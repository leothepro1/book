/**
 * GET /api/analytics/live/visitors
 *
 * Besökare just nu — near-live read endpoint.
 *
 * Returns the count of distinct active session_ids for the current
 * authenticated tenant over the last 5 minutes. Cached 60s in Upstash
 * (read-through, per recon §5.3 RESOLVED). Polled every 5 min from
 * the admin browser via VisitorsLiveCard (B.4).
 *
 * Layered defenses:
 *   1. getAuth() → 401 on unauthenticated.
 *   2. getCurrentTenant() → 404 on missing tenant. Tenant id is
 *      ALWAYS resolved server-side; never from query/body.
 *   3. Per-tenant rate limit (60 req/min) → 429 + Retry-After. Per
 *      task brief (Web Claude review point #3): authenticated polling
 *      loops still need server-side throttling, regardless of
 *      browser-cache headers.
 *   4. analyticsSpan wraps the cache + DB work — Sentry context.
 *   5. withRedisCache (60s TTL) — read-through.
 *   6. getVisitorsNow — the SQL query (B.1).
 *
 * Response (200): { visitorsNow, updatedAt, source }.
 *   - visitorsNow: number ≥ 0
 *   - updatedAt: ISO timestamp of when this response was computed
 *     (not when the cache was set — the widget shows freshness
 *     relative to "now", not relative to cache TTL).
 *   - source: "cache" | "fresh" — for ops debugging via the response
 *     body in DevTools.
 *
 * Cache-Control: private, max-age=60. Browsers and intermediate
 * caches throttle re-polls; multi-tab dashboards don't blast Redis.
 *
 * Cache-hit instrumentation (per recon §3.5 + Web Claude review #1):
 *   - Cache miss → analyticsBreadcrumb("widget", "cache_miss", ...)
 *     + log("info", "analytics.live_visitors.served", source: "fresh"
 *     ...) ALWAYS — low-volume, high-signal.
 *   - Cache hit → log("info", ...) sampled at 1% via shouldSample().
 *     Aggregate hit-rate is observable via structured-log
 *     aggregation; full-volume logs would be ~33 lines/sec at fleet
 *     scale.
 *   - Errors → log("error", ...) ALWAYS.
 */

import { NextResponse } from "next/server";

import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { withRedisCache } from "@/app/_lib/analytics/live/cache";
import { checkLiveVisitorsRateLimit } from "@/app/_lib/analytics/live/rate-limit";
import {
  CACHE_HIT_SAMPLE_RATE,
  shouldSample,
} from "@/app/_lib/analytics/live/sampling";
import { getVisitorsNow } from "@/app/_lib/analytics/live/visitors";
import {
  analyticsBreadcrumb,
  analyticsSpan,
} from "@/app/_lib/analytics/pipeline/observability";
import { log } from "@/app/_lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_TTL_SECONDS = 60;

function cacheKey(tenantId: string): string {
  return `bedfront:cache:analytics:live:visitors:${tenantId}`;
}

export async function GET(): Promise<NextResponse> {
  // 1. Auth.
  const { userId } = await getAuth();
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // 2. Tenant resolution — server-side only. setSentryTenantContext()
  //    fires inside getCurrentTenant() so subsequent Sentry traces
  //    are tenant-tagged.
  const tenantData = await getCurrentTenant();
  if (!tenantData) {
    return NextResponse.json(
      { error: "Tenant not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const tenantId = tenantData.tenant.id;

  // 3. Rate limit — defense-in-depth against authenticated tight-
  //    loop polling (devtools, automation, multi-tab abuse). 60
  //    req/min per tenant.
  const rl = await checkLiveVisitorsRateLimit(tenantId);
  if (!rl.allowed) {
    log("warn", "analytics.live_visitors.rate_limited", {
      tenantId,
      retryAfterSeconds: rl.retryAfterSeconds,
    });
    return new NextResponse(null, {
      status: 429,
      headers: {
        "Retry-After": String(rl.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    });
  }

  // 4-6. Span-wrap the cache + DB work.
  const startedAtMs = Date.now();
  try {
    const result = await analyticsSpan(
      "widget.visitors_now",
      { tenant_id: tenantId, pipeline_step: "widget.visitors_now" },
      () =>
        withRedisCache<number>(cacheKey(tenantId), CACHE_TTL_SECONDS, () =>
          getVisitorsNow(tenantId),
        ),
    );

    const durationMs = Date.now() - startedAtMs;

    // Observability emit — sampled by source.
    if (result.source === "fresh") {
      // Always log misses (low-volume, high-signal — surfaces
      // Redis degradation, query latency, or fresh-fetch volume
      // spikes).
      analyticsBreadcrumb("widget", "cache_miss", {
        tenant_id: tenantId,
        key: cacheKey(tenantId),
      });
      log("info", "analytics.live_visitors.served", {
        tenantId,
        visitorsNow: result.value,
        source: "fresh",
        durationMs,
      });
    } else if (shouldSample(CACHE_HIT_SAMPLE_RATE)) {
      // Sample 1% of hits so aggregate hit-rate stays observable
      // without flooding the log stream at fleet scale.
      log("info", "analytics.live_visitors.served", {
        tenantId,
        visitorsNow: result.value,
        source: "cache",
        durationMs,
        sampled: true,
      });
    }

    return NextResponse.json(
      {
        visitorsNow: result.value,
        updatedAt: new Date().toISOString(),
        source: result.source,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=60",
        },
      },
    );
  } catch (err) {
    log("error", "analytics.live_visitors.failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
