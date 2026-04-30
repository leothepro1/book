/**
 * Manual mark-as-paid for B2B bank-transfer / cash payments.
 *
 * In steady-state the PAID transition happens automatically via the
 * Stripe webhook (`handle-draft-order-pi.ts`) when the customer pays
 * through the invoice link. This service exists for the alternate
 * flow where the operator records that payment was received outside
 * Stripe (manual transfer, cash, third-party rail) and needs to push
 * the draft through the same downstream effects.
 *
 * Behaviour mirrors the webhook (Q14 — auto-convert):
 *   1. INVOICED/OVERDUE → PAID (atomic transition + STATE_CHANGED event)
 *   2. After commit: invoke `convertDraftToOrder` to reach COMPLETED.
 *
 * Throws-style errors (NotFoundError, ValidationError, ConflictError)
 * matching `lifecycle.ts`. Caller (action layer) catches and maps to
 * Result-shape.
 */

import { z } from "zod";
import type { DraftOrder, DraftOrderStatus, Order } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  NotFoundError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";
import { transitionDraftStatusInTx } from "./lifecycle";
import { unlinkActiveCheckoutSession, type UnlinkResult } from "./unlink";
import { runUnlinkSideEffects } from "./unlink-side-effects";

// ── Types ──────────────────────────────────────────────────────

export const MarkDraftAsPaidInputSchema = z.object({
  tenantId: z.string().min(1),
  draftOrderId: z.string().min(1),
  /** Free-form operator note — bank reference, transaction id, etc. */
  reference: z.string().max(500).optional(),
  actorUserId: z.string().optional(),
});

export type MarkDraftAsPaidInput = z.infer<typeof MarkDraftAsPaidInputSchema>;
export type MarkDraftAsPaidArgs = z.input<typeof MarkDraftAsPaidInputSchema>;

export type MarkDraftAsPaidResult = {
  draft: DraftOrder;
  /** Set when auto-convert succeeded; absent when convert failed (PAID is still committed). */
  order?: Order;
};

// ── Helpers ────────────────────────────────────────────────────

const PAYABLE_STATUSES: DraftOrderStatus[] = ["INVOICED", "OVERDUE"];

// ── markDraftAsPaid ────────────────────────────────────────────

// §13.1 fix: unlink the active DraftCheckoutSession before recording
// manual payment. This prevents the double-charge race where a buyer
// completes Stripe payment after the merchant marked the draft as
// paid manually.
// Refs: draft-orders-invoice-flow.md v1.2 §6.1, §13.1, invariant 5.
export async function markDraftAsPaid(
  input: MarkDraftAsPaidArgs,
): Promise<MarkDraftAsPaidResult> {
  const params = MarkDraftAsPaidInputSchema.parse(input);

  // Pre-tx: load draft + validate status. Cross-tenant collapses to NOT_FOUND.
  const draft = (await prisma.draftOrder.findFirst({
    where: { id: params.draftOrderId, tenantId: params.tenantId },
  })) as DraftOrder | null;
  if (!draft) {
    throw new NotFoundError("DraftOrder not found in tenant", {
      tenantId: params.tenantId,
      draftOrderId: params.draftOrderId,
    });
  }
  if (!PAYABLE_STATUSES.includes(draft.status)) {
    throw new ValidationError(
      "Draft must be in INVOICED or OVERDUE status to mark paid",
      { draftOrderId: draft.id, status: draft.status },
    );
  }

  // Tx: unlink → re-validate → transition → audit. The unlink runs as
  // the FIRST in-tx step (per §13.1 fix) so the session is invalidated
  // BEFORE we commit PAID. If the buyer's Stripe webhook arrives
  // between commit and side-effects, Phase H's webhook handler will
  // see status=UNLINKED and refund instead of double-charging
  // (v1.2 §6.4).
  const txResult = await prisma.$transaction(async (tx) => {
    const fresh = (await tx.draftOrder.findFirst({
      where: { id: draft.id, tenantId: draft.tenantId },
      select: { status: true },
    })) as { status: DraftOrderStatus } | null;
    if (!fresh) {
      throw new NotFoundError("DraftOrder vanished during mutation", {
        draftOrderId: draft.id,
      });
    }
    if (!PAYABLE_STATUSES.includes(fresh.status)) {
      throw new ValidationError(
        "Draft status changed before mark-as-paid could commit",
        { draftOrderId: draft.id, status: fresh.status },
      );
    }

    // §13.1 fix — unlink BEFORE transition. The session's PI must be
    // cancelled before we commit PAID; the order is critical because
    // Phase H's webhook routes off session.status (ACTIVE = pay,
    // UNLINKED = refund). If we transitioned first then unlinked, a
    // buyer's parallel Stripe webhook could see ACTIVE briefly and
    // capture the payment.
    const unlink = await unlinkActiveCheckoutSession(
      tx,
      draft.id,
      draft.tenantId,
      "marked_paid_manually",
      { source: "admin_ui", userId: params.actorUserId },
    );

    const result = await transitionDraftStatusInTx(tx, {
      tenantId: draft.tenantId,
      draftOrderId: draft.id,
      from: fresh.status,
      to: "PAID",
      actorUserId: params.actorUserId ?? null,
      actorSource: "admin_ui",
      metadata: {
        reason: "manual_payment",
        reference: params.reference ?? null,
      },
    });
    if (!result.transitioned) {
      throw new ValidationError(
        "Draft mutated during mark-as-paid — retry",
        { draftOrderId: draft.id },
      );
    }
    return { unlink };
  });

  if (txResult.unlink.unlinked) {
    schedulePostCommitUnlinkSideEffects(draft.tenantId, draft.id, txResult.unlink);
  }

  log("info", "draft_order.marked_paid_manually", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    reference: params.reference ?? null,
    sessionUnlinked: txResult.unlink.unlinked,
  });

  // TODO: Phase E + Phase H — auto-convert flow. Pre-Phase C this
  // function read `metafields.stripePaymentIntentId` and forwarded it
  // to `convertDraftToOrder` (which requires a PI ID). Phase B deleted
  // the metafields-based storage of PI; Phase E moves the PI to
  // `DraftCheckoutSession.stripePaymentIntentId`. Until Phase E +
  // Phase H wire the session-aware lookup, mark-as-paid stops at PAID
  // and does NOT auto-convert. Production has zero drafts, so this
  // regression has zero exposure (Phase B verification VP4).
  const refreshed = (await prisma.draftOrder.findFirst({
    where: { id: draft.id, tenantId: draft.tenantId },
  })) as DraftOrder;
  return { draft: refreshed };
}

/** Same fire-and-forget post-commit dispatcher as in lines/discount/update-*. */
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
