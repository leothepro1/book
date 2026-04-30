/**
 * discount_used v0.1.0
 * ────────────────────
 *
 * A discount was applied to an Order. Phase 5 uses this for discount
 * effectiveness analysis — usage rates per discount, conversion uplift,
 * cost-per-acquired-booking.
 *
 * Triggered by: `commitDiscountApplication` in
 * `app/_lib/discounts/apply.ts` — called inside the Order-creation
 * transaction at checkout. Transactional emit; the analytics event
 * persists with the operational DiscountUsage row.
 *
 * Idempotency key: `discount_used:${orderId}:${discountId}`. One usage
 * per (Order, Discount) pair — the unique constraint on DiscountUsage
 * enforces this at the operational layer.
 *
 * Operational ↔ analytics field mapping:
 *   discount_id      ← Discount.id
 *   discount_code    ← DiscountCode.code if applied via code, else null
 *                       (AUTOMATIC discounts have no code)
 *   order_id         ← Order.id
 *   discount_amount  ← {amount: minor units saved, currency}
 *   order_total      ← {amount: Order.totalAmount POST-discount, currency}
 *   used_at          ← now() at apply time
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const DiscountUsedPayloadSchema = z.object({
  discount_id: z.string().min(1),
  discount_code: z.string().min(1).nullable(),
  order_id: z.string().min(1),
  discount_amount: z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  order_total: z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  used_at: z.coerce.date(),
});

export const DiscountUsedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("discount_used"),
    schema_version: z.literal("0.1.0"),
    payload: DiscountUsedPayloadSchema,
  }),
);

export type DiscountUsedPayload = z.infer<typeof DiscountUsedPayloadSchema>;
export type DiscountUsedEvent = z.infer<typeof DiscountUsedSchema>;
