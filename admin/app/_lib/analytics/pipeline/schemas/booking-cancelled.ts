/**
 * booking_cancelled v0.1.0
 * ───────────────────────
 *
 * Emitted when a booking transitions to status=CANCELLED. Phase 2's only emit
 * site is the PMS chokepoint (`ingest.ts` Case 4 UPDATE) firing when a PMS
 * update flips status to cancelled. Future direct-booking cancellation flows
 * (admin cancel, guest self-cancel) will emit from their own sites.
 *
 * Triggered by: `executeUpsertOnce` in
 * `app/_lib/integrations/reliability/ingest.ts` Case 4 (UPDATE) — fires when
 * the chokepoint applies a content change AND the new status is CANCELLED.
 *
 * Relationship to booking_modified:
 *   When a single PMS update both modifies fields AND transitions
 *   status → CANCELLED, we emit booking_cancelled ONLY. See
 *   docs/analytics/event-catalog.md and the Q7 discriminator comment at
 *   the emit site for the full reasoning.
 *
 * Field choices:
 *   - `cancelled_at` is the PMS-reported version timestamp (`providerUpdatedAt`).
 *     This is when the PMS believes the cancellation happened, not when
 *     Bedfront ingested it.
 *   - The original stay dates (`check_in_date` / `check_out_date`) are
 *     included so Phase 5 can answer "how far ahead were cancellations
 *     made?" — a critical operational metric for revenue forecasting.
 *   - `cancellation_reason` is intentionally absent in v0.1.0. The Booking
 *     model has no reason field today; adding one without a product
 *     decision on the reason taxonomy would lock in guesses. Reserved for
 *     v0.2.0 once the reason vocabulary is defined.
 *
 * Operational ↔ analytics field mapping:
 *   booking_id          ← Booking.id
 *   pms_provider        ← derivePMSAdapterType(Booking.externalSource)
 *   pms_reference       ← Booking.externalId
 *   check_in_date       ← Booking.arrival   formatted YYYY-MM-DD (UTC)
 *   check_out_date      ← Booking.departure formatted YYYY-MM-DD (UTC)
 *   number_of_nights    ← derived
 *   number_of_guests    ← Booking.guestCount (nullable)
 *   accommodation_id    ← Booking.accommodationId (nullable)
 *   source_channel      ← deriveSourceChannel(booking)
 *   cancelled_at        ← input.providerUpdatedAt
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const BookingCancelledPayloadSchema = z.object({
  booking_id: z.string().min(1),
  pms_provider: z.enum(["mews", "fake", "manual", "other"]),
  pms_reference: z.string().nullable(),
  check_in_date: z.string().regex(ISO_DATE, "check_in_date must be YYYY-MM-DD"),
  check_out_date: z.string().regex(ISO_DATE, "check_out_date must be YYYY-MM-DD"),
  number_of_nights: z.number().int().positive(),
  number_of_guests: z.number().int().positive().nullable(),
  accommodation_id: z.string().min(1).nullable(),
  source_channel: z.enum(["direct", "pms_import", "third_party_ota", "unknown"]),
  cancelled_at: z.union([z.string(), z.date()]),
});

export const BookingCancelledSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("booking_cancelled"),
    schema_version: z.literal("0.1.0"),
    payload: BookingCancelledPayloadSchema,
  }),
);

export type BookingCancelledPayload = z.infer<typeof BookingCancelledPayloadSchema>;
export type BookingCancelledEvent = z.infer<typeof BookingCancelledSchema>;
