/**
 * ManualAdapter — Default PMS Adapter
 *
 * Reads booking data from the local PostgreSQL database.
 * This is the current behavior — no external PMS integration.
 *
 * Used as the default adapter for tenants without a PMS connection.
 * Zero regression: preserves 100% of existing functionality.
 *
 * notifyCheckIn / notifyCheckOut are no-ops because check-in/out
 * is handled directly in the platform database.
 */

import type { PmsAdapter } from "../adapter";
import type { NormalizedBooking, NormalizedGuest, PmsProvider, SyncResult } from "../types";
import { mapPrismaBookingToNormalized, mapPrismaBookingToGuest } from "../types";
import { prisma } from "@/app/_lib/db/prisma";
import { toPrismaBookingStatus } from "../prisma-mapping";

export class ManualAdapter implements PmsAdapter {
  readonly provider: PmsProvider = "manual";

  async getBookings(
    tenantId: string,
    filters?: { guestEmail?: string; status?: NormalizedBooking["status"][] }
  ): Promise<NormalizedBooking[]> {
    const where: Record<string, unknown> = { tenantId };

    if (filters?.guestEmail) {
      where.guestEmail = filters.guestEmail;
    }

    if (filters?.status && filters.status.length > 0) {
      where.status = { in: filters.status.map(toPrismaBookingStatus) };
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { arrival: "desc" },
    });

    return bookings.map(mapPrismaBookingToNormalized);
  }

  async getBooking(
    tenantId: string,
    externalId: string
  ): Promise<NormalizedBooking | null> {
    const booking = await prisma.booking.findFirst({
      where: { id: externalId, tenantId },
    });

    if (!booking) return null;
    return mapPrismaBookingToNormalized(booking);
  }

  async getGuest(
    tenantId: string,
    externalId: string
  ): Promise<NormalizedGuest | null> {
    // In the manual adapter, guest externalId is the guestEmail.
    // We extract guest data from the latest booking for this email.
    const booking = await prisma.booking.findFirst({
      where: { tenantId, guestEmail: externalId },
      orderBy: { arrival: "desc" },
    });

    if (!booking) return null;
    return mapPrismaBookingToGuest(booking);
  }

  async notifyCheckIn(
    _tenantId: string,
    _externalId: string
  ): Promise<void> {
    // No-op for manual provider — check-in is handled directly in the platform
  }

  async notifyCheckOut(
    _tenantId: string,
    _externalId: string
  ): Promise<void> {
    // No-op for manual provider — check-out is handled directly in the platform
  }

  async testConnection(
    _credentials: Record<string, string>
  ): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }

  async syncBookings(
    _tenantId: string,
    _since?: Date
  ): Promise<SyncResult> {
    // No-op for manual provider — bookings are managed directly in local DB
    return { created: 0, updated: 0, cancelled: 0, errors: [], syncedAt: new Date() };
  }

  getWebhookBookingId(_payload: unknown): string | null {
    // Manual provider does not receive webhooks
    return null;
  }

  resolveWebhookTenant(_payload: unknown): string | null {
    // Manual provider does not receive webhooks
    return null;
  }

  async verifyWebhookSignature(
    _rawBody: Buffer,
    _headers: Record<string, string>,
    _credentials: Record<string, string>
  ): Promise<boolean> {
    // Manual provider rejects all incoming webhooks
    return false;
  }
}
