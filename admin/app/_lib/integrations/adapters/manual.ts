/**
 * ManualAdapter — Default PMS Adapter (No External PMS)
 *
 * Returns empty results for all queries.
 * Used as the fallback adapter for tenants without a PMS connection.
 *
 * Tenants using ManualAdapter manage their content manually
 * through the admin UI — no external availability or pricing data.
 */

import type { PmsAdapter } from "../adapter";
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
} from "../types";

export class ManualAdapter implements PmsAdapter {
  readonly provider: PmsProvider = "manual";

  async getAvailability(
    _tenantId: string,
    params: AvailabilityParams,
  ): Promise<AvailabilityResult> {
    const nights = Math.round(
      (params.checkOut.getTime() - params.checkIn.getTime()) / (1000 * 60 * 60 * 24),
    );
    return {
      categories: [],
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      nights,
      guests: params.guests,
      searchId: `manual_${Date.now()}`,
    };
  }

  async getRoomTypes(_tenantId: string): Promise<RoomCategory[]> {
    return [];
  }

  async getRestrictions(
    _tenantId: string,
    _from: Date,
    _to: Date,
    _categoryExternalId?: string,
  ): Promise<Restriction[]> {
    return [];
  }

  async lookupBooking(
    _tenantId: string,
    _reference: string,
  ): Promise<BookingLookup | null> {
    return null;
  }

  async getGuest(
    _tenantId: string,
    _bookingExternalId: string,
  ): Promise<GuestData | null> {
    return null;
  }

  async getAddons(
    _tenantId: string,
    _categoryExternalId?: string,
  ): Promise<Addon[]> {
    return [];
  }

  async getPaymentStatus(
    _tenantId: string,
    _bookingExternalId: string,
  ): Promise<PaymentStatus | null> {
    return null;
  }

  async getUnitAvailability(
    _tenantId: string,
    externalIds: string[],
    _checkIn: Date,
    _checkOut: Date,
  ): Promise<Map<string, boolean>> {
    // No PMS = assume all units available
    const result = new Map<string, boolean>();
    for (const id of externalIds) {
      result.set(id, true);
    }
    return result;
  }

  async createBooking(
    _tenantId: string,
    _params: CreateBookingParams,
  ): Promise<BookingConfirmation> {
    throw new Error("ManualAdapter does not support booking creation. Connect a PMS to enable online bookings.");
  }

  async listBookings(
    _tenantId: string,
    _params: ListBookingsParams,
  ): Promise<ListBookingsPage> {
    // Manual tenants have no upstream PMS to sweep — bookings are
    // managed in our own admin UI, which writes directly through the
    // normal Booking path (not through upsertBookingFromPms). The
    // reconciliation engine therefore has nothing to reconcile here.
    return { bookings: [], nextCursor: null };
  }

  async holdAvailability(
    _tenantId: string,
    _params: HoldParams,
  ): Promise<HoldResult | null> {
    // No upstream PMS → no hold mechanism to use. Returning null
    // signals the caller to skip the hold step. Since manual tenants
    // manage their own inventory outside our platform, double-booking
    // races aren't our concern for them.
    return null;
  }

  async confirmHold(_tenantId: string, _holdExternalId: string): Promise<string> {
    // Should never be called since holdAvailability always returns
    // null for manual tenants. Throw loudly if misused.
    throw new Error(
      "ManualAdapter.confirmHold called — no hold should exist on a manual tenant",
    );
  }

  async releaseHold(_tenantId: string, _holdExternalId: string): Promise<void> {
    // Same reasoning as confirmHold — but for releaseHold we no-op
    // rather than throw: the expire cron should be tolerant if it
    // encounters a stale manual-era row.
  }

  async testConnection(
    _credentials: Record<string, string>,
  ): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }

  resolveWebhookTenant(_payload: unknown): string | null {
    return null;
  }

  async verifyWebhookSignature(
    _rawBody: Buffer,
    _headers: Record<string, string>,
    _credentials: Record<string, string>,
  ): Promise<boolean> {
    return false;
  }

  parseWebhookEvents(
    _rawBody: Buffer,
    _parsedPayload: unknown,
  ): PmsWebhookEvent[] | null {
    // No upstream PMS → no webhooks. Return null so the route
    // responds with 400 if someone targets it anyway.
    return null;
  }

  async cancelBooking(
    _tenantId: string,
    _params: CancelBookingParams,
  ): Promise<CancelBookingResult> {
    // Manual tenants have no external PMS to cancel in — the cancel is
    // purely local (Order + Booking + Stripe refund in our own systems).
    // Return deterministic success so the saga proceeds.
    return {
      canceledAtPms: new Date(),
      alreadyCanceled: false,
    };
  }
}
