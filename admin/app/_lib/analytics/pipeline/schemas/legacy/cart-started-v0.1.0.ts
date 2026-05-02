/**
 * cart_started v0.1.0 — DEPRECATED (storefront)
 * ──────────────────────────────────────────────
 *
 * This is the legacy v0.1.0 schema for cart_started, preserved here so
 * the registry can keep validating events that were emitted before the
 * v0.2.0 migration drained from the outbox. Do NOT add new emit-sites
 * targeting v0.1.0 — emit v0.2.0 from `../cart-started.ts`.
 *
 * The semantic mismatch that triggered the version bump: v0.1.0
 * required an `accommodation_id` field, but the actual cart in the
 * codebase is a Shop product cart (no accommodation concept). v0.2.0
 * replaces `accommodation_id` with `product_id` and the docstring
 * names a precise lifecycle for `cart_id`.
 *
 * Removal plan: this file may be deleted once the analytics outbox is
 * confirmed empty of v0.1.0 cart_started events (post Phase 5 cutover
 * + retention window).
 */

import { z } from "zod";

import { BaseEventSchema } from "../base";
import { StorefrontContextSchema } from "../_storefront-context";

export const CartStartedV010PayloadSchema = StorefrontContextSchema.and(
  z.object({
    cart_id: z.string().min(1),
    accommodation_id: z.string().min(1),
    cart_total: z.object({
      amount: z.number().int().nonnegative(),
      currency: z.string().length(3),
    }),
  }),
);

export const CartStartedV010Schema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("cart_started"),
    schema_version: z.literal("0.1.0"),
    payload: CartStartedV010PayloadSchema,
  }),
);

export type CartStartedV010Payload = z.infer<typeof CartStartedV010PayloadSchema>;
export type CartStartedV010Event = z.infer<typeof CartStartedV010Schema>;
