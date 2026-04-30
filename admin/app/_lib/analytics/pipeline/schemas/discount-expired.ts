/**
 * discount_expired v0.1.0
 * ───────────────────────
 *
 * A Discount's `endsAt` timestamp passed and the existing
 * `sync-discount-statuses` cron transitioned its status to EXPIRED.
 *
 * Triggered by: `syncDiscountStatuses` in `app/_lib/discounts/status.ts`,
 * inside the existing toExpire batch. Standalone emit, fire-and-forget
 * per discount expired in this cron tick. The cron runs every 15
 * minutes (vercel.json) so latency between actual expiry and event
 * emission is bounded by that interval — Phase 5 should treat
 * `expired_at` (cron observation time) as approximate, not exact.
 *
 * Idempotency key: `discount_expired:${discountId}:${endsAt.getTime()}`.
 * The endsAt timestamp is part of the key so a discount that's
 * deactivated, re-enabled with a new endsAt, then expired again
 * produces a distinct event.
 *
 * Operational ↔ analytics field mapping:
 *   discount_id   ← Discount.id
 *   title         ← Discount.title
 *   ends_at       ← Discount.endsAt (the timestamp that triggered the
 *                    status transition)
 *   expired_at    ← cron observation time (now() during the sync run)
 *   total_uses    ← Discount.usageCount at expiry (denormalized — gives
 *                    Phase 5 a per-discount usage snapshot without a
 *                    follow-up join)
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const DiscountExpiredPayloadSchema = z.object({
  discount_id: z.string().min(1),
  title: z.string().min(1),
  ends_at: z.coerce.date(),
  expired_at: z.coerce.date(),
  total_uses: z.number().int().nonnegative(),
});

export const DiscountExpiredSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("discount_expired"),
    schema_version: z.literal("0.1.0"),
    payload: DiscountExpiredPayloadSchema,
  }),
);

export type DiscountExpiredPayload = z.infer<typeof DiscountExpiredPayloadSchema>;
export type DiscountExpiredEvent = z.infer<typeof DiscountExpiredSchema>;
