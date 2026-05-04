/**
 * Sampling helper for high-volume observability events.
 *
 * Per task brief (Web Claude review point #1 + #2): the besökare
 * widget's cache hits would generate ~33 log lines/sec at fleet
 * scale (10K tenants × 1 poll/5min). Logging every hit is too
 * noisy. Logging zero hits leaves ops blind to Redis degradation.
 *
 * The compromise: always log misses + errors (low-volume, high-
 * signal), sample hits at 1% (low-signal, high-volume).
 *
 * This is a deliberately simple Math.random() sampler, not a
 * deterministic per-tenant or per-key one. We don't need fairness
 * across tenants; we need a tractable log volume that still
 * captures the cache-hit-rate signal in aggregate.
 *
 * Track 3 is the first consumer; the helper is intentionally small
 * (no per-rate-window throttling, no exponential decay) so it can
 * be reused or replaced as later use cases emerge.
 */

/**
 * Returns true with probability `rate`. Rate must be in (0, 1].
 *
 * `rate = 1` always returns true (every event sampled in).
 * `rate = 0.01` returns true ~1% of calls.
 *
 * Math.random() is intentionally non-deterministic — we don't need
 * the same event to always be sampled across replicas.
 */
export function shouldSample(rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return Math.random() < rate;
}

/**
 * Default sample rate for cache-hit logs. 1% chosen so a 33-RPS
 * fleet generates ~0.33 lines/sec of cache-hit observability — a
 * tractable volume that still surfaces hit-rate trends in
 * structured-log aggregations.
 */
export const CACHE_HIT_SAMPLE_RATE = 0.01;
