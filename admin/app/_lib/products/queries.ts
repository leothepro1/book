/**
 * Products Queries — SEO sitemap read operations
 * ═══════════════════════════════════════════════
 *
 * Mirrors `_lib/accommodations/queries.ts`. Tenant isolation
 * enforced once in this module; consumers (today only
 * `seo/sitemap/production-registry.ts`) never write raw Prisma.
 *
 * Every fetcher conforms to `SitemapShardFetcher` (see
 * `seo/sitemap/types.ts`). Four-point contract:
 *   1. WHERE includes { tenantId }.
 *   2. Status + archived + product-type filters pre-filter
 *      isIndexable rules that are expressible in SQL.
 *   3. Post-fetch `adapter.isIndexable` gates JSON overrides.
 *   4. `orderBy: { id: "asc" }` for deterministic pagination.
 */

import { prisma } from "@/app/_lib/db/prisma";

import type { BuiltShardEntry } from "../seo/sitemap/types";
import {
  type ProductWithMedia,
  productSeoAdapter,
} from "../seo/adapters/product";
import {
  collectionSeoInclude,
  productCollectionSeoAdapter,
} from "../seo/adapters/product-collection";
import type { SeoTenantContext } from "../seo/types";

// ── Products shard fetcher ───────────────────────────────────

/**
 * Fetch one page of indexable products for the sitemap.
 *
 * Pre-filter: `status = "ACTIVE"`, `archivedAt IS NULL`,
 * `productType = "STANDARD"`. GIFT_CARD is gated here AND by
 * `productSeoAdapter.isIndexable` — double defense. Keeping the
 * SQL filter avoids hydrating GIFT_CARD rows at all.
 *
 * Variants are included even though sitemap output doesn't read
 * variant data; matching the adapter's `ProductWithMedia` type
 * signature keeps the pipeline cast-free.
 */
export async function fetchProductsForSitemap(args: {
  readonly tenant: SeoTenantContext;
  readonly limit: number;
  readonly offset: number;
}): Promise<readonly BuiltShardEntry[]> {
  const { tenant, limit, offset } = args;

  const rows: ProductWithMedia[] = await prisma.product.findMany({
    where: {
      tenantId: tenant.id,
      status: "ACTIVE",
      archivedAt: null,
      productType: "STANDARD",
    },
    include: {
      media: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { id: "asc" },
    take: limit,
    skip: offset,
  });

  const entries: BuiltShardEntry[] = [];
  for (const row of rows) {
    if (!productSeoAdapter.isIndexable(row)) continue;
    const sitemapEntries = productSeoAdapter.getSitemapEntries(
      row,
      tenant,
      tenant.activeLocales,
    );
    for (const entry of sitemapEntries) {
      entries.push({
        url: entry.url,
        lastmod: entry.lastmod,
        alternates: entry.alternates ?? [],
      });
    }
  }
  return entries;
}

// ── Product collections shard fetcher ───────────────────────

/**
 * Fetch one page of active product collections for the sitemap.
 *
 * `collectionSeoInclude(tenant.id)` (from
 * `seo/adapters/product-collection.ts`) scopes the items join to
 * ACTIVE STANDARD non-archived products belonging to this tenant
 * and caps at `MAX_ITEMLIST_MEMBERS`.
 *
 * ProductCollection has no `archivedAt` column — the enum-valued
 * `status` encodes archival state, so `status: "ACTIVE"` is the
 * only pre-filter.
 *
 * ⚠ SITEMAP FETCHER COUPLING:
 * If `collectionSeoInclude` in
 * `seo/adapters/product-collection.ts` changes shape, this
 * fetcher's output changes in lockstep. Review both together.
 */
export async function fetchProductCollectionsForSitemap(args: {
  readonly tenant: SeoTenantContext;
  readonly limit: number;
  readonly offset: number;
}): Promise<readonly BuiltShardEntry[]> {
  const { tenant, limit, offset } = args;

  const rows = await prisma.productCollection.findMany({
    where: {
      tenantId: tenant.id,
      status: "ACTIVE",
    },
    include: collectionSeoInclude(tenant.id),
    orderBy: { id: "asc" },
    take: limit,
    skip: offset,
  });

  const entries: BuiltShardEntry[] = [];
  for (const row of rows) {
    if (!productCollectionSeoAdapter.isIndexable(row)) continue;
    const sitemapEntries = productCollectionSeoAdapter.getSitemapEntries(
      row,
      tenant,
      tenant.activeLocales,
    );
    for (const entry of sitemapEntries) {
      entries.push({
        url: entry.url,
        lastmod: entry.lastmod,
        alternates: entry.alternates ?? [],
      });
    }
  }
  return entries;
}
