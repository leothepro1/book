/**
 * cart_started v0.1.0 (storefront)
 * ────────────────────────────────
 *
 * Fires when the FIRST item is added to an empty cart. Pairs with
 * `cart_updated` (subsequent mutations) and `cart_abandoned` (guest
 * left with non-empty cart) for funnel analysis.
 *
 * Triggered by: the analytics worker (Phase 3 PR-B), subscribed to the
 * portal's cart state changes. Worker tracks cart_id per session and
 * only emits cart_started once per cart-lifecycle.
 *
 * Consent category: `analytics`.
 *
 * Operational ↔ analytics field mapping:
 *   cart_id             ← client-generated ULID, persists in
 *                         sessionStorage for the cart's lifetime
 *   accommodation_id    ← the first item's accommodation
 *   cart_total          ← {amount: minor units, currency}
 *   storefront_context  ← shared
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";
import { StorefrontContextSchema } from "./_storefront-context";

export const CartStartedPayloadSchema = StorefrontContextSchema.and(
  z.object({
    cart_id: z.string().min(1),
    accommodation_id: z.string().min(1),
    cart_total: z.object({
      amount: z.number().int().nonnegative(),
      currency: z.string().length(3),
    }),
  }),
);

export const CartStartedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("cart_started"),
    schema_version: z.literal("0.1.0"),
    payload: CartStartedPayloadSchema,
  }),
);

export type CartStartedPayload = z.infer<typeof CartStartedPayloadSchema>;
export type CartStartedEvent = z.infer<typeof CartStartedSchema>;
