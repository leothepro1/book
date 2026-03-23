/**
 * Mews PMS Adapter — Booking Engine
 *
 * Implementation of PmsAdapter for the Mews Connector API.
 * All Mews API calls are POST with auth tokens in the request body.
 *
 * Rate limit: 200 requests per AccessToken per 30 seconds.
 * Handled by database-backed rate limiter in MewsClient.
 *
 * TODO: Implement actual Mews API calls for availability, rates, etc.
 * Current implementation stubs all methods while preserving the
 * client/credentials/rate-limiting infrastructure.
 */

import type { PmsAdapter } from "../../adapter";
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
} from "../../types";
import type { MewsCredentials } from "./credentials";
import { MewsClient } from "./client";

export class MewsAdapter implements PmsAdapter {
  readonly provider: PmsProvider = "mews";
  private readonly client: MewsClient;

  constructor(credentials: MewsCredentials) {
    this.client = new MewsClient(credentials);
  }

  // ── 1. Availability + Rates ─────────────────────────────────

  async getAvailability(
    _tenantId: string,
    params: AvailabilityParams,
  ): Promise<AvailabilityResult> {
    // TODO: Call Mews services/getAvailability and rates/getAll
    // Map MewsServiceAvailability + MewsRate → AvailabilityResult
    const nights = Math.round(
      (params.checkOut.getTime() - params.checkIn.getTime()) / 86400000,
    );
    return {
      categories: [],
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      nights,
      guests: params.guests,
      searchId: `mews_${Date.now()}`,
    };
  }

  // ── 2. Room Types ───────────────────────────────────────────

  async getRoomTypes(_tenantId: string): Promise<RoomCategory[]> {
    // TODO: Call Mews resources/getAll → map to RoomCategory[]
    return [];
  }

  // ── 3. Restrictions ─────────────────────────────────────────

  async getRestrictions(
    _tenantId: string,
    _from: Date,
    _to: Date,
    _categoryExternalId?: string,
  ): Promise<Restriction[]> {
    // TODO: Call Mews restrictions/getAll → map to Restriction[]
    return [];
  }

  // ── 4. Booking Lookup ───────────────────────────────────────

  async lookupBooking(
    _tenantId: string,
    _reference: string,
  ): Promise<BookingLookup | null> {
    // TODO: Call Mews reservations/getAll with ConfirmationNumber filter
    return null;
  }

  // ── 5. Guest Data ───────────────────────────────────────────

  async getGuest(
    _tenantId: string,
    _bookingExternalId: string,
  ): Promise<GuestData | null> {
    // TODO: Call Mews customers/getAll with reservation CustomerId
    return null;
  }

  // ── 6. Add-ons ──────────────────────────────────────────────

  async getAddons(
    _tenantId: string,
    _categoryExternalId?: string,
  ): Promise<Addon[]> {
    // TODO: Call Mews products/getAll → map to Addon[]
    return [];
  }

  // ── 7. Payment Status ───────────────────────────────────────

  async getPaymentStatus(
    _tenantId: string,
    _bookingExternalId: string,
  ): Promise<PaymentStatus | null> {
    // TODO: Call Mews bills/getAll for the reservation
    return null;
  }

  // ── 8. Connection & Webhooks ────────────────────────────────

  async testConnection(
    credentials: Record<string, string>,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const { MewsCredentialsSchema } = await import("./credentials");
      const parsed = MewsCredentialsSchema.parse(credentials);
      const testClient = new MewsClient(parsed);
      // Hit a lightweight endpoint to verify credentials
      await testClient.post("configuration/get", {});
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: message };
    }
  }

  resolveWebhookTenant(payload: unknown): string | null {
    if (
      payload &&
      typeof payload === "object" &&
      "EnterpriseId" in payload &&
      typeof (payload as Record<string, unknown>).EnterpriseId === "string"
    ) {
      return (payload as Record<string, string>).EnterpriseId;
    }
    return null;
  }

  async verifyWebhookSignature(
    _rawBody: Buffer,
    headers: Record<string, string>,
    credentials: Record<string, string>,
  ): Promise<boolean> {
    // Mews uses a simple token-in-URL approach
    const token = headers["x-forwarded-token"] ?? "";
    return token === credentials.webhookToken;
  }
}
