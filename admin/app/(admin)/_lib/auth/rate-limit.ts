/**
 * Simple in-memory sliding window rate limiter.
 *
 * Stores timestamps per key in a Map. On each check, expired entries
 * are pruned and the current count is compared against the limit.
 *
 * Limitation: state is per-process. In a multi-instance deployment,
 * each instance tracks independently. For stricter enforcement,
 * upgrade to Redis/Upstash.
 */

const store = new Map<string, number[]>();

const WINDOW_MS = 3_600_000; // 1 hour
const MAX_REQUESTS = 20;

/**
 * Checks if the given key has exceeded the rate limit.
 * Automatically records the current request if allowed.
 *
 * @returns true if the request is allowed, false if rate limited
 */
export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  // Get existing timestamps and prune expired ones
  const timestamps = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= MAX_REQUESTS) {
    store.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return true;
}
