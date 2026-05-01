/**
 * checkout_started v0.1.0 (storefront)
 * ────────────────────────────────────
 *
 * Fires when the guest enters the checkout flow (clicks "checkout" /
 * lands on `/checkout`). Pairs with the SERVER-side `payment_succeeded`
 * to compute checkout conversion: emit `checkout_started` from the
 * worker, then `payment_succeeded` from `processOrderPaidSideEffects`.
 *
 * Triggered by: analytics worker on URL match for `/checkout` (or the
 * portal's checkout-route equivalent).
 *
 * Consent category: `analytics`.
 *
 * Operational ↔ analytics field mapping:
 *   cart_id             ← cart ULID being checked out
 *   items_count         ← items at checkout entry
 *   cart_total          ← {amount, currency} at checkout entry
 *   storefront_context  ← shared
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";
import { StorefrontContextSchema } from "./_storefront-context";

export const CheckoutStartedPayloadSchema = StorefrontContextSchema.and(
  z.object({
    cart_id: z.string().min(1),
    items_count: z.number().int().positive(),
    cart_total: z.object({
      amount: z.number().int().nonnegative(),
      currency: z.string().length(3),
    }),
  }),
);

export const CheckoutStartedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("checkout_started"),
    schema_version: z.literal("0.1.0"),
    payload: CheckoutStartedPayloadSchema,
  }),
);

export type CheckoutStartedPayload = z.infer<typeof CheckoutStartedPayloadSchema>;
export type CheckoutStartedEvent = z.infer<typeof CheckoutStartedSchema>;
