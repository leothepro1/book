/**
 * withRedisCache — read-through cache wrapper.
 *
 * Track 3's first consumer of this pattern. Per recon §3.2:
 *
 *   - On `redis.get(key)` non-null + JSON-parseable → return
 *     { value: cached, source: "cache" }.
 *   - On miss → await fetcher(), redis.set(key, JSON.stringify(value),
 *     { ex: ttlSeconds }), return { value, source: "fresh" }.
 *   - Redis errors during get/set are NEVER fatal — they fall through
 *     to fetcher() and we still serve fresh data. Each error emits a
 *     structured log warn.
 *   - Dev mode (Proxy returns null on get): pass-through. Fetcher runs
 *     every call; the helper effectively becomes a no-op cache.
 *
 * Singleton: uses `redis` from `@/app/_lib/redis/client` per
 * admin/CLAUDE.md "Enterprise infrastructure" rule. Never instantiates
 * Redis directly.
 *
 * Key namespacing: callers should follow the convention
 * `bedfront:cache:<domain>:<purpose>:<scope>` (matches the existing
 * `bedfront:ratelimit:` prefix scheme at
 * app/_lib/analytics/pipeline/rate-limit.ts:43). The helper does NOT
 * enforce this — that's a per-call discipline.
 */

import { redis } from "@/app/_lib/redis/client";
import { log } from "@/app/_lib/logger";

export interface CacheResult<T> {
  value: T;
  source: "cache" | "fresh";
}

/**
 * Read-through cache. Returns the cached value when present, otherwise
 * runs the fetcher, caches the result with TTL, and returns it.
 *
 * The fetcher's error path is the caller's responsibility — this
 * helper does not catch fetcher exceptions. Only redis.get/set errors
 * are absorbed (they degrade to a fresh fetch).
 */
export async function withRedisCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<CacheResult<T>> {
  // ── 1. Attempt cache read ──────────────────────────────────────
  let cached: unknown = null;
  try {
    cached = await redis.get(key);
  } catch (err) {
    log("warn", "analytics.live_cache.get_failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    cached = null;
  }

  if (cached !== null && cached !== undefined) {
    // The Upstash REST client deserialises JSON automatically: a
    // value previously stored as `JSON.stringify(value)` comes back
    // as the parsed object. Strings stored unwrapped come back as
    // strings. We accept whichever shape arrives.
    if (typeof cached === "string") {
      try {
        const parsed = JSON.parse(cached) as T;
        return { value: parsed, source: "cache" };
      } catch {
        // Treat un-parseable string as cache miss; fall through.
        log("warn", "analytics.live_cache.parse_failed", { key });
      }
    } else {
      return { value: cached as T, source: "cache" };
    }
  }

  // ── 2. Cache miss → fetcher → cache write ──────────────────────
  const fresh = await fetcher();

  try {
    await redis.set(key, JSON.stringify(fresh), { ex: ttlSeconds });
  } catch (err) {
    log("warn", "analytics.live_cache.set_failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    // Don't fail the request — we already have the fresh value.
  }

  return { value: fresh, source: "fresh" };
}
