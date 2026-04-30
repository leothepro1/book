/**
 * payment_succeeded v0.1.0
 * ───────────────────────
 *
 * Emitted when a payment is captured and the order/booking is marked paid.
 *
 * Orthogonal dimensions (Q2 resolution, Phase 1A)
 * ───────────────────────────────────────────────
 *
 * `provider` and `payment_instrument` are deliberately separate dimensions.
 * The earlier draft conflated them into a single `payment_method` enum
 * (`["card", "swedbankpay", "stripe", "other"]`), which mixed two
 * orthogonal axes — a card payment via Stripe could be either "card" or
 * "stripe" depending on the writer, and Phase 5 aggregations like
 * "revenue per provider" or "conversion by payment instrument" would be
 * unanswerable without a re-encoding pass.
 *
 * Shopify itself splits these (`payment_gateway` × `payment_method`) for
 * the same reason. We do it now so historical data isn't trapped in the
 * conflated form.
 *
 *   provider           — who processes the payment
 *   payment_instrument — what the customer pays with
 *
 * Operational ↔ analytics field mapping
 * ─────────────────────────────────────
 *
 *   payment_id          ← Order.id (or Stripe payment_intent_id, depending
 *                         on the emit site — see callers in Phase 1B)
 *   booking_id          ← Order.bookingId                      (nullable —
 *                         non-accommodation orders, e.g. gift cards, have
 *                         a payment but no booking)
 *   amount.amount       ← Order.totalAmount                    (öre)
 *   amount.currency     ← Order.currency                       (ISO 4217)
 *   provider_reference  ← Stripe payment_intent_id, future Swedbankpay txn
 *                         id, etc.
 *   captured_at         ← Order.paidAt
 *
 * Mapping from Order.paymentMethod (Bedfront's current operational field):
 *   "STRIPE_CHECKOUT"   → provider: "stripe",   payment_instrument: "card"
 *                         (Stripe Checkout is primarily card; precise
 *                         instrument requires querying the Stripe
 *                         payment_method object — Phase 1B may opt to do
 *                         that, otherwise default "card")
 *   "STRIPE_ELEMENTS"   → provider: "stripe",   payment_instrument: from
 *                         the Stripe payment_method object if available,
 *                         else "other"
 *   Future Swedbankpay  → provider: "swedbankpay", payment_instrument:
 *                         from Swedbankpay response
 *   Future manual       → provider: "manual",   payment_instrument: from
 *                         merchant input or "other"
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

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
});

export const PaymentSucceededSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("payment_succeeded"),
    schema_version: z.literal("0.1.0"),
    payload: PaymentSucceededPayloadSchema,
  }),
);

export type PaymentSucceededPayload = z.infer<typeof PaymentSucceededPayloadSchema>;
export type PaymentSucceededEvent = z.infer<typeof PaymentSucceededSchema>;
