/**
 * Mutation: change the customer (`guestAccountId`) on an existing draft.
 *
 * Result-style return mirrors `updateDraftMeta`. EDITABLE_STATUSES gate +
 * in-tx race protection are duplicated from `update-meta.ts` — the two
 * services share the same mutability boundary by design.
 *
 * Snapshot fields (`contactEmail/Phone/FirstName/LastName`) are NOT
 * frozen here. `create-with-lines` likewise leaves them null; the
 * read-side falls back to GuestAccount lookup. Schema comment
 * (4910–4912) promises freeze-at-creation but the implementation has
 * always deferred. Closing that gap is a separate cleanup ticket.
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

export type DraftCustomerPatch = {
  /** `null` clears the customer association. */
  guestAccountId: string | null;
};

export const DraftCustomerPatchSchema = z.object({
  guestAccountId: z.string().min(1).nullable(),
});

export type UpdateDraftCustomerActor = {
  userId?: string;
  source: "admin_ui" | "cron";
};

export type UpdateDraftCustomerResult =
  | { ok: true; draft: DraftOrder }
  | { ok: false; error: string };

// ── updateDraftCustomer ────────────────────────────────────────

const EDITABLE_STATUSES: DraftOrderStatus[] = [
  "OPEN",
  "PENDING_APPROVAL",
  "APPROVED",
];

type Diff = {
  guestAccountId: { from: string | null; to: string | null };
};

export async function updateDraftCustomer(
  draftId: string,
  tenantId: string,
  rawPatch: DraftCustomerPatch,
  actor: UpdateDraftCustomerActor,
): Promise<UpdateDraftCustomerResult> {
  const patch = DraftCustomerPatchSchema.parse(rawPatch);

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

  // No-op patch — early return without DB roundtrip / event noise.
  if ((current.guestAccountId ?? null) === (patch.guestAccountId ?? null)) {
    return { ok: true, draft: current };
  }

  // Validate that the new GuestAccount exists in this tenant. Cross-tenant
  // guests surface as INVALID_CUSTOMER (same response as missing — never
  // leak existence across tenants).
  if (patch.guestAccountId !== null) {
    const guest = await prisma.guestAccount.findFirst({
      where: { id: patch.guestAccountId, tenantId },
      select: { id: true },
    });
    if (!guest) {
      return { ok: false, error: DRAFT_ERRORS.INVALID_CUSTOMER };
    }
  }

  const diff: Diff = {
    guestAccountId: {
      from: current.guestAccountId ?? null,
      to: patch.guestAccountId ?? null,
    },
  };

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

      // Phase D — version CAS via updateMany. Catches concurrent edits
      // that don't change status (which the in-tx status re-check above
      // wouldn't catch).
      const updateRes = await tx.draftOrder.updateMany({
        where: { id: draftId, tenantId, version: fresh.version },
        data: {
          guestAccountId: patch.guestAccountId,
          version: { increment: 1 },
        },
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
        type: "CUSTOMER_UPDATED",
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

/**
 * Fire-and-forget post-commit dispatcher for unlink side effects.
 * Local copy of the same helper in `lines.ts` / `discount.ts` —
 * recon Summary 4 says fire-and-forget is the existing convention,
 * this preserves it without introducing a shared post-commit module.
 */
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
