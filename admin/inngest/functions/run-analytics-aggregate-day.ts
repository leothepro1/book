/**
 * run-analytics-aggregate-day — per-tenant aggregator runner.
 *
 * Triggered by `analytics.aggregate.fanout` events from
 * `scan-analytics-aggregate`. For each fanout event, runs
 * `runAggregateDay` for every day in the 48h sliding window
 * (yesterday-yesterday + yesterday + today-partial), per recon §3.4.
 *
 * Concurrency: 1 per tenant. Same pattern as `drain-analytics-outbox`
 * (drain-analytics-outbox.ts:88-91): `concurrency.key =
 * "event.data.tenant_id"`. Same tenant serialises end-to-end; cross-
 * tenant runs in parallel up to the Inngest plan-cap.
 *
 * Each day is wrapped in its own `step.run` via `withSentry` — Inngest
 * checkpoints completion per day, so a crash mid-window resumes only
 * the unfinished days on retry.
 */

import { log } from "@/app/_lib/logger";
import { withSentry } from "@/app/_lib/observability/inngest-sentry";
import { inngest } from "@/inngest/client";

import { runAggregateDay } from "@/app/_lib/analytics/aggregation/aggregate-day-runner";

const WINDOW_DAYS = 3; // today + yesterday + day-before-yesterday

export const runAnalyticsAggregateDay = inngest.createFunction(
  {
    id: "run-analytics-aggregate-day",
    triggers: [{ event: "analytics.aggregate.fanout" }],
    concurrency: {
      limit: 1,
      key: "event.data.tenant_id",
    },
    retries: 3,
  },
  async ({ event, step }) => {
    const tenantId = event.data.tenant_id;
    const days = getWindowDays(WINDOW_DAYS);

    let totalRowsWritten = 0;
    let totalEventsRead = 0;
    let dayCount = 0;

    for (const day of days) {
      const isoDate = day.toISOString().slice(0, 10);
      const result = await withSentry(
        step,
        `aggregator.run_day_${isoDate}`,
        {
          tenant_id: tenantId,
          pipeline_step: "aggregator.run_day",
        },
        () => runAggregateDay(tenantId, day),
      );
      totalRowsWritten += result.rowsWritten;
      totalEventsRead += result.eventsRead;
      dayCount += 1;
    }

    log("info", "analytics.aggregator.fanout_complete", {
      tenantId,
      days: dayCount,
      totalRowsWritten,
      totalEventsRead,
    });

    return { tenantId, days: dayCount, totalRowsWritten, totalEventsRead };
  },
);

/**
 * Returns N days starting from today and going backwards. Each entry
 * is the UTC day-start. Order is newest-first which means the runner
 * always re-aggregates today first — useful for partial-day freshness.
 */
function getWindowDays(n: number): Date[] {
  const out: Date[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    out.push(d);
  }
  return out;
}
