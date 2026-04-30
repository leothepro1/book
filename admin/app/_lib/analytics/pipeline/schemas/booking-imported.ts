/**
 * booking_imported v0.1.0
 * ───────────────────────
 *
 * Emitted when a booking originates AT a PMS (Mews / Apaleo / Opera / future)
 * and is ingested into Bedfront via the reliability engine. The complement of
 * booking_completed (which fires for direct bookings made through Bedfront's
 * checkout). Phase 1B deliberately split these into two event types — see
 * docs/analytics/event-catalog.md for the why.
 *
 * Triggered by: `executeUpsertOnce` in
 * `app/_lib/integrations/reliability/ingest.ts` Case 1 (INSERT) — fires when
 * the chokepoint inserts a new Booking row from PMS data.
 *
 * Field profile differs from booking_completed:
 *   - No `total_amount` — PMS imports don't have a linked Order, so we have
 *     no money to report. Phase 5 aggregations interested in import revenue
 *     will join against PMS-side rate plans / external systems.
 *   - `accommodation_id` is nullable — PMS imports often arrive before any
 *     local Accommodation row is matched/created.
 *   - `number_of_guests` is nullable — operational `Booking.guestCount` is
 *     nullable and PMS adapters may not always populate it.
 *   - `pms_provider` is required — the dimension Phase 5 uses to slice
 *     import volume by PMS vendor.
 *
 * Operational ↔ analytics field mapping:
 *   booking_id         ← Booking.id
 *   pms_provider       ← derivePMSAdapterType(Booking.externalSource)
 *   pms_reference      ← Booking.externalId (the PMS-side identifier)
 *   check_in_date      ← Booking.arrival   formatted YYYY-MM-DD (UTC)
 *   check_out_date     ← Booking.departure formatted YYYY-MM-DD (UTC)
 *   number_of_nights   ← derived
 *   number_of_guests   ← Booking.guestCount (nullable)
 *   accommodation_id   ← Booking.accommodationId (nullable)
 *   guest_email_hash   ← deriveGuestId for an email-only booking
 *                        (PMS imports start without a GuestAccount link;
 *                        the linked event is `guest_account_linked`)
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const BookingImportedPayloadSchema = z.object({
  booking_id: z.string().min(1),
  pms_provider: z.enum(["mews", "fake", "manual", "other"]),
  pms_reference: z.string().min(1),
  check_in_date: z.string().regex(ISO_DATE, "check_in_date must be YYYY-MM-DD"),
  check_out_date: z.string().regex(ISO_DATE, "check_out_date must be YYYY-MM-DD"),
  number_of_nights: z.number().int().positive(),
  number_of_guests: z.number().int().positive().nullable(),
  accommodation_id: z.string().min(1).nullable(),
  guest_email_hash: z.string().min(1),
});

export const BookingImportedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("booking_imported"),
    schema_version: z.literal("0.1.0"),
    payload: BookingImportedPayloadSchema,
  }),
);

export type BookingImportedPayload = z.infer<typeof BookingImportedPayloadSchema>;
export type BookingImportedEvent = z.infer<typeof BookingImportedSchema>;
