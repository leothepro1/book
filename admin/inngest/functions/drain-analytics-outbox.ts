/**
 * drain-analytics-outbox — per-tenant outbox drainer.
 *
 * Triggered by `analytics.outbox.flush` events. Reads pending rows from
 * `analytics.outbox` for the tenant, validates each against the schema
 * registry, inserts validated rows into `analytics.event`, and marks the
 * outbox row as published. Handles partial failures by incrementing
 * `failed_count` and DLQ-ing rows whose count exceeds
 * `ANALYTICS_DLQ_THRESHOLD` (default 5).
 *
 * Concurrency: 1 per tenant. The locked design decision is "cap drainer
 * concurrency to 1 per tenant; unlimited between tenants". Inngest's
 * `concurrency.key = "event.data.tenant_id"` partitions runs into
 * per-tenant buckets — same tenant serializes, different tenants run in
 * parallel.
 *
 * Retries: Inngest's built-in step retry (default 5 attempts with
 * exponential backoff). One drain attempt = one batch of up to
 * `BATCH_SIZE` rows = one Postgres transaction. If the transaction
 * fails the entire batch rolls back and Inngest re-runs from scratch.
 * Per-row failures (validation, insert) increment `failed_count` and
 * DO commit (so the next drain doesn't re-process them with their
 * counter unchanged) — those don't trigger Inngest retry.
 *
 * SELECT FOR UPDATE SKIP LOCKED ensures concurrent drainers (e.g. a
 * cron-triggered fan-out arriving while a flush event is mid-process)
 * don't fight over the same rows.
 *
 * Append-only: this function never UPDATEs `analytics.event`. The
 * `INSERT ... ON CONFLICT (event_id, occurred_at) DO NOTHING` clause
 * handles the partial-failure recovery where a previous drain
 * succeeded on the event INSERT but crashed before updating the outbox.
 * Next drain re-inserts (no-op via conflict) and finally marks the
 * outbox row published.
 */

import { Prisma } from "@prisma/client";

import {
  _unguardedAnalyticsPipelineClient,
} from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  analyticsBreadcrumb,
  analyticsSpan,
} from "@/app/_lib/analytics/pipeline/observability";
import {
  AnalyticsSchemaNotRegisteredError,
  AnalyticsSchemaVersionMissingError,
  getEventSchema,
} from "@/app/_lib/analytics/pipeline/schemas/registry";
import { inngest } from "@/inngest/client";

const BATCH_SIZE = 100;
const DEFAULT_DLQ_THRESHOLD = 5;

function getDlqThreshold(): number {
  const raw = process.env.ANALYTICS_DLQ_THRESHOLD;
  if (!raw) return DEFAULT_DLQ_THRESHOLD;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DLQ_THRESHOLD;
  return n;
}

interface OutboxRow {
  id: string;
  tenant_id: string;
  event_id: string;
  event_name: string;
  schema_version: string;
  payload: unknown;
  actor_type: string;
  actor_id: string | null;
  correlation_id: string | null;
  created_at: Date;
  failed_count: number;
}

interface BatchResult {
  processed: number;
  failed: number;
  dlq: number;
  remaining_hint: boolean;
}

export const drainAnalyticsOutbox = inngest.createFunction(
  {
    id: "drain-analytics-outbox",
    triggers: [{ event: "analytics.outbox.flush" }],
    concurrency: {
      limit: 1,
      key: "event.data.tenant_id",
    },
    retries: 5,
  },
  async ({ event, step }) => {
    const tenantId = event.data.tenant_id;
    const dlqThreshold = getDlqThreshold();

    analyticsBreadcrumb("drainer", "batch_start", {
      tenant_id: tenantId,
      hint_count: event.data.hint_count ?? null,
    });

    const result = await step.run("drain-batch", async () =>
      analyticsSpan(
        "drainer.batch",
        { tenant_id: tenantId, pipeline_step: "drainer.batch" },
        () => drainOneBatch(tenantId, dlqThreshold),
      ),
    );

    log("info", "analytics.drainer.batch_complete", {
      tenantId,
      processed: result.processed,
      failed: result.failed,
      dlq: result.dlq,
      remainingHint: result.remaining_hint,
    });

    analyticsBreadcrumb("drainer", "batch_complete", {
      tenant_id: tenantId,
      ...result,
    });

    // If the batch returned a full BATCH_SIZE of processed+failed rows,
    // there may be more pending rows. Fan out a follow-up flush event
    // so we drain in pipeline rather than wait for the next cron tick
    // or external signal.
    if (result.remaining_hint) {
      await step.sendEvent("drain-followup", {
        name: "analytics.outbox.flush",
        data: { tenant_id: tenantId },
      });
    }

    return result;
  },
);

