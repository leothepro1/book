/**
 * PMS Integration Layer — Normalized Data Contracts
 *
 * These types define the platform's canonical data shapes for a BOOKING ENGINE.
 * Every PMS adapter maps its response into these contracts.
 * No platform code ever sees raw PMS data — only these types.
 *
 * Capabilities:
 *   1. Availability   — rooms/units per date per category
 *   2. Rates          — pricing, rate plans, campaigns
 *   3. Restrictions   — min/max stay, CTA/CTD
 *   4. Room types     — categories, capacity, metadata
 *   5. Booking lookup — existing bookings for modify/cancel flows
 *   6. Guest data     — name, email, phone (booking-linked)
 *   7. Add-ons        — extras tied to rate plans or stays
 *   8. Payment status — paid/unpaid, outstanding balance
 */

import { z } from "zod";

// ── PMS Provider ────────────────────────────────────────────

export const PmsProviderSchema = z.enum(["manual", "mews", "apaleo", "opera", "fake"]);
export type PmsProvider = z.infer<typeof PmsProviderSchema>;

// ── Integration Status ──────────────────────────────────────

export const IntegrationStatusSchema = z.enum(["active", "disconnected", "error", "pending"]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

// ── Room / Unit Category ────────────────────────────────────

export const RoomCategorySchema = z.object({
  /** PMS-side unique identifier for this room type / category */
  externalId: z.string(),
  /** Display name (e.g. "Dubbelrum Havsutsikt") */
  name: z.string(),
  /** Short marketing description */
  shortDescription: z.string(),
  /** Detailed description */
  longDescription: z.string(),
  /** Classification: HOTEL, APARTMENT, CAMPING, CABIN, etc. */
  type: z.string(),
  /** Image URLs for this category */
  imageUrls: z.array(z.string()),
  /** Maximum guest capacity */
  maxGuests: z.number(),
  /** Default guests (if applicable) */
  defaultGuests: z.number().optional(),
  /** Facility tags (e.g. "wifi", "kitchen", "parking") */
  facilities: z.array(z.string()),
  /** Base price per night in smallest currency unit (ören/cents) */
  basePricePerNight: z.number(),
});

export type RoomCategory = z.infer<typeof RoomCategorySchema>;

// ── Rate Plan ───────────────────────────────────────────────

export const RatePlanSchema = z.object({
  /** PMS-side rate plan ID */
  externalId: z.string(),
  /** Display name (e.g. "Flexibel", "Icke återbetalningsbar") */
  name: z.string(),
  /** Description */
  description: z.string(),
  /** Cancellation policy type */
  cancellationPolicy: z.enum(["FLEXIBLE", "MODERATE", "NON_REFUNDABLE"]),
  /** Human-readable cancellation description */
  cancellationDescription: z.string(),
  /** Computed price per night in smallest currency unit */
  pricePerNight: z.number(),
  /** Total price for the stay in smallest currency unit */
  totalPrice: z.number(),
  /** Currency code (e.g. "SEK", "EUR") */
  currency: z.string(),
  /** Rate plan validity window (null = always valid) */
  validFrom: z.coerce.date().nullable(),
  validTo: z.coerce.date().nullable(),
  /** Add-ons included in this rate plan */
  includedAddons: z.array(z.object({
    addonId: z.string(),
    name: z.string(),
    quantity: z.number(),
  })),
});

export type RatePlan = z.infer<typeof RatePlanSchema>;

// ── Availability Result ─────────────────────────────────────

export const AvailabilityEntrySchema = z.object({
  /** The room category */
  category: RoomCategorySchema,
  /** Available rate plans for this category + date range */
  ratePlans: z.array(RatePlanSchema),
  /** Lowest total price across all rate plans (smallest currency unit) */
  lowestTotalPrice: z.number(),
  /** Number of available units for this category */
  availableUnits: z.number(),
});

export type AvailabilityEntry = z.infer<typeof AvailabilityEntrySchema>;

export const AvailabilityResultSchema = z.object({
  /** Available categories with their rate plans */
  categories: z.array(AvailabilityEntrySchema),
  /** Echoed search parameters */
  checkIn: z.coerce.date(),
  checkOut: z.coerce.date(),
  nights: z.number(),
  guests: z.number(),
  /** PMS-side search reference (for follow-up calls) */
  searchId: z.string(),
});

export type AvailabilityResult = z.infer<typeof AvailabilityResultSchema>;

// ── Availability Query Params ───────────────────────────────

export const AvailabilityParamsSchema = z.object({
  checkIn: z.coerce.date(),
  checkOut: z.coerce.date(),
  guests: z.number().min(1),
  /** Optional: filter by accommodation types */
  types: z.array(z.string()).optional(),
});

export type AvailabilityParams = z.infer<typeof AvailabilityParamsSchema>;

// ── Restrictions ────────────────────────────────────────────

export const RestrictionSchema = z.object({
  /** Which room category this restriction applies to (null = all) */
  categoryExternalId: z.string().nullable(),
  /** Date this restriction applies to */
  date: z.coerce.date(),
  /** Minimum nights required */
  minStay: z.number().nullable(),
  /** Maximum nights allowed */
  maxStay: z.number().nullable(),
  /** Closed to arrival — cannot check in on this date */
  closedToArrival: z.boolean(),
  /** Closed to departure — cannot check out on this date */
  closedToDeparture: z.boolean(),
});

export type Restriction = z.infer<typeof RestrictionSchema>;

// ── Booking Lookup ──────────────────────────────────────────

export const BookingLookupSchema = z.object({
  /** PMS-side booking ID */
  externalId: z.string(),
  /** Guest name */
  guestName: z.string(),
  /** Guest email */
  guestEmail: z.string(),
  /** Guest phone */
  guestPhone: z.string().nullable(),
  /** Room category name */
  categoryName: z.string(),
  /** Check-in date */
  checkIn: z.coerce.date(),
  /** Check-out date */
  checkOut: z.coerce.date(),
  /** Number of guests */
  guests: z.number(),
  /** Booking status */
  status: z.enum(["confirmed", "checked_in", "checked_out", "cancelled", "no_show"]),
  /** Total amount in smallest currency unit */
  totalAmount: z.number(),
  /** Currency code */
  currency: z.string(),
  /** Rate plan name */
  ratePlanName: z.string().nullable(),
  /** Creation timestamp */
  createdAt: z.coerce.date(),
});

export type BookingLookup = z.infer<typeof BookingLookupSchema>;

// ── Guest Data ──────────────────────────────────────────────

export const GuestDataSchema = z.object({
  /** PMS-side guest ID */
  externalId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  address: z.object({
    street: z.string().nullable(),
    postalCode: z.string().nullable(),
    city: z.string().nullable(),
    country: z.string().nullable(),
  }),
});

export type GuestData = z.infer<typeof GuestDataSchema>;

// ── Add-ons ─────────────────────────────────────────────────

export const AddonSchema = z.object({
  /** PMS-side addon ID */
  externalId: z.string(),
  /** Display name */
  name: z.string(),
  /** Description */
  description: z.string(),
  /** Price per unit in smallest currency unit */
  price: z.number(),
  /** Currency code */
  currency: z.string(),
  /** Whether this is per night or per stay */
  pricingMode: z.enum(["PER_NIGHT", "PER_STAY", "PER_PERSON", "PER_PERSON_PER_NIGHT"]),
});

export type Addon = z.infer<typeof AddonSchema>;

// ── Payment Status ──────────────────────────────────────────

export const PaymentStatusSchema = z.object({
  /** PMS-side booking ID */
  bookingExternalId: z.string(),
  /** Total charged amount (smallest currency unit) */
  totalAmount: z.number(),
  /** Amount already paid (smallest currency unit) */
  paidAmount: z.number(),
  /** Outstanding balance (smallest currency unit) */
  outstandingBalance: z.number(),
  /** Currency code */
  currency: z.string(),
  /** Overall payment state */
  status: z.enum(["PAID", "PARTIALLY_PAID", "UNPAID", "REFUNDED"]),
});

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

// ── Booking Creation ────────────────────────────────────────

export const CreateBookingParamsSchema = z.object({
  categoryId: z.string(),
  ratePlanId: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().int().min(1),
  guestInfo: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().nullable().optional(),
  }),
  addons: z.array(z.object({
    addonId: z.string(),
    quantity: z.number().int().min(1),
  })).default([]),
  specialRequests: z.string().optional(),
});

