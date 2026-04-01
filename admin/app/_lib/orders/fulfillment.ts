/**
 * Fulfillment Status Transitions
 * ═══════════════════════════════
 *
 * The ONLY place that writes fulfillmentStatus transitions.
 * Never write fulfillmentStatus directly in route handlers.
 *
 * Idempotent — transitioning to the current state returns success.
 * Tenant-isolated — always verifies tenantId matches.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { canTransitionFulfillment } from "./types";
import type { OrderFulfillmentStatus, OrderEventType } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────

export interface FulfillmentTransitionResult {
  success: boolean;
  orderId?: string;
  previousStatus?: OrderFulfillmentStatus;
  newStatus?: OrderFulfillmentStatus;
  error?: string;
  alreadyInState?: boolean;
}

// ── Event type mapping ───────────────────────────────────────

function eventTypeForTransition(to: OrderFulfillmentStatus): OrderEventType {
  switch (to) {
    case "IN_PROGRESS":  return "ORDER_UPDATED";
    case "FULFILLED":    return "ORDER_FULFILLED";
    case "CANCELLED":    return "ORDER_CANCELLED";
    case "ON_HOLD":      return "ORDER_UPDATED";
    case "SCHEDULED":    return "ORDER_UPDATED";
    case "UNFULFILLED":  return "ORDER_UNFULFILLED";
  }
}

function buildFulfillmentMessage(to: OrderFulfillmentStatus, note?: string): string {
  const messages: Record<OrderFulfillmentStatus, string> = {
    UNFULFILLED:  "Bokning återställd till obekräftad",
    SCHEDULED:    "Bokning schemalagd",
    IN_PROGRESS:  "Gästen checkade in",
    FULFILLED:    "Gästen checkade ut",
    ON_HOLD:      "Bokning pausad",
    CANCELLED:    "Bokning avbokad",
  };
  return note ? `${messages[to]} — ${note}` : messages[to];
}

// ── Main function ────────────────────────────────────────────

export async function transitionFulfillmentStatus(
  orderId: string,
  tenantId: string,
  to: OrderFulfillmentStatus,
  options: {
    actorUserId?: string;
    note?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<FulfillmentTransitionResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, tenantId: true, fulfillmentStatus: true, guestAccountId: true, orderNumber: true },
  });

  if (!order || order.tenantId !== tenantId) {
    return { success: false, error: "Order not found" };
  }

  // Idempotent — already in target state
  if (order.fulfillmentStatus === to) {
    return {
      success: true,
      alreadyInState: true,
      orderId: order.id,
      previousStatus: order.fulfillmentStatus,
      newStatus: to,
    };
  }

  if (!canTransitionFulfillment(order.fulfillmentStatus, to)) {
    return {
      success: false,
      error: `Cannot transition from ${order.fulfillmentStatus} to ${to}`,
    };
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        fulfillmentStatus: to,
        ...(to === "FULFILLED" ? { fulfilledAt: new Date() } : {}),
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId,
        tenantId,
        type: eventTypeForTransition(to),
        message: buildFulfillmentMessage(to, options.note),
        actorUserId: options.actorUserId ?? null,
        metadata: (options.metadata ?? {}) as Record<string, string>,
      },
    }),
  ]);

  log("info", "order.fulfillment.transition", {
    orderId,
    tenantId,
    from: order.fulfillmentStatus,
    to,
    actorUserId: options.actorUserId ?? null,
  });

  // Emit ORDER_FULFILLED guest event
  if (to === "FULFILLED" && order.guestAccountId) {
    const { createGuestAccountEvent } = await import("@/app/_lib/guests/events");
    await createGuestAccountEvent({
      guestAccountId: order.guestAccountId,
      tenantId,
      type: "ORDER_FULFILLED",
      message: `Bokning #${order.orderNumber} genomförd`,
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
      orderId: order.id,
    });
  }

  // Enroll in ORDER_COMPLETED automations when order is both PAID and FULFILLED
  if (to === "FULFILLED" && order.guestAccountId) {
    const fullOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: { financialStatus: true },
    });
    if (fullOrder?.financialStatus === "PAID") {
      import("@/app/_lib/email/enrollInAutomations").then(({ enrollInAutomations }) =>
        enrollInAutomations({
          tenantId,
          guestId: order.guestAccountId!,
          trigger: "ORDER_COMPLETED",
        }),
      ).catch((err) => log("error", "order.automation_enroll.failed", { orderId, error: String(err) }));
    }
  }

  return {
    success: true,
    orderId: order.id,
    previousStatus: order.fulfillmentStatus,
    newStatus: to,
  };
}
