/**
 * Read-side service for draft-orders admin UI.
 * Returns Result<T,E> shape — matches existing orders/* read pattern.
 * Mutations in lifecycle.ts throw ServiceError — different convention by design.
 *
 * `updateDraftMeta` is the exception in this file: it IS a mutation,
 * but its caller surface is the admin UI form-action layer, which
 * expects Result-style returns (matching `updateCustomerNote`,
 * `updateOrderTags` in `(admin)/orders/actions.ts`). The throw-style
 * lifecycle services (cancelDraft, sendInvoice, …) are called by code
 * paths that already wrap errors at a different boundary.
 */

import { z } from "zod";
import type { DraftOrder, DraftOrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { VersionConflictError } from "@/app/_lib/errors/service-errors";
import { createDraftOrderEventInTx } from "./events";
import { DRAFT_ERRORS } from "./errors";
import { unlinkActiveCheckoutSession, type UnlinkResult } from "./unlink";
import { runUnlinkSideEffects } from "./unlink-side-effects";

// ── Types ──────────────────────────────────────────────────────

export type DraftMetaPatch = {
  expiresAt?: Date;
  internalNote?: string | null;
  customerNote?: string | null;
  /** Replaces (not merges) the tag array. */
  tags?: string[];
};

export const DraftMetaPatchSchema = z.object({
  expiresAt: z.date().optional(),
  internalNote: z.string().max(5000).nullable().optional(),
  customerNote: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().min(1).max(64)).max(50).optional(),
});

export type UpdateDraftMetaActor = {
  userId?: string;
  source: "admin_ui" | "cron";
};

export type UpdateDraftMetaResult =
  | { ok: true; draft: DraftOrder }
  | { ok: false; error: string };

// ── updateDraftMeta ────────────────────────────────────────────

const EDITABLE_STATUSES: DraftOrderStatus[] = [
  "OPEN",
  "PENDING_APPROVAL",
  "APPROVED",
];

type Diff = {
  expiresAt?: { from: string | null; to: string };
  internalNote?: { from: string | null; to: string | null };
  customerNote?: { from: string | null; to: string | null };
  tags?: { from: string[]; to: string[] };
};

function buildDiff(prev: DraftOrder, patch: DraftMetaPatch): Diff {
  const diff: Diff = {};
  if (
    patch.expiresAt !== undefined &&
    patch.expiresAt.getTime() !== prev.expiresAt.getTime()
  ) {
    diff.expiresAt = {
      from: prev.expiresAt.toISOString(),
      to: patch.expiresAt.toISOString(),
    };
  }
  if (
    patch.internalNote !== undefined &&
    (patch.internalNote ?? null) !== (prev.internalNote ?? null)
  ) {
    diff.internalNote = {
      from: prev.internalNote ?? null,
      to: patch.internalNote ?? null,
    };
  }
  if (
    patch.customerNote !== undefined &&
    (patch.customerNote ?? null) !== (prev.customerNote ?? null)
  ) {
    diff.customerNote = {
      from: prev.customerNote ?? null,
      to: patch.customerNote ?? null,
    };
  }
  if (patch.tags !== undefined) {
    const prevTags = prev.tags ?? [];
    const sortedPrev = [...prevTags].sort();
    const sortedNext = [...patch.tags].sort();
    if (
      sortedPrev.length !== sortedNext.length ||
      sortedPrev.some((t, i) => t !== sortedNext[i])
    ) {
      diff.tags = { from: prevTags, to: patch.tags };
    }
  }
  return diff;
}