export type CreateBookingParams = z.infer<typeof CreateBookingParamsSchema>;

export const BookingConfirmationSchema = z.object({
  externalId: z.string(),
  confirmationNumber: z.string(),
  status: z.enum(["CONFIRMED", "PENDING_PAYMENT", "WAITLISTED"]),
  totalAmount: z.number(),
  currency: z.string(),
  cancellationDeadline: z.string().nullable().optional(),
});

export type BookingConfirmation = z.infer<typeof BookingConfirmationSchema>;

// ── Sync Event Types (kept for webhook/cron infra) ──────────

export const SyncEventTypeSchema = z.enum([
  "availability.queried",
  "booking.created",
  "booking.modified",
  "booking.cancelled",
  "sync.started",
  "sync.completed",
  "sync.failed",
  "connection.tested",
  "connection.failed",
]);

export type SyncEventType = z.infer<typeof SyncEventTypeSchema>;

// ── Legacy Booking Types (guest portal compatibility) ───────
// These types are used by guest portal rendering code to display
// booking data. They map cleanly from BookingLookup and Prisma models.
// Will be removed when guest portal routes are fully migrated.

export const NormalizedBookingStatusSchema = z.enum(["upcoming", "active", "completed", "cancelled"]);
export type NormalizedBookingStatus = z.infer<typeof NormalizedBookingStatusSchema>;

