/**
 * cart_updated v0.1.0 (storefront)
 * ────────────────────────────────
 *
 * Fires on every cart mutation AFTER cart_started — adding more items,
 * removing items, or changing quantities. Phase 5 uses this for cart
 * dynamics analysis (do guests add and remove? bundle behavior?).
 *
 * Triggered by: analytics worker subscribed to cart state. Throttled
 * to one event per ~500 ms of cart-mutation activity (worker-side
 * debounce) so rapid quantity changes don't flood the dispatch.
 *
 * Consent category: `analytics`.
 *
 * Operational ↔ analytics field mapping:
 *   cart_id             ← same ULID as cart_started for this cart
 *   items_count         ← total items in cart after mutation
 *   cart_total          ← {amount, currency} after mutation
 *   action              ← what triggered this update:
 *                         "added" | "removed" | "quantity_changed"
 *   storefront_context  ← shared
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";
import { StorefrontContextSchema } from "./_storefront-context";

export const CartUpdatedPayloadSchema = StorefrontContextSchema.and(
  z.object({
    cart_id: z.string().min(1),
    items_count: z.number().int().nonnegative(),
    cart_total: z.object({
      amount: z.number().int().nonnegative(),
      currency: z.string().length(3),
    }),
    action: z.enum(["added", "removed", "quantity_changed"]),
  }),
);

export const CartUpdatedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("cart_updated"),
    schema_version: z.literal("0.1.0"),
    payload: CartUpdatedPayloadSchema,
  }),
);

export type CartUpdatedPayload = z.infer<typeof CartUpdatedPayloadSchema>;
export type CartUpdatedEvent = z.infer<typeof CartUpdatedSchema>;
