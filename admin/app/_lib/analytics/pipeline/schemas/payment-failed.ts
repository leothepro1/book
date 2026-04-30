/**
 * payment_failed v0.1.0
 * ─────────────────────
 *
 * Emitted when a payment attempt fails. Today the only emit site is the
 * Stripe webhook (`payment_intent.payment_failed`); future providers
 * (Swedbankpay, Nets) will emit from their own webhook handlers when
 * activated.
 *
 * Triggered by: `handlePaymentIntentFailed` in
 * `app/api/webhooks/stripe/route.ts`. Standalone emit (the order is not
 * mutated through a tx the analytics emit can attach to — the function
 * runs after Stripe's signature verification + webhook-event dedup).
 *
 * Idempotency note (see Q6 in the Phase 2 plan):
 *   The natural key seems to be `payment_failed:${paymentIntent.id}` but
 *   that's NOT unique per failure occurrence — Stripe can deliver multiple
 *   `payment_intent.payment_failed` events for the same PI when the PI
 *   retries. We use `payment_failed:${paymentIntent.id}:${stripeEventId}`
 *   so each failure occurrence is a distinct analytics event. Phase 5
 *   needs to count failure occurrences (not unique sessions) to compute
 *   per-customer / per-provider failure rates and time-to-recovery.
 *
 * Operational ↔ analytics field mapping:
 *   order_id         ← Order.id (resolved from pi.metadata.orderId)
 *   payment_intent_id ← Stripe PaymentIntent.id
 *   amount           ← { amount: pi.amount, currency: pi.currency }
 *                       (pi.amount is already minor units for Stripe)
 *   decline_code     ← pi.last_payment_error?.decline_code (Stripe)
 *   error_code       ← pi.last_payment_error?.code (Stripe)
 *   error_message    ← pi.last_payment_error?.message (truncated)
 *   attempted_at     ← now() at emit time
 *   provider         ← "stripe" today; will diverge as more providers
 *                       activate
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const PaymentFailedPayloadSchema = z.object({
  order_id: z.string().min(1),
  payment_intent_id: z.string().min(1),
  amount: z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  decline_code: z.string().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  attempted_at: z.union([z.string(), z.date()]),
  provider: z.enum(["stripe", "swedbankpay", "manual", "other"]),
});

export const PaymentFailedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("payment_failed"),
    schema_version: z.literal("0.1.0"),
    payload: PaymentFailedPayloadSchema,
  }),
);

export type PaymentFailedPayload = z.infer<typeof PaymentFailedPayloadSchema>;
export type PaymentFailedEvent = z.infer<typeof PaymentFailedSchema>;
