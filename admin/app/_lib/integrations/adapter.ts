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
}
