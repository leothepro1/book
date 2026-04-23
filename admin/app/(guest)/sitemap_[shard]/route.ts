/**
 * GET /sitemap_{resourceType}_{shardIndex}.xml
 * ════════════════════════════════════════════
 *
 * One sitemap shard file for a per-tenant resource type. Matches
 * URLs of the form:
 *
 *   /sitemap_accommodations_1.xml
 *   /sitemap_accommodation_categories_1.xml
 *   /sitemap_products_1.xml
 *   /sitemap_product_collections_1.xml
 *   /sitemap_pages_1.xml
 *
 * Validates the shard segment via regex before any tenant lookup.
 * Anything malformed (wrong resource-type name, zero/negative
 * shardIndex, non-canonical leading zeros, missing `.xml`) → 404.
 * 404 (not 400) matches crawler mental models — bad shard URLs
 * are "no such resource" from a SEO bot's perspective, not
 * client errors.
 *
 * Returns a valid empty `<urlset>` for shard 1 with zero entries
 * (a tenant with e.g. no products but a crawler hitting
 * `/sitemap_products_1.xml` directly gets 200 + empty urlset
 * rather than 404 — matches M7.1 aggregator contract).
 */

import { PRODUCTION_SHARD_REGISTRY } from "@/app/_lib/seo/sitemap/production-registry";
import { buildShardForTenant } from "@/app/_lib/seo/sitemap/aggregator";
import { sitemapShardToXml } from "@/app/_lib/seo/sitemap/xml";
import type { SitemapResourceType } from "@/app/_lib/seo/sitemap/types";
import {
  handleSitemapError,
  resolveSeoContextForSitemapRoute,
  xmlSitemapResponse,
} from "@/app/(guest)/_lib/sitemap/route-helpers";

/**
 * Canonical shard-name pattern. Resource-type names MUST match the
 * SitemapResourceType union exactly. `\d+` rejects negative signs
 * and non-numeric garbage; the follow-up `String(n) !== raw` check
 * in the handler rejects non-canonical leading zeros like `01`.
 */
const SHARD_PATTERN =
  /^(accommodations|accommodation_categories|products|product_collections|pages)_(\d+)\.xml$/;

export const dynamic = "force-dynamic";

/**
 * Next.js 16 does not extract a bracket-suffixed segment from a folder
 * name that carries a prefix (`sitemap_[shard]`) into typed params —
 * generated route types surface `params: Promise<{}>`. Parse the shard
 * from `req.url` instead; the URL always carries the full pathname and
 * the regex validator below rejects anything malformed.
 */
// Match Next.js 16's generated signature exactly: params is a Promise of
// an empty object. `{}` means "any object" in TS, so tests that still
// pass `{ shard }` for mocking convenience remain assignable.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type RouteCtx = { params: Promise<{}> };

export async function GET(req: Request, _ctx: RouteCtx): Promise<Response> {
  const shard = new URL(req.url).pathname.replace(/^\/sitemap_/, "");

  // Parse + validate shard segment. 404 on any malformed input.
  const match = SHARD_PATTERN.exec(shard);
  if (!match) return xmlSitemapResponse("", 404);
  const resourceType = match[1] as SitemapResourceType;
  const shardIndexStr = match[2];
  const shardIndex = parseInt(shardIndexStr, 10);
  // Canonical-URL contract: `/sitemap_products_01.xml` and
  // `/sitemap_products_0.xml` both 404. `String(1) === "1"` but
  // `String(1) !== "01"`; `shardIndex < 1` catches zero.
  if (shardIndex < 1 || String(shardIndex) !== shardIndexStr) {
    return xmlSitemapResponse("", 404);
  }

  // Resolve tenant.
  const seoTenant = await resolveSeoContextForSitemapRoute();
  if (!seoTenant) return xmlSitemapResponse("", 404);

  // Build the shard. `null` means out-of-range (shardIndex > 1
  // with zero entries, per M7.1 contract). Shard 1 with zero
  // entries returns a BuiltShard — we serve an empty urlset.
  try {
    const built = await buildShardForTenant(
      seoTenant,
      resourceType,
      shardIndex,
      PRODUCTION_SHARD_REGISTRY,
    );
    if (built === null) return xmlSitemapResponse("", 404);
    const xml = sitemapShardToXml(built);
    return xmlSitemapResponse(xml, 200);
  } catch (error) {
    return handleSitemapError(error, seoTenant.id, resourceType, shardIndex);
  }
}
