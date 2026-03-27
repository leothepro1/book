/**
 * Order Types
 * ═══════════
 *
 * TypeScript types and Zod schemas for the order system.
 * Derived from Prisma models. All monetary amounts in smallest
 * currency unit (ören/cents) — never floats.
 */

import { z } from "zod";
import type {
  Order,
  OrderLineItem,
  OrderEvent,
  OrderStatus,
  OrderEventType,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from "@prisma/client";

// ── Re-exports for convenience ─────────────────────────────────

export type {
  Order, OrderLineItem, OrderEvent, OrderStatus, OrderEventType,
  OrderFinancialStatus, OrderFulfillmentStatus,
};

// ── Composite types ────────────────────────────────────────────

export type OrderWithLineItems = Order & {
  lineItems: OrderLineItem[];
};

export type OrderWithEvents = Order & {
  events: OrderEvent[];
};

export type OrderFull = Order & {
  lineItems: OrderLineItem[];
  events: OrderEvent[];
};

// ── Input schemas ──────────────────────────────────────────────

export const guestInfoSchema = z.object({
  name: z.string().min(1, "Namn krävs").max(200),
  email: z.string().email("Ogiltig e-postadress"),
  phone: z.string().max(50).optional(),
});

export type GuestInfo = z.infer<typeof guestInfoSchema>;

export const createOrderLineItemInput = z.object({
  productId: z.string().min(1),
  variantId: z.string().nullable(),
  title: z.string().min(1),
  variantTitle: z.string().nullable(),
  sku: z.string().nullable(),
  imageUrl: z.string().nullable(),
  quantity: z.number().int().min(1),
  unitAmount: z.number().int().min(0),
  currency: z.string().default("SEK"),
});

export type CreateOrderLineItemInput = z.infer<typeof createOrderLineItemInput>;

export const createOrderInput = z.object({
  tenantId: z.string().min(1),
  guestInfo: guestInfoSchema,
  lineItems: z.array(createOrderLineItemInput).min(1, "Varukorgen är tom"),
  currency: z.string().default("SEK"),
});

export type CreateOrderInput = z.infer<typeof createOrderInput>;

// ── Status transition helpers ──────────────────────────────────

/**
 * Valid state transitions for orders.
 *
 * PENDING → PAID:       Payment provider webhook reports "resolved"
 * PENDING → CANCELLED:  Session expired, PI cancelled, or inventory rejected
 * PAID → FULFILLED:     Admin action (shipped/delivered/gift card created)
 * PAID → CANCELLED:     Admin-initiated cancel of paid order.
 *                        Caller MUST call adapter.refund() before transitioning.
 *                        Refund is NOT automatic — same model as Shopify.
 * PAID → REFUNDED:      charge.refunded webhook from payment provider
 * FULFILLED → REFUNDED: Post-fulfillment refund (return, complaint)
 */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["FULFILLED", "CANCELLED", "REFUNDED"],
  FULFILLED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Financial status transitions ─────────────────────────────

const FINANCIAL_TRANSITIONS: Record<OrderFinancialStatus, OrderFinancialStatus[]> = {
  PENDING:            ["AUTHORIZED", "PAID", "VOIDED"],
  AUTHORIZED:         ["PAID", "VOIDED"],
  PAID:               ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["REFUNDED"],
  REFUNDED:           [],
  VOIDED:             [],
};

export function canTransitionFinancial(
  from: OrderFinancialStatus,
  to: OrderFinancialStatus,
): boolean {
  return FINANCIAL_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Fulfillment status transitions ───────────────────────────

const FULFILLMENT_TRANSITIONS: Record<OrderFulfillmentStatus, OrderFulfillmentStatus[]> = {
  UNFULFILLED: ["SCHEDULED", "IN_PROGRESS", "CANCELLED", "ON_HOLD"],
  SCHEDULED:   ["UNFULFILLED", "IN_PROGRESS", "CANCELLED", "ON_HOLD"],
  IN_PROGRESS: ["FULFILLED", "ON_HOLD"],
  FULFILLED:   [],
  ON_HOLD:     ["UNFULFILLED", "SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  CANCELLED:   [],
}

export function canTransitionFulfillment(
  from: OrderFulfillmentStatus,
  to: OrderFulfillmentStatus,
): boolean {
  return FULFILLMENT_TRANSITIONS[from]?.includes(to) ?? false;
}
