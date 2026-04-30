/**
 * booking_no_show v0.1.0  (registered, emit deferred to Phase 2.x)
 * ───────────────────────
 *
 * Emitted when a guest fails to arrive on the scheduled check-in date.
 *
 * Phase 2 ships the SCHEMA + REGISTRY entry only. There is no operational
 * emit site yet. Per Q2 of the Phase 2 plan, the deferral is not about
 * the size of the cron — it's about the product decision behind no-show
 * detection:
 *
 *   "When does a booking count as no-show? 24h after arrival? 48h?
 *    Arrival + 24h?"
 *
 * That window is for Apelviken (and other early tenants) to define before
 * we wire up internal detection. Until then, the schema is registered so
 * that:
 *   - When a PMS reports no-show via the existing ingest path
 *     (ingest.ts already maps `IngestStatus="no_show"` to operational
 *     CANCELLED with metadata), Phase 2.x can flip on the emit at that
 *     site without schema work.
 *   - When Bedfront's own no-show detection cron is built (post-Apelviken
 *     window decision), it has a registered schema waiting.
 *
 * The verify-phase2.ts script lists this event in KNOWN_DEFERRED_EVENTS
 * with an explicit reason — see scripts/verify-phase2.ts.
 *
 * Field choices intentionally conservative:
 *   - `detection_source` enum reserves slots for `"pms"` (the PMS told us)
 *     and `"internal"` (our own cron noticed). v0.1.0 doesn't need
 *     consensus on which is canonical — Phase 2.x will produce only one
 *     source initially.
 *   - `expected_check_in_date` is the date the guest was supposed to
 *     arrive. `detected_at` is the moment we noticed — not when the
 *     no-show "happened" (which is fuzzy by definition).
 *
 * Operational ↔ analytics field mapping (planned for Phase 2.x):
 *   booking_id              ← Booking.id
 *   pms_provider            ← derivePMSAdapterType(Booking.externalSource)
 *   pms_reference           ← Booking.externalId
 *   expected_check_in_date  ← Booking.arrival formatted YYYY-MM-DD (UTC)
 *   accommodation_id        ← Booking.accommodationId (nullable)
 *   number_of_guests        ← Booking.guestCount (nullable)
 *   detection_source        ← "pms" | "internal" depending on emit site
 *   detected_at             ← now() at emit time
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const BookingNoShowPayloadSchema = z.object({
  booking_id: z.string().min(1),
  pms_provider: z.enum(["mews", "fake", "manual", "other"]),
  pms_reference: z.string().nullable(),
  expected_check_in_date: z
    .string()
    .regex(ISO_DATE, "expected_check_in_date must be YYYY-MM-DD"),
  accommodation_id: z.string().min(1).nullable(),
  number_of_guests: z.number().int().positive().nullable(),
  detection_source: z.enum(["pms", "internal"]),
  detected_at: z.union([z.string(), z.date()]),
});

export const BookingNoShowSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("booking_no_show"),
    schema_version: z.literal("0.1.0"),
    payload: BookingNoShowPayloadSchema,
  }),
);

export type BookingNoShowPayload = z.infer<typeof BookingNoShowPayloadSchema>;
export type BookingNoShowEvent = z.infer<typeof BookingNoShowSchema>;
