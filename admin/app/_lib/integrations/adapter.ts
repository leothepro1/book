/**
 * PMS Adapter Interface — Booking Engine
 *
 * The contract every PMS implementation must satisfy.
 * No optional methods — all methods are required.
 *
 * Platform code never calls a PMS directly.
 * All availability/booking data access goes through an adapter
 * resolved via resolveAdapter(tenantId).
 *
 * Capabilities:
 *   1. Availability + Rates  — search for available rooms with pricing
 *   2. Room types            — category metadata (capacity, images, facilities)
 *   3. Restrictions          — min/max stay, CTA/CTD per date
 *   4. Booking lookup        — existing booking by reference
 *   5. Guest data            — guest info tied to a booking
 *   6. Add-ons              — extras available for a category/rate plan
 *   7. Payment status        — paid/unpaid/outstanding for a booking
 *   8. Connection            — test credentials, verify webhooks
 */

import type {
  PmsProvider,
  AvailabilityParams,
  AvailabilityResult,
  RoomCategory,
  Restriction,
  BookingLookup,
  GuestData,
  Addon,
  PaymentStatus,
  CreateBookingParams,
  BookingConfirmation,
  ListBookingsParams,
  ListBookingsPage,
  PmsWebhookEvent,
  CancelBookingParams,
  CancelBookingResult,
  HoldParams,
  HoldResult,
} from "./types";

export interface PmsAdapter {
  readonly provider: PmsProvider;

  // ── 1. Availability + Rates ─────────────────────────────────
  /**
   * Search for available rooms/units within a date range.
   * Returns categories with rate plans, pricing, and unit counts.
   * This is the primary query powering the booking engine search.
   */
  getAvailability(
    tenantId: string,
    params: AvailabilityParams,
  ): Promise<AvailabilityResult>;

  // ── 2. Room Types ───────────────────────────────────────────
  /**
   * Fetch all room categories/types for this property.
   * Used for search filters, category pages, and admin UI.
   */
  getRoomTypes(tenantId: string): Promise<RoomCategory[]>;

  // ── 3. Restrictions ─────────────────────────────────────────
  /**
   * Fetch stay restrictions for a date range.
   * Returns min/max stay, closed-to-arrival/departure per date.
   * Used to disable invalid dates in the calendar picker.
   */
  getRestrictions(
    tenantId: string,
    from: Date,
    to: Date,
    categoryExternalId?: string,
  ): Promise<Restriction[]>;

  // ── 4. Booking Lookup ───────────────────────────────────────
  /**
   * Look up an existing booking by PMS reference or confirmation number.
   * Used for "find my booking" and modify/cancel flows.
   */
  lookupBooking(
    tenantId: string,
    reference: string,
  ): Promise<BookingLookup | null>;

  // ── 5. Guest Data ───────────────────────────────────────────
  /**
   * Fetch guest data linked to a booking.
   * Limited to what the PMS exposes (name, email, phone, address).
   */
  getGuest(
    tenantId: string,
    bookingExternalId: string,
  ): Promise<GuestData | null>;

  // ── 6. Add-ons ──────────────────────────────────────────────
  /**
   * Fetch available add-ons for a category or rate plan.
   * Returns breakfast, packages, parking, etc.
   */
  getAddons(
    tenantId: string,
    categoryExternalId?: string,
  ): Promise<Addon[]>;

  // ── 7. Payment Status ───────────────────────────────────────
  /**
   * Check payment status for a booking.
   * Returns total, paid, outstanding balance.
   * Not all PMS providers support this — ManualAdapter returns null.
   */
  getPaymentStatus(
    tenantId: string,
    bookingExternalId: string,
  ): Promise<PaymentStatus | null>;

  // ── 9. Unit-Level Availability ──────────────────────────────
  /**
   * Check availability for specific units/resources by their PMS external IDs.
   * Returns a Map from externalId → available (boolean).
   * Used by spot booking to check per-marker availability.
   */
  getUnitAvailability(
    tenantId: string,
    externalIds: string[],
    checkIn: Date,
    checkOut: Date,
  ): Promise<Map<string, boolean>>;

  // ── 10. Create Booking ──────────────────────────────────────
  /**
   * Create a new booking in the PMS.
   * Returns confirmation with PMS reference and status.
   */
  createBooking(
    tenantId: string,
    params: CreateBookingParams,
  ): Promise<BookingConfirmation>;

  // ── 11. List Bookings (reliability engine) ──────────────────
  /**
   * List bookings whose state falls within the window [from, to),
   * paginated by an opaque cursor.
   *
   * Used EXCLUSIVELY by the PMS reliability engine (reconciliation
   * cron). Not a general-purpose query — the user-facing booking flows
   * look up bookings by reference via lookupBooking().
   *
   * Contract:
   *   • First call: pass cursor = null / undefined. The adapter
   *     returns the first page plus a nextCursor (or null if the
   *     window fits in one page).
   *   • Subsequent calls: pass the previous nextCursor. Loop until
   *     the returned nextCursor is null.
   *   • Every returned booking MUST carry a non-null
   *     providerUpdatedAt. This is the version vector the reliability
   *     engine uses to reject stale events. If the PMS does not
   *     expose a last-modified timestamp for a given booking, the
   *     adapter MUST omit it rather than fabricate one.
   *   • Adapters MAY clamp `limit` to their own page ceiling.
   */
  listBookings(
    tenantId: string,
    params: ListBookingsParams,
  ): Promise<ListBookingsPage>;

