/**
 * payment_succeeded v0.2.0
 * ────────────────────────
 *
 * Emitted when a payment is captured and the order is marked PAID.
 * Fires for **every** paid Order regardless of orderType (ACCOMMODATION,
 * PURCHASE, GIFT_CARD, …).
 *
 * Version history
 * ───────────────
 *   v0.1.0  Initial schema. Carried provider, payment_instrument, amount,
 *           booking_id, provider_reference, captured_at. **Lacked
 *           source_channel and line_items.** Deprecated. Preserved at
 *           `legacy/payment-succeeded-v0.1.0.ts` for outbox-drain
 *           backward-compat only.
 *   v0.2.0  Adds REQUIRED `source_channel` (the order-origin channel,
 *           mirroring Order.sourceChannel mapped into the analytics
 *           domain) and REQUIRED `line_items[]` (per-product revenue
 *           split, sourced from OrderLineItem rows). **Current.**
 *
 *           Both fields are required because every paid Order has the
 *           data: Order.sourceChannel is a String? column with explicit
 *           `"unknown"`-fallback at emit time, and Order.lineItems is
 *           always materialised (orders without explicit line items
 *           emit `line_items: []` — a structurally valid empty array).
 *           Pre-stable (0.x) versioning per `schemas/registry.ts:17-20`
 *           allows required fields without a major bump.
 *
 *           Phase 5A's aggregator consumes these for REVENUE × CHANNEL,
 *           ORDERS × CHANNEL, and REVENUE × PRODUCT dimensions. Without
 *           v0.2.0, PURCHASE orders lose CHANNEL coverage entirely
 *           (booking_completed only fires for ACCOMMODATION) and
 *           REVENUE × PRODUCT has no source.
 *
 * Orthogonal payment dimensions (Q2 resolution, Phase 1A — UNCHANGED)
 * ───────────────────────────────────────────────────────────────────
 *
 * `provider` and `payment_instrument` are deliberately separate
 * dimensions. The earlier draft conflated them into a single
 * `payment_method` enum, which mixed two orthogonal axes — a card
 * payment via Stripe could be either "card" or "stripe" depending on
 * the writer, and Phase 5 aggregations like "revenue per provider" or
 * "conversion by payment instrument" would be unanswerable without a
 * re-encoding pass.
 *
 *   provider           — who processes the payment
 *   payment_instrument — what the customer pays with
 *
 * Operational ↔ analytics field mapping
 * ─────────────────────────────────────
 *
 *   payment_id          ← Order.id (stable across providers — INVOICE
 *                         has no Stripe PI; provider-specific reference
 *                         lives in `provider_reference`)
 *   booking_id          ← Order's linked Booking.id (nullable for
 *                         non-accommodation orders)
 *   amount.amount       ← Order.totalAmount                    (öre)
 *   amount.currency     ← Order.currency                       (ISO 4217)
 *   provider            ← see deriveProvider in integrations.ts
 *   payment_instrument  ← see deriveInstrument in integrations.ts
 *   provider_reference  ← Order.stripePaymentIntentId ?? Order.id
 *   captured_at         ← Order.paidAt
 *   source_channel      ← see deriveOrderSourceChannel in integrations.ts.
 *                         Maps Order.sourceChannel string into the
 *                         analytics-domain enum. Values: "direct",
 *                         "admin_draft", "pms_import", "third_party_ota",
 *                         "unknown". Null Order.sourceChannel maps to
 *                         "unknown" (defensive — emitter never throws
 *                         mid-transaction on a new shape).
 *   line_items[]        ← Order.lineItems mapped each row to
 *                         { product_id: lineItem.productId,
 *                           amount:     lineItem.totalAmount }.
 *                         `amount` is the per-line öre total
 *                         (quantity × unitAmount), per the operational
 *                         convention in OrderLineItem.totalAmount.
 *                         Empty array is valid: orders without explicit
 *                         OrderLineItem rows emit `line_items: []`
 *                         rather than omitting the field — required
 *                         shape, deterministic.
 *
 * source_channel enum extension over booking_completed (intentional)
 * ──────────────────────────────────────────────────────────────────
 *
 * `booking_completed` v0.1.0 uses
 * `["direct", "pms_import", "third_party_ota", "unknown"]` because
 * Booking.externalSource never carries an `admin_draft` value (admin-
 * draft conversion produces an Order, not a Booking). `payment_succeeded`
 * v0.2.0 SUPERSETS that domain by adding `"admin_draft"` because Order
 * does carry that value (see `app/_lib/draft-orders/convert.ts:355`).
 * Aggregators that join across both events MUST handle the superset.
 *
 * Bedfront's current Order.sourceChannel free-form string takes values
 * `"direct"`, `"admin_draft"`, future `"booking_com"` / `"expedia"` /
 * app-handles. Mapping rules in `deriveOrderSourceChannel` collapse
 * unknown values to `"unknown"` rather than failing emit.
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const PaymentSucceededLineItemSchema = z.object({
  product_id: z.string().min(1),
  amount: z.number().int().nonnegative(),
});

export const PaymentSucceededPayloadSchema = z.object({
  payment_id: z.string().min(1),
  booking_id: z.string().min(1).nullable(),
  amount: z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  provider: z.enum(["stripe", "swedbankpay", "manual", "other"]),
  payment_instrument: z.enum(["card", "bank_transfer", "wallet", "other"]),
  provider_reference: z.string().min(1),
  captured_at: z.union([z.string(), z.date()]),
  source_channel: z.enum([
    "direct",
    "admin_draft",
    "pms_import",
    "third_party_ota",
    "unknown",
  ]),
  line_items: z.array(PaymentSucceededLineItemSchema),
});

export const PaymentSucceededSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("payment_succeeded"),
    schema_version: z.literal("0.2.0"),
    payload: PaymentSucceededPayloadSchema,
  }),
);

export type PaymentSucceededLineItem = z.infer<
  typeof PaymentSucceededLineItemSchema
>;
export type PaymentSucceededPayload = z.infer<
  typeof PaymentSucceededPayloadSchema
>;
export type PaymentSucceededEvent = z.infer<typeof PaymentSucceededSchema>;
