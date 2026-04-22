/**
 * Saga retry backoff schedule.
 *
 * Exponential with jitter. Jitter is deterministic-for-tests via an
 * optional RNG parameter, so unit tests don't flake on timing.
 *
 * See admin/docs/cancellation-engine.md §6.4.
 */

/** Delay in milliseconds before attempt N+1 given that N attempts have happened. */
const SCHEDULE_MS: readonly number[] = [
  60_000,      // attempt 1 failed → retry in 1 min
  5 * 60_000,  // attempt 2 failed → retry in 5 min
  30 * 60_000, // attempt 3 failed → retry in 30 min
  2 * 60 * 60_000, // attempt 4 failed → retry in 2 h
];

/**
 * Compute the next-attempt delay in milliseconds.
 *
 * @param attempts Number of attempts already completed (≥ 1 after first failure).
 * @param rng      Optional 0..1 source. Omit in production; inject in tests.
 * @returns null once the cap is reached — caller should escalate instead of retry.
 */
export function computeBackoffMs(
  attempts: number,
  rng: () => number = Math.random,
): number | null {
  if (!Number.isFinite(attempts) || attempts < 1) {
    return null;
  }
  const idx = attempts - 1;
  if (idx >= SCHEDULE_MS.length) return null;
  const base = SCHEDULE_MS[idx];
  // Jitter in [−20%, +20%] to avoid thundering-herd on the cron tick.
  const jitter = (rng() * 0.4 - 0.2) * base;
  return Math.max(0, Math.floor(base + jitter));
}

/**
 * Absolute Date of next attempt, or null if no more retries.
 * Callers set CancellationRequest.nextAttemptAt to this value.
 */
export function computeNextAttemptAt(
  attempts: number,
  now: Date = new Date(),
  rng: () => number = Math.random,
): Date | null {
  const ms = computeBackoffMs(attempts, rng);
  if (ms === null) return null;
  return new Date(now.getTime() + ms);
}
