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
  /**
   * PMS-reported last-modified timestamp. Used as the version vector
   * by the reliability engine: an ingest whose providerUpdatedAt is
   * ≤ the stored one is a no-op (stale-event rejection). Adapters
   * that cannot surface this timestamp from the PMS must omit the
   * booking (return null from lookupBooking) rather than fabricate
   * a value, which would break the stale-detection guarantee.
   */
  providerUpdatedAt: z.coerce.date(),
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

// ── Addon Line Item (platform → PMS adapter) ──────────────

export const AddonLineItemSchema = z.object({
  title: z.string(),
  quantity: z.number().int().min(1),
  totalAmount: z.number().int(), // öre/cents
  currency: z.string(),
});

export type AddonLineItem = z.infer<typeof AddonLineItemSchema>;

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
  /** Add-on line items with title + amount (no PMS product mapping needed) */
  addonLineItems: z.array(AddonLineItemSchema).default([]),
  specialRequests: z.string().optional(),
  /** PMS resource ID for unit-level assignment (e.g. Mews Resource.Id) */
  requestedResourceId: z.string().optional(),
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

// ── Availability Hold (checkout-phase soft reservation) ───────
//
// Placed at the PMS before the guest completes payment so the unit
// isn't claimed by a parallel booking mid-checkout. TTL is enforced
// by the PMS; if we don't confirm before the expiry the reservation
// auto-releases on their side. We also run a local expire-cron as a
// second safety net (in case our confirmation is lost).
//
// Providers that don't expose a hold/optional concept (Manual and
// some legacy PMSes) return null from holdAvailability, which the
// caller treats as "not supported — proceed without hold". The
// outbound engine then falls back to post-payment createBooking.

export const HoldParamsSchema = z.object({
  /** PMS category ID (room type). */
  categoryId: z.string(),
  /** PMS rate plan ID. */
  ratePlanId: z.string(),
  /** Stay dates — YYYY-MM-DD in the property timezone. */
  checkIn: z.string(),
  checkOut: z.string(),
  /** Total guests (for PersonCounts). */
  guests: z.number().int().min(1),
  /** Provisional guest — can be minimal; full data written on confirm. */
  guestInfo: z.object({
    firstName: z.string().min(1),
    lastName: z.string(),
    email: z.string().email(),
    phone: z.string().nullable().optional(),
  }),
  /** PMS resource (unit) id — for per-unit holds; optional for category-level. */
  requestedResourceId: z.string().optional(),
  /** How long to hold the unit. Platform default is 15 min. */
  holdDurationMs: z.number().int().positive(),
});

export type HoldParams = z.infer<typeof HoldParamsSchema>;

export const HoldResultSchema = z.object({
  /** PMS-side ID for the held reservation. Used for confirm/release. */
  externalId: z.string(),
  /** When the PMS will auto-release if we don't confirm. */
  expiresAt: z.coerce.date(),
});

export type HoldResult = z.infer<typeof HoldResultSchema>;

// ── List Bookings (reliability engine — reconciliation only) ──
//
// Used exclusively by the PMS reliability engine to sweep for missed
// webhook events. NOT a general-purpose booking query. The window
// is bounded so adapters can implement it even when the underlying
// PMS has no native "modified since" filter (Mews, for example).
//
// Contract:
//   • Adapter returns all bookings whose PMS-reported state falls
//     within [from, to). Implementations may include bookings created
//     OR modified in that window — whatever the PMS allows.
//   • Results are paginated via an opaque `cursor`. Pass null on the
//     first call; pass the returned `nextCursor` on each subsequent
//     call until it is null (end of page stream).
//   • Every `BookingLookup` returned MUST carry a non-null
//     `providerUpdatedAt` — the reliability engine needs it as the
//     version vector for stale-event rejection. Adapters that cannot
//     produce this timestamp from the PMS must omit the booking
//     rather than invent one.

export const ListBookingsParamsSchema = z.object({
  /** Inclusive lower bound of the sweep window. */
  from: z.coerce.date(),
  /** Exclusive upper bound of the sweep window. */
  to: z.coerce.date(),
  /** Opaque resume token. Null = start from the beginning of the window. */
  cursor: z.string().nullable().optional(),
  /** Maximum rows per page. Adapters may clamp to a lower provider limit. */
  limit: z.number().int().positive().optional(),
});

export type ListBookingsParams = z.infer<typeof ListBookingsParamsSchema>;

