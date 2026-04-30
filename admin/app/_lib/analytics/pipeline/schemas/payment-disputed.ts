/**
 * payment_disputed v0.1.0
 * ───────────────────────
 *
 * Emitted when a Stripe `charge.dispute.created` webhook fires (chargeback
 * initiated). Disputes are operationally expensive — chargebacks include
 * Stripe fees, require evidence response, and threaten merchant
 * payment-account standing. The analytics event lets Phase 5 compute
 * per-merchant dispute rate, per-instrument dispute likelihood, etc.
 *
 * Triggered by: `handleChargeDisputed` in
 * `app/api/webhooks/stripe/route.ts` (NEW handler added in Phase 2 Commit B).
 * Standalone emit. The same handler also writes an OrderEvent of type
 * ORDER_UPDATED with `dispute: true` metadata so the operator-facing
 * order timeline shows the dispute. Adding a dedicated ORDER_DISPUTED
 * enum value is a separate operational concern (requires migration);
 * tracked for follow-up.
 *
 * Idempotency key: `payment_disputed:${dispute.id}` — Stripe disputes are
 * unique per chargeback. (We append `:${stripeEventId}` for parallel
 * structure with payment_failed and to absorb hypothetical webhook
 * re-deliveries.)
 *
 * Operational ↔ analytics field mapping:
 *   order_id           ← Order.id (resolved via Charge → PaymentIntent → Order)
 *   charge_id          ← Stripe Charge.id (dispute.charge)
 *   dispute_id         ← Stripe Dispute.id
 *   disputed_amount    ← { amount: dispute.amount, currency: dispute.currency }
 *   dispute_reason     ← deriveDisputeReason(dispute) — Stripe's reason
 *                        enum mapped to the analytics-domain enum
 *   dispute_status     ← Stripe dispute.status (passed through —
 *                        "warning_needs_response" / "needs_response" /
 *                        "under_review" / "charge_refunded" / "won" /
 *                        "lost"). Phase 5 will track status transitions
 *                        via additional events; v0.1.0 captures the
 *                        creation snapshot only.
 *   created_at         ← Stripe dispute.created (epoch seconds)
 *   provider           ← "stripe"
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const PaymentDisputedPayloadSchema = z.object({
  order_id: z.string().min(1),
  charge_id: z.string().min(1),
  dispute_id: z.string().min(1),
  disputed_amount: z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  dispute_reason: z.enum([
    "credit_not_processed",
    "duplicate",
    "fraudulent",
    "general",
    "incorrect_account_details",
    "insufficient_funds",
    "product_not_received",
    "product_unacceptable",
    "subscription_canceled",
    "unrecognized",
    "other",
    "unknown",
  ]),
  dispute_status: z.enum([
    "warning_needs_response",
    "warning_under_review",
    "warning_closed",
    "needs_response",
    "under_review",
    "charge_refunded",
    "won",
    "lost",
    "unknown",
  ]),
  created_at: z.coerce.date(),
  provider: z.enum(["stripe", "swedbankpay", "manual", "other"]),
});

export const PaymentDisputedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("payment_disputed"),
    schema_version: z.literal("0.1.0"),
    payload: PaymentDisputedPayloadSchema,
  }),
);

export type PaymentDisputedPayload = z.infer<typeof PaymentDisputedPayloadSchema>;
export type PaymentDisputedEvent = z.infer<typeof PaymentDisputedSchema>;
