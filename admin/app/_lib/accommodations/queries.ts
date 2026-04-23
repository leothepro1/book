/**
 * Accommodations Queries — SEO sitemap read operations
 * ═════════════════════════════════════════════════════
 *
 * Mirrors the pattern established in `_lib/guests/queries.ts`: one
 * domain-scoped read module, tenant isolation enforced once here,
 * never exposed through raw Prisma in route handlers. Callers from
 * `seo/sitemap/production-registry.ts` import these helpers; no
 * other consumers today.
 *
 * ── Shape of every fetcher ────────────────────────────────────
 * Each `fetch*ForSitemap` conforms to `SitemapShardFetcher`:
 *
 *   1. Tenant-scoped WHERE ({ tenantId: tenant.id }).
 *   2. Status / archivedAt filters matching the adapter's
 *      `isIndexable` rules that ARE expressible in SQL.
 *   3. `orderBy: { id: "asc" }` — cuid lexicographic pagination,
 *      deterministic across requests.
 *   4. `take: limit, skip: offset` — aggregator passes SHARD_SIZE +
 *      (shardIndex - 1) * SHARD_SIZE.
 *   5. Post-fetch: `adapter.isIndexable(row)` gates JSON-column
 *      overrides (`seo.noindex`) and composite rules (empty
 *      category) that SQL WHERE can't express.
 *   6. `adapter.getSitemapEntries(row, tenant, tenant.activeLocales)`
 *      produces already-absolute URLs per locale.
 *   7. Normalize `SitemapEntry.alternates?` → non-optional
 *      `BuiltShardEntry.alternates` with `?? []`.
 */

import { prisma } from "@/app/_lib/db/prisma";

import type { BuiltShardEntry } from "../seo/sitemap/types";
import {
  type AccommodationWithMedia,
  accommodationSeoAdapter,
} from "../seo/adapters/accommodation";
import {
  accommodationCategorySeoAdapter,
  categorySeoInclude,
} from "../seo/adapters/accommodation-category";
import type { SeoTenantContext } from "../seo/types";

// ── Accommodations shard fetcher ─────────────────────────────

/**
 * Fetch one page of active, non-archived accommodations for the
 * sitemap. Calls `accommodationSeoAdapter.isIndexable` on every
 * row to gate JSON-column overrides (`seo.noindex`) — that field
 * is not expressible as a Prisma WHERE.
 */
export async function fetchAccommodationsForSitemap(args: {
  readonly tenant: SeoTenantContext;
  readonly limit: number;
  readonly offset: number;
}): Promise<readonly BuiltShardEntry[]> {
  const { tenant, limit, offset } = args;

  const rows = await prisma.accommodation.findMany({
    where: {
      tenantId: tenant.id,
      status: "ACTIVE",
      archivedAt: null,
    },
    include: { media: { orderBy: { sortOrder: "asc" } } },
    orderBy: { id: "asc" },
    take: limit,
    skip: offset,
  });

  const entries: BuiltShardEntry[] = [];
  for (const row of rows) {
    if (!accommodationSeoAdapter.isIndexable(row)) continue;
    const sitemapEntries = accommodationSeoAdapter.getSitemapEntries(
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

// ── Accommodation categories shard fetcher ──────────────────

/**
 * Fetch one page of active accommodation categories for the sitemap.
 *
 * The `include` reuses `categorySeoInclude(tenant.id)` from
 * `seo/adapters/accommodation-category.ts` — the same fragment the
 * category adapter expects on its input. That helper scopes the
 * items join to ACTIVE, non-archived, tenant-scoped accommodations
 * and caps at `MAX_ITEMLIST_MEMBERS`.
 *
 * ⚠ SITEMAP FETCHER COUPLING:
 * If `categorySeoInclude` in `seo/adapters/accommodation-category.ts`
 * changes — different item WHERE, different order, different cap —
 * this fetcher MUST be reviewed. The category adapter's
 * `isIndexable(row)` guards "items.length > 0" via the hydrated
 * items array. A narrower or empty items hydration would flip
 * previously-indexable categories to non-indexable by accident.
 */
export async function fetchAccommodationCategoriesForSitemap(args: {
  readonly tenant: SeoTenantContext;
  readonly limit: number;
  readonly offset: number;
}): Promise<readonly BuiltShardEntry[]> {
  const { tenant, limit, offset } = args;

  const rows = await prisma.accommodationCategory.findMany({
    where: {
      tenantId: tenant.id,
      status: "ACTIVE",
    },
    include: categorySeoInclude(tenant.id),
    orderBy: { id: "asc" },
    take: limit,
    skip: offset,
  });

  const entries: BuiltShardEntry[] = [];
  for (const row of rows) {
    if (!accommodationCategorySeoAdapter.isIndexable(row)) continue;
    const sitemapEntries = accommodationCategorySeoAdapter.getSitemapEntries(
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

// ── Pages-shard existence gate ───────────────────────────────

/**
 * Does this tenant have at least one ACTIVE, non-archived
 * accommodation? Used by `pages-source` to decide whether `/stays`
 * belongs in the sitemap for this tenant.
 *
 * Implemented as a `findFirst` with `select: { id: true }` — a
 * sub-5ms indexed point-lookup. Kept distinct from
 * `fetchFeaturedAccommodationsForSitemap` because the two have
 * different semantics (existence check vs. data fetch for the
 * adapter's MAX(updatedAt) signal). Collapsing saves zero queries
 * in the common empty-tenant short-circuit path.
 */
export async function tenantHasActiveAccommodations(
  tenantId: string,
): Promise<boolean> {
  const row = await prisma.accommodation.findFirst({
    where: { tenantId, status: "ACTIVE", archivedAt: null },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Return the most-recently-updated ACTIVE, non-archived
 * accommodation (as a 1-element array), or `[]` if the tenant has
 * none. Consumed by the pages shard to feed
 * `accommodationIndexSeoAdapter.getSitemapEntries` — the adapter
 * only reads `featuredAccommodations` to compute MAX(updatedAt)
 * for sitemap lastmod, so a singleton suffices.
 *
 * ── Intentional deviation from toStructuredData cap of 20 ────────
 * `accommodationIndexSeoAdapter.toStructuredData` caps the ItemList
 * at `MAX_ITEMLIST_MEMBERS` (20). The sitemap use case does NOT
 * consume the list body — only its MAX(updatedAt) reduction — so
 * fetching 20 rows where 1 suffices is wasted IO. The singleton
 * gives the same MAX result (1-element max = that row's updatedAt).
 */
export async function fetchFeaturedAccommodationsForSitemap(
  tenantId: string,
): Promise<readonly AccommodationWithMedia[]> {
  const row = await prisma.accommodation.findFirst({
    where: { tenantId, status: "ACTIVE", archivedAt: null },
    orderBy: { updatedAt: "desc" },
    include: { media: { orderBy: { sortOrder: "asc" } } },
  });
  return row !== null ? [row] : [];
}
