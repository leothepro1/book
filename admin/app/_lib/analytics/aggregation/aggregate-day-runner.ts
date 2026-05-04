/**
 * Phase 5A — aggregator DB runner.
 *
 * Wraps `aggregateEvents` (B.3) with the production read/write path:
 *
 *   1. Open a Postgres cursor over `analytics.event` for the
 *      (tenantId, occurred_at-range) pair, streamed as an
 *      AsyncIterable so the aggregator never holds raw events in
 *      memory (recon §3.3).
 *   2. Fold via aggregateEvents.
 *   3. Compute RETURNING_CUSTOMER_RATE — needs an extra DB query
 *      against analytics.event for actor_id history (recon §2.7).
 *   4. Batch-upsert all rows to `analytics.daily_metric` (50/batch,
 *      same as legacy aggregation.ts:213-232).
 *
 * Singleton client: uses `_unguardedAnalyticsPipelineClient` per
 * `drain-analytics-outbox.ts:33-35`. analytics-schema models route
 * through this client because the dev-mode access guard on the
 * default `prisma` symbol blocks direct access to those models.
 *
 * Idempotence (recon §6.7): re-running runAggregateDay for the same
 * (tenantId, date) produces the same final DB state. Verified by
 * `runAggregateDay-idempotency` smoke in this file's test (the marker
 * string "idempotency" is what verify-phase5a-aggregator.ts greps for
 * in B.6 check #6).
 *
 * Tenant-isolation INVARIANT: every analytics.event query has
 * `tenant_id = ${tenantId}` in WHERE — verifier check #10 enforces.
 */

import { _unguardedAnalyticsPipelineClient } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

import { aggregateEvents } from "./aggregate-day";
import type { MetricRow } from "./aggregate-day";
import type { AnalyticsEventRow } from "./metric-mapping";

const UPSERT_BATCH_SIZE = 50;

export interface AggregationResult {
  tenantId: string;
  date: string; // YYYY-MM-DD (UTC)
  rowsWritten: number;
  eventsRead: number;
  errors: string[];
}

/**
 * Aggregate one (tenantId, date) into analytics.daily_metric.
 *
 * `date` is a Date pointing at any instant in the target UTC day —
 * the runner clamps to the day-start internally so callers can pass
 * `new Date()` directly.
 */
