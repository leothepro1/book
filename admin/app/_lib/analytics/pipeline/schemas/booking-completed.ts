/**
 * booking_completed v0.1.0
 * ───────────────────────
 *
 * Emitted when a booking is confirmed and ready for fulfillment.
 *
 * Operational ↔ analytics field mapping
 * ─────────────────────────────────────
 *
 * The emitter is the translation boundary. Analytics field names are
 * domain-of-analytics names, not operational names — that decoupling lets us
 * rename operational columns without breaking analytics consumers.
 *
 *   booking_id          ← Booking.id                       (CUID)
 *   accommodation_id    ← Booking.accommodationId          (CUID)
 *   guest_id            ← see "guest_id derivation" below
 *   check_in_date       ← Booking.arrival   formatted YYYY-MM-DD (UTC)
 *   check_out_date      ← Booking.departure formatted YYYY-MM-DD (UTC)
 *   number_of_nights    ← derived (check_out_date − check_in_date)
 *   number_of_guests    ← Booking.numberOfGuests
 *   total_amount.amount ← Booking.totalAmount              (öre / minor units)
 *   total_amount.currency ← Booking.currency                (ISO 4217, 3 chars)
 *   source_channel      ← see "source_channel derivation" below
 *   pms_reference       ← Booking.externalId               (nullable)
 *
 * guest_id derivation (Q3 resolution, Phase 1A)
 * ─────────────────────────────────────────────
 * - If Booking has a GuestAccount relation:
 *     guest_id = GuestAccount.id                            (CUID, no prefix)
 * - Otherwise (email-only booking):
 *     guest_id = "email_" + first 16 hex chars of
 *                SHA-256(`${tenantId}:${email.toLowerCase().trim()}`)
 *
 * The "email_" prefix makes it visible during debugging that this is a
 * pseudonym, not a GuestAccount id. Lowercasing and trimming the email
 * before hashing means `Anna@example.com` and `anna@example.com ` produce
 * the same id. Tenant id is part of the hash input so the same email
 * across tenants gets different pseudonyms.
 *
 * source_channel derivation (Q4 resolution, Phase 1A)
 * ───────────────────────────────────────────────────
 *   Booking.externalSource = "manual"      → "direct"
 *   Booking.externalSource = "mews" / future PMSes → "pms_import"
 *   Booking.externalSource = "fake"        → "direct" (test/dev events
 *                                            stay in pipeline; filtering is
 *                                            a Phase 5 aggregation concern)
 *   Booking.externalSource = unmapped/null → "unknown" (defensive — the
 *                                            emitter never throws on a new
 *                                            source value mid-transaction)
 *   Future booking.com / OTAs              → "third_party_ota"
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const BookingCompletedPayloadSchema = z.object({
  booking_id: z.string().min(1),
  accommodation_id: z.string().min(1),
  guest_id: z.string().min(1),
  check_in_date: z.string().regex(ISO_DATE, "check_in_date must be YYYY-MM-DD"),
  check_out_date: z.string().regex(ISO_DATE, "check_out_date must be YYYY-MM-DD"),
  number_of_nights: z.number().int().positive(),
  number_of_guests: z.number().int().positive(),
  total_amount: z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  source_channel: z.enum(["direct", "pms_import", "third_party_ota", "unknown"]),
  pms_reference: z.string().nullable(),
});

export const BookingCompletedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("booking_completed"),
    schema_version: z.literal("0.1.0"),
    payload: BookingCompletedPayloadSchema,
  }),
);

export type BookingCompletedPayload = z.infer<typeof BookingCompletedPayloadSchema>;
export type BookingCompletedEvent = z.infer<typeof BookingCompletedSchema>;
