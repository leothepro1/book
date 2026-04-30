/**
 * accommodation_price_changed v0.1.0  (registered, emit deferred to Phase 4 CDC)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * The base price of an accommodation changed. Useful for Phase 5
 * pricing-volatility analysis: how often do tenants change prices,
 * what's the typical magnitude, what are the seasonal patterns.
 *
 * Same Q4 deferral as the other accommodation_* events. CDC is the
 * canonical capture point for price changes across all write-paths
 * (admin UI, bulk import, dynamic pricing, future AI suggestions).
 *
 * Operational ↔ analytics field mapping (planned for Phase 4):
 *   accommodation_id    ← Accommodation.id
 *   accommodation_type  ← Accommodation.type
 *   previous_price      ← {amount, currency} before the change
 *   new_price           ← {amount, currency} after the change
 *   change_pct          ← derived: (new - prev) / prev * 100, rounded
 *                         (precomputed for Phase 5 ergonomics; null when
 *                         previous_price.amount === 0)
 *   changed_at          ← timestamp of the price update
 *   changed_by_actor_id ← admin user CUID if discoverable; else null
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const AccommodationPriceChangedPayloadSchema = z.object({
  accommodation_id: z.string().min(1),
  accommodation_type: z.enum(["hotel", "cabin", "camping", "apartment", "pitch"]),
  previous_price: z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  new_price: z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  change_pct: z.number().nullable(),
  changed_at: z.coerce.date(),
  changed_by_actor_id: z.string().min(1).nullable(),
});

export const AccommodationPriceChangedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("accommodation_price_changed"),
    schema_version: z.literal("0.1.0"),
    payload: AccommodationPriceChangedPayloadSchema,
  }),
);

export type AccommodationPriceChangedPayload = z.infer<typeof AccommodationPriceChangedPayloadSchema>;
export type AccommodationPriceChangedEvent = z.infer<typeof AccommodationPriceChangedSchema>;