async function drainOneBatch(
  tenantId: string,
  dlqThreshold: number,
): Promise<BatchResult> {
  return _unguardedAnalyticsPipelineClient.$transaction(async (tx) => {
    // 1. Lock + read pending rows for this tenant.
    const rows = await tx.$queryRaw<OutboxRow[]>`
      SELECT id, tenant_id, event_id, event_name, schema_version,
             payload, actor_type, actor_id, correlation_id, created_at,
             failed_count
      FROM analytics.outbox
      WHERE tenant_id = ${tenantId}
        AND published_at IS NULL
      ORDER BY created_at
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    if (rows.length === 0) {
      return { processed: 0, failed: 0, dlq: 0, remaining_hint: false };
    }

    let processed = 0;
    let failed = 0;
    let dlq = 0;

    for (const row of rows) {
      const outcome = await processRow(tx, row, dlqThreshold);
      if (outcome === "processed") processed++;
      else if (outcome === "dlq") dlq++;
      else failed++;
    }

    return {
      processed,
      failed,
      dlq,
      remaining_hint: rows.length === BATCH_SIZE,
    };
  });
}

type RowOutcome = "processed" | "failed" | "dlq";

async function processRow(
  tx: Prisma.TransactionClient,
  row: OutboxRow,
  dlqThreshold: number,
): Promise<RowOutcome> {
  try {
    // 1. Validate against registry.
    const schema = getEventSchema(row.event_name, row.schema_version);
    const candidate = {
      event_id: row.event_id,
      tenant_id: row.tenant_id,
      event_name: row.event_name,
      schema_version: row.schema_version,
      occurred_at: row.created_at,
      correlation_id: row.correlation_id,
      payload: row.payload,
      actor_type: row.actor_type,
      actor_id: row.actor_id,
    };
    schema.parse(candidate);

    // 2. INSERT into analytics.event with ON CONFLICT for the
    //    "previous drain partially succeeded" recovery path.
    //    The composite PK (event_id, occurred_at) is what we conflict on.
    await tx.$executeRaw`
      INSERT INTO analytics.event (
        event_id, tenant_id, event_name, schema_version,
        occurred_at, received_at, correlation_id,
        actor_type, actor_id, payload, context
      ) VALUES (
        ${row.event_id},
        ${row.tenant_id},
        ${row.event_name},
        ${row.schema_version},
        ${row.created_at},
        NOW(),
        ${row.correlation_id},
        ${row.actor_type},
        ${row.actor_id},
        ${JSON.stringify(row.payload)}::jsonb,
        NULL
      )
      ON CONFLICT (event_id, occurred_at) DO NOTHING
    `;

    // 3. Mark outbox row published.
    await tx.$executeRaw`
      UPDATE analytics.outbox
      SET published_at = NOW()
      WHERE id = ${row.id}
    `;

    return "processed";
  } catch (err) {
    const newFailedCount = row.failed_count + 1;
    const errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    const errorType =
      err instanceof AnalyticsSchemaNotRegisteredError
        ? "SchemaNotRegistered"
        : err instanceof AnalyticsSchemaVersionMissingError
          ? "SchemaVersionMissing"
          : err instanceof Error
            ? err.constructor.name
            : "UnknownError";

    if (newFailedCount > dlqThreshold) {
      await tx.$executeRaw`
        UPDATE analytics.outbox
        SET failed_count = ${newFailedCount},
            last_error = ${"[DLQ] " + errorMessage},
            published_at = NOW()
        WHERE id = ${row.id}
      `;
      // Sentry capture for DLQ — fingerprint per locked design decision
      // (Phase 1B Sentry helper lives in app/_lib/observability/inngest-sentry.ts,
      // shipped in Commit B; for Commit A the drainer captures inline so the
      // pipeline is functional end-to-end, then Commit B promotes the helper).
      captureDLQInline({
        tenant_id: row.tenant_id,
        event_id: row.event_id,
        event_name: row.event_name,
        schema_version: row.schema_version,
        failed_count: newFailedCount,
        error_type: errorType,
        error_message: errorMessage,
      });
      return "dlq";
    }

    await tx.$executeRaw`
      UPDATE analytics.outbox
      SET failed_count = ${newFailedCount},
          last_error = ${errorMessage}
      WHERE id = ${row.id}
    `;

    log("warn", "analytics.drainer.row_failed", {
      tenantId: row.tenant_id,
      eventId: row.event_id,
      eventName: row.event_name,
      schemaVersion: row.schema_version,
      failedCount: newFailedCount,
      errorType,
      error: errorMessage,
    });

    return "failed";
  }
}

interface DLQCapture {
  tenant_id: string;
  event_id: string;
  event_name: string;
  schema_version: string;
  failed_count: number;
  error_type: string;
  error_message: string;
}

function captureDLQInline(params: DLQCapture): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs");
    Sentry.captureException(new Error(`[DLQ] ${params.error_message}`), {
      tags: {
        tenant_id: params.tenant_id,
        event_id: params.event_id,
        event_name: params.event_name,
        schema_version: params.schema_version,
        failed_count: params.failed_count,
        pipeline_step: "drainer.dlq",
      },
      fingerprint: ["analytics", "dlq", params.event_name, params.error_type],
      extra: {
        error_message: params.error_message,
      },
    });
  } catch {
    // Sentry not initialised — log only.
    log("error", "analytics.drainer.dlq", {
      tenantId: params.tenant_id,
      eventId: params.event_id,
      eventName: params.event_name,
      schemaVersion: params.schema_version,
      failedCount: params.failed_count,
      errorType: params.error_type,
      error: params.error_message,
    });
  }
}
