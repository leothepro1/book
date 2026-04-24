export const dynamic = "force-dynamic";

/**
 * Cron: Release Expired Draft Holds + Recover Stuck PLACING
 * ═══════════════════════════════════════════════════════════
 *
 * Safety net for the FAS 6.5C hold lifecycle. Two sweeps in one route:
 *
 *   Sweep A — expired PLACED holds:
 *     DraftReservation WHERE holdState='PLACED' AND holdExpiresAt<now
 *     For each: adapter.releaseHold (best-effort, idempotent) + transition
 *     holdState='RELEASED' + emit HOLD_RELEASED event (source="cron") +
 *     emit draft_order.updated webhook (changeType="hold_released").
 *
 *   Sweep B — stuck PLACING recovery:
 *     DraftReservation WHERE holdState='PLACING' AND holdLastAttemptAt < now-120s
 *     For each: probe PmsIdempotencyKey by holdIdempotencyKey; resolve to
 *     PLACED (COMPLETED cache) or FAILED (FAILED cache / no row /
 *     IN_FLIGHT aged >48h).
 *
 * Mirrors release-expired-holds (Orders) pattern — tolerates concurrent
 * cron invocations via adapter's idempotent releaseHold + DB-level
 * updateMany-with-state-filter.
 *
 * Schedule: every 5 min (vercel.json).
 * Auth: Bearer CRON_SECRET.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { runWithPool } from "@/app/_lib/concurrency/pool";
import { createDraftOrderEvent } from "@/app/_lib/draft-orders";

const SWEEP_A_BATCH = 200;
const SWEEP_B_BATCH = 50;
const POOL_CONCURRENCY = 8;
const ROUTE_WALL_BUDGET_MS = 55_000;
const EXPIRY_GRACE_MS = 30_000;
const STUCK_PLACING_MS = 120_000;
const IDEMPOTENCY_KEY_TTL_MS = 48 * 60 * 60 * 1000;

// Narrow Prisma row types used inside this route — avoids tight coupling
// to the full DraftReservation type.
type ExpiredPlacedRow = {
  id: string;
  tenantId: string;
  draftOrderId: string;
  draftLineItemId: string;
  holdExternalId: string | null;
};

type StuckPlacingRow = {
  id: string;
  tenantId: string;
  draftOrderId: string;
  draftLineItemId: string;
  holdIdempotencyKey: string | null;
  holdLastAttemptAt: Date | null;
};

type Counters = {
  sweepA: { released: number; adapterErrors: number; skippedBudget: number };
  sweepB: {
    recoveredPlaced: number;
    recoveredFailed: number;
    recoveredOrphan: number;
    skippedBudget: number;
  };
};

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const deadline = startedAt + ROUTE_WALL_BUDGET_MS;
  const counters: Counters = {
    sweepA: { released: 0, adapterErrors: 0, skippedBudget: 0 },
    sweepB: {
      recoveredPlaced: 0,
      recoveredFailed: 0,
      recoveredOrphan: 0,
      skippedBudget: 0,
    },
  };

  await runSweepA(deadline, counters);

  if (Date.now() < deadline) {
    await runSweepB(deadline, counters);
  } else {
    log("warn", "draft_hold.expire_cron.sweep_b_skipped_budget", {});
  }

  const durationMs = Date.now() - startedAt;
  log("info", "draft_hold.expire_cron.completed", {
    durationMs,
    ...counters.sweepA,
    ...counters.sweepB,
  });

  return Response.json({
    ok: true,
    durationMs,
    sweepA: counters.sweepA,
    sweepB: counters.sweepB,
  });
}

// ── Sweep A — expired PLACED ────────────────────────────────────

async function runSweepA(deadline: number, counters: Counters): Promise<void> {
  const cutoff = new Date(Date.now() - EXPIRY_GRACE_MS);

  const due = (await prisma.draftReservation.findMany({
    where: {
      holdState: "PLACED",
      holdExpiresAt: { not: null, lt: cutoff },
      holdExternalId: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      draftOrderId: true,
      draftLineItemId: true,
      holdExternalId: true,
    },
    orderBy: [{ holdExpiresAt: "asc" }, { id: "asc" }],
    take: SWEEP_A_BATCH,
  })) as ExpiredPlacedRow[];

  if (due.length === 0) return;

  const outcomes = await runWithPool(
    due,
    async (row) => handleExpiredPlaced(row),
    { concurrency: POOL_CONCURRENCY, deadline },
  );

  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i];
    if (o.skippedDueToBudget) {
      counters.sweepA.skippedBudget++;
      continue;
    }
    if (!o.ok) {
      counters.sweepA.adapterErrors++;
      continue;
    }
    counters.sweepA.released++;
  }
}

async function handleExpiredPlaced(row: ExpiredPlacedRow): Promise<void> {
  const externalId = row.holdExternalId!;

  // Best-effort adapter call. Any adapter error is logged but the DB
  // row is still transitioned to RELEASED to converge state. If the
  // hold is still live at Mews, the PMS-side ReleasedUtc auto-releases
  // it within the hold's configured TTL.
  let adapterReleaseOk = true;
  try {
    const adapter = await resolveAdapter(row.tenantId);
    await adapter.releaseHold(row.tenantId, externalId);
  } catch (err) {
    adapterReleaseOk = false;
    log("warn", "draft_hold.cron.release_adapter_failed", {
      tenantId: row.tenantId,
      draftReservationId: row.id,
      externalId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // DB update — updateMany with state filter prevents races (if another
  // process already transitioned this row, count=0 and we no-op).
  await prisma.draftReservation.updateMany({
    where: {
      id: row.id,
      tenantId: row.tenantId,
      holdState: "PLACED",
    },
    data: { holdState: "RELEASED" },
  });

  // Audit event — non-tx (cron is not inside a caller's tx).
  await createDraftOrderEvent({
    tenantId: row.tenantId,
    draftOrderId: row.draftOrderId,
    type: "HOLD_RELEASED",
    metadata: {
      draftLineItemId: row.draftLineItemId,
      previousExternalId: externalId,
      source: "cron",
      adapterReleaseOk,
    },
    actorUserId: null,
    actorSource: "cron",
  });

  emitPlatformEvent({
    type: "draft_order.updated",
    tenantId: row.tenantId,
    payload: {
      draftOrderId: row.draftOrderId,
      tenantId: row.tenantId,
      changeType: "hold_released",
      draftLineItemId: row.draftLineItemId,
      source: "cron",
      updatedAt: new Date().toISOString(),
    },
  }).catch((err) => {
    log("error", "draft_order.webhook_emit_failed", {
      tenantId: row.tenantId,
      draftOrderId: row.draftOrderId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  log("info", "draft_hold.cron.released", {
    tenantId: row.tenantId,
    draftReservationId: row.id,
    externalId,
    adapterReleaseOk,
  });
}

// ── Sweep B — stuck PLACING recovery ────────────────────────────
//
// INVARIANT: STUCK_PLACING_MS (120s) MUST stay below PmsIdempotencyKey
// TTL (48h, set by cleanup-idempotency-keys cron) minus a safety margin.
// Otherwise this sweep may find a stuck PLACING row whose idempotency
// cache entry has already been purged, and resolve it defensively to
// FAILED with STUCK_PLACING_NO_CACHE even though the hold may have
// succeeded at Mews. If a future operator extends STUCK_PLACING_MS
// beyond ~24h, update this coupling.

async function runSweepB(deadline: number, counters: Counters): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_PLACING_MS);

  const stuck = (await prisma.draftReservation.findMany({
    where: {
      holdState: "PLACING",
      holdLastAttemptAt: { not: null, lt: cutoff },
    },
    select: {
      id: true,
      tenantId: true,
      draftOrderId: true,
      draftLineItemId: true,
      holdIdempotencyKey: true,
      holdLastAttemptAt: true,
    },
    orderBy: [{ holdLastAttemptAt: "asc" }, { id: "asc" }],
    take: SWEEP_B_BATCH,
  })) as StuckPlacingRow[];

  if (stuck.length === 0) return;

  const outcomes = await runWithPool(
    stuck,
    async (row) => handleStuckPlacing(row, counters),
    { concurrency: POOL_CONCURRENCY, deadline },
  );

  for (const o of outcomes) {
    if (o.skippedDueToBudget) counters.sweepB.skippedBudget++;
  }
}

async function handleStuckPlacing(
  row: StuckPlacingRow,
  counters: Counters,
): Promise<void> {
  // Probe PmsIdempotencyKey to determine the real Phase 2 outcome.
  //
  // Four possibilities:
  //   1. COMPLETED with a non-null HoldResult → PLACED (recover)
  //   2. FAILED                                → FAILED
  //   3. IN_FLIGHT and firstSeenAt > 48h old   → FAILED (stale)
  //   4. No row found / key null               → FAILED (defensive, orphan)
  if (!row.holdIdempotencyKey) {
    await transitionToFailed(row, "STUCK_PLACING_NO_KEY", counters);
    counters.sweepB.recoveredOrphan++;
    log("error", "draft_hold.cron.stuck_no_idempotency_key", {
      tenantId: row.tenantId,
      draftReservationId: row.id,
      draftLineItemId: row.draftLineItemId,
    });
    return;
  }

  const cached = await prisma.pmsIdempotencyKey.findUnique({
    where: { key: row.holdIdempotencyKey },
    select: { status: true, resultJson: true, firstSeenAt: true },
  });

  if (!cached) {
    await transitionToFailed(row, "STUCK_PLACING_NO_CACHE", counters);
    counters.sweepB.recoveredOrphan++;
    log("error", "draft_hold.cron.stuck_no_cache_row", {
      tenantId: row.tenantId,
      draftReservationId: row.id,
      key: row.holdIdempotencyKey.slice(0, 16) + "…",
    });
    return;
  }

  if (cached.status === "COMPLETED") {
    // Parse the cached HoldResult (may be null if adapter returned null).
    const result = decodeCachedHoldResult(cached.resultJson);
    if (result === null) {
      await transitionToFailed(row, "ADAPTER_NOT_SUPPORTED", counters);
      return;
    }
    // Transition PLACING → PLACED with the recovered externalId + expiresAt.
    await prisma.draftReservation.updateMany({
      where: { id: row.id, tenantId: row.tenantId, holdState: "PLACING" },
      data: {
        holdState: "PLACED",
        holdExternalId: result.externalId,
        holdExpiresAt: result.expiresAt,
        holdLastError: null,
      },
    });
    await createDraftOrderEvent({
      tenantId: row.tenantId,
      draftOrderId: row.draftOrderId,
      type: "HOLD_PLACED",
      metadata: {
        draftLineItemId: row.draftLineItemId,
        externalId: result.externalId,
        holdExpiresAt: result.expiresAt.toISOString(),
        source: "cron_recovery",
      },
      actorSource: "cron",
    });
    emitPlatformEvent({
      type: "draft_order.updated",
      tenantId: row.tenantId,
      payload: {
        draftOrderId: row.draftOrderId,
        tenantId: row.tenantId,
        changeType: "hold_placed",
        draftLineItemId: row.draftLineItemId,
        externalId: result.externalId,
        holdExpiresAt: result.expiresAt.toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }).catch(() => undefined);

    counters.sweepB.recoveredPlaced++;
    log("info", "draft_hold.cron.stuck_recovered_placed", {
      tenantId: row.tenantId,
      draftReservationId: row.id,
      externalId: result.externalId,
    });
    return;
  }

  if (cached.status === "FAILED") {
    const errMsg = extractCachedError(cached.resultJson);
    await transitionToFailed(row, errMsg, counters);
    return;
  }

  if (cached.status === "IN_FLIGHT") {
    const age = Date.now() - cached.firstSeenAt.getTime();
    if (age > IDEMPOTENCY_KEY_TTL_MS) {
      await transitionToFailed(row, "STUCK_IN_FLIGHT_AGED_OUT", counters);
      return;
    }
    // Fresh IN_FLIGHT — leave alone for now; next cron cycle re-checks.
    log("info", "draft_hold.cron.stuck_still_in_flight", {
      tenantId: row.tenantId,
      draftReservationId: row.id,
      ageSec: Math.round(age / 1000),
    });
    return;
  }

  // Unknown status — defensive fail.
  await transitionToFailed(row, `STUCK_UNKNOWN_CACHE_STATUS:${cached.status}`, counters);
  counters.sweepB.recoveredOrphan++;
}

async function transitionToFailed(
  row: StuckPlacingRow,
  errorCode: string,
  counters: Counters,
): Promise<void> {
  await prisma.draftReservation.updateMany({
    where: { id: row.id, tenantId: row.tenantId, holdState: "PLACING" },
    data: {
      holdState: "FAILED",
      holdLastError: errorCode.slice(0, 500),
    },
  });

  await createDraftOrderEvent({
    tenantId: row.tenantId,
    draftOrderId: row.draftOrderId,
    type: "HOLD_FAILED",
    metadata: {
      draftLineItemId: row.draftLineItemId,
      errorCode,
      errorMessage: errorCode,
      source: "cron_recovery",
    },
    actorSource: "cron",
  });

  emitPlatformEvent({
    type: "draft_order.updated",
    tenantId: row.tenantId,
    payload: {
      draftOrderId: row.draftOrderId,
      tenantId: row.tenantId,
      changeType: "hold_failed",
      draftLineItemId: row.draftLineItemId,
      errorCode,
      updatedAt: new Date().toISOString(),
    },
  }).catch(() => undefined);

  counters.sweepB.recoveredFailed++;
  log("warn", "draft_hold.cron.stuck_recovered_failed", {
    tenantId: row.tenantId,
    draftReservationId: row.id,
    errorCode,
  });
}

// ── Cache decoders (matches idempotency.ts serializeResult) ─────

function decodeCachedHoldResult(
  raw: unknown,
): { externalId: string; expiresAt: Date } | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.externalId !== "string") return null;
  const exp = obj.expiresAt;
  let expiresAt: Date | null = null;
  if (exp instanceof Date) {
    expiresAt = exp;
  } else if (
    exp !== null &&
    typeof exp === "object" &&
    typeof (exp as { __date?: unknown }).__date === "string"
  ) {
    // idempotency.ts serializes Dates as { __date: ISO }
    expiresAt = new Date((exp as { __date: string }).__date);
  } else if (typeof exp === "string") {
    expiresAt = new Date(exp);
  }
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return null;
  return { externalId: obj.externalId, expiresAt };
}

function extractCachedError(raw: unknown): string {
  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.error === "string") return obj.error;
  }
  return "STUCK_PLACING_CACHED_FAILURE";
}
