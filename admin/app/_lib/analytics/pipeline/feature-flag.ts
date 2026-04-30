/**
 * Per-tenant analytics-pipeline feature flag.
 *
 * Reads `analytics.tenant_config.pipeline_enabled`. Cached in-process for 60
 * seconds via a Map-based LRU (max 1000 tenants). Per-process means a flag
 * flip can take up to 60s to propagate fleet-wide on Vercel; that's an
 * intentional tradeoff against round-tripping the DB on every event emit.
 *
 * Safe default: missing tenant_config row → returns `false`. New tenants are
 * dormant in the pipeline until explicitly enabled.
 */

import { withTenant } from "@/app/_lib/analytics/pipeline/tenant";

const TTL_MS = 60_000;
const MAX_ENTRIES = 1000;

type CacheEntry = { value: boolean; expiresAt: number };

const cache = new Map<string, CacheEntry>();

function cacheGet(tenantId: string): boolean | undefined {
  const entry = cache.get(tenantId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(tenantId);
    return undefined;
  }
  // LRU touch: re-insert so iteration order reflects recent use.
  cache.delete(tenantId);
  cache.set(tenantId, entry);
  return entry.value;
}

function cacheSet(tenantId: string, value: boolean): void {
  if (cache.has(tenantId)) cache.delete(tenantId);
  cache.set(tenantId, { value, expiresAt: Date.now() + TTL_MS });
  // Evict oldest until under cap. Map preserves insertion order, so the
  // oldest entry is the one returned first by .keys().
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Returns whether the analytics pipeline is enabled for this tenant.
 *
 * Returns false (safe default) if no tenant_config row exists, or if the
 * row's pipeline_enabled column is false.
 */
export async function isAnalyticsEnabledForTenant(
  tenantId: string,
): Promise<boolean> {
  const cached = cacheGet(tenantId);
  if (cached !== undefined) return cached;

  const enabled = await withTenant(tenantId, async (db) => {
    const row = await db.analyticsPipelineTenantConfig.findUnique({
      where: { tenantId },
      select: { pipelineEnabled: true },
    });
    return row?.pipelineEnabled ?? false;
  });

  cacheSet(tenantId, enabled);
  return enabled;
}

/**
 * Clears the in-process cache. Test-only helper — production doesn't expose
 * a flush path because the 60s TTL is the propagation contract.
 */
export function _clearAnalyticsFeatureFlagCacheForTests(): void {
  cache.clear();
}
