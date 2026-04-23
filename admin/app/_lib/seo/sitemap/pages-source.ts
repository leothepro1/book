/**
 * M7 Sitemap — pages shard (synthetic resource)
 * ═════════════════════════════════════════════
 *
 * The `pages` shard fuses two synthetic resources into a single
 * sitemap file: `homepage` (the tenant root `/`) and
 * `accommodation_index` (`/stays`). Neither has a Prisma row —
 * each is synthesized at fetch time by delegating to its adapter's
 * `getSitemapEntries`.
 *
 * Lives under `_lib/seo/sitemap/` (not a domain lib) because the
 * pages shard is an SEO-engine construct, not a domain concept.
 *
 * ── Fetcher behavior ─────────────────────────────────────────
 * 1. Homepage — ALWAYS emitted, one entry per locale. The
 *    homepage adapter is `isIndexable: () => true`; merchant-level
 *    noindex is the resolver's concern, not the sitemap's.
 * 2. Accommodation-index — emitted ONLY when the tenant has ≥1
 *    ACTIVE, non-archived accommodation. An empty-tenant `/stays`
 *    would render thin content, so we skip it — same principle as
 *    the Batch B empty-category noindex rule.
 * 3. `featuredAccommodations` is sourced via
 *    `fetchFeaturedAccommodationsForSitemap` (a singleton — the
 *    most-recently-updated ACTIVE accommodation) because the
 *    adapter only reads the list for its MAX(updatedAt) signal.
 *
 * ── Size invariant ───────────────────────────────────────────
 * At any realistic tenant volume the pages shard contains at most
 * `activeLocales.length × 2` entries — far below `SHARD_SIZE`
 * (50,000). The fetcher still honors `limit` + `offset` for
 * contract symmetry, but `hasMore` on the resulting shard is
 * structurally always `false`. No further shards ever exist for
 * `pages`.
 */

import {
  fetchFeaturedAccommodationsForSitemap,
  tenantHasActiveAccommodations,
} from "../../accommodations/queries";
import { accommodationIndexSeoAdapter } from "../adapters/accommodation-index";
import {
  type HomepageEntity,
  homepageSeoAdapter,
} from "../adapters/homepage";
import type { SeoTenantContext } from "../types";
import type { BuiltShardEntry } from "./types";

/**
 * Produce the `pages` shard's entries for a tenant. Honors
 * `limit` + `offset` by slicing the synthesized entry list at the
 * end, which is cheap — the list is at most a handful of entries.
 */
export async function fetchPagesForSitemap(args: {
  readonly tenant: SeoTenantContext;
  readonly limit: number;
  readonly offset: number;
}): Promise<readonly BuiltShardEntry[]> {
  const { tenant, limit, offset } = args;
  const entries: BuiltShardEntry[] = [];

  // Homepage — always present. `HomepageEntity` is `Record<string,
  // never>`; the adapter ignores `entity` and reads `tenant`.
  const homepageEntity: HomepageEntity = {};
  const homepageEntries = homepageSeoAdapter.getSitemapEntries(
    homepageEntity,
    tenant,
    tenant.activeLocales,
  );
  for (const entry of homepageEntries) {
    entries.push({
      url: entry.url,
      lastmod: entry.lastmod,
      alternates: entry.alternates ?? [],
    });
  }

  // Accommodation-index — gated on "at least one active
  // accommodation exists for this tenant."
  if (await tenantHasActiveAccommodations(tenant.id)) {
    const featured = await fetchFeaturedAccommodationsForSitemap(tenant.id);
    const indexEntries = accommodationIndexSeoAdapter.getSitemapEntries(
      {
        tenantId: tenant.id,
        activeLocales: tenant.activeLocales,
        featuredAccommodations: featured,
      },
      tenant,
      tenant.activeLocales,
    );
    for (const entry of indexEntries) {
      entries.push({
        url: entry.url,
        lastmod: entry.lastmod,
        alternates: entry.alternates ?? [],
      });
    }
  }

  return entries.slice(offset, offset + limit);
}
