/**
 * M7 Sitemap — aggregator
 * ═══════════════════════
 *
 * Builds the per-tenant sitemap index and per-shard entry lists by
 * walking a `ShardRegistry` of per-resource-type fetchers. Pure with
 * respect to its fetcher dependency: the registry is passed in, not
 * resolved from a module-level singleton. M7.1 tests pass mock
 * registries; M7.2 wires the production registry through route
 * handlers.
 *
 * ── Iteration model ────────────────────────────────────────────
 * For each `SitemapResourceType` in SITEMAP_RESOURCE_TYPES order, the
 * index builder probes shard 1, then shard 2, etc., until a shard
 * returns null (out-of-range) or signals `hasMore = false`. Shards
 * with zero entries are NOT emitted in the index — empty types are
 * omitted entirely rather than referencing empty urlset files.
 *
 * Fetches are SEQUENTIAL across resource types. Parallelizing 5
 * fetches per sitemap request at 10k-tenant scale multiplies peak DB
 * load without a user-visible latency win (sitemap is s-maxage cached
 * for 1h in the edge). Sequential keeps DB pressure predictable.
 *
 * ── Overshoot on `hasMore` ─────────────────────────────────────
 * `hasMore` is set when a fetcher returns exactly SHARD_SIZE entries.
 * In the exact-boundary case ("tenant has exactly 50,000 products")
 * the index builder probes shard 2, gets an empty result, and the
 * probe returns null — no empty shard is referenced. One extra DB
 * round-trip in that corner case, vs. a guaranteed COUNT query per
 * resource type per sitemap request. At pilot scale the tradeoff is
 * trivially in the overshoot's favour.
 *
 * ── Error wrapping ─────────────────────────────────────────────
 * A fetcher rejection is wrapped in `SitemapAggregationError` so the
 * route handler can:
 *   - log `seo.sitemap.aggregation_failed` with resourceType +
 *     shardIndex + tenantId and the underlying `cause`,
 *   - return 503 + Retry-After without leaking fetcher internals.
 * Wrapping happens at the buildShardForTenant boundary. The index
 * builder awaits shard builds — any wrapped error propagates through
 * unchanged (no partial index is ever returned).
 */

import type { SeoTenantContext } from "../types";
import {
  type BuiltShard,
  type BuiltShardEntry,
  type BuiltSitemapIndex,
  type BuiltSitemapIndexShardRef,
  type ShardRegistry,
  type SitemapResourceType,
  SHARD_SIZE,
  SITEMAP_RESOURCE_TYPES,
} from "./types";

// ── Error wrapping ──────────────────────────────────────────

/**
 * Thrown when a `SitemapShardFetcher` rejects during aggregation.
 * Carries the resource type, 1-based shard index, tenant id, and
 * the original `cause` — enough for the M7.3 route handler to emit
 * a structured `seo.sitemap.aggregation_failed` log event without
 * reading into fetcher internals.
 *
 * Never constructed outside this module. Callers consume it as a
 * named error class — `err instanceof SitemapAggregationError` is
 * the supported branching mechanism.
 */
export class SitemapAggregationError extends Error {
  constructor(
    public readonly resourceType: SitemapResourceType,
    public readonly shardIndex: number,
    public readonly tenantId: string,
    public readonly cause: unknown,
  ) {
    super(
      `Sitemap aggregation failed for ${resourceType} shard ${shardIndex} ` +
        `(tenant ${tenantId})`,
    );
    this.name = "SitemapAggregationError";
  }
}

// ── Shard builder ───────────────────────────────────────────

/**
 * Build a single sitemap shard for the given `(resourceType, shardIndex)`.
 *
 * Returns:
 *   - A `BuiltShard` when the requested shard materializes (even if
 *     its entries are empty AND shardIndex === 1; the route handler
 *     can serve a valid empty `<urlset>` for a direct request to a
 *     shard URL that happens to have no entries yet).
 *   - `null` when the shard is out of range — either `shardIndex < 1`
 *     (invalid input) or `shardIndex > 1` with zero entries (the
 *     fetcher ran out of rows one page before this).
 *
 * Throws `SitemapAggregationError` (wrapping the fetcher's error) if
 * the underlying fetcher rejects. The wrapped `.cause` preserves the
 * original error for structured logging upstream.
 */
export async function buildShardForTenant(
  tenant: SeoTenantContext,
  resourceType: SitemapResourceType,
  shardIndex: number,
  registry: ShardRegistry,
): Promise<BuiltShard | null> {
  if (!Number.isInteger(shardIndex) || shardIndex < 1) return null;

  const fetcher = registry[resourceType];
  const offset = (shardIndex - 1) * SHARD_SIZE;

  let entries: readonly BuiltShardEntry[];
  try {
    entries = await fetcher({ tenant, limit: SHARD_SIZE, offset });
  } catch (cause) {
    throw new SitemapAggregationError(
      resourceType,
      shardIndex,
      tenant.id,
      cause,
    );
  }

  // Out-of-range: a non-first shard with zero entries means the
  // fetcher already exhausted the table on the previous shard. The
  // index builder uses this to terminate its probe loop.
  if (entries.length === 0 && shardIndex > 1) return null;

  return {
    resourceType,
    shardIndex,
    entries,
    hasMore: entries.length === SHARD_SIZE,
  };
}

// ── Index builder ───────────────────────────────────────────

/**
 * Build the full sitemap index for a tenant. Iterates
 * `SITEMAP_RESOURCE_TYPES` in declared order and probes shards
 * until each type exhausts. Empty-entries shards are skipped; only
 * shards with ≥1 entry are referenced in the index.
 */
export async function buildSitemapIndexForTenant(
  tenant: SeoTenantContext,
  registry: ShardRegistry,
): Promise<BuiltSitemapIndex> {
  const shards: BuiltSitemapIndexShardRef[] = [];

  for (const resourceType of SITEMAP_RESOURCE_TYPES) {
    let shardIndex = 1;
    while (true) {
      const shard = await buildShardForTenant(
        tenant,
        resourceType,
        shardIndex,
        registry,
      );
      if (shard === null) break;
      if (shard.entries.length > 0) {
        shards.push({
          resourceType,
          shardIndex,
          url: buildShardUrl(tenant, resourceType, shardIndex),
          lastmod: maxLastmod(shard.entries),
        });
      }
      if (!shard.hasMore) break;
      shardIndex += 1;
    }
  }

  return { shards };
}

// ── Helpers ─────────────────────────────────────────────────

function buildShardUrl(
  tenant: SeoTenantContext,
  resourceType: SitemapResourceType,
  shardIndex: number,
): string {
  return `https://${tenant.primaryDomain}/sitemap_${resourceType}_${shardIndex}.xml`;
}

/**
 * MAX(lastmod) across a shard's entries, skipping nulls. Returns
 * null only when every entry has a null lastmod — sitemap.org
 * permits `<lastmod>` omission on the parent `<sitemap>` ref.
 */
function maxLastmod(entries: readonly BuiltShardEntry[]): Date | null {
  let max: Date | null = null;
  for (const entry of entries) {
    if (entry.lastmod === null) continue;
    if (max === null || entry.lastmod.getTime() > max.getTime()) {
      max = entry.lastmod;
    }
  }
  return max;
}
