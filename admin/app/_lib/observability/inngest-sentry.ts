/**
 * Inngest + Sentry observability helpers.
 *
 * Two helpers, both layered on top of the existing app/_lib/observability/
 * sentry.ts pattern (lazy `require("@sentry/nextjs")`, silent no-op when
 * the SDK isn't installed):
 *
 *   withSentry(step, name, tags, fn)
 *     Wraps an Inngest step in BOTH `step.run(name, ...)` AND a Sentry
 *     span. The Sentry span is INSIDE step.run, not outside — that
 *     ordering is critical: Inngest memoizes step results across retries,
 *     so a span outside step.run would not nest under the function's
 *     parent span on retry attempts. Inside step.run, every retry that
 *     re-executes the step body opens a fresh nested span.
 *
 *   captureDLQ(params)
 *     Sentry capture for outbox rows that exceeded ANALYTICS_DLQ_THRESHOLD.
 *     Uses the locked fingerprint:
 *         ["analytics", "dlq", event_name, error_type]
 *     so repeated DLQ failures of the same shape group into one Sentry
 *     issue with a rising counter, rather than spamming new issues.
 *     A new event_name or a new error_type → a new issue.
 *
 * The `@sentry/inngest` middleware package is intentionally NOT used in
 * Phase 1B (decision Q7). When we have ≥3 Inngest functions and pattern
 * duplication justifies the cross-cut, we'll standardize on it.
 */

import { analyticsSpan } from "@/app/_lib/analytics/pipeline/observability";
import { log } from "@/app/_lib/logger";

// ── Types ────────────────────────────────────────────────────────────────

/**
 * Minimal shape of Inngest's `step` object that we depend on. Typing
 * Inngest's full `StepTools<…>` at the helper boundary would drag deep
 * client-bound generics into every caller. The loose function type is
 * structurally compatible with both Inngest's real `step.run` (which
 * has a broader signature, `(idOrOptions, fn, ...inputs) => Promise<…>`)
 * and with vitest's `vi.fn()` mocks in unit tests. The cast on the
 * helper's return recovers the typed result.
 */
interface InngestStepLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (...args: any[]) => any;
}

interface SentryTags {
  /** Tenant CUID. Defaults to "system" when the step has no tenant context (cron scanners, etc.). */
  tenant_id?: string;
  /** Pipeline step identifier for grouping. Defaults to the wrapper's `name` arg if unset. */
  pipeline_step?: string;
  event_name?: string;
  schema_version?: string;
}

// ── withSentry ───────────────────────────────────────────────────────────

export async function withSentry<T>(
  step: InngestStepLike,
  name: string,
  tags: SentryTags,
  fn: () => Promise<T>,
): Promise<T> {
  // step.run gives Inngest memoization (retries skip already-completed
  // steps). analyticsSpan inside step.run gives a fresh Sentry span on
  // every actual execution. Don't invert this — see file header.
  return step.run(name, async () => {
    return analyticsSpan(
      name,
      {
        tenant_id: tags.tenant_id ?? "system",
        pipeline_step: tags.pipeline_step ?? name,
        ...(tags.event_name !== undefined ? { event_name: tags.event_name } : {}),
        ...(tags.schema_version !== undefined
          ? { schema_version: tags.schema_version }
          : {}),
      },
      fn,
    );
  }) as Promise<T>;
}

// ── captureDLQ ───────────────────────────────────────────────────────────

export interface CaptureDLQParams {
  tenant_id: string;
  event_id: string;
  event_name: string;
  schema_version: string;
  failed_count: number;
  error: Error;
}

export function captureDLQ(params: CaptureDLQParams): void {
  const errorType = params.error.constructor.name;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs");
    Sentry.captureException(params.error, {
      tags: {
        tenant_id: params.tenant_id,
        event_id: params.event_id,
        event_name: params.event_name,
        schema_version: params.schema_version,
        failed_count: params.failed_count,
        pipeline_step: "drainer.dlq",
      },
      fingerprint: ["analytics", "dlq", params.event_name, errorType],
      extra: { error_message: params.error.message },
    });
  } catch {
    // Sentry not initialised (test env / no-Sentry-deploy). Fall back
    // to the structured logger so the DLQ event is still visible.
  }
  // Also log structured — Sentry is the alert path; the log line is the
  // operational searchable record. Both are fire-and-forget; neither
  // blocks the drainer.
  log("error", "analytics.drainer.dlq", {
    tenantId: params.tenant_id,
    eventId: params.event_id,
    eventName: params.event_name,
    schemaVersion: params.schema_version,
    failedCount: params.failed_count,
    errorType,
    error: params.error.message,
  });
}
