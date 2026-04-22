/**
 * Cancellation engine — error taxonomy.
 *
 * Engine, adapters, and saga orchestrator raise these instead of generic
 * Errors so that call sites can branch precisely on transient vs. permanent
 * failure. Retry policy lives in the saga; adapters only classify.
 *
 * See admin/docs/cancellation-engine.md §9.
 */

/**
 * Engine-side error. Code is stable and machine-readable. Matches the
 * shape of Shopify's ReturnErrorCode usage — callers switch on `.code`,
 * not on `.message`.
 */
export type CancellationErrorCode =
  | "INVALID_STATE"
  | "NOT_FOUND"
  | "POLICY_MISSING"
  | "PRECONDITION_FAILED"
  | "IDEMPOTENCY_LOCK_HELD"
  | "BOOKING_NOT_CANCELLABLE";

export class CancellationError extends Error {
  readonly name = "CancellationError";
  constructor(
    public readonly code: CancellationErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

/**
 * Transient PMS failure — worth retrying. Saga increments attempts and
 * re-enters via the retry-cancellation-saga cron.
 *
 * Examples: 429 Too Many Requests, 408 Timeout, 500 Internal, network
 * errors, DNS failures.
 *
 * `retryAfterMs` is advisory — when provided (e.g. from a 429
 * Retry-After header), the saga may use it to override the default
 * exponential-backoff schedule.
 */
export class TransientPmsError extends Error {
  readonly name = "TransientPmsError";
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

/**
 * Permanent PMS failure — retry would not help. Saga DECLINES the
 * cancellation with reason=OTHER + a descriptive note, and escalates
 * to Sentry for ops review.
 *
 * Examples: 400 validation, 401 auth, 403 for a reservation in a
 * non-cancellable state that is NOT already-cancelled (that case is
 * handled inside the adapter and returns success).
 */
export class PermanentPmsError extends Error {
  readonly name = "PermanentPmsError";
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

/** Stripe refund transient — network / 5xx / rate limit. Saga retries Step 2. */
export class TransientStripeError extends Error {
  readonly name = "TransientStripeError";
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

/**
 * Stripe refund permanent — charge already refunded, charge disputed,
 * account frozen, etc. Saga marks refundStatus=FAILED and alerts admin;
 * PMS is NEVER reversed as compensation.
 */
export class PermanentStripeError extends Error {
  readonly name = "PermanentStripeError";
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}
