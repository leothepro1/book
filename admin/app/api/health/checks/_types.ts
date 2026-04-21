/**
 * Shared types for the readiness-check registry.
 *
 * A Check is a single dependency probe (DB, Redis, etc). The registry
 * in ./index.ts owns the full list. Each check must be:
 *   - idempotent (running it twice produces the same result)
 *   - side-effect-free (no writes, no mutations)
 *   - self-contained (its own try/catch; never throws to the caller)
 *
 * A check that throws is a bug — the readiness route assumes every
 * run() resolves with a CheckResult, even on failure.
 */

export type CheckStatus = "ok" | "degraded" | "down";

export interface CheckResult {
  /** Stable identifier used in query params and logs. Snake_case. */
  name: string;
  status: CheckStatus;
  /** Wall-clock latency of the probe in milliseconds. */
  latency_ms: number;
  /**
   * Human-readable one-line summary — safe to expose publicly.
   * No stack traces, no connection strings, no credentials.
   */
  message?: string;
  /**
   * Optional non-sensitive structured details (e.g. a count, a mode name).
   * Exposed in the public response, so must not contain secrets.
   */
  details?: Record<string, string | number | boolean>;
}

export interface Check {
  /** Must be unique across the registry and stable across versions. */
  name: string;
  /**
   * Hard timeout in milliseconds. The readiness route wraps run() in
   * Promise.race with this duration; a timed-out check yields a synthetic
   * CheckResult with status='down'.
   */
  timeout_ms: number;
  /**
   * Runs the probe. Must catch all internal errors and return a
   * CheckResult with status='down' + a safe message on failure.
   * MUST NOT throw.
   */
  run(): Promise<CheckResult>;
}