export async function updateDraftMeta(
  draftId: string,
  tenantId: string,
  rawPatch: DraftMetaPatch,
  actor: UpdateDraftMetaActor,
): Promise<UpdateDraftMetaResult> {
  const patch = DraftMetaPatchSchema.parse(rawPatch);

  // Pre-tx: load current state. Cross-tenant access surfaces here as
  // null (same response as not-found — never leak existence).
  const current = (await prisma.draftOrder.findFirst({
    where: { id: draftId, tenantId },
  })) as DraftOrder | null;
  if (!current) {
    return { ok: false, error: DRAFT_ERRORS.NOT_FOUND };
  }

  if (!EDITABLE_STATUSES.includes(current.status)) {
    return {
      ok: false,
      error: DRAFT_ERRORS.TERMINAL_STATUS(current.status),
    };
  }

  const diff = buildDiff(current, patch);

  // No-op patch — early return without DB roundtrip / event noise.
  if (Object.keys(diff).length === 0) {
    return { ok: true, draft: current };
  }

  try {
    const txResult = await prisma.$transaction(async (tx) => {
      // Re-validate inside tx (defensive against concurrent transitions).
      const fresh = await tx.draftOrder.findFirst({
        where: { id: draftId, tenantId },
        select: { status: true, version: true },
      });
      if (!fresh) {
        throw new Error("__VANISHED__");
      }
      if (!EDITABLE_STATUSES.includes(fresh.status)) {
        throw new Error(`__TERMINAL__:${fresh.status}`);
      }

      // Phase D — assemble the patch + version increment, then write
      // via updateMany with version-CAS filter.
      const data: Prisma.DraftOrderUpdateManyMutationInput = {
        version: { increment: 1 },
      };
      if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt;
      if (patch.internalNote !== undefined) data.internalNote = patch.internalNote;
      if (patch.customerNote !== undefined) data.customerNote = patch.customerNote;
      if (patch.tags !== undefined) data.tags = { set: patch.tags };

      const updateRes = await tx.draftOrder.updateMany({
        where: { id: draftId, tenantId, version: fresh.version },
        data,
      });
      if (updateRes.count === 0) {
        throw new VersionConflictError(DRAFT_ERRORS.VERSION_CONFLICT, {
          draftOrderId: draftId,
          tenantId,
          expectedVersion: fresh.version,
        });
      }

      await createDraftOrderEventInTx(tx, {
        tenantId,
        draftOrderId: draftId,
        type: "META_UPDATED",
        metadata: { diff } as Prisma.InputJsonValue,
        actorUserId: actor.userId ?? null,
        actorSource: actor.source,
      });

      // Phase D — v1.2 §6.1.
      const unlink = await unlinkActiveCheckoutSession(
        tx,
        draftId,
        tenantId,
        "draft_mutated",
        { source: actor.source, userId: actor.userId },
      );

      const refreshed = (await tx.draftOrder.findFirst({
        where: { id: draftId, tenantId },
      })) as DraftOrder;

      return { draft: refreshed, unlink };
    });

    if (txResult.unlink.unlinked) {
      schedulePostCommitUnlinkSideEffects(tenantId, draftId, txResult.unlink);
    }

    return { ok: true, draft: txResult.draft };
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return { ok: false, error: DRAFT_ERRORS.VERSION_CONFLICT };
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "__VANISHED__") {
      return { ok: false, error: DRAFT_ERRORS.NOT_FOUND };
    }
    if (msg.startsWith("__TERMINAL__:")) {
      const status = msg.slice("__TERMINAL__:".length);
      return { ok: false, error: DRAFT_ERRORS.TERMINAL_STATUS(status) };
    }
    throw err;
  }
}

/** Same fire-and-forget pattern as in `update-customer.ts`. */
function schedulePostCommitUnlinkSideEffects(
  tenantId: string,
  draftOrderId: string,
  unlink: UnlinkResult,
): void {
  if (!unlink.unlinked || unlink.sessionId === null) return;
  void runUnlinkSideEffects({
    tenantId,
    draftOrderId,
    sessionId: unlink.sessionId,
    releasedHoldExternalIds: unlink.releasedHoldExternalIds,
    stripePaymentIntentId: unlink.stripePaymentIntentId,
  }).catch((err) => {
    log("error", "draft_invoice.side_effects_failed", {
      tenantId,
      draftOrderId,
      sessionId: unlink.sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
