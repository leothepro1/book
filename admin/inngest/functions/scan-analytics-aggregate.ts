/**
 * scan-analytics-aggregate — cron-triggered fanout for Phase 5A
 * aggregator.
 *
 * Runs every 15 minutes (cron: every-15-minutes), matching the Tier 2
 * dashboard freshness SLO of 15 min per `docs/analytics/tiers.md:38`.
 * Selects every tenant with events in the last 48h sliding window and
 * dispatches one `analytics.aggregate.fanout` per tenant. The matching
 * `run-analytics-aggregate-day` function then folds via runAggregateDay
 * for each day in the 48h window.
 *
 * Design choices (per recon §3.1-3.4):
 * - Inngest cron, not Vercel cron. Aggregator stack reuses the
 *   drainer's retry/concurrency/Sentry patterns; introducing a parallel
 *   cron-route would duplicate infrastructure without benefit.
 * - 48h sliding window covers late events for ~24h after dygnsbyte and
 *   re-aggregates today + yesterday + day-before-yesterday on every
 *   tick. Idempotent upsert at the runner makes 96 runs/day cheap.
 * - LIMIT 10000 — matches Phase 5A scale target (10k tenants).
 * - No concurrency key on the scanner: only one cron scheduler runs
 *   per Inngest app, so per-tenant sharding here is moot. The
 *   dispatched fanout events are per-tenant-keyed via the runner's
 *   own concurrency config.
 */

import { _unguardedAnalyticsPipelineClient } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { withSentry } from "@/app/_lib/observability/inngest-sentry";
import { inngest } from "@/inngest/client";

const MAX_TENANTS_PER_SCAN = 10_000;
const ACTIVITY_WINDOW_HOURS = 48;

export const scanAnalyticsAggregate = inngest.createFunction(
  {
    id: "scan-analytics-aggregate",
    triggers: [
      // Dual-trigger: cron in production; the matching event lets
      // operators (and B.6's verifier) invoke a scan immediately
      // without waiting up to 15 min for the next cron tick.
      { event: "analytics.aggregate.scan" },
      { cron: "*/15 * * * *" },
    ],
    retries: 1,
  },
  async ({ step }) => {
    const tenants = await withSentry(
      step,
      "aggregator.scan.find_active_tenants",
      { pipeline_step: "aggregator.scan" },
      async () => {
        const cutoff = new Date(
          Date.now() - ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000,
        );
        const rows = await _unguardedAnalyticsPipelineClient.$queryRaw<
          { tenant_id: string }[]
        >`
          SELECT DISTINCT tenant_id
          FROM analytics.event
          WHERE occurred_at >= ${cutoff}
          LIMIT ${MAX_TENANTS_PER_SCAN}
        `;
        return rows.map((r) => r.tenant_id);
      },
    );

    if (tenants.length === 0) {
      log("info", "analytics.aggregator.scan_no_active_tenants", {});
      return { dispatched: 0 };
    }

    log("info", "analytics.aggregator.scan_dispatching", {
      tenant_count: tenants.length,
    });

    await step.sendEvent(
      "dispatch-aggregate-fanout",
      tenants.map((tenant_id) => ({
        name: "analytics.aggregate.fanout" as const,
        data: { tenant_id },
      })),
    );

    return { dispatched: tenants.length };
  },
);
