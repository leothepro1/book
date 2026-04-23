/**
 * GET /robots.txt
 * ═══════════════
 *
 * Per-tenant robots.txt, served from the tenant hostname. Three
 * response branches:
 *
 *   1. Resolved tenant → 200, full robots body with Allow /
 *      Disallow / Sitemap: https://{primaryDomain}/sitemap.xml.
 *   2. Null tenant (unknown host) → 200, fail-closed
 *      "User-agent: *\nDisallow: /\n".
 *   3. Unexpected throw → 200, fail-safe Disallow:/ + no-store.
 *      Explicitly NEVER 503 — Google treats missing/5xx robots.txt
 *      as "crawl everything" for 24h, which is the worst failure
 *      mode for a per-tenant platform. See `handleRobotsError`
 *      for the full rationale.
 *
 * ── Cache semantics ────────────────────────────────────────────
 * `dynamic = "force-dynamic"` required (host-based routing cannot
 * be pre-generated). `revalidate` intentionally unset (contradicts
 * force-dynamic per Next 15). Edge cache is driven entirely by the
 * response's Cache-Control header via `textRobotsResponse`.
 *
 * High-volume endpoint: no structured logging on happy or null-
 * tenant paths — only on errors. `seo.robots.fail_closed` was
 * considered and dropped (null-tenant fires for every bot/IP
 * probe; near-zero operational signal).
 */

import { buildRobotsTxt } from "@/app/_lib/seo/sitemap/robots";
import {
  handleRobotsError,
  resolveSeoContextForSitemapRoute,
  textRobotsResponse,
} from "@/app/(guest)/_lib/sitemap/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let tenantId: string | null = null;
  try {
    const seoTenant = await resolveSeoContextForSitemapRoute();
    if (!seoTenant) {
      // Edge cache on null-tenant: safe because tenant-by-host
      // invalidation (5min) catches new tenant registrations on the
      // fetch layer, but the response body itself stays cached for
      // up to 1h. Net effect: a newly-registered tenant sees correct
      // robots within 1h (worst case) as the edge cache's s-maxage
      // expires. Acceptable trade-off for a high-volume endpoint;
      // if this becomes a merchant-onboarding issue, consider
      // stale-while-revalidate → 0 on null-tenant path specifically.
      const body = buildRobotsTxt({ primaryDomain: "", indexable: false });
      return textRobotsResponse(body, "edge");
    }
    tenantId = seoTenant.id;
    const body = buildRobotsTxt({
      primaryDomain: seoTenant.primaryDomain,
      indexable: true,
    });
    return textRobotsResponse(body, "edge");
  } catch (error) {
    return handleRobotsError(error, tenantId);
  }
}
