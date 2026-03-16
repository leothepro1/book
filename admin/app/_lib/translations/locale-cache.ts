// ── Published locale cache ────────────────────────────────────
//
// Pure in-memory cache. No DB dependency. Edge-safe.
// Middleware and API routes both import this module.
// Middleware uses getCached/setCached. API routes use invalidate.

const cache = new Map<string, { value: boolean; expiresAt: number }>();

const TTL_MS = 10_000; // 10 seconds

/**
 * Check cache for published state. Returns null on cache miss.
 * If tenantPrimaryLocale is provided, that locale always returns true.
 */
export function getCachedLocalePublished(
  tenantId: string,
  locale: string,
  tenantPrimaryLocale?: string,
): boolean | null {
  // Tenant's primary locale is always published
  if (tenantPrimaryLocale && locale === tenantPrimaryLocale) return true;

  const cacheKey = `${tenantId}:${locale}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  return null; // cache miss
}

/**
 * Store published state in cache.
 */
export function setCachedLocalePublished(tenantId: string, locale: string, published: boolean): void {
  cache.set(`${tenantId}:${locale}`, { value: published, expiresAt: Date.now() + TTL_MS });
}

/**
 * Invalidate cache for a specific tenant + locale.
 * Call after publishing/unpublishing a locale.
 */
export function invalidateLocaleCache(tenantId: string, locale?: string): void {
  if (locale) {
    cache.delete(`${tenantId}:${locale}`);
  } else {
    for (const key of cache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        cache.delete(key);
      }
    }
  }
}
