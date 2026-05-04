/**
 * Per-tenant rate limiter for the besökare-widget read endpoint.
 *
 * Per task brief (Web Claude review point #3): even with a 60s
 * Upstash cache and a 5-min browser polling cadence, an authenticated
 * admin can poll in a tight loop (devtools, automation, multi-tab).
 * Server-side rate-limit is required defense-in-depth, irrespective
 * of client browser-cache headers.
 *
 * Limit: 60 requests / minute per tenant. That's 12× the design poll
 * rate (1 / 5 min = 0.0033 RPS per tenant) and 60× a once-per-second
 * dashboard-tab refresher. Anything beyond that is misuse.
 *
 * Singleton: uses `redis` from app/_lib/redis/client per
 * admin/CLAUDE.md "Enterprise infrastructure" rule.
 *
 * Dev mode: short-circuits to allow, matching the existing
 * `app/_lib/analytics/pipeline/rate-limit.ts` pattern (line 95).
 */

import { Ratelimit } from "@upstash/ratelimit";

import { redis } from "@/app/_lib/redis/client";

// ── Limiter cache ────────────────────────────────────────────────────────

let cachedLimiter: Ratelimit | null = null;

function getLimiter(): Ratelimit {
  if (cachedLimiter) return cachedLimiter;
  cachedLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "60 s"),
    analytics: true,
    prefix: "bedfront:ratelimit:analytics-live-visitors",
  });
  return cachedLimiter;
}

// ── Public API ───────────────────────────────────────────────────────────

export interface LiveVisitorsRateLimitDecision {
  allowed: boolean;
  /**
   * Seconds until the bucket resets. Caller passes this to the
   * Retry-After response header. Always >= 1 — HTTP clients treat 0
   * as "retry immediately" which would just re-trigger the limit.
   */
  retryAfterSeconds: number;
}

const ALLOWED: LiveVisitorsRateLimitDecision = {
  allowed: true,
  retryAfterSeconds: 0,
};

/**
 * Check whether the besökare endpoint may be served for this tenant.
 *
 * Returns `{ allowed: true }` in development to keep the dev loop
 * unconstrained.
 */
export async function checkLiveVisitorsRateLimit(
  tenantId: string,
): Promise<LiveVisitorsRateLimitDecision> {
  if (process.env.NODE_ENV === "development") return ALLOWED;

  const limiter = getLimiter();
  const result = await limiter.limit(`tenant:${tenantId}`);

  if (result.success) return ALLOWED;

  const waitMs = Math.max(0, result.reset - Date.now());
  const retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));

  return { allowed: false, retryAfterSeconds };
}
