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
}