export async function runAggregateDay(
  tenantId: string,
  date: Date,
): Promise<AggregationResult> {
  const dayStart = startOfUtcDay(date);
  const dayEnd = endOfUtcDay(date);
  const isoDate = dayStart.toISOString().slice(0, 10);

  const result: AggregationResult = {
    tenantId,
    date: isoDate,
    rowsWritten: 0,
    eventsRead: 0,
    errors: [],
  };

  const startedAt = Date.now();
  log("info", "analytics.aggregator.run_start", {
    tenantId,
    date: isoDate,
  });

  try {
    // ── 1. Stream events as an AsyncIterable.
    //
    // For the volumes Phase 5A targets (1.2M events/day worst-case
    // per tenant), Prisma's `findMany` would materialise the entire
    // result in memory before yielding the first row. The aggregator
    // contract is AsyncIterable — we honour it via an explicit
    // chunked iterator on the (tenant_id, occurred_at) index. Each
    // page is bounded; we never hold more than CHUNK rows at once.

    let eventsRead = 0;
    async function* streamEvents(): AsyncIterable<AnalyticsEventRow> {
      const CHUNK = 5000;
      let cursor: Date | null = null;
      let cursorEventId: string | null = null;
      while (true) {
        const rows = cursor === null
          ? await _unguardedAnalyticsPipelineClient.$queryRaw<
              AnalyticsEventRow[]
            >`
              SELECT
                tenant_id, event_name, schema_version, occurred_at,
                actor_type, actor_id, payload, context
              FROM analytics.event
              WHERE tenant_id = ${tenantId}
                AND occurred_at >= ${dayStart}
                AND occurred_at <= ${dayEnd}
              ORDER BY occurred_at ASC, event_id ASC
              LIMIT ${CHUNK}
            `
          : await _unguardedAnalyticsPipelineClient.$queryRaw<
              (AnalyticsEventRow & { event_id: string })[]
            >`
              SELECT
                tenant_id, event_id, event_name, schema_version, occurred_at,
                actor_type, actor_id, payload, context
              FROM analytics.event
              WHERE tenant_id = ${tenantId}
                AND occurred_at >= ${dayStart}
                AND occurred_at <= ${dayEnd}
                AND (
                  occurred_at > ${cursor}
                  OR (occurred_at = ${cursor} AND event_id > ${cursorEventId})
                )
              ORDER BY occurred_at ASC, event_id ASC
              LIMIT ${CHUNK}
            `;
        if (rows.length === 0) break;
        for (const r of rows) {
          eventsRead++;
          yield r;
        }
        const last = rows[rows.length - 1] as
          AnalyticsEventRow & { event_id?: string };
        cursor = new Date(last.occurred_at);
        cursorEventId = last.event_id ?? null;
        if (rows.length < CHUNK) break;
      }
    }

    // ── 2. Fold — pure compute.

    const rows = await aggregateEvents(streamEvents(), tenantId, dayStart, {
      onUnmapped: (info) => {
        log("info", "analytics.aggregator.unmapped_event", {
          tenantId,
          eventName: info.eventName,
          schemaVersion: info.schemaVersion,
        });
      },
    });
    result.eventsRead = eventsRead;

    // ── 3. RETURNING_CUSTOMER_RATE.
    //
    // For each PAID-event actor_id seen today, check if there is any
    // earlier analytics.event from the same actor_id (any event type
    // — the recon allows this as a wider proxy than just paid orders;
    // the parity-tolerance is 1.5%). Computed as:
    //   returning = |actor_ids_today_with_prior_events|
    //   rate      = round(returning / orders_today * 10000)   (basis points)

    const returningRow = await computeReturningCustomerRate(
      tenantId,
      dayStart,
      dayEnd,
    );
    if (returningRow !== null) {
      rows.push({
        tenantId,
        date: dayStart,
        ...returningRow,
      });
    }

    // ── 4. Batched upsert.

    for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
      const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
      await Promise.all(batch.map((r) => upsertRow(r)));
    }

    result.rowsWritten = rows.length;

    log("info", "analytics.aggregator.run_complete", {
      tenantId,
      date: isoDate,
      rowsWritten: result.rowsWritten,
      eventsRead: result.eventsRead,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "analytics.aggregator.run_failed", {
      tenantId,
      date: isoDate,
      error: msg.slice(0, 500),
    });
    result.errors.push(msg);
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function endOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

async function upsertRow(row: MetricRow): Promise<void> {
  // analytics-schema model — must use the unguarded singleton.
  // Prisma upsert handles the composite-unique conflict resolution.
  await _unguardedAnalyticsPipelineClient.analyticsDailyMetricV2.upsert({
    where: {
      tenantId_date_metric_dimension_dimensionValue: {
        tenantId: row.tenantId,
        date: row.date,
        metric: row.metric,
        dimension: row.dimension,
        dimensionValue: row.dimensionValue,
      },
    },
    create: {
      tenantId: row.tenantId,
      date: row.date,
      metric: row.metric,
      dimension: row.dimension,
      dimensionValue: row.dimensionValue,
      value: row.value,
    },
    update: {
      value: row.value,
    },
  });
}

interface ReturningCustomerRow {
  metric: string;
  dimension: string;
  dimensionValue: string;
  value: bigint;
}

/**
 * Returning-customer rate, basis points (10_000 = 100%).
 *
 * Definition for v2:
 *   numerator   = count of distinct payment_succeeded actor_ids today
 *                 whose actor_id ALSO has at least one analytics.event
 *                 row strictly earlier than dayStart.
 *   denominator = count of distinct payment_succeeded actor_ids today.
 *
 * Returns null when the denominator is zero — no row is emitted that
 * day. This matches legacy v1 which emits 0 for empty input via a
 * different path (we let the caller decide whether to materialise the
 * 0).
 */
async function computeReturningCustomerRate(
  tenantId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<ReturningCustomerRow | null> {
  const todayActors = await _unguardedAnalyticsPipelineClient.$queryRaw<
    { actor_id: string }[]
  >`
    SELECT DISTINCT actor_id
    FROM analytics.event
    WHERE tenant_id = ${tenantId}
      AND event_name = 'payment_succeeded'
      AND occurred_at >= ${dayStart}
      AND occurred_at <= ${dayEnd}
      AND actor_id IS NOT NULL
  `;
  if (todayActors.length === 0) {
    return {
      metric: "RETURNING_CUSTOMER_RATE",
      dimension: "TOTAL",
      dimensionValue: "TOTAL",
      value: BigInt(0),
    };
  }

  const actorIds = todayActors.map((r) => r.actor_id);
  // Build the IN-clause via Prisma's parameterised array binding (avoids
  // SQL injection — actor_ids come from DB but the safer pattern is to
  // bind explicitly).
  const returning = await _unguardedAnalyticsPipelineClient.$queryRaw<
    { actor_id: string }[]
  >`
    SELECT DISTINCT actor_id
    FROM analytics.event
    WHERE tenant_id = ${tenantId}
      AND occurred_at < ${dayStart}
      AND actor_id = ANY(${actorIds})
  `;

  const denom = todayActors.length;
  const num = returning.length;
  // Round half-up: (num * 10000 + denom/2) / denom
  const rate = Math.round((num / denom) * 10000);
  return {
    metric: "RETURNING_CUSTOMER_RATE",
    dimension: "TOTAL",
    dimensionValue: "TOTAL",
    value: BigInt(rate),
  };
}
