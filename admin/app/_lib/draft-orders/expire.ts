/**
 * DraftOrder — expiry sweep service (FAS 6.5E).
 *
 * Sweeps DraftOrder rows past their `expiresAt` deadline whose status is
 * still in a cancellable working state (OPEN / PENDING_APPROVAL / APPROVED)
 * and routes each through `cancelDraft` with `actorSource: "cron"`.
 *
 * Mirrors FAS 6.5C `release-expired-draft-holds` orchestration: single
 * batched query, bounded concurrency pool, wall-budget-aware deadline,
 * per-draft try/catch — one bad row never aborts the sweep. Idempotency
 * is delegated entirely to `cancelDraft`'s C2/C3/C4 preconditions, which
 * also defend against the SELECT→cancel race (status changes mid-sweep).
 *
 * INVARIANT: this function never throws. The route handler observes the
 * SweepResult counters; everything else is logged and bucketed.
 */

import type { DraftOrderStatus } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { runWithPool } from "@/app/_lib/concurrency/pool";
import {
  ConflictError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";
import { cancelDraft } from "./lifecycle";

// ── Constants (mirrored from 6.5C) ──────────────────────────────

const BATCH_SIZE = 200;
const POOL_CONCURRENCY = 8;
const SWEEP_TARGETS: readonly DraftOrderStatus[] = [
  "OPEN",
  "PENDING_APPROVAL",
  "APPROVED",
];

// ── Public types ────────────────────────────────────────────────

export type SweepResult = {
  examined: number;
  cancelled: number;
  /** Race-on-terminal — cancelDraft rejected because status moved (expected). */
  skipped: number;
  /** Genuine errors — cancelDraft threw something we did not expect. */
  failed: number;
  /** Aggregate of per-line hold-release errors collected from successful cancels. */
  holdReleaseErrors: number;
  errorBreakdown: {
    raceOnTerminal: number;
    transitionErrors: number;
    holdReleaseErrors: number;
    stripeErrors: number;
  };
  durationMs: number;
  /** Wall-budget exhausted — pool returned skippedDueToBudget for some rows. */
  partial: boolean;
};

export type SweepExpiredDraftsOptions = {
  /** Override the comparison clock (test-only). */
  now?: Date;
  /** Epoch ms wall-budget deadline. Defaults to no deadline. */
  deadline?: number;
  /** Override max rows per tick. Defaults to 200. */
  batchSize?: number;
  /** Override pool concurrency. Defaults to 8. */
  concurrency?: number;
};

// ── Internal: per-draft selection shape ─────────────────────────

type ExpiredDraftRow = {
  id: string;
  tenantId: string;
  status: DraftOrderStatus;
  expiresAt: Date | null;
};

// ── Error classification ────────────────────────────────────────

type RaceClassification =
  | { kind: "race"; phase: "ALREADY_TERMINAL" | "PAID_RACE" | "MISSING_REASON" | "IN_TX_RACE" | "OTHER" }
  | { kind: "unknown" };

/**
 * Classify a thrown error from cancelDraft. Race-on-terminal is the
 * expected outcome when a draft transitioned out from under us between
 * the SELECT and the cancel call (sendInvoice / convertToOrder won the
 * race) — we count it as `skipped`, not `failed`.
 *
 * Phase string is derived from message content because 6.5D's service
 * errors carry no machine-readable sub-code beyond the class. If the
 * service later grows codes (`error.code === "ALREADY_TERMINAL"`), this
 * classifier should switch to that signal.
 */
function classifyCancelError(e: unknown): RaceClassification {
  if (!(e instanceof ValidationError) && !(e instanceof ConflictError)) {
    return { kind: "unknown" };
  }
  const msg = e.message;
  if (msg.includes("PAID")) return { kind: "race", phase: "PAID_RACE" };
  if (msg.includes("terminal")) return { kind: "race", phase: "ALREADY_TERMINAL" };
  if (msg.includes("reason required")) return { kind: "race", phase: "MISSING_REASON" };
  if (msg.includes("mutated") || msg.includes("retry")) return { kind: "race", phase: "IN_TX_RACE" };
  return { kind: "race", phase: "OTHER" };
}

// ── sweepExpiredDrafts ─────────────────────────────────────────

export async function sweepExpiredDrafts(
  opts: SweepExpiredDraftsOptions = {},
): Promise<SweepResult> {
  const startedAt = Date.now();
  const cutoff = opts.now ?? new Date();
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY;
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const concurrency = opts.concurrency ?? POOL_CONCURRENCY;

  const result: SweepResult = {
    examined: 0,
    cancelled: 0,
    skipped: 0,
    failed: 0,
    holdReleaseErrors: 0,
    errorBreakdown: {
      raceOnTerminal: 0,
      transitionErrors: 0,
      holdReleaseErrors: 0,
      stripeErrors: 0,
    },
    durationMs: 0,
    partial: false,
  };

  // Single batched SELECT for the tick. Cross-tenant by design — cron
  // is not scoped to any one tenant. Index hit:
  //   @@index([tenantId, status]) covers the status filter
  //   @@index([tenantId, expiresAt]) covers the expiry filter
  // Postgres planner picks whichever is cheaper on the live cardinality.
  const due = (await prisma.draftOrder.findMany({
    where: {
      status: { in: SWEEP_TARGETS as DraftOrderStatus[] },
      expiresAt: { lt: cutoff },
    },
    select: {
      id: true,
      tenantId: true,
      status: true,
      expiresAt: true,
    },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: batchSize,
  })) as ExpiredDraftRow[];

  result.examined = due.length;

  if (due.length === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const outcomes = await runWithPool(
    due,
    async (row) => processDraft(row),
    {
      concurrency,
      deadline: Number.isFinite(deadline) ? deadline : undefined,
    },
  );

  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i];
    if (o.skippedDueToBudget) {
      result.partial = true;
      continue;
    }
    if (!o.ok || !o.value) {
      // The pool itself caught an error — the worker rethrew to it.
      // processDraft never rethrows, so this branch is defensive only.
      result.failed++;
      result.errorBreakdown.transitionErrors++;
      continue;
    }
    const v = o.value;
    if (v.outcome === "cancelled") {
      result.cancelled++;
      if (v.holdReleaseErrors > 0) {
        result.holdReleaseErrors += v.holdReleaseErrors;
        result.errorBreakdown.holdReleaseErrors += v.holdReleaseErrors;
      }
      if (v.stripeError) {
        result.errorBreakdown.stripeErrors++;
      }
    } else if (v.outcome === "skipped") {
      result.skipped++;
      result.errorBreakdown.raceOnTerminal++;
    } else {
      result.failed++;
      result.errorBreakdown.transitionErrors++;
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

type ProcessResult =
  | { outcome: "cancelled"; holdReleaseErrors: number; stripeError: boolean }
  | { outcome: "skipped" }
  | { outcome: "failed" };

async function processDraft(row: ExpiredDraftRow): Promise<ProcessResult> {
  try {
    const res = await cancelDraft({
      tenantId: row.tenantId,
      draftOrderId: row.id,
      reason: "Automatic expiry",
      actorSource: "cron",
    });
    return {
      outcome: "cancelled",
      holdReleaseErrors: res.holdReleaseErrors.length,
      stripeError: res.stripePaymentIntentCancelError !== null,
    };
  } catch (err) {
    const classification = classifyCancelError(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode =
      err instanceof Error ? (err as Error & { code?: string }).code ?? null : null;

    if (classification.kind === "race") {
      log("info", "draft.expire.race", {
        tenantId: row.tenantId,
        draftOrderId: row.id,
        fromStatus: row.status,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        errorCode,
        errorMessage,
        phase: classification.phase,
      });
      return { outcome: "skipped" };
    }

    log("warn", "draft.expire.error", {
      tenantId: row.tenantId,
      draftOrderId: row.id,
      fromStatus: row.status,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      errorCode,
      errorMessage,
    });
    return { outcome: "failed" };
  }
}
