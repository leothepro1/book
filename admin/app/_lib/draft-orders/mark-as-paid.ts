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

// TODO: Phase D — call `unlinkActiveCheckoutSession` before recording
// manual payment. This addresses §13.1 (mark-as-paid double-charge
// bug) per draft-orders-invoice-flow.md v1.2. Phase C deliberately
// leaves the bug in place because (a) the unlink helper does not yet
// exist (Phase D) and (b) the session model is not wired into any
// flow that creates PIs (Phase E), so there is no live PI to cancel.
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

  // Tx: re-validate + transition + audit. Race-safe via updateMany filter
  // inside transitionDraftStatusInTx.
  const transitioned = await prisma.$transaction(async (tx) => {
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
    return true;
  });

  if (!transitioned) {
    // Defensive — transition helper threw above. Should be unreachable.
    throw new ValidationError("mark-as-paid did not commit", {
      draftOrderId: draft.id,
    });
  }

  log("info", "draft_order.marked_paid_manually", {
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    reference: params.reference ?? null,
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
