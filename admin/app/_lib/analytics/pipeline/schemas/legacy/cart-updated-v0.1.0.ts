/**
 * cart_updated v0.1.0 — DEPRECATED (storefront)
 * ──────────────────────────────────────────────
 *
 * Legacy v0.1.0 schema for cart_updated, preserved so the registry can
 * keep validating events emitted before the v0.2.0 migration drained
 * from the outbox. Do NOT add new emit-sites targeting v0.1.0 — emit
 * v0.2.0 from `../cart-updated.ts`.
 *
 * v0.2.0 added a required `line_items_count` field (distinct line-item
 * count, complementary to the existing `items_count` which is sum of
 * quantities). Adding a required field with no default is a breaking
 * change per CLAUDE.md analytics versioning, hence the major bump.
 *
 * Removal plan: this file may be deleted once the analytics outbox is
 * confirmed empty of v0.1.0 cart_updated events.
 */

import { z } from "zod";

import { BaseEventSchema } from "../base";
import { StorefrontContextSchema } from "../_storefront-context";

export const CartUpdatedV010PayloadSchema = StorefrontContextSchema.and(
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

export const CartUpdatedV010Schema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("cart_updated"),
    schema_version: z.literal("0.1.0"),
    payload: CartUpdatedV010PayloadSchema,
  }),
);

export type CartUpdatedV010Payload = z.infer<typeof CartUpdatedV010PayloadSchema>;
export type CartUpdatedV010Event = z.infer<typeof CartUpdatedV010Schema>;
