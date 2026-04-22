/**
 * PMS Reliability Engine — Ingestion Contract
 *
 * These types define the boundary between "a PMS told us about a booking"
 * and "the booking is durably stored in our database". Every path into
 * Booking from a PMS — webhook, reconciliation cron, or manual admin
 * action — must pass through this contract into upsertBookingFromPms().
 *
 * Invariants encoded here:
 *
 *   1. `externalId` is the stable PMS identifier. It is the single key
 *      used for idempotency across webhook + cron races.
 *   2. `providerUpdatedAt` is the version vector. Any write whose version
 *      is <= the stored version is a no-op (stale-event rejection).
 *   3. `source` is the audit marker. SLO monitoring treats
 *      source="reconciliation" on a CREATE as a signal that the webhook
 *      path failed for this booking — the key reliability metric.
 *
 * All dates are UTC Date objects. All monetary amounts are integers
 * in the smallest currency unit (öre/cents).
 */

import { z } from "zod";
import { PmsProviderSchema } from "../types";

// ── Source of ingestion ──────────────────────────────────────
//
// Stored in SyncEvent.payload.source. A booking.created event with
// source="reconciliation" means the webhook missed this booking — this
// is the key reliability signal. Sustained >0 per tenant → alert.

export const IngestSourceSchema = z.enum([
  "webhook", // PMS pushed an event to /api/webhooks/pms/*
  "reconciliation", // Cron discovered the booking via listBookings()
  "manual", // Admin-triggered one-off sync (debug tools, re-send flows)
]);

export type IngestSource = z.infer<typeof IngestSourceSchema>;

// ── Normalized guest identity ───────────────────────────────

export const IngestGuestSchema = z.object({
  firstName: z.string().min(1),
  // lastName can be empty. Some cultures use a single name (Indonesian
  // "Sukarno", Burmese "Aung") and PMS systems don't reliably split.
  // Callers passing a single-token guestName should pass "" here and
  // set firstName to the full name. Making this required min(1) would
  // silently fail every such booking in BookingSyncError.
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});

export type IngestGuest = z.infer<typeof IngestGuestSchema>;

// ── Normalized stay ─────────────────────────────────────────

export const IngestStaySchema = z.object({
  checkIn: z.coerce.date(),
  checkOut: z.coerce.date(),
  unit: z.string(),
  guestCount: z.number().int().positive().optional(),
  specialRequests: z.string().optional(),
  ratePlanId: z.string().optional(),
  pmsBookingRef: z.string().optional(),
});

export type IngestStay = z.infer<typeof IngestStaySchema>;

// ── Normalized status ───────────────────────────────────────
//
// Adapter-space status (adapter returns these in BookingLookup.status).
// Mapped to Prisma BookingStatus at the ingest boundary.

export const IngestStatusSchema = z.enum([
  "confirmed", // → PRE_CHECKIN
  "checked_in", // → ACTIVE
  "checked_out", // → COMPLETED
  "cancelled", // → CANCELLED
  "no_show", // → CANCELLED (no NO_SHOW enum yet; flagged in SyncEvent)
]);

export type IngestStatus = z.infer<typeof IngestStatusSchema>;

// ── The ingestion contract ───────────────────────────────────
//
// Every caller — webhook handler, reconciliation cron, manual tool —
// constructs one of these and passes it to upsertBookingFromPms().
// Validation is strict at the boundary: malformed input is rejected
// before any DB work, never silently coerced.

export const BookingUpsertInputSchema = z.object({
  // Tenancy + provider — how we route + audit
  tenantId: z.string().min(1),
  provider: PmsProviderSchema,

  // Idempotency key — the single source of truth for
  // "same booking or different booking?"
  externalId: z.string().min(1),

  // Version vector — drives stale-event rejection. When a PMS doesn't
  // expose a last-modified timestamp, callers should pass the PMS event
  // timestamp or fall back to new Date() (with awareness that this
  // weakens stale-event protection for that provider).
  providerUpdatedAt: z.coerce.date(),

  // Who asked us to do this write — becomes SyncEvent.payload.source
  source: IngestSourceSchema,

  // Booking payload
  guest: IngestGuestSchema,
  stay: IngestStaySchema,
  status: IngestStatusSchema,

  // Optional PMS-reported creation timestamp. When source="reconciliation"
  // and action="created", the delta between this and our new row's
  // createdAt is the recovery-lag SLO metric.
  providerCreatedAt: z.coerce.date().optional(),
});

export type BookingUpsertInput = z.infer<typeof BookingUpsertInputSchema>;

// ── The ingestion result ────────────────────────────────────
//
// upsertBookingFromPms() always resolves (never rejects on business
// reasons — only on infrastructure failures like DB unavailability).
// Callers inspect `action` to decide follow-up work (e.g., emit a
// reliability alert on source=reconciliation && action=created).

export type UpsertAction =
  | "created" // Booking did not exist; row inserted
  | "updated" // Booking existed; version newer, row updated
  | "unchanged_stale" // Booking existed; incoming version <= stored; no-op
  | "unchanged_identical"; // Booking existed; identical data, no-op

export interface UpsertResult {
  action: UpsertAction;
  bookingId: string;
  tenantId: string;
  externalId: string;
  /**
   * Recovery lag in milliseconds — the delta between PMS-reported
   * creation time and our local createdAt. Populated only when
   * action="created" and providerCreatedAt was provided by the caller.
   * This is the raw input to the SLO metric "miss recovery lag".
   */
  recoveryLagMs?: number;
}

// ── Adapter → ingest mapping helper ─────────────────────────
//
// Converts the adapter's BookingLookup (what listBookings returns)
// into the ingestion contract. Adapters themselves never construct
// BookingUpsertInput — the reliability module owns this mapping so
// adapters remain read-only and unaware of write semantics.

export const BookingLookupToIngestParamsSchema = z.object({
  tenantId: z.string(),
  provider: PmsProviderSchema,
  source: IngestSourceSchema,
});

export type BookingLookupToIngestParams = z.infer<
  typeof BookingLookupToIngestParamsSchema
>;
