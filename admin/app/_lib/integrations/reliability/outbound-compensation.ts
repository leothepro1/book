/**
 * Outbound Compensation — Refund + Cancel for DEAD outbound jobs
 * ════════════════════════════════════════════════════════════════
 *
 * Executes the three-step compensation when a paid order's PMS
 * booking cannot be created after the retry ladder is exhausted:
 *
 *   1. Stripe refund via the tenant's payment adapter
 *   2. Order → CANCELLED + financialStatus=REFUNDED + fulfillmentStatus=CANCELLED
 *   3. Booking (if any) → CANCELLED
 *
 * Every step is idempotent: a retry of the whole compensation sees
 * the Order already REFUNDED and skips the Stripe refund, etc.
 *
 * Throws on any step that could still succeed with more time. The
 * caller (compensateOutboundJob) catches, schedules a retry, and
 * re-enters here on the next cron tick.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { canTransition, canTransitionFinancial, canTransitionFulfillment } from "@/app/_lib/orders/types";
import { getAdapterAndContextForTenant } from "@/app/_lib/payments/providers/config";

export interface RefundOrderForFailedFulfillmentArgs {
  tenantId: string;
  orderId: string;
}

export async function refundOrderForFailedFulfillment(
  args: RefundOrderForFailedFulfillmentArgs,
): Promise<void> {
  const { tenantId, orderId } = args;

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: {
      paymentSession: {
        select: { id: true, externalSessionId: true },
      },
      bookings: {
        select: { id: true, status: true },
      },
    },
  });

  if (!order) {
    // Order vanished between job creation and compensation — nothing
    // we can do. Treat as success so the job moves to COMPENSATED
    // rather than spinning forever.
    log("warn", "pms.outbound.compensation.order_gone", { tenantId, orderId });
    return;
  }

  // ── Step 1: Stripe refund (idempotent via financialStatus) ──
  //
  // If financialStatus is already REFUNDED (or VOIDED for never-charged),
  // we've already issued the refund on a prior attempt — skip.

  const alreadyRefunded =
    order.financialStatus === "REFUNDED" ||
    order.financialStatus === "VOIDED";

  if (!alreadyRefunded) {
    if (!order.paymentSession?.externalSessionId) {
      // Order is PAID but has no external session id — edge case
      // (maybe the session was archived). Without the session id we
      // can't ask the adapter to refund. Escalate rather than loop.
      throw new Error(
        `Order ${orderId} is paid but has no paymentSession.externalSessionId — cannot issue refund automatically`,
      );
    }

    const { adapter, ctx } = await getAdapterAndContextForTenant(tenantId);

    const refundResult = await adapter.refund({
      sessionId: order.paymentSession.externalSessionId,
      amount: order.totalAmount,
      reason: "PMS booking creation failed — reservation could not be confirmed",
      ctx,
    });

    if (!refundResult.success) {
      // Adapter reported refund didn't go through. Rethrow so the
      // caller schedules a retry. We don't partially commit the
      // other steps — Order stays PAID, Booking stays intact, job
      // stays in COMPENSATING state awaiting another pass.
      throw new Error(
        `Stripe refund failed for order ${orderId} (providerRefundId=${refundResult.providerRefundId})`,
      );
    }

    log("info", "pms.outbound.compensation.refund_issued", {
      tenantId,
      orderId,
      amount: order.totalAmount,
      providerRefundId: refundResult.providerRefundId,
    });
  }

  // ── Step 2: Order state transitions (idempotent) ──
  //
  // Each guard is a no-op if we already landed on the target state
  // from a prior attempt. We use the platform's canTransition helpers
  // so a future order-type that forbids these transitions is
  // surfaced loudly rather than silently overwritten.

  const orderUpdate: Record<string, unknown> = {};
  if (canTransition(order.status, "CANCELLED")) {
    orderUpdate.status = "CANCELLED";
    orderUpdate.cancelledAt = new Date();
  }
  if (canTransitionFinancial(order.financialStatus, "REFUNDED")) {
    orderUpdate.financialStatus = "REFUNDED";
    orderUpdate.refundedAt = new Date();
  }
  if (canTransitionFulfillment(order.fulfillmentStatus, "CANCELLED")) {
    orderUpdate.fulfillmentStatus = "CANCELLED";
  }

  if (Object.keys(orderUpdate).length > 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: orderUpdate,
    });
  }

  // Audit event — always append (operators read the timeline)
  await prisma.orderEvent.create({
    data: {
      orderId,
      tenantId,
      type: "ORDER_UPDATED",
      message:
        "Automatisk återbetalning — PMS-bokningen kunde inte skapas, beloppet är återbetalat till gästen",
    },
  });

  // ── Step 3: Booking → CANCELLED (if present) ──

  for (const b of order.bookings) {
    if (b.status === "CANCELLED") continue;
    await prisma.booking.update({
      where: { id: b.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });
  }

  log("info", "pms.outbound.compensation.completed", {
    tenantId,
    orderId,
    bookingCount: order.bookings.length,
  });
}
