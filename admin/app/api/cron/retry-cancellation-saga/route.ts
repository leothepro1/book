export const dynamic = "force-dynamic";

/**
 * Cron: Retry Cancellation Saga
 * ─────────────────────────────
 *
 * Advances OPEN CancellationRequests whose saga stopped on a transient
 * error (PMS 429, Stripe 5xx, network blip). Picks rows where
 * `nextAttemptAt` has passed AND `attempts < MAX_SAGA_ATTEMPTS`.
 *
 * The saga itself is fully idempotent:
 *   • The PMS adapter treats "already cancelled" as success.
 *   • Stripe uses a stable idempotency key, returning the same refund
 *     on replay.
 *   • DB writes are status-guarded so re-entry on an already-committed
 *     request is a no-op.
 *
 * Sequential execution (NOT Promise.all) because concurrent retries on
 * many rows would slam the tenant's PMS and Stripe Connect account
 * simultaneously. 20 rows per run keeps us well under the Vercel
 * function timeout and respects downstream rate limits.
 *
 * Runs every 5 minutes. Auth: CRON_SECRET bearer.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";
import { runCancellationSaga } from "@/app/_lib/cancellations/engine";
import { MAX_SAGA_ATTEMPTS } from "@/app/_lib/cancellations/types";

const BATCH_SIZE = 20;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();

  const due = await prisma.cancellationRequest.findMany({
    where: {
      status: "OPEN",
      nextAttemptAt: { lte: now },
      attempts: { lt: MAX_SAGA_ATTEMPTS },
    },
    select: {
      id: true,
      tenantId: true,
    },
    take: BATCH_SIZE,
    orderBy: { nextAttemptAt: "asc" },
  });

  let processed = 0;
  let errors = 0;

  for (const row of due) {
    setSentryTenantContext(row.tenantId);
    try {
      // Saga never throws to the caller — it persists whatever
      // interim/terminal state it reached. A thrown here indicates
      // a genuinely unexpected crash (e.g. DB outage) we want surfaced.
      await runCancellationSaga({
        tenantId: row.tenantId,
        cancellationRequestId: row.id,
        now,
      });
      processed++;
    } catch (err) {
      errors++;
      log("error", "cron.retry_cancellation_saga.unexpected_throw", {
        tenantId: row.tenantId,
        cancellationRequestId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue — one row's crash must not stop the batch.
    }
  }

  log("info", "cron.retry_cancellation_saga.completed", {
    found: due.length,
    processed,
    errors,
    batchSize: BATCH_SIZE,
  });

  return Response.json({
    ok: true,
    found: due.length,
    processed,
    errors,
  });
}
