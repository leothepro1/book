/**
 * Stripe webhook bridge — draft-order PaymentIntent succeeded.
 *
 * Branches from `route.ts:handlePaymentIntentSucceeded` when
 * pi.metadata.kind === "draft_order_invoice". Lives in its own module
 * so it can be exercised directly in tests (route.ts is a Next.js
 * app-router file with restricted exports).
 *
 * Two-tx pattern per FAS 6.5D audit §5.3 (Option A):
 *   Tx 1: tiny INVOICED/OVERDUE → PAID transition (idempotent via
 *         updateMany with status filter; re-delivery sees count=0
 *         and proceeds to Tx 2).
 *   Tx 2: convertDraftToOrder (full promotion, from `_lib/draft-orders`).
 *
 * Phase C post-commit side-effects (analytics, email, guest account,
 * platform webhooks) are fire-and-forget — never throw back to the
 * webhook handler.
 */

import type Stripe from "stripe";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

export async function handleDraftOrderPaymentIntentSucceeded(
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const draftOrderId = pi.metadata?.draftOrderId;
  const tenantId = pi.metadata?.tenantId;
  if (!draftOrderId || !tenantId) {
    log("error", "stripe.draft_webhook.missing_metadata", {
      paymentIntentId: pi.id,
      hasDraftOrderId: Boolean(draftOrderId),
      hasTenantId: Boolean(tenantId),
    });
    return;
  }

  const draft = await prisma.draftOrder.findFirst({
    where: { id: draftOrderId, tenantId },
    select: {
      id: true,
      status: true,
      completedOrderId: true,
      displayNumber: true,
    },
  });
  if (!draft) {
    log("warn", "stripe.draft_webhook.draft_not_found", {
      draftOrderId,
      tenantId,
      paymentIntentId: pi.id,
    });
    return;
  }

  // L3 fast-path: already converted.
  if (draft.completedOrderId !== null) {
    log("info", "stripe.draft_webhook.already_converted", {
      draftOrderId,
      completedOrderId: draft.completedOrderId,
      paymentIntentId: pi.id,
    });
    return;
  }

  // Tx 1: INVOICED/OVERDUE → PAID (idempotent via status filter).
  if (draft.status === "INVOICED" || draft.status === "OVERDUE") {
    const { createDraftOrderEventInTx } = await import(
      "@/app/_lib/draft-orders"
    );
    await prisma.$transaction(async (tx) => {
      const res = await tx.draftOrder.updateMany({
        where: {
          id: draftOrderId,
          tenantId,
          status: { in: ["INVOICED", "OVERDUE"] },
        },
        data: { status: "PAID", version: { increment: 1 } },
      });
      if (res.count === 0) return;
      await createDraftOrderEventInTx(tx, {
        tenantId,
        draftOrderId,
        type: "STATE_CHANGED",
        metadata: {
          from: draft.status,
          to: "PAID",
          stripePaymentIntentId: pi.id,
          amount: pi.amount,
          currency: pi.currency,
        },
        actorSource: "webhook",
      });
    });

    const { emitPlatformEvent } = await import("@/app/_lib/apps/webhooks");
    emitPlatformEvent({
      type: "draft_order.paid",
      tenantId,
      payload: {
        draftOrderId,
        tenantId,
        displayNumber: draft.displayNumber,
        stripePaymentIntentId: pi.id,
        amount: pi.amount,
        currency: pi.currency.toUpperCase(),
        paidAt: new Date().toISOString(),
      },
    }).catch((err) =>
      log("error", "draft_order.webhook_emit_failed", {
        tenantId,
        draftOrderId,
        eventType: "draft_order.paid",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  } else if (draft.status !== "PAID") {
    log("error", "stripe.draft_webhook.unexpected_status", {
      draftOrderId,
      status: draft.status,
      paymentIntentId: pi.id,
    });
    return;
  }

  // Tx 2: convertDraftToOrder. Re-throws on failure → Stripe retry.
  const { convertDraftToOrder } = await import("@/app/_lib/draft-orders");
  const result = await convertDraftToOrder({
    tenantId,
    draftOrderId,
    stripePaymentIntentId: pi.id,
    actorSource: "webhook",
  });

  log("info", "stripe.draft_webhook.converted", {
    tenantId,
    draftOrderId,
    orderId: result.order.id,
    alreadyConverted: result.alreadyConverted,
    paymentIntentId: pi.id,
  });

  // Phase C: post-commit side-effects. Fire-and-forget — do NOT throw
  // back. convert has already committed; another retry would be a
  // wasted no-op at the draft layer.
  try {
    const { processOrderPaidSideEffects } = await import(
      "@/app/_lib/orders/process-paid-side-effects"
    );
    await processOrderPaidSideEffects(result.order.id, pi.id);
  } catch (err) {
    log("error", "stripe.draft_webhook.side_effects_failed", {
      tenantId,
      draftOrderId,
      orderId: result.order.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
