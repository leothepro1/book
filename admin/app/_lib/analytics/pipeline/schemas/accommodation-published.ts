/**
 * accommodation_published v0.1.0  (registered, emit deferred to Phase 4 CDC)
 * ────────────────────────────────────────────────────────────────────────
 *
 * An accommodation went live on the guest-facing booking engine — i.e.,
 * its `status` became `ACTIVE` and it's discoverable in the storefront.
 *
 * Q4 of the Phase 2 plan deferred the emit site to Phase 4 (Postgres
 * CDC). Reasoning:
 *   - Bedfront has multiple admin write-paths for accommodations
 *     (visual editor saves, bulk import, future AI tools, manual admin
 *     mutations).
 *   - Instrumenting every write-path is fragile: a new admin route
 *     added later forgets to emit and the analytics record drifts from
 *     reality.
 *   - CDC captures `status` transitions regardless of which code path
 *     wrote them — one emit-source for all writers.
 *
 * Phase 2 ships the SCHEMA + REGISTRY entry only. Listed in
 * `KNOWN_DEFERRED_EVENTS` in scripts/verify-phase2.ts with the explicit
 * reason. When Phase 4 CDC lands, the events activate automatically.
 *
 * Operational ↔ analytics field mapping (planned for Phase 4):
 *   accommodation_id    ← Accommodation.id
 *   accommodation_type  ← Accommodation.type (HOTEL / CABIN / CAMPING /
 *                         APARTMENT / PITCH)
 *   display_name        ← Accommodation's localized name (resolved at
 *                         emit time from the tenant's primary locale)
 *   base_price          ← {amount, currency} from Accommodation pricing
 *   status_transition   ← previous status → "ACTIVE" (always ACTIVE on
 *                         this event by definition)
 *   published_at        ← timestamp of the status transition (CDC-derived)
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

export const AccommodationPublishedPayloadSchema = z.object({
  accommodation_id: z.string().min(1),
  accommodation_type: z.enum(["hotel", "cabin", "camping", "apartment", "pitch"]),
  display_name: z.string().min(1),
  base_price: z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  status_transition: z.object({
    from: z.enum(["active", "inactive", "archived", "unknown"]),
    to: z.literal("active"),
  }),
  published_at: z.union([z.string(), z.date()]),
});

export const AccommodationPublishedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("accommodation_published"),
    schema_version: z.literal("0.1.0"),
    payload: AccommodationPublishedPayloadSchema,
  }),
);

export type AccommodationPublishedPayload = z.infer<typeof AccommodationPublishedPayloadSchema>;
export type AccommodationPublishedEvent = z.infer<typeof AccommodationPublishedSchema>;
