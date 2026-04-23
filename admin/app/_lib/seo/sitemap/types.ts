/**
 * M7 Sitemap — shared types & constants
 * ═════════════════════════════════════
 *
 * Pure data types consumed by the aggregator, the XML serializer, and
 * (from M7.2 onward) the fetcher registry. No Prisma, no Next.js, no
 * logging — this module stays importable from every runtime context.
 *
 * ── Why a new "resource type" distinct from SeoResourceType ──────
 * `SeoResourceType` in `../types` is the per-adapter discriminator
 * ("homepage", "accommodation", "accommodation_index", "search", ...).
 * `SitemapResourceType` is the per-SHARD grouping: one shard file per
 * value. They intentionally diverge because:
 *
 *   - "pages" collapses multiple SeoResourceTypes (homepage +
 *     accommodation_index) into a single shard file, since neither
 *     has its own natural collection URL pattern.
 *   - "search" has no shard — its adapter returns [] from
 *     getSitemapEntries, so it contributes zero sitemap URLs.
 *   - Plurals vs. singulars are intentional: the shard name becomes
 *     part of the URL (/sitemap_accommodations_1.xml), and plurals
 *     match the sitemap-protocol convention.
 */

import type { SeoTenantContext } from "../types";

// ── Resource types for sitemap sharding ──────────────────────

/**
 * Every resource type that produces a dedicated sitemap shard file.
 * Deliberately distinct from `SeoResourceType`:
 *   - "pages" fuses homepage + accommodation_index.
 *   - "search" is absent (never indexable).
 */
export type SitemapResourceType =
  | "accommodations"
  | "accommodation_categories"
  | "products"
  | "product_collections"
  | "pages";

/**
 * Canonical iteration order for the sitemap index. The aggregator
 * walks this list; the order determines how shard refs appear in
 * the `<sitemapindex>` output. Keep stable for crawler caching.
 */
export const SITEMAP_RESOURCE_TYPES: readonly SitemapResourceType[] = [
  "accommodations",
  "accommodation_categories",
  "products",
  "product_collections",
  "pages",
];

// ── Sharding constant ────────────────────────────────────────

/**
 * Sitemap.org hard cap: a single `<urlset>` file may contain at most
 * 50,000 URLs and 50 MiB uncompressed. We cap on URL count; the byte
 * cap is never the binding constraint at our URL shapes.
 *
 * Pilot tenants have <500 URLs total, so every shard is shard 1. The
 * structure is future-proof: the day a tenant exceeds 50k URLs of
 * one type, sharding activates without a code change.
 */
export const SHARD_SIZE = 50_000;

// ── Built-output shapes (aggregator → serializer contract) ──

/**
 * One URL ready for emission into a `<urlset>` shard. Produced by
 * per-resource-type fetchers; consumed by `sitemapShardToXml`.
 *
 * Every field is already resolved to a form the XML serializer can
 * emit without further computation: `url` and alternate URLs are
 * absolute (https://...), lastmod is a `Date` or null.
 */
export interface BuiltShardEntry {
  readonly url: string;
  readonly lastmod: Date | null;
  readonly alternates: ReadonlyArray<{
    readonly hreflang: string;
    readonly url: string;
  }>;
}

/**
 * One sitemap shard file's content: the ordered entries for
 * `resourceType` + `shardIndex`, plus a `hasMore` flag that tells
 * the index builder whether to probe shard N+1.
 *
 * Shard indexing is 1-based to match the URL convention
 * `/sitemap_<type>_<n>.xml`.
 */
export interface BuiltShard {
  readonly resourceType: SitemapResourceType;
  readonly shardIndex: number;
  readonly entries: readonly BuiltShardEntry[];
  readonly hasMore: boolean;
}

/**
 * A single `<sitemap>` ref inside `<sitemapindex>`. `url` is the
 * absolute URL to the shard file on the tenant's primary domain.
 * `lastmod` is MAX(entry.lastmod) across the shard's entries, or
 * null if every entry lacked a lastmod (the XML serializer omits
 * the tag in that case — sitemap.org permits omission).
 */
export interface BuiltSitemapIndexShardRef {
  readonly resourceType: SitemapResourceType;
  readonly shardIndex: number;
  readonly url: string;
  readonly lastmod: Date | null;
}

/** The full `<sitemapindex>` content. */
export interface BuiltSitemapIndex {
  readonly shards: readonly BuiltSitemapIndexShardRef[];
}

// ── Fetcher contract ────────────────────────────────────────

/**
 * Per-resource-type sitemap entry fetcher. M7.1 defines the contract;
 * M7.2 supplies Prisma-backed implementations and wires the
 * production `ShardRegistry`. M7.1 tests pass mock fetchers.
 *
 * ── Four-point contract (every implementation MUST obey) ───────
 *
 * 1. **Tenant isolation.** Every Prisma query MUST include
 *    `{ tenantId: tenant.id }` in its WHERE clause. No exceptions —
 *    a missing filter leaks entries from other tenants into a
 *    tenant's sitemap, which is both a privacy bug and a SERP
 *    correctness bug (crawler gets URLs that 404 on the tenant's
 *    own domain). Enforced by test fixtures that seed two tenants
 *    and assert no cross-bleeding.
 *
 * 2. **Pre-filter via adapter.isIndexable().** A row that the DB
 *    returns but the adapter deems non-indexable MUST NOT appear
 *    in the sitemap. DB WHEREs approximate the isIndexable rules
 *    (ACTIVE, not archived, etc.); the adapter is the authority.
 *    Fetchers call isIndexable on every row before calling
 *    adapter.getSitemapEntries. Two-layer defense: DB filters at
 *    query time, adapter filters as the final gate.
 *
 * 3. **Deterministic ordering.** Every query uses
 *    `orderBy: { id: "asc" }` (cuid lexicographic). All seoable
 *    entities use `@id @default(cuid())` per the schema audit, so
 *    id-asc produces a stable paginated sequence where shard 1
 *    and shard 2 never overlap or reorder between requests. If the
 *    id generator ever changes to uuid, switch to
 *    `[{ createdAt: "asc" }, { id: "asc" }]` at every callsite.
 *
 * 4. **Emit absolute URLs.** `BuiltShardEntry.url` and every
 *    alternate `url` MUST be absolute (`https://...`). Fetchers
 *    call the adapter's `getSitemapEntries`, which uses
 *    `buildAbsoluteUrl(tenant, locale, basePath)` under the hood.
 *    The XML serializer does NOT resolve relative paths — it
 *    xml-escapes and emits verbatim.
 */
export type SitemapShardFetcher = (args: {
  readonly tenant: SeoTenantContext;
  readonly limit: number;
  readonly offset: number;
}) => Promise<readonly BuiltShardEntry[]>;

/**
 * Maps every `SitemapResourceType` to its fetcher. `Record<…>`
 * ensures `tsc` rejects a registry missing any resource type —
 * a type-level guarantee that M7.2's wiring can't ship half-complete.
 */
export type ShardRegistry = Record<SitemapResourceType, SitemapShardFetcher>;

// ── robots.txt context ──────────────────────────────────────

/**
 * Input to `buildRobotsTxt`. The route handler owns the policy
 * (what sets `indexable = false`); the builder is a pure projection.
 *
 * `indexable = false` emits a fail-closed `Disallow: /`. Used by
 * the M7.4 robots route when `resolveTenantFromHost()` returns null
 * (unknown host) — we'd rather a crawler see "this host is off
 * limits" than risk indexing a fallback tenant's content.
 */
export interface RobotsContext {
  readonly primaryDomain: string;
  readonly indexable: boolean;
}
