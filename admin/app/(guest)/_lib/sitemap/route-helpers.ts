/**
 * M7 Sitemap — route-handler helpers
 * ══════════════════════════════════
 *
 * Shared between `/sitemap.xml`, `/sitemap_[shard]`, and
 * `/robots.txt`. Five concerns:
 *
 *   1. `resolveSeoContextForSitemapRoute`
 *        Resolve tenant from host + fetch locales + build the
 *        SeoTenantContext the aggregator consumes. Returns null
 *        when the host maps to no tenant — sitemap routes emit
 *        404, robots route emits the fail-closed Disallow:/ body.
 *
 *   2. `xmlSitemapResponse`
 *        Canonical XML Response with status-driven Cache-Control.
 *        Single source of truth for Content-Type + cache semantics
 *        on sitemap routes.
 *
 *   3. `handleSitemapError`
 *        Log + 503 for any error bubbling out of the aggregator.
 *        Branches on `SitemapAggregationError` for full context;
 *        falls through to a generic `route_error` log event.
 *
 *   4. `textRobotsResponse`
 *        Canonical text/plain 200 for robots.txt, with a cacheMode
 *        literal union ("edge" | "no-store") that drives
 *        Cache-Control. Separate from `xmlSitemapResponse` so the
 *        function name documents the content type.
 *
 *   5. `handleRobotsError`
 *        UNLIKE `handleSitemapError`, returns 200 with a fail-safe
 *        Disallow:/ body. A 5xx or missing robots.txt makes Google
 *        "crawl everything" for 24h — strictly worse than a
 *        transient fail-safe Disallow. See the function's JSDoc
 *        for the full rationale.
 *
 * Filename note: this file's role grew beyond "locale context" as
 * the plan firmed up. `route-helpers` is strictly more accurate
 * (five mixed-concern helpers, not just locale). Small filename
 * deviation from the approved plan; contents match the approved
 * contract.
 */

import { NextResponse } from "next/server";

import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { log } from "@/app/_lib/logger";
import { SitemapAggregationError } from "@/app/_lib/seo/sitemap/aggregator";
import { buildRobotsTxt } from "@/app/_lib/seo/sitemap/robots";
import type { SitemapResourceType } from "@/app/_lib/seo/sitemap/types";
import type { SeoTenantContext } from "@/app/_lib/seo/types";
import { tenantToSeoContext } from "@/app/_lib/tenant/seo-context";

// ── Tenant context resolution ───────────────────────────────

/**
 * Resolve the full `SeoTenantContext` for a sitemap route request.
 * Returns `null` when the host header maps to no tenant — callers
 * should respond 404.
 *
 * Emits `seo.sitemap.no_active_locales` warning (but still returns
 * a usable context) when the tenant has zero `TenantLocale` rows.
 * `tenantToSeoContext` handles the fallback internally by prepending
 * the default locale, so the sitemap still renders meaningful URLs.
 */
export async function resolveSeoContextForSitemapRoute(): Promise<
  SeoTenantContext | null
> {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return null;

  const locales = await prisma.tenantLocale.findMany({
    where: { tenantId: tenant.id },
  });

  if (locales.length === 0) {
    log("warn", "seo.sitemap.no_active_locales", {
      tenantId: tenant.id,
    });
  }

  return tenantToSeoContext({ tenant, locales });
}

// ── XML Response helper ─────────────────────────────────────

/**
 * Canonical XML response for sitemap routes.
 *
 * Cache-Control semantics by status:
 *   • 200  → public, s-maxage=3600, SWR=86400 (edge-cached 1h).
 *   • 404  → no-store (tenant resolution / shard naming MUST take
 *           effect immediately; a cached 404 would outlive DNS
 *           or routing changes).
 *   • 503  → no-store + Retry-After: 60 (a transient DB blip
 *           must not become an hour of sticky service denial).
 *
 * Caller supplies the body; empty string is valid for 404 / 503.
 */
export function xmlSitemapResponse(
  xml: string,
  status: 200 | 404 | 503,
): NextResponse {
  const headers: Record<string, string> = {
    "content-type": "application/xml; charset=utf-8",
  };
  if (status === 200) {
    headers["cache-control"] =
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";
  } else {
    headers["cache-control"] = "no-store";
    if (status === 503) headers["retry-after"] = "60";
  }
  return new NextResponse(xml, { status, headers });
}

// ── Error handler ────────────────────────────────────────────

/**
 * Log the error under the appropriate event name and return a
 * canonical 503 response. `SitemapAggregationError` carries its
 * own context (resourceType + shardIndex + tenantId + cause);
 * generic throws fall through to `route_error` with the caller's
 * context.
 */
export function handleSitemapError(
  error: unknown,
  tenantId: string,
  resourceType: SitemapResourceType | "index",
  shardIndex?: number,
): NextResponse {
  if (error instanceof SitemapAggregationError) {
    log("error", "seo.sitemap.aggregation_failed", {
      tenantId: error.tenantId,
      resourceType: error.resourceType,
      shardIndex: error.shardIndex,
      // `cause` is `unknown`; `String()` is safe for any JS value
      // including Error instances (→ "Error: message") and thrown
      // non-Error values. Matches the primitive-only LogContext.
      cause: String(error.cause),
    });
  } else {
    log("error", "seo.sitemap.route_error", {
      tenantId,
      resourceType,
      shardIndex: shardIndex ?? null,
      error: String(error),
    });
  }
  return xmlSitemapResponse("", 503);
}

// ── Robots response helper ──────────────────────────────────

/**
 * Canonical text/plain 200 for robots.txt. Status is always 200 —
 * robots.txt never 404s or 503s by design (see `handleRobotsError`).
 *
 * `cacheMode` is a literal union rather than a boolean for
 * self-documentation at the callsite:
 *
 *   "edge"     → public, s-maxage=3600, SWR=86400 (happy + null-
 *                tenant paths; both are intentional stable responses).
 *   "no-store" → used by `handleRobotsError` so a transient fail-
 *                safe never sticks in the edge cache for an hour.
 */
export function textRobotsResponse(
  body: string,
  cacheMode: "edge" | "no-store",
): NextResponse {
  const headers: Record<string, string> = {
    "content-type": "text/plain; charset=utf-8",
  };
  if (cacheMode === "edge") {
    headers["cache-control"] =
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";
  } else {
    headers["cache-control"] = "no-store";
  }
  return new NextResponse(body, { status: 200, headers });
}

// ── Robots error handler ────────────────────────────────────

/**
 * Robots-specific error handler. UNLIKE `handleSitemapError`, this
 * function returns 200 with a fail-safe `User-agent: *\nDisallow: /`
 * body. Rationale:
 *
 *   Google's documented behavior on missing or 5xx robots.txt is
 *   "assume no restrictions, crawl everything" for up to 24h —
 *   strictly worse than serving a transient Disallow. The
 *   200 + no-store combo pauses crawlers until the underlying
 *   issue resolves on the next request.
 *
 * This is the ONLY route in the entire SEO stack that intentionally
 * hides errors behind a successful response. Callers must always
 * prefer this over any throw-through / 5xx path.
 *
 * `tenantId` is `string | null`: the route may or may not have
 * resolved the tenant before the throw. Both states are legitimate
 * log values.
 */
export function handleRobotsError(
  error: unknown,
  tenantId: string | null,
): NextResponse {
  log("error", "seo.robots.route_error", {
    tenantId,
    error: String(error),
  });
  return textRobotsResponse(
    buildRobotsTxt({ primaryDomain: "", indexable: false }),
    "no-store",
  );
}
