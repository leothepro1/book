/**
 * GET /sitemap.xml
 * ════════════════
 *
 * Per-tenant sitemap index. Routes on the guest host (e.g.
 * `apelviken-x.rutgr.com`), resolves the tenant from the request
 * host header, walks PRODUCTION_SHARD_REGISTRY via
 * `buildSitemapIndexForTenant`, and serializes the result via
 * `sitemapIndexToXml`.
 *
 * ── Cache semantics (two layers, orthogonal) ──────────────────
 *   • `resolveTenantFromHost` wraps its Prisma lookup in
 *     `unstable_cache` (tag "tenant-by-host:{portalSlug}",
 *     revalidate 300s). Admin tenant mutations invalidate via
 *     `revalidateTag`.
 *   • The XML body is edge-cached by the Cache-Control header
 *     emitted from `xmlSitemapResponse` (s-maxage=3600,
 *     SWR=86400). Google pulls sitemaps infrequently; 1h
 *     staleness is acceptable per M7 trade-off.
 *
 * `dynamic = "force-dynamic"` is REQUIRED — host-based routing
 * cannot be pre-generated at build time. `revalidate` is NOT set:
 * in Next 15, `force-dynamic` + `revalidate` is contradictory, and
 * the response's Cache-Control header alone drives edge caching.
 */

import { PRODUCTION_SHARD_REGISTRY } from "@/app/_lib/seo/sitemap/production-registry";
import { buildSitemapIndexForTenant } from "@/app/_lib/seo/sitemap/aggregator";
import { sitemapIndexToXml } from "@/app/_lib/seo/sitemap/xml";
import {
  handleSitemapError,
  resolveSeoContextForSitemapRoute,
  xmlSitemapResponse,
} from "@/app/(guest)/_lib/sitemap/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const seoTenant = await resolveSeoContextForSitemapRoute();
  if (!seoTenant) {
    return xmlSitemapResponse("", 404);
  }

  try {
    const index = await buildSitemapIndexForTenant(
      seoTenant,
      PRODUCTION_SHARD_REGISTRY,
    );
    const xml = sitemapIndexToXml(index);
    return xmlSitemapResponse(xml, 200);
  } catch (error) {
    return handleSitemapError(error, seoTenant.id, "index");
  }
}