// ListBookingsBooking is the exact same shape as BookingLookup — both
// require providerUpdatedAt. Kept as a named alias so call sites read
// intent clearly at the reconciliation-vs-lookup boundary.
export const ListBookingsBookingSchema = BookingLookupSchema;
export type ListBookingsBooking = BookingLookup;

export const ListBookingsPageSchema = z.object({
  bookings: z.array(ListBookingsBookingSchema),
  /** Null = no more pages in this window. */
  nextCursor: z.string().nullable(),
});

export type ListBookingsPage = z.infer<typeof ListBookingsPageSchema>;

// ── PMS Webhook Events (reliability engine — webhook path) ───
//
// Adapters parse raw webhook payloads into this normalized shape.
// Exactly enough information for the reliability engine to act:
//
//   • externalEventId — the PMS's unique ID for this event, used
//     for dedup at the inbox. MUST be stable across retry deliveries
//     of the same event.
//   • externalBookingId — which booking changed. Optional because
//     some event types (e.g. account-level notifications) don't
//     reference one; they are stored in the inbox but not processed.
//   • eventType — opaque provider string preserved for audit. The
//     reliability engine never switches on this — it always re-fetches
//     the booking state from the PMS to get the current truth.
//
// Adapters that don't support webhooks (Manual) return null.
// Malformed payloads surface as null so the route returns 400 safely.

export const PmsWebhookEventSchema = z.object({
  externalEventId: z.string().min(1),
  externalBookingId: z.string().min(1).nullable(),
  eventType: z.string().min(1),
});

export type PmsWebhookEvent = z.infer<typeof PmsWebhookEventSchema>;

// ── Cancellation (PMS write path) ────────────────────────────
//
// The adapter's cancelBooking() consumes CancelBookingParams and returns
// CancelBookingResult. The engine owns idempotency, reason taxonomy, and
// fee calculation — the adapter's only job is to flip the PMS-side
// reservation into its Canceled state and report back what happened.
//
// See admin/docs/cancellation-engine.md §5.

export const CancelBookingParamsSchema = z.object({
  bookingExternalId: z.string().min(1),

  /**
   * Free-text note sent to the PMS's notes/comments field. Typically
   * the engine builds this from "reason=<handle> note=<guestNote>" so
   * operators can see context in the PMS UI. Max 500 chars — matches
   * CancellationRequest.declineNote cap.
   */
  note: z.string().max(500).optional(),

  /**
   * Our idempotency key. Format: `cancellation:{cancellationRequestId}:attempt:{n}`.
   * Most PMS providers (Mews included) don't honour idempotency keys —
   * adapters are responsible for recognising "already cancelled" as
   * success so retries don't fail.
   */
  idempotencyKey: z.string().min(1),

  /**
   * Whether the PMS should post its own cancellation fee on the folio.
   * Default FALSE — we compute and charge fees ourselves via Stripe
   * for audit consistency.
   */
  chargeFee: z.boolean().default(false),

  /**
   * Whether the PMS should send its own guest email. Default FALSE —
   * we send via sendEmailEvent() so the email goes through our
   * templating, rate-limiting, and unsubscribe pipeline.
   */
  sendGuestEmail: z.boolean().default(false),
});

export type CancelBookingParams = z.infer<typeof CancelBookingParamsSchema>;

export const CancelBookingResultSchema = z.object({
  /** When the PMS confirmed the cancel (its server clock, or our now() if unknown). */
  canceledAtPms: z.coerce.date(),

  /**
   * True when the PMS reported the reservation was already cancelled
   * before this call. Adapters recognise this from provider-specific
   * signals (for Mews: 403 response + a follow-up state check). Engine
   * treats it identically to a fresh cancel — the idempotent success
   * path.
   */
  alreadyCanceled: z.boolean(),

  /**
   * When `chargeFee=true` and the PMS posted a fee item, this is the
   * PMS-side order-item ID. Useful for reconciling against our Stripe
   * refund amount. Null when we handled the fee purely on Stripe.
   */
  pmsFeeItemId: z.string().optional(),
  pmsFeeAmountOre: z.number().int().optional(),
  pmsFeeCurrency: z.string().optional(),

  /**
   * Truncated PMS response payload for SyncEvent audit. Adapters MUST
   * NOT include credentials or any secret in this field. Size cap
   * enforced at log-write time (~2KB).
   */
  rawAuditPayload: z.record(z.string(), z.unknown()).optional(),
});

export type CancelBookingResult = z.infer<typeof CancelBookingResultSchema>;

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
