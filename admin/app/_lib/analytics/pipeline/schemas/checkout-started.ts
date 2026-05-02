/**
 * checkout_started v0.2.0 (storefront)
 * ────────────────────────────────────
 *
 * Fires when the guest enters the checkout flow from the cart — i.e.
 * clicks the "Till kassa" button on the cart drawer, which initiates
 * the cart-to-checkout transition. Pairs with the SERVER-side
 * `payment_succeeded` (emitted from `processOrderPaidSideEffects`) for
 * checkout-conversion analysis.
 *
 * Version history:
 *   v0.1.0  Original. Lacked `line_items_count`; cart-only scope was
 *           ambiguous and a non-cart emitter could have rationalised
 *           filling `cart_id` with a non-cart identifier. Preserved
 *           at `legacy/checkout-started-v0.1.0.ts`.
 *   v0.2.0  Adds `line_items_count` for parity with cart_updated and
 *           cart_abandoned. Makes cart-only scope explicit. Current.
 *
 * Triggered by: analytics worker on the cart-drawer's checkout-button
 * click handler, BEFORE the redirect to `/checkout?session=…`. Emit
 * is single-shot per checkout transition.
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
 *   THIS EVENT IS CART-ONLY. Non-cart purchase flows MUST NOT emit
 *   `checkout_started`. Specifically:
 *
 *     • Gift-card purchase (`/shop/gift-cards/[slug]`) — uses the
 *       direct PaymentIntent flow via `/api/checkout/purchase-intent`,
 *       no cart involved.
 *     • Future one-shot purchase flows of any kind — same.
 *
 *   These flows will use a separate event family (`purchase_initiated`
 *   and friends, deferred to a follow-up PR with its own schemas).
 *   Emit-engineers reading this schema in isolation MUST NOT stuff a
 *   non-cart identifier (orderId, idempotencyKey, etc.) into
 *   `cart_id`. The field name is load-bearing — Phase 5 funnel joins
 *   to `cart_started` by `cart_id` and a synthetic id joins to
 *   nothing.
 *
 * `items_count`. Positive integer — sum of quantities across all line
 *   items at checkout entry. Same semantics as `cart_updated`'s
 *   `items_count`. The cart being non-empty is implied by entering
 *   checkout; `items_count: 0` is structurally invalid.
 *
 * `line_items_count`. Positive integer — count of distinct line items
 *   at checkout entry. Same semantics as `cart_updated`'s
 *   `line_items_count`. NEW in v0.2.0.
 *
 * `cart_total`. Object `{ amount, currency }`. Per the global
 *   convention in `base.ts`: `amount` is an integer in MINOR UNITS,
 *   `currency` is ISO 4217 three-letter UPPERCASE. The total is the
 *   cart's value at the moment the checkout transition begins —
 *   before any server-side recalc, tax application, or discount
 *   resolution. Phase 5 readers comparing `cart_total` here against
 *   `Order.totalAmount` from `payment_succeeded` should expect them
 *   to differ by tax/discount/rounding.
 *
 * `storefront_context`. Shared StorefrontContextSchema fields. See
 *   `_storefront-context.ts` for the contract on each.
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";
import { StorefrontContextSchema } from "./_storefront-context";

export const CheckoutStartedPayloadSchema = StorefrontContextSchema.and(
  z.object({
    cart_id: z.string().min(1),
    items_count: z.number().int().positive(),
    line_items_count: z.number().int().positive(),
    cart_total: z.object({
      amount: z.number().int().nonnegative(),
      currency: z.string().length(3),
    }),
  }),
);

export const CheckoutStartedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("checkout_started"),
    schema_version: z.literal("0.2.0"),
    payload: CheckoutStartedPayloadSchema,
  }),
);

export type CheckoutStartedPayload = z.infer<typeof CheckoutStartedPayloadSchema>;
export type CheckoutStartedEvent = z.infer<typeof CheckoutStartedSchema>;