  // ── 12. Availability Hold (checkout-phase reservation) ──────
  /**
   * Place a soft reservation at the PMS so the unit is held while
   * the guest completes checkout. The PMS enforces the TTL; we
   * call confirmHold within that window on successful payment or
   * releaseHold if the guest abandons.
   *
   * Return null when the adapter/PMS doesn't support holds (Manual,
   * or providers without an Optional-reservation concept). The
   * caller then falls back to post-payment createBooking — with the
   * caveat that this re-introduces the double-booking race.
   *
   * Throws on adapter-level errors (HTTP failures, auth, etc.) so
   * the caller can distinguish "not supported" (null) from
   * "temporarily unavailable" (throw).
   */
  holdAvailability(
    tenantId: string,
    params: HoldParams,
  ): Promise<HoldResult | null>;

  /**
   * Promote a held reservation to a confirmed booking. Idempotent:
   * calling on an already-confirmed reservation is a no-op. Throws
   * on adapter errors. Return value is the confirmed external id
   * (most PMSes reuse the hold id, some mint a new one).
   */
  confirmHold(tenantId: string, holdExternalId: string): Promise<string>;

  /**
   * Release a held reservation explicitly. Idempotent: calling on
   * an already-released or already-expired hold is a no-op. Throws
   * on adapter errors — the cron will retry on next cycle.
   */
  releaseHold(tenantId: string, holdExternalId: string): Promise<void>;

  // ── 8. Connection & Webhooks ────────────────────────────────
  /**
   * Test that the provided credentials are valid.
   * Called during integration setup in admin settings.
   */
  testConnection(
    credentials: Record<string, string>,
  ): Promise<{ ok: boolean; error?: string }>;

  /**
   * Extract the PMS's tenant/property identifier from a webhook payload.
   * Resolves which platform tenant this webhook belongs to.
   * Returns null if the adapter doesn't support webhooks.
   */
  resolveWebhookTenant(payload: unknown): string | null;

  /**
   * Verify the cryptographic signature on an incoming webhook.
   * Each PMS has its own signing mechanism (HMAC, RSA, etc.).
   * Returns true if valid, false otherwise.
   */
  verifyWebhookSignature(
    rawBody: Buffer,
    headers: Record<string, string>,
    credentials: Record<string, string>,
  ): Promise<boolean>;

  /**
   * Parse an incoming webhook payload into one or more normalized
   * events. A single webhook delivery may notify about multiple
   * bookings (Mews batches them); each sub-event gets its own
   * PmsWebhookEvent so the reliability engine can dedupe and process
   * them independently.
   *
   * Takes both `rawBody` and `parsedPayload` because adapters for
   * providers without native event IDs (Mews is one) must derive a
   * stable dedup key from a hash of the raw body.
   *
   * Contract:
   *   • Return null when the payload is malformed or the adapter
   *     doesn't support webhooks (the route returns 400 / logs).
   *   • Return [] for well-formed events carrying no actionable
   *     reservation reference (e.g. account-level notifications).
   *     The route still records them in the inbox for audit.
   *   • Each event's externalEventId MUST be stable across retry
   *     deliveries of the same event. For providers without a native
   *     event ID, derive from a hash of rawBody + a within-payload
   *     index.
   *
   * The reliability engine never inspects eventType — it always
   * re-fetches the booking state from the PMS to avoid relying on
   * the payload's own data, which can be reordered or stale.
   */
  parseWebhookEvents(
    rawBody: Buffer,
    parsedPayload: unknown,
  ): PmsWebhookEvent[] | null;

  // ── 12. Cancellation ────────────────────────────────────────
  /**
   * Cancel a reservation in the PMS.
   *
   * Idempotency: PMS APIs rarely support idempotency keys (Mews does
   * not). Adapters MUST recognise a repeated cancel as success by
   * inspecting the reservation's state and returning
   * `alreadyCanceled: true` — the engine treats that identically to
   * a fresh cancel.
   *
   * Side effects (PMS-side only): reservation state → Canceled,
   * inventory released, PMS audit trail written. This method does NOT
   * touch our Order, trigger Stripe refund, or send guest email —
   * those are the engine's responsibility (see cancellation-engine.md §6).
   *
   * Error taxonomy: adapters MUST classify failures as
   * TransientPmsError (the saga retries) or PermanentPmsError (the
   * saga DECLINES the request). Any other thrown error is treated as
   * transient — err on the side of retry.
   */
  cancelBooking(
    tenantId: string,
    params: CancelBookingParams,
  ): Promise<CancelBookingResult>;
}
