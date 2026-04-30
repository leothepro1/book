/**
 * Sentry instrumentation helpers for the analytics pipeline.
 *
 * Layered on top of the existing app/_lib/observability/sentry.ts pattern:
 * tenant context (tenantId tag + tenant context object) is set upstream by
 * the request resolver. These helpers add analytics-specific breadcrumbs
 * and spans on top of that scope without re-setting tenant context.
 *
 * Both helpers are wrapped in defensive try/catch around the Sentry import
 * to match setSentryTenantContext()'s pattern: in test or no-Sentry
 * environments, calls become no-ops rather than crashing the pipeline.
 */

type Sentry = {
  addBreadcrumb: (b: {
    category: string;
    message: string;
    data?: Record<string, unknown>;
    level?: "info" | "warning" | "error";
  }) => void;
  startSpan: <T>(
    options: { name: string; attributes?: Record<string, unknown> },
    callback: () => Promise<T> | T,
  ) => Promise<T>;
  captureException: (
    err: unknown,
    scope?: {
      tags?: Record<string, string | number | boolean>;
      fingerprint?: string[];
    },
  ) => void;
};

function loadSentry(): Sentry | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@sentry/nextjs") as Sentry;
  } catch {
    return null;
  }
}

/**
 * Emit a Sentry breadcrumb under the analytics namespace.
 *
 * Category becomes `analytics.<category>` (e.g. analytics.outbox,
 * analytics.ingest). Tenant context is assumed already on scope.
 */
export function analyticsBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const sentry = loadSentry();
  if (!sentry) return;
  try {
    sentry.addBreadcrumb({
      category: `analytics.${category}`,
      message,
      data,
      level: "info",
    });
  } catch {
    // Sentry initialised but breadcrumb call failed — never let observability
    // break the pipeline.
  }
}

/**
 * Wrap an operation in a Sentry span tagged with analytics-specific metadata.
 *
 * On error: the span is marked failed, the error is captured with a
 * fingerprint of `['analytics', tags.pipeline_step, error.constructor.name]`
 * so similar pipeline errors group across tenants, and the error is rethrown
 * so the caller's normal error handling fires.
 */
export async function analyticsSpan<T>(
  name: string,
  tags: {
    tenant_id: string;
    pipeline_step: string;
    event_name?: string;
    schema_version?: string;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const sentry = loadSentry();
  if (!sentry) {
    return fn();
  }
  try {
    return await sentry.startSpan(
      {
        name,
        attributes: {
          "analytics.tenant_id": tags.tenant_id,
          "analytics.pipeline_step": tags.pipeline_step,
          ...(tags.event_name
            ? { "analytics.event_name": tags.event_name }
            : {}),
          ...(tags.schema_version
            ? { "analytics.schema_version": tags.schema_version }
            : {}),
        },
      },
      fn,
    );
  } catch (err) {
    try {
      sentry.captureException(err, {
        tags: {
          tenant_id: tags.tenant_id,
          pipeline_step: tags.pipeline_step,
          ...(tags.event_name ? { event_name: tags.event_name } : {}),
        },
        fingerprint: [
          "analytics",
          tags.pipeline_step,
          err instanceof Error ? err.constructor.name : "UnknownError",
        ],
      });
    } catch {
      // Sentry capture failed — swallow; the original error is about to
      // rethrow and reach the caller's handler regardless.
    }
    throw err;
  }
}
