/**
 * DraftOrder — overdue marking service (FAS 7.5 / Path B "lite").
 *
 * Sister service to `sweepExpiredDrafts` (FAS 6.5E). Sweeps DraftOrder
 * rows whose status is INVOICED and whose `shareLinkExpiresAt` has been
 * past for at least `graceDays` (default 3), and routes each through the
 * existing `transitionDraftStatusInTx` helper to flip them to OVERDUE.
 *
 * Mirrors `expire.ts` shape 1:1: single batched cross-tenant query,
 * bounded concurrency pool, wall-budget-aware deadline, per-row tx,
 * per-row try/catch — one bad row never aborts the sweep.
 *
 * Dual events per successful transition (matches the pattern FAS 7.4
 * established for INVOICE_RESENT): the helper emits STATE_CHANGED in
 * the same tx, and we add a dedicated INVOICE_OVERDUE event so the
 * timeline gets a distinct marker readers can switch on.
 *
 * Race-on-terminal — if `updateMany` finds no row in INVOICED status
 * because something (resendInvoice, cancelDraft, manual-mark-paid)
 * moved it between the SELECT and the tx — `transitioned: false` is
 * returned by the helper and we count it as `skipped`, NOT `failed`.
 *
 * INVARIANT: this function never throws. The route handler observes
 * the OverdueResult counters; everything else is logged and bucketed.
 */

import type { Prisma, DraftOrderStatus } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { runWithPool } from "@/app/_lib/concurrency/pool";
import { createDraftOrderEventInTx } from "./events";
import { transitionDraftStatusInTx } from "./lifecycle";

// ── Constants (mirrored from expire.ts) ─────────────────────────

const BATCH_SIZE = 200;
const POOL_CONCURRENCY = 8;
const DEFAULT_GRACE_DAYS = 3;
const SOURCE_STATUS: DraftOrderStatus = "INVOICED";
const TARGET_STATUS: DraftOrderStatus = "OVERDUE";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Public types ────────────────────────────────────────────────

export type OverdueResult = {
  examined: number;
  marked: number;
  /** Race-on-terminal — row moved out of INVOICED between SELECT and tx. */
  skipped: number;
  /** Genuine errors — anything we did not expect inside the per-row tx. */
  failed: number;
  durationMs: number;
  /** Wall-budget exhausted — pool returned skippedDueToBudget for some rows. */
  partial: boolean;
};

export type MarkOverdueOptions = {
  /** Override the comparison clock (test-only). */
  now?: Date;
  /** Epoch ms wall-budget deadline. Defaults to no deadline. */
  deadline?: number;
  /** Override max rows per tick. Defaults to 200. */
  batchSize?: number;
  /** Override pool concurrency. Defaults to 8. */
  concurrency?: number;
  /** Override grace window in days. Defaults to 3 (per recon §D Q1). */
  graceDays?: number;
};

// ── Internal: per-row selection shape ───────────────────────────

type OverdueRow = {
  id: string;
  tenantId: string;
  status: DraftOrderStatus;
  shareLinkExpiresAt: Date | null;
};

type ProcessResult =
  | { outcome: "marked" }
  | { outcome: "skipped" }
  | { outcome: "failed" };

// ── markOverdueDrafts ───────────────────────────────────────────

export async function markOverdueDrafts(
  options: MarkOverdueOptions = {},
): Promise<OverdueResult> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const concurrency = options.concurrency ?? POOL_CONCURRENCY;
  const graceDays = options.graceDays ?? DEFAULT_GRACE_DAYS;
  const cutoff = new Date(now.getTime() - graceDays * MS_PER_DAY);

  const result: OverdueResult = {
    examined: 0,
    marked: 0,
    skipped: 0,
    failed: 0,
    durationMs: 0,
    partial: false,
  };

  // Single batched SELECT for the tick. Cross-tenant by design — cron
  // is not scoped to any one tenant. Index hit:
  //   @@index([tenantId, status]) covers the status filter
  //   @@index([tenantId, shareLinkExpiresAt]) covers the expiry filter
  // (Postgres planner picks whichever is cheaper on the live cardinality.)
  // shareLinkExpiresAt IS NULL is excluded by `lt` semantics in Prisma.
  const due = (await prisma.draftOrder.findMany({
    where: {
      status: SOURCE_STATUS,
      shareLinkExpiresAt: { lt: cutoff },
    },
    select: {
      id: true,
      tenantId: true,
      status: true,
      shareLinkExpiresAt: true,
    },
    orderBy: [{ shareLinkExpiresAt: "asc" }, { id: "asc" }],
    take: batchSize,
  })) as OverdueRow[];

  result.examined = due.length;

  if (due.length === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const outcomes = await runWithPool(
    due,
    async (row) => processRow(row, { now, graceDays, cutoff }),
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
      // processRow never rethrows, so this branch is defensive only.
      result.failed++;
      continue;
    }
    const v = o.value;
    if (v.outcome === "marked") {
      result.marked++;
    } else if (v.outcome === "skipped") {
      result.skipped++;
    } else {
      result.failed++;
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

async function processRow(
  row: OverdueRow,
  ctx: { now: Date; graceDays: number; cutoff: Date },
): Promise<ProcessResult> {
  const shareLinkExpiresAtIso = row.shareLinkExpiresAt?.toISOString() ?? null;
  const overdueAtIso = ctx.now.toISOString();
  const cutoffIso = ctx.cutoff.toISOString();

  try {
    return await prisma.$transaction(async (tx) => {
      // Prisma.InputJsonValue rejects `null` in nested fields — use
      // conditional spread so optional values are omitted when absent.
      // (Same pattern FAS 7.4 established for INVOICE_RESENT.)
      const eventMetadata: Prisma.InputJsonValue = {
        graceDays: ctx.graceDays,
        cutoff: cutoffIso,
        overdueAt: overdueAtIso,
        ...(shareLinkExpiresAtIso !== null
          ? { shareLinkExpiresAt: shareLinkExpiresAtIso }
          : {}),
      };

      const transition = await transitionDraftStatusInTx(tx, {
        tenantId: row.tenantId,
        draftOrderId: row.id,
        from: SOURCE_STATUS,
        to: TARGET_STATUS,
        actorSource: "cron",
        metadata: eventMetadata,
      });

      if (!transition.transitioned) {
        log("info", "draft.overdue.race", {
          tenantId: row.tenantId,
          draftOrderId: row.id,
          fromStatus: row.status,
          shareLinkExpiresAt: shareLinkExpiresAtIso,
        });
        return { outcome: "skipped" } as const;
      }

      // Dual-event pattern (matches FAS 7.4 INVOICE_RESENT).
      // STATE_CHANGED is emitted by the helper; INVOICE_OVERDUE gives the
      // timeline a distinct marker independent of the generic state event.
      await createDraftOrderEventInTx(tx, {
        tenantId: row.tenantId,
        draftOrderId: row.id,
        type: "INVOICE_OVERDUE",
        metadata: eventMetadata,
        actorSource: "cron",
      });

      return { outcome: "marked" } as const;
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode =
      err instanceof Error
        ? (err as Error & { code?: string }).code ?? null
        : null;

    log("warn", "draft.overdue.error", {
      tenantId: row.tenantId,
      draftOrderId: row.id,
      fromStatus: row.status,
      shareLinkExpiresAt: shareLinkExpiresAtIso,
      errorCode,
      errorMessage,
    });
    return { outcome: "failed" };
  }
}
