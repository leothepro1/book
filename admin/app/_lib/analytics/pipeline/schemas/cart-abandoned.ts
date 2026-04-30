/**
 * cart_abandoned v0.1.0 (storefront)
 * ──────────────────────────────────
 *
 * Fires when the guest closes the tab / navigates away with a non-empty
 * cart that was NOT moved into checkout. Dispatched via
 * `navigator.sendBeacon()` from the unload handler (Phase 3 PR-B
 * Commit H) so the event reaches the server even after page tear-down.
 *
 * Phase 5 uses this for abandoned-cart recovery analysis, segmented
 * email automation, and conversion-funnel leakage detection.
 *
 * Consent category: `analytics`.
 *
 * Operational ↔ analytics field mapping:
 *   cart_id                       ← same ULID as cart_started
 *   items_count                   ← items in cart at abandonment
 *   cart_total                    ← {amount, currency} at abandonment
 *   time_since_last_interaction_ms ← how long the cart was idle before
 *                                    the unload fired (worker tracks
 *                                    cart-touch timestamps)
 *   storefront_context            ← shared
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";
import { StorefrontContextSchema } from "./_storefront-context";

export const CartAbandonedPayloadSchema = StorefrontContextSchema.and(
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

export const CartAbandonedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("cart_abandoned"),
    schema_version: z.literal("0.1.0"),
    payload: CartAbandonedPayloadSchema,
  }),
);

export type CartAbandonedPayload = z.infer<typeof CartAbandonedPayloadSchema>;
export type CartAbandonedEvent = z.infer<typeof CartAbandonedSchema>;
