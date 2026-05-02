/**
 * cart_updated v0.2.0 (storefront)
 * ────────────────────────────────
 *
 * Fires on every cart mutation AFTER cart_started — adding additional
 * items, removing items, or changing quantities of existing items.
 * Phase 5 uses this for cart-dynamics analysis (do guests add and
 * remove? bundle behaviour? variant-swap rates?).
 *
 * Version history:
 *   v0.1.0  Original. Lacked `line_items_count`; `action` semantics
 *           were ambiguous on variant-swap and coupon-only mutations.
 *           Preserved at `legacy/cart-updated-v0.1.0.ts`.
 *   v0.2.0  Adds required `line_items_count`. Sharpens `action`
 *           semantics (variant-swap → remove+add; coupon-only → no
 *           emit). Current.
 *
 * Triggered by: analytics worker subscribed to cart state. The worker
 * does NOT throttle or debounce — every emit-site call produces a
 * distinct event with its own ULID. Outbox dedup is by
 * `UNIQUE (tenant_id, event_id)`; rapid successive mutations land as
 * distinct rows that Phase 5 may aggregate at read time.
 *
 * Consent category: `analytics`.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Semantic Contract
 * ──────────────────────────────────────────────────────────────────────
 *
 * `cart_id`. Same ULID as the `cart_started` event for this cart.
 *   See `cart-started.ts` for the full lifecycle contract
 *   (localStorage, multi-tab shared, regenerated on clearCart).
 *
 * `items_count`. Positive integer — sum of quantities across all line
 *   items in the cart AFTER the mutation.
 *
 *     Cart [{productA, qty: 2}, {productB, qty: 1}]
 *       → items_count: 3
 *
 *   Conceptually answers: "how many physical items will the guest
 *   take home if they check out now?".
 *
 * `line_items_count`. Positive integer — count of DISTINCT line items
 *   in the cart AFTER the mutation. Complementary to `items_count`.
 *
 *     Cart [{productA, qty: 2}, {productB, qty: 1}]
 *       → line_items_count: 2
 *
 *   Conceptually answers: "how many distinct products is the guest
 *   buying?". Aggregators choose based on metric intent — e.g.
 *   AOV-by-line-count uses `line_items_count`; AOV-by-unit uses
 *   `items_count`.
 *
 *   NEW in v0.2.0. Adding a required field with no default is a
 *   breaking change; v0.1.0 readers must be migrated before they can
 *   consume v0.2.0 events.
 *
 * `cart_total`. Object `{ amount, currency }`. Per the global
 *   convention in `base.ts`: `amount` is an integer in MINOR UNITS,
 *   `currency` is ISO 4217 three-letter UPPERCASE. The total is the
 *   cart's running total AFTER the mutation.
 *
 * `action`. Closed enum with exactly three values:
 *
 *     "added"             A new line item appears in the cart that was
 *                         not present before the mutation.
 *     "removed"           A line item that was present is no longer in
 *                         the cart after the mutation.
 *     "quantity_changed"  An existing line item — same `productId` AND
 *                         same `variantId` — has its quantity changed.
 *
 *   Variant-swap (same parent product, different variant) is NOT a
 *   `quantity_changed`. Variant-swap emits TWO events: a "removed"
 *   for the old variant, followed by an "added" for the new variant.
 *   Phase 5 readers that want to detect variant-swaps as a single
 *   logical action MUST correlate adjacent remove+add pairs by
 *   parent `productId` (which arrives via the corresponding
 *   `cart_started` or earlier `cart_updated` events for the cart).
 *
 *   Mutations that do NOT change the line-item set — applying a
 *   coupon, recalculating tax, or any other non-line-item state
 *   change — do NOT emit `cart_updated`. The event is for line-item
 *   changes only.
 *
 * `storefront_context`. Shared StorefrontContextSchema fields. See
 *   `_storefront-context.ts` for the contract on each.
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";
import { StorefrontContextSchema } from "./_storefront-context";

export const CartUpdatedPayloadSchema = StorefrontContextSchema.and(
  z.object({
    cart_id: z.string().min(1),
    items_count: z.number().int().positive(),
    line_items_count: z.number().int().positive(),
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
    schema_version: z.literal("0.2.0"),
    payload: CartUpdatedPayloadSchema,
  }),
);

export type CartUpdatedPayload = z.infer<typeof CartUpdatedPayloadSchema>;
export type CartUpdatedEvent = z.infer<typeof CartUpdatedSchema>;