export const NormalizedBookingSchema = z.object({
  externalId: z.string(),
  tenantId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  guestName: z.string(),
  guestEmail: z.string(),
  guestPhone: z.string().nullable(),
  arrival: z.coerce.date(),
  departure: z.coerce.date(),
  unit: z.string(),
  unitType: z.string().nullable(),
  status: NormalizedBookingStatusSchema,
  adults: z.number(),
  children: z.number(),
  extras: z.array(z.string()),
  rawSource: PmsProviderSchema,
  checkedInAt: z.coerce.date().nullable(),
  checkedOutAt: z.coerce.date().nullable(),
  signatureCapturedAt: z.coerce.date().nullable(),
});

export type NormalizedBooking = z.infer<typeof NormalizedBookingSchema>;

export const NormalizedGuestSchema = z.object({
  externalId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  address: z.object({
    street: z.string().nullable(),
    postalCode: z.string().nullable(),
    city: z.string().nullable(),
    country: z.string().nullable(),
  }),
});

export type NormalizedGuest = z.infer<typeof NormalizedGuestSchema>;

/** Map Prisma BookingStatus enum to normalized status. */
export function mapPrismaStatus(status: "PRE_CHECKIN" | "ACTIVE" | "COMPLETED" | "CANCELLED"): NormalizedBookingStatus {
  switch (status) {
    case "PRE_CHECKIN": return "upcoming";
    case "ACTIVE": return "active";
    case "COMPLETED": return "completed";
    case "CANCELLED": return "cancelled";
  }
}

/** Convert a Prisma Booking to NormalizedBooking. */
export function mapPrismaBookingToNormalized(booking: {
  id: string; tenantId: string; firstName: string; lastName: string;
  guestEmail: string; phone: string | null; arrival: Date; departure: Date;
  unit: string; status: string; checkedInAt: Date | null; checkedOutAt: Date | null;
  signatureCapturedAt: Date | null;
}): NormalizedBooking {
  return {
    externalId: booking.id,
    tenantId: booking.tenantId,
    firstName: booking.firstName,
    lastName: booking.lastName,
    guestName: `${booking.firstName} ${booking.lastName}`,
    guestEmail: booking.guestEmail,
    guestPhone: booking.phone,
    arrival: booking.arrival,
    departure: booking.departure,
    unit: booking.unit,
    unitType: null,
    status: mapPrismaStatus(booking.status as "PRE_CHECKIN" | "ACTIVE" | "COMPLETED" | "CANCELLED"),
    adults: 0,
    children: 0,
    extras: [],
    rawSource: "manual",
    checkedInAt: booking.checkedInAt,
    checkedOutAt: booking.checkedOutAt,
    signatureCapturedAt: booking.signatureCapturedAt,
  };
}
