/**
 * PMS Adapter Interface
 *
 * The contract every PMS implementation must satisfy.
 * No optional methods — all methods are required.
 *
 * Platform code never calls a PMS directly.
 * All booking/guest data access goes through an adapter
 * resolved via resolveAdapter(tenantId).
 */

import type { NormalizedBooking, NormalizedGuest, PmsProvider, SyncResult } from "./types";

export interface PmsAdapter {
  readonly provider: PmsProvider;

  getBookings(
    tenantId: string,
    filters?: { guestEmail?: string; status?: NormalizedBooking["status"][] }
  ): Promise<NormalizedBooking[]>;

  getBooking(
    tenantId: string,
    externalId: string
  ): Promise<NormalizedBooking | null>;

  getGuest(
    tenantId: string,
    externalId: string
  ): Promise<NormalizedGuest | null>;

  notifyCheckIn(
    tenantId: string,
    externalId: string
  ): Promise<void>;

  notifyCheckOut(
    tenantId: string,
    externalId: string
  ): Promise<void>;

  testConnection(
    credentials: Record<string, string>
  ): Promise<{ ok: boolean; error?: string }>;

  /**
   * Sync bookings from the PMS into the platform.
   * Returns a summary of created/updated/cancelled bookings.
   * For ManualAdapter: no-op, returns empty result.
   */
  syncBookings(
    tenantId: string,
    since?: Date
  ): Promise<SyncResult>;

  /**
   * Extract a booking external ID from a webhook payload.
   * Returns null if the payload doesn't contain a booking reference
   * or the adapter doesn't support webhooks.
   */
  getWebhookBookingId(payload: unknown): string | null;

  /**
   * Extract the PMS's tenant/property identifier from a webhook payload.
   * This identifier must match TenantIntegration.externalTenantId
   * to resolve which platform tenant this webhook belongs to.
   * Returns null if the adapter doesn't support webhooks.
   */
  resolveWebhookTenant(payload: unknown): string | null;

  /**
   * Verify the cryptographic signature on an incoming webhook.
   * Each PMS has its own signing mechanism (HMAC, RSA, etc.).
   * The rawBody must be verified BEFORE parsing as JSON.
   *
   * Returns true if the signature is valid, false otherwise.
   * ManualAdapter always returns false (rejects all webhooks).
   */
  verifyWebhookSignature(
    rawBody: Buffer,
    headers: Record<string, string>,
    credentials: Record<string, string>
  ): Promise<boolean>;
}
