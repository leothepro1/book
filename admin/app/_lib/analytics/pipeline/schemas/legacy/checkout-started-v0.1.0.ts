/**
 * checkout_started v0.1.0 — DEPRECATED (storefront)
 * ──────────────────────────────────────────────────
 *
 * Legacy v0.1.0 schema for checkout_started, preserved so the registry
 * can keep validating events emitted before the v0.2.0 migration
 * drained from the outbox. Do NOT add new emit-sites targeting v0.1.0
 * — emit v0.2.0 from `../checkout-started.ts`.
 *
 * v0.2.0 added a required `line_items_count` field for parity with
 * cart_updated and cart_abandoned, and made the cart-only scope
 * explicit in the docstring (gift-card and other one-shot purchase
 * flows MUST NOT use this event).
 *
 * Removal plan: this file may be deleted once the analytics outbox is
 * confirmed empty of v0.1.0 checkout_started events.
 */

import { z } from "zod";

import { BaseEventSchema } from "../base";
import { StorefrontContextSchema } from "../_storefront-context";

export const CheckoutStartedV010PayloadSchema = StorefrontContextSchema.and(
  z.object({
    cart_id: z.string().min(1),
    items_count: z.number().int().positive(),
    cart_total: z.object({
      amount: z.number().int().nonnegative(),
      currency: z.string().length(3),
    }),
  }),
);

export const CheckoutStartedV010Schema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("checkout_started"),
    schema_version: z.literal("0.1.0"),
    payload: CheckoutStartedV010PayloadSchema,
  }),
);

export type CheckoutStartedV010Payload = z.infer<typeof CheckoutStartedV010PayloadSchema>;
export type CheckoutStartedV010Event = z.infer<typeof CheckoutStartedV010Schema>;
