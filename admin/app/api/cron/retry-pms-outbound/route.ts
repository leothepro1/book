export const dynamic = "force-dynamic";

/**
 * Cron: Retry PMS Outbound Pipeline
 * ═══════════════════════════════════
 *
 * Drains the PmsOutboundJob table with dual responsibility:
 *
 *   Primary phase — rows needing createBooking retry:
 *     • status PENDING / FAILED with nextRetryAt due
 *     • status PROCESSING stranded for > 5 min (crashed worker)
 *
 *   Compensation phase — rows needing refund:
 *     • status DEAD with compensationNextRetryAt due (or null, for
 *       the first compensation attempt immediately after DEAD)
 *     • status COMPENSATING stranded for > 5 min
 *
 * Both phases run in the same invocation. A single batch contains
 * both kinds of work, each row goes to the correct handler
 * (processOutboundJob vs compensateOutboundJob).
 *
 * Schedule: every 5 min (matches webhook-retry cadence for
 * operational consistency).
 *
 * Auth: Bearer CRON_SECRET.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  processOutboundJob,
  compensateOutboundJob,
  OUTBOUND_RECLAIM_AFTER_MS,
} from "@/app/_lib/integrations/reliability/outbound";
import { runWithPool } from "@/app/_lib/concurrency/pool";
import { interleaveByGroup } from "@/app/_lib/concurrency/round-robin";

const BATCH_SIZE = 400;
const POOL_CONCURRENCY = 8;
const ROUTE_WALL_BUDGET_MS = 55_000;

// Oversample before round-robin-interleaving by tenant (see
// retry-pms-webhooks/route.ts for the rationale).
const FETCH_MULTIPLIER = 3;

type JobRow = {
  id: string;
  tenantId: string;
  status: string;
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();
  const reclaimCutoff = new Date(now.getTime() - OUTBOUND_RECLAIM_AFTER_MS);

  // Collect rows in two queries (primary + compensation) then merge.
  // Keeping them separate is clearer than one gargantuan OR clause,
  // and the two selects hit different index paths on the composite
  // indexes so Postgres plans each optimally.

  const [primaryCandidates, compensationCandidates] = await Promise.all([
    prisma.pmsOutboundJob.findMany({
      where: {
        OR: [
          {
            status: { in: ["PENDING", "FAILED"] },
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
          },
          {
            status: "PROCESSING",
            lastAttemptAt: { lt: reclaimCutoff },
          },
        ],
      },
      select: { id: true, tenantId: true, status: true },
      orderBy: [{ nextRetryAt: "asc" }, { lastAttemptAt: "asc" }, { id: "asc" }],
      take: BATCH_SIZE * FETCH_MULTIPLIER,
    }),
    prisma.pmsOutboundJob.findMany({
      where: {
        OR: [
          {
            status: "DEAD",
            OR: [
              { compensationNextRetryAt: null },
              { compensationNextRetryAt: { lte: now } },
            ],
          },
          {
            status: "COMPENSATING",
            compensationLastAt: { lt: reclaimCutoff },
          },
        ],
      },
      select: { id: true, tenantId: true, status: true },
      orderBy: [
        { compensationNextRetryAt: "asc" },
        { compensationLastAt: "asc" },
        { id: "asc" },
      ],
      take: BATCH_SIZE * FETCH_MULTIPLIER,
    }),
  ]);

  // Tenant-fair ordering so a single noisy tenant can't monopolise
  // the pool's worker slots. Within each batch we still process
  // oldest-due first per tenant.
  const primary = interleaveByGroup(
    primaryCandidates,
    (r) => r.tenantId,
    BATCH_SIZE,
  );
  const compensation = interleaveByGroup(
    compensationCandidates,
    (r) => r.tenantId,
    BATCH_SIZE,
  );

  const primaryStranded = primary.filter((r) => r.status === "PROCESSING").length;
  const compStranded = compensation.filter((r) => r.status === "COMPENSATING").length;
  if (primaryStranded > 0 || compStranded > 0) {
    log("warn", "pms.outbound.retry_cron.stranded_rows_detected", {
      primaryStranded,
      compensationStranded: compStranded,
    });
  }

  const counters = {
    primaryCompleted: 0,
    primaryRetried: 0,
    primaryDead: 0,
    primarySkipped: 0,
    primaryErrors: 0,
    compCompensated: 0,
    compRetried: 0,
    compFailed: 0,
    compSkipped: 0,
    compErrors: 0,
    primaryStranded,
    compensationStranded: compStranded,
  };

  // Run the two pools in parallel. Each pool uses its own deadline
  // so neither can starve the other; within a pool the concurrency
  // cap bounds adapter / Stripe load.
  await Promise.all([
    runWithPool(
      primary as JobRow[],
      async (row) => processOutboundJob(row.id),
      {
        concurrency: POOL_CONCURRENCY,
        deadline: startedAt + ROUTE_WALL_BUDGET_MS,
      },
    ).then((outcomes) => {
      for (let i = 0; i < outcomes.length; i++) {
        const row = primary[i];
        const o = outcomes[i];
        if (o.skippedDueToBudget) {
          counters.primarySkipped++;
          continue;
        }
        if (!o.ok) {
          counters.primaryErrors++;
          log("error", "pms.outbound.retry_cron.primary_uncaught", {
            jobId: row.id,
            tenantId: row.tenantId,
            error: o.error?.message ?? "unknown",
          });
          continue;
        }
        switch (o.value) {
          case "COMPLETED":
            counters.primaryCompleted++;
            break;
          case "FAILED":
            counters.primaryRetried++;
            break;
          case "DEAD":
            counters.primaryDead++;
            break;
          default:
            counters.primarySkipped++;
        }
      }
    }),
    runWithPool(
      compensation as JobRow[],
      async (row) => compensateOutboundJob(row.id),
      {
        concurrency: POOL_CONCURRENCY,
        deadline: startedAt + ROUTE_WALL_BUDGET_MS,
      },
    ).then((outcomes) => {
      for (let i = 0; i < outcomes.length; i++) {
        const row = compensation[i];
        const o = outcomes[i];
        if (o.skippedDueToBudget) {
          counters.compSkipped++;
          continue;
        }
        if (!o.ok) {
          counters.compErrors++;
          log("error", "pms.outbound.retry_cron.compensation_uncaught", {
            jobId: row.id,
            tenantId: row.tenantId,
            error: o.error?.message ?? "unknown",
          });
          continue;
        }
        switch (o.value) {
          case "COMPENSATED":
            counters.compCompensated++;
            break;
          case "DEAD":
            counters.compRetried++;
            break;
          case "COMPENSATION_FAILED":
            counters.compFailed++;
            break;
          default:
            counters.compSkipped++;
        }
      }
    }),
  ]);

  const durationMs = Date.now() - startedAt;

  // The two SLO signals to alert on:
  //   primaryDead > 0 sustained → adapter consistently rejecting bookings
  //   compFailed  > 0 ever     → money is stuck (refund failed too), operator needed
  log("info", "pms.outbound.retry_cron.completed", {
    durationMs,
    primaryBatch: primary.length,
    compensationBatch: compensation.length,
    ...counters,
  });

  return Response.json({
    ok: true,
    durationMs,
    primaryBatch: primary.length,
    compensationBatch: compensation.length,
    ...counters,
  });
}
