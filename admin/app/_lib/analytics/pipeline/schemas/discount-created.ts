/**
 * discount_created v0.1.0
 * ───────────────────────
 *
 * A merchant created a new Discount row. Phase 5 uses this for tenant-
 * level discount-program activity rollups.
 *
 * Triggered by: `POST /api/admin/discounts` (admin route's
 * `prisma.$transaction` block). Transactional emit — if the create tx
 * aborts, the analytics event never lands.
 *
 * Idempotency key: `discount_created:${discount.id}`. The Discount.id
 * CUID is unique by definition.
 *
 * Operational ↔ analytics field mapping:
 *   discount_id      ← Discount.id
 *   title            ← Discount.title (internal admin label)
 *   method           ← Discount.method (AUTOMATIC | CODE) → lowercased
 *   value_type       ← Discount.valueType → "percentage" | "fixed_amount"
 *   value            ← Discount.value (basis points if percentage,
 *                      minor units if fixed)
 *   currency         ← Discount has no explicit currency column;
 *                      fixed_amount discounts inherit the tenant's
 *                      primary currency. Phase 5 may need to enrich at
 *                      query time.
 *   starts_at        ← Discount.startsAt
 *   ends_at          ← Discount.endsAt (nullable — open-ended)
 *   usage_limit      ← Discount.usageLimit (nullable — unlimited)
 *   created_at       ← Discount.createdAt
 *   created_by_actor_id ← Discount.createdByUserId (nullable)
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const DiscountCreatedPayloadSchema = z.object({
  discount_id: z.string().min(1),
  title: z.string().min(1),
  method: z.enum(["automatic", "code"]),
  value_type: z.enum(["percentage", "fixed_amount"]),
  value: z.number().int().nonnegative(),
  currency: z.string().length(3).nullable(),
  starts_at: z.union([z.string(), z.date()]),
  ends_at: z.union([z.string(), z.date()]).nullable(),
  usage_limit: z.number().int().positive().nullable(),
  created_at: z.union([z.string(), z.date()]),
  created_by_actor_id: z.string().min(1).nullable(),
});

export const DiscountCreatedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("discount_created"),
    schema_version: z.literal("0.1.0"),
    payload: DiscountCreatedPayloadSchema,
  }),
);

export type DiscountCreatedPayload = z.infer<typeof DiscountCreatedPayloadSchema>;
export type DiscountCreatedEvent = z.infer<typeof DiscountCreatedSchema>;
