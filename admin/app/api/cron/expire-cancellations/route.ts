export const dynamic = "force-dynamic";

/**
 * Cron: Expire Cancellations
 * ──────────────────────────
 *
 * Transitions REQUESTED cancellation requests that have passed their
 * `expiresAt` into the EXPIRED terminal state. Matches Shopify's implicit
 * "auto-decline stale requests" — protects revenue when an admin forgets
 * to review a pending cancellation.
 *
 * EXPIRED is terminal-but-restartable (same as DECLINED): the guest can
 * submit a new request, which will go through the policy + approval flow
 * from scratch.
 *
 * Runs every 10 minutes via Vercel cron. Batched (200 rows/run) to stay
 * well under the serverless function budget.
 *
 * Auth: CRON_SECRET bearer (same as all other crons).
 */

import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";
import { emitCancellationEvent } from "@/app/_lib/cancellations/events";

const BATCH_SIZE = 200;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();

  // Find all due rows in one read. The partial unique index
  // (status IN ('REQUESTED','OPEN')) on (tenantId, bookingId) means
  // we never expire more than one active request per booking.
  const due = await prisma.cancellationRequest.findMany({
    where: {
      status: "REQUESTED",
      expiresAt: { lte: now },
    },
    select: {
      id: true,
      tenantId: true,
      version: true,
    },
    take: BATCH_SIZE,
    orderBy: { expiresAt: "asc" },
  });

  let transitioned = 0;
  let skipped = 0; // concurrent update won the race

  for (const row of due) {
    // Optimistic transition — if another path (admin approved, guest
    // withdrew) beat us, updateMany returns count=0 and we skip.
    const result = await prisma.cancellationRequest.updateMany({
      where: {
        id: row.id,
        status: "REQUESTED",
        version: row.version,
      },
      data: {
        status: "EXPIRED",
        canceledAt: now,
        expiresAt: null,
        nextAttemptAt: null,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      skipped++;
      continue;
    }

    try {
      await emitCancellationEvent(prisma, {
        cancellationRequestId: row.id,
        tenantId: row.tenantId,
        type: "EXPIRED",
        actor: "SYSTEM",
        message: "Auto-expired after policy.autoExpireHours",
      });
    } catch (err) {
      // Event-log failure is non-fatal for the expire. The row is already
      // transitioned; we just lose the audit entry. Logged explicitly so
      // operators can hand-reconstruct if needed.
      log("error", "cron.expire_cancellations.event_write_failed", {
        cancellationRequestId: row.id,
        tenantId: row.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    transitioned++;
  }

  log("info", "cron.expire_cancellations.completed", {
    found: due.length,
    transitioned,
    skipped,
    batchSize: BATCH_SIZE,
  });

  return Response.json({
    ok: true,
    found: due.length,
    transitioned,
    skipped,
  });
}
