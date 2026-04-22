export const dynamic = "force-dynamic";

/**
 * Cron: Cleanup PMS Reliability Tables
 * ══════════════════════════════════════
 *
 * Bounds the growth of the reliability engine's bookkeeping tables:
 *
 *   • PmsWebhookInbox PROCESSED rows — auditable for 30 days, then
 *     reclaimed. A busy tenant receives ~hundreds of webhooks/day;
 *     at 10k tenants over 12 months this unbounded would reach
 *     billions of rows and degrade query times on /retry-pms-webhooks.
 *
 *   • PmsWebhookInbox DEAD rows — kept 90 days so an operator has a
 *     real window to triage terminal failures. After that we assume
 *     the decision to leave them DEAD was intentional.
 *
 *   • WebhookDedup — the legacy dedup table. Per its model comment,
 *     entries older than 7 days can be reclaimed. Nothing else in
 *     the codebase prunes this table.
 *
 * Schedule: nightly at 04:17 UTC (offset from other nightly crons so
 * they don't all hit the DB at once). Safe to re-run; deletes are
 * idempotent by design.
 *
 * Auth: Bearer CRON_SECRET.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

// Retention windows. Tuned for operational visibility vs storage cost.
const PROCESSED_RETENTION_DAYS = 30;
const DEAD_RETENTION_DAYS = 90;
const WEBHOOK_DEDUP_RETENTION_DAYS = 7;
// Idempotency keys are only useful within the retry ladder's total
// duration (5m + 15m + 1h + 4h + 24h ≈ 30h). 48h gives buffer for
// clock skew and late-arriving retries. Beyond that, a new attempt
// is treated as a fresh operation.
const IDEMPOTENCY_RETENTION_HOURS = 48;

// Batch size per delete. Postgres locks acquired per-statement; larger
// batches are more efficient but bigger table locks. 10k per batch is
// the sweet spot at Neon's 15s statement_timeout.
const DELETE_BATCH_LIMIT = 10_000;

async function deleteOldInboxRows(
  status: "PROCESSED" | "DEAD",
  cutoff: Date,
): Promise<number> {
  const timestampField = status === "PROCESSED" ? "processedAt" : "deadAt";
  // deleteMany with where { [field]: { lt: cutoff } } is the idiomatic
  // Prisma form. Limit via Postgres-side CTE since Prisma doesn't
  // natively cap deleteMany — we don't need batching unless one night
  // accumulates > 10k (unlikely for DEAD rows).
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM "PmsWebhookInbox"
     WHERE "id" IN (
       SELECT "id" FROM "PmsWebhookInbox"
       WHERE "status" = $1 AND "${timestampField}" < $2
       LIMIT $3
     )`,
    status,
    cutoff,
    DELETE_BATCH_LIMIT,
  );
  return result;
}

async function deleteOldWebhookDedup(cutoff: Date): Promise<number> {
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM "WebhookDedup"
     WHERE "id" IN (
       SELECT "id" FROM "WebhookDedup"
       WHERE "createdAt" < $1
       LIMIT $2
     )`,
    cutoff,
    DELETE_BATCH_LIMIT,
  );
  return result;
}

async function deleteOldIdempotencyKeys(cutoff: Date): Promise<number> {
  // Only delete rows in terminal state (COMPLETED / FAILED). An
  // IN_FLIGHT row older than 48 h is almost certainly orphaned
  // (claimer crashed), but deleting it here would let a new retry
  // think it's safe to re-hit the PMS. Safer to leave orphaned
  // IN_FLIGHT rows for manual cleanup — they surface in the health
  // endpoint.
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM "PmsIdempotencyKey"
     WHERE "id" IN (
       SELECT "id" FROM "PmsIdempotencyKey"
       WHERE "status" IN ('COMPLETED', 'FAILED')
         AND "firstSeenAt" < $1
       LIMIT $2
     )`,
    cutoff,
    DELETE_BATCH_LIMIT,
  );
  return result;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();

  const processedCutoff = new Date(
    now.getTime() - PROCESSED_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const deadCutoff = new Date(
    now.getTime() - DEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const dedupCutoff = new Date(
    now.getTime() - WEBHOOK_DEDUP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const idempotencyCutoff = new Date(
    now.getTime() - IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000,
  );

  // Each delete is independent: a partial failure still leaves the
  // other cleanups applied. Logged individually so operators can tell
  // which specific table misbehaved.
  const results = {
    processedDeleted: 0,
    deadDeleted: 0,
    dedupDeleted: 0,
    idempotencyDeleted: 0,
    errors: [] as string[],
  };

  try {
    results.processedDeleted = await deleteOldInboxRows(
      "PROCESSED",
      processedCutoff,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`processed: ${msg}`);
    log("error", "pms.cleanup.processed_failed", { error: msg });
  }

  try {
    results.deadDeleted = await deleteOldInboxRows("DEAD", deadCutoff);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`dead: ${msg}`);
    log("error", "pms.cleanup.dead_failed", { error: msg });
  }

  try {
    results.dedupDeleted = await deleteOldWebhookDedup(dedupCutoff);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`dedup: ${msg}`);
    log("error", "pms.cleanup.dedup_failed", { error: msg });
  }

  try {
    results.idempotencyDeleted =
      await deleteOldIdempotencyKeys(idempotencyCutoff);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`idempotency: ${msg}`);
    log("error", "pms.cleanup.idempotency_failed", { error: msg });
  }

  const durationMs = Date.now() - startedAt;
  log("info", "pms.cleanup.completed", {
    durationMs,
    processedDeleted: results.processedDeleted,
    deadDeleted: results.deadDeleted,
    dedupDeleted: results.dedupDeleted,
    idempotencyDeleted: results.idempotencyDeleted,
    errorCount: results.errors.length,
    firstError: results.errors[0] ?? null,
  });

  return Response.json({
    ok: results.errors.length === 0,
    durationMs,
    ...results,
  });
}
