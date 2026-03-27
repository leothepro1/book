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
    case "IN_PROGRESS":  return "CHECKIN_CONFIRMED";
    case "FULFILLED":    return "CHECKOUT_CONFIRMED";
    case "CANCELLED":    return "CANCELLED";
    case "ON_HOLD":      return "NOTE_ADDED";
    case "SCHEDULED":    return "NOTE_ADDED";
    case "UNFULFILLED":  return "NOTE_ADDED";
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
    select: { id: true, tenantId: true, fulfillmentStatus: true },
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

  return {
    success: true,
    orderId: order.id,
    previousStatus: order.fulfillmentStatus,
    newStatus: to,
  };
}
