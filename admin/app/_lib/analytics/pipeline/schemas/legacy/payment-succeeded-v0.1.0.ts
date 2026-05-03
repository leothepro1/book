/**
 * payment_succeeded v0.1.0 — DEPRECATED
 * ─────────────────────────────────────
 *
 * This is the legacy v0.1.0 schema for `payment_succeeded`, preserved
 * here so the registry can keep validating events that were emitted
 * before the v0.2.0 migration drained from the outbox. Do NOT add new
 * emit-sites targeting v0.1.0 — emit v0.2.0 from
 * `../payment-succeeded.ts`.
 *
 * The semantic gap that triggered the version bump: v0.1.0 carried
 * `provider` + `payment_instrument` but no `source_channel` (where the
 * order originated) and no `line_items[]` (per-product revenue split).
 * Phase 5A's aggregator needs both — REVENUE × CHANNEL and REVENUE ×
 * PRODUCT are dashboard-visible dimensions today (per legacy v1
 * `aggregation.ts:104-118`). v0.2.0 closes both gaps additively;
 * provider / payment_instrument are unchanged.
 *
 * Removal plan: this file may be deleted once the analytics outbox is
 * confirmed empty of v0.1.0 `payment_succeeded` events (post Phase 5
 * cutover + retention window). The registry import below is also
 * removed at that time.
 *
 * Operational ↔ analytics field mapping (UNCHANGED from production v0.1.0)
 * ───────────────────────────────────────────────────────────────────────
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
 */

import { z } from "zod";

import { BaseEventSchema } from "../base";

export const PaymentSucceededV010PayloadSchema = z.object({
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

export const PaymentSucceededV010Schema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("payment_succeeded"),
    schema_version: z.literal("0.1.0"),
    payload: PaymentSucceededV010PayloadSchema,
  }),
);

export type PaymentSucceededV010Payload = z.infer<
  typeof PaymentSucceededV010PayloadSchema
>;
export type PaymentSucceededV010Event = z.infer<
  typeof PaymentSucceededV010Schema
>;
