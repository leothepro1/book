export const dynamic = "force-dynamic";

/**
 * Cron: Retry PMS Webhook Inbox
 * ══════════════════════════════
 *
 * Drains the PmsWebhookInbox: every row whose status is PENDING or
 * FAILED and whose nextRetryAt has passed is re-processed through
 * the same pipeline that the live webhook route uses. The retry
 * ladder (5m → 15m → 1h → 4h → 24h → DEAD) is enforced per row; the
 * cron just picks the next due batch.
 *
 * This is the final recovery step behind two other layers:
 *
 *   1. Webhook route — accepts every delivery, inboxes + tries to
 *      process synchronously within an 8s budget.
 *   2. This cron — catches anything the route deferred or that the
 *      PMS retried after our window closed.
 *   3. Reconciliation cron — reads bookings from the PMS directly
 *      and backfills anything that escaped both webhook paths.
 *
 * Auth: Bearer CRON_SECRET.
 * Schedule: every 5 minutes via vercel.json. A shorter cadence would
 * process faster but adds DB load; 5 min is the emergent sweet spot
 * given the 5-minute first-retry delay.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  processInboxRow,
  PROCESSING_RECLAIM_AFTER_MS,
} from "@/app/_lib/integrations/reliability/webhook";
import { runWithPool } from "@/app/_lib/concurrency/pool";
import { interleaveByGroup } from "@/app/_lib/concurrency/round-robin";

// How many rows to drain per cron invocation. With concurrency=8 and
// ~0.5–2s per row (network to PMS), ~400 rows fit in 55s comfortably.
// Old serial throughput was ~100 rows/5min = 1.2k/hr; now ~5k/hr.
const BATCH_SIZE = 400;

// Oversample when fetching so the round-robin interleave has enough
// candidates from different tenants to distribute fairly. 3x means
// a batch of 400 is selected from up to 1200 eligible rows — plenty
// of cross-tenant diversity to avoid monopolisation.
const FETCH_MULTIPLIER = 3;

// In-flight processing cap. The Mews adapter's per-accessToken rate
// limiter (200/30s) naturally throttles a single-tenant burst, so we
// don't need a small cap here. 8 is the sweet spot: high enough to
// saturate network I/O, low enough that a single slow PMS instance
// can't starve other tenants' rows.
const POOL_CONCURRENCY = 8;

// Hard wall-clock cap for the route. A single slow row cannot
// cause us to 504.
const ROUTE_WALL_BUDGET_MS = 55_000;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();

  // Pick the oldest due work first. Three populations are eligible:
  //   1. PENDING — new intakes that couldn't be processed sync
  //   2. FAILED — retries whose nextRetryAt has come due
  //   3. PROCESSING — stranded rows whose worker crashed mid-claim
  //      (lastAttemptAt older than PROCESSING_RECLAIM_AFTER_MS).
  //      Without this category, a crashed serverless instance would
  //      leave an inbox row PROCESSING forever, silently losing the
  //      booking. processInboxRow itself handles the actual claim
  //      transition; we just include these rows in the eligible set.
  const now = new Date();
  const reclaimCutoff = new Date(now.getTime() - PROCESSING_RECLAIM_AFTER_MS);

  // Oversample the eligible set, then round-robin-interleave by
  // tenant so one tenant with thousands of PENDING rows doesn't
  // starve every other tenant's events out of this batch.
  const candidates = await prisma.pmsWebhookInbox.findMany({
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
    select: { id: true, tenantId: true, provider: true, status: true },
    orderBy: [{ nextRetryAt: "asc" }, { lastAttemptAt: "asc" }, { id: "asc" }],
    take: BATCH_SIZE * FETCH_MULTIPLIER,
  });
  const due = interleaveByGroup(candidates, (r) => r.tenantId, BATCH_SIZE);

  const reclaimCount = due.filter((r) => r.status === "PROCESSING").length;
  if (reclaimCount > 0) {
    log("warn", "pms.webhook.retry_cron.stranded_rows_detected", {
      count: reclaimCount,
    });
  }

  const counters = {
    processed: 0,
    retried: 0, // moved to FAILED with a future nextRetryAt
    dead: 0, // exceeded attempt ladder
    skipped: 0, // claimed by another worker or budget exceeded
    errors: 0, // uncaught exceptions, never expected
    reclaimed: reclaimCount, // stranded PROCESSING rows in this batch
  };

  // Concurrency pool — processes up to POOL_CONCURRENCY rows in
  // parallel. Each row's processInboxRow is already self-contained
  // (mutates its own inbox row, owns its own status transition via
  // updateMany-with-status-filter), so no cross-row synchronisation
  // is needed.
  const outcomes = await runWithPool(
    due,
    async (row) => processInboxRow(row.id),
    {
      concurrency: POOL_CONCURRENCY,
      deadline: startedAt + ROUTE_WALL_BUDGET_MS,
    },
  );

  for (let i = 0; i < outcomes.length; i++) {
    const row = due[i];
    const o = outcomes[i];
    if (o.skippedDueToBudget) {
      counters.skipped++;
      continue;
    }
    if (!o.ok) {
      counters.errors++;
      log("error", "pms.webhook.retry_cron.row_uncaught", {
        inboxId: row.id,
        tenantId: row.tenantId,
        provider: row.provider,
        error: o.error?.message ?? "unknown",
      });
      continue;
    }
    switch (o.value) {
      case "PROCESSED":
        counters.processed++;
        break;
      case "FAILED":
        counters.retried++;
        break;
      case "DEAD":
        counters.dead++;
        break;
      default:
        counters.skipped++;
    }
  }

  const durationMs = Date.now() - startedAt;

  log("info", "pms.webhook.retry_cron.completed", {
    durationMs,
    batchSize: due.length,
    ...counters,
  });

  return Response.json({
    ok: true,
    durationMs,
    batchSize: due.length,
    ...counters,
  });
}
