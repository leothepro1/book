/**
 * payment_refunded v0.1.0
 * ───────────────────────
 *
 * Emitted when a refund is processed. A single Order can produce multiple
 * payment_refunded events if it's partially refunded across multiple Stripe
 * webhook deliveries.
 *
 * Triggered by: `handleChargeRefunded` in
 * `app/api/webhooks/stripe/route.ts`. Standalone emit, fire-and-forget.
 *
 * Idempotency key includes the Stripe event ID so partial refunds across
 * separate webhook deliveries are distinct events:
 *   `payment_refunded:${charge.id}:${stripeEventId}`
 *
 * Operational ↔ analytics field mapping:
 *   order_id          ← Order.id (resolved from charge.payment_intent → Order)
 *   charge_id         ← Stripe Charge.id
 *   refund_amount     ← { amount: charge.amount_refunded,
 *                          currency: charge.currency.toUpperCase() }
 *                       The cumulative refunded total at this point in time;
 *                       Phase 5 reconstructs partial-refund deltas from
 *                       successive events.
 *   refund_reason     ← deriveRefundReason(charge) — closed enum
 *   refunded_at       ← now() at emit time (Stripe doesn't expose a
 *                       refund-creation timestamp on the charge object;
 *                       the webhook delivery time is the closest proxy)
 *   provider          ← "stripe"
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const PaymentRefundedPayloadSchema = z.object({
  order_id: z.string().min(1),
  charge_id: z.string().min(1),
  refund_amount: z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  refund_reason: z.enum([
    "duplicate",
    "fraudulent",
    "requested_by_customer",
    "expired_uncaptured_charge",
    "other",
    "unknown",
  ]),
  refunded_at: z.union([z.string(), z.date()]),
  provider: z.enum(["stripe", "swedbankpay", "manual", "other"]),
});

export const PaymentRefundedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("payment_refunded"),
    schema_version: z.literal("0.1.0"),
    payload: PaymentRefundedPayloadSchema,
  }),
);

export type PaymentRefundedPayload = z.infer<typeof PaymentRefundedPayloadSchema>;
export type PaymentRefundedEvent = z.infer<typeof PaymentRefundedSchema>;
