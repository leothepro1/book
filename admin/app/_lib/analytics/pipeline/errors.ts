/**
 * Analytics pipeline emit/validation/transaction errors.
 *
 * Phase 0 tenant-scoping errors (AnalyticsTenantError, AnalyticsTenantMissingError,
 * AnalyticsTenantInvalidError, AnalyticsTenantMismatchError) live in tenant.ts
 * and are intentionally NOT re-exported here — keep the error class hierarchy
 * close to the helper that throws it. Phase 0 schema/registry errors live in
 * schemas/registry.ts for the same reason.
 */

import type { ZodIssue } from "zod";

export class AnalyticsEmitError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "AnalyticsEmitError";
  }
}

/**
 * Thrown when a payload fails Zod validation against the registered schema
 * for (event_name, schema_version). The Zod issues are attached so callers
 * can surface field-level errors in logs / observability without re-parsing
 * the message.
 */
export class AnalyticsValidationError extends AnalyticsEmitError {
  constructor(
    public readonly issues: readonly ZodIssue[],
    message?: string,
  ) {
    super(message ?? `analytics payload failed schema validation (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
    this.name = "AnalyticsValidationError";
  }
}

/**
 * Thrown when emitAnalyticsEvent is called outside an active Prisma
 * transaction. The emitter requires an operational `tx` so the outbox row
 * is committed atomically with the operational mutation that triggered it.
 */
export class AnalyticsTransactionRequiredError extends AnalyticsEmitError {
  constructor(message?: string) {
    super(message ?? "emitAnalyticsEvent must be called from inside a Prisma $transaction — pass the `tx` argument from your operational transaction.");
    this.name = "AnalyticsTransactionRequiredError";
  }
}
