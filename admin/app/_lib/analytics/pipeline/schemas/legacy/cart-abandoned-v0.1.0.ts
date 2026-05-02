/**
 * cart_abandoned v0.1.0 — DEPRECATED (storefront)
 * ────────────────────────────────────────────────
 *
 * Legacy v0.1.0 schema for cart_abandoned, preserved so the registry
 * can keep validating events emitted before the v0.2.0 migration
 * drained from the outbox. Do NOT add new emit-sites targeting v0.1.0
 * — emit v0.2.0 from `../cart-abandoned.ts`.
 *
 * v0.2.0 added a required `line_items_count` field for parity with
 * cart_updated, and tightened the definition of `interaction` to
 * cart-mutation events strictly. The `interaction` ambiguity was a
 * GAP flagged in the schema audit — two implementations could differ
 * by orders of magnitude on what they counted as an interaction.
 *
 * Removal plan: this file may be deleted once the analytics outbox is
 * confirmed empty of v0.1.0 cart_abandoned events.
 */

import { z } from "zod";

import { BaseEventSchema } from "../base";
import { StorefrontContextSchema } from "../_storefront-context";

export const CartAbandonedV010PayloadSchema = StorefrontContextSchema.and(
  z.object({
    cart_id: z.string().min(1),
    items_count: z.number().int().positive(),
    cart_total: z.object({
      amount: z.number().int().nonnegative(),
      currency: z.string().length(3),
    }),
    time_since_last_interaction_ms: z.number().int().nonnegative(),
  }),
);

export const CartAbandonedV010Schema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("cart_abandoned"),
    schema_version: z.literal("0.1.0"),
    payload: CartAbandonedV010PayloadSchema,
  }),
);

export type CartAbandonedV010Payload = z.infer<typeof CartAbandonedV010PayloadSchema>;
export type CartAbandonedV010Event = z.infer<typeof CartAbandonedV010Schema>;
