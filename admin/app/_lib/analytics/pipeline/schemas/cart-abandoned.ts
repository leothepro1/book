/**
 * cart_abandoned v0.2.0 (storefront)
 * ──────────────────────────────────
 *
 * Fires when the guest closes the tab or navigates away with a non-
 * empty cart that was NOT moved into checkout. Dispatched via
 * `navigator.sendBeacon()` from the loader's unload handler so the
 * event reaches the server even after page tear-down.
 *
 * Phase 5 uses this for abandoned-cart recovery analysis, segmented
 * email automation, and conversion-funnel leakage detection.
 *
 * Version history:
 *   v0.1.0  Original. Lacked `line_items_count`; "interaction" was
 *           undefined and could have meant anything from add-to-cart
 *           to mouse-hover. Preserved at
 *           `legacy/cart-abandoned-v0.1.0.ts`.
 *   v0.2.0  Adds `line_items_count` for parity with cart_updated.
 *           Defines "interaction" strictly as cart-mutation events.
 *           Current.
 *
 * Consent category: `analytics`.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Semantic Contract
 * ──────────────────────────────────────────────────────────────────────
 *
 * `cart_id`. Same ULID as the `cart_started` event for this cart.
 *   See `cart-started.ts` for the full lifecycle contract.
 *
 * `items_count`. Positive integer — sum of quantities across all line
 *   items at the moment of abandonment. The cart being non-empty is
 *   the definition of "abandoned"; a zero-item cart cannot be
 *   abandoned (it's just an absent cart) and `items_count: 0` is
 *   structurally invalid.
 *
 * `line_items_count`. Positive integer — count of distinct line items
 *   at the moment of abandonment. Same semantics as cart_updated's
 *   field of the same name. NEW in v0.2.0.
 *
 * `cart_total`. Object `{ amount, currency }`. Per the global
 *   convention in `base.ts`: `amount` is an integer in MINOR UNITS,
 *   `currency` is ISO 4217 three-letter UPPERCASE. The total is the
 *   cart's value at the moment of abandonment.
 *
 * `time_since_last_interaction_ms`. Non-negative integer — milliseconds
 *   between the most recent INTERACTION and the moment the unload
 *   handler fired.
 *
 *   "Interaction" is defined STRICTLY as a cart-mutation event:
 *
 *     • addToCart       — a new line item appears
 *     • removeFromCart  — an existing line item disappears
 *     • updateQuantity  — an existing line item's quantity changes
 *
 *   The following are NOT interactions for this measurement:
 *
 *     × opening or closing the cart drawer
 *     × hovering over the cart-icon button
 *     × scrolling the cart drawer
 *     × navigating between pages (with the cart unchanged)
 *     × any keyboard or pointer event that does not mutate cart state
 *
 *   Cart-mutation timestamps are persisted in `localStorage` alongside
 *   cart state at `bf_cart_{tenantId}.lastMutationAt` (epoch ms). On
 *   abandonment, the loader computes:
 *
 *       time_since_last_interaction_ms =
 *         Date.now() - bf_cart_{tenantId}.lastMutationAt
 *
 *   When the cart was just created (cart_started fired and no
 *   subsequent mutation yet), `lastMutationAt` equals the
 *   cart_started timestamp.
 *
 * `storefront_context`. Shared StorefrontContextSchema fields. See
 *   `_storefront-context.ts` for the contract on each.
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";
import { StorefrontContextSchema } from "./_storefront-context";

export const CartAbandonedPayloadSchema = StorefrontContextSchema.and(
  z.object({
    cart_id: z.string().min(1),
    items_count: z.number().int().positive(),
    line_items_count: z.number().int().positive(),
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
    schema_version: z.literal("0.2.0"),
    payload: CartAbandonedPayloadSchema,
  }),
);

export type CartAbandonedPayload = z.infer<typeof CartAbandonedPayloadSchema>;
export type CartAbandonedEvent = z.infer<typeof CartAbandonedSchema>;
