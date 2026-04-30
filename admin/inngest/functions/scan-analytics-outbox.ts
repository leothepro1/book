/**
 * scan-analytics-outbox — cron-triggered safety net for the drainer.
 *
 * Runs every minute. Selects every tenant with pending outbox rows,
 * dispatches one `analytics.outbox.flush` event per tenant. Each
 * dispatched flush event is then drained by `drain-analytics-outbox`
 * with that function's per-tenant concurrency cap (so cross-tenant
 * parallelism is preserved automatically, and a tenant already mid-drain
 * just queues another batch — no contention).
 *
 * This is the fallback path. The hot path is:
 *   emitAnalyticsEvent (commits outbox row) → caller's
 *   signalAnalyticsFlush (sends flush event) → drain-analytics-outbox
 *   runs within ~1s.
 *
 * The cron exists for the cases the hot path can't cover:
 *   - signalAnalyticsFlush failed silently (Inngest unreachable, Vercel
 *     cold start dropped the call, pod crashed between commit and signal)
 *   - emit happened but no signal was ever sent (e.g. caller forgot)
 *   - drainer crashed mid-batch and Inngest's retry budget exhausted
 *     before the full batch drained
 *
 * Worst-case latency for the fallback path: ≤ 60 seconds + drain time.
 * That's the SLO we expose to Phase 5 aggregations.
 *
 * No concurrency key on this function — there's only ever one cron
 * scheduler running per Inngest app, so we don't need a per-tenant key.
 * The dispatched flush events DO have per-tenant concurrency via the
 * drainer's own configuration.
 */

import {
  _unguardedAnalyticsPipelineClient,
} from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { inngest } from "@/inngest/client";

const MAX_TENANTS_PER_SCAN = 1000;

export const scanAnalyticsOutbox = inngest.createFunction(
  {
    id: "scan-analytics-outbox",
    // Dual-trigger: cron */1 fires in production; the matching event
    // is exposed so verify-phase1b.ts (and operators in incidents) can
    // invoke a scan immediately without waiting up to 60s for the next
    // cron tick. Both triggers run the same function body.
    triggers: [
      { event: "analytics.outbox.scan" },
      { cron: "* * * * *" },
    ],
    retries: 1,
  },
  async ({ step }) => {
    const tenants = await step.run("find-pending-tenants", async () => {
      const rows = await _unguardedAnalyticsPipelineClient.$queryRaw<
        { tenant_id: string }[]
      >`
        SELECT DISTINCT tenant_id
        FROM analytics.outbox
        WHERE published_at IS NULL
        LIMIT ${MAX_TENANTS_PER_SCAN}
      `;
      return rows.map((r) => r.tenant_id);
    });

    if (tenants.length === 0) {
      log("info", "analytics.scanner.no_pending", {});
      return { dispatched: 0 };
    }

    log("info", "analytics.scanner.dispatching", {
      tenant_count: tenants.length,
    });

    // Dispatch in parallel via step.sendEvent. Inngest serialises the
    // sends internally; from the function's perspective they're one
    // step.
    await step.sendEvent(
      "dispatch-flushes",
      tenants.map((tenant_id) => ({
        name: "analytics.outbox.flush" as const,
        data: { tenant_id },
      })),
    );

    return { dispatched: tenants.length };
  },
);
