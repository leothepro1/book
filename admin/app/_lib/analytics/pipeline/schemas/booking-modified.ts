/**
 * booking_modified v0.1.0
 * ───────────────────────
 *
 * Emitted when an existing Booking row's content changes. Today's emit site
 * is the PMS chokepoint (`ingest.ts` Case 4 UPDATE), so all current
 * modifications carry `source_channel: "pms_import"`. Future direct-booking
 * edit flows (admin date change, guest count edit) will emit from their
 * own sites and may carry `source_channel: "direct"`.
 *
 * Triggered by: `executeUpsertOnce` in
 * `app/_lib/integrations/reliability/ingest.ts` Case 4 (UPDATE) — fires when
 * the chokepoint detects real content change (different from the existing row,
 * not a stale or identical re-sync).
 *
 * Relationship to booking_cancelled:
 *   booking_modified and booking_cancelled live at the same operational site.
 *   When a single PMS update both modifies fields AND transitions
 *   status → CANCELLED, we emit booking_cancelled ONLY (cancellation is the
 *   more specific signal — see Q7 in the Phase 2 plan and the catalog's
 *   "Relationship to other events" section). Pre-cancellation field changes
 *   are almost always PMS internal housekeeping that downstream analytics
 *   shouldn't double-count.
 *
 * Operational ↔ analytics field mapping:
 *   booking_id          ← Booking.id
 *   pms_provider        ← derivePMSAdapterType(Booking.externalSource)
 *   pms_reference       ← Booking.externalId
 *   check_in_date       ← Booking.arrival   formatted YYYY-MM-DD (UTC)  (current value)
 *   check_out_date      ← Booking.departure formatted YYYY-MM-DD (UTC)  (current value)
 *   number_of_nights    ← derived
 *   number_of_guests    ← Booking.guestCount (nullable, current value)
 *   accommodation_id    ← Booking.accommodationId (nullable)
 *   source_channel      ← deriveSourceChannel(booking)
 *   provider_updated_at ← input.providerUpdatedAt (PMS version timestamp;
 *                          part of the idempotency key so successive
 *                          modifications are distinct events)
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const BookingModifiedPayloadSchema = z.object({
  booking_id: z.string().min(1),
  pms_provider: z.enum(["mews", "fake", "manual", "other"]),
  pms_reference: z.string().nullable(),
  check_in_date: z.string().regex(ISO_DATE, "check_in_date must be YYYY-MM-DD"),
  check_out_date: z.string().regex(ISO_DATE, "check_out_date must be YYYY-MM-DD"),
  number_of_nights: z.number().int().positive(),
  number_of_guests: z.number().int().positive().nullable(),
  accommodation_id: z.string().min(1).nullable(),
  source_channel: z.enum(["direct", "pms_import", "third_party_ota", "unknown"]),
  provider_updated_at: z.coerce.date(),
});

export const BookingModifiedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("booking_modified"),
    schema_version: z.literal("0.1.0"),
    payload: BookingModifiedPayloadSchema,
  }),
);

export type BookingModifiedPayload = z.infer<typeof BookingModifiedPayloadSchema>;
export type BookingModifiedEvent = z.infer<typeof BookingModifiedSchema>;
