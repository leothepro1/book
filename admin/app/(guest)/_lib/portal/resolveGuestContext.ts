/**
 * Guest Context Resolution (Session-Based)
 * ═════════════════════════════════════════
 *
 * Session equivalent of resolveBookingFromToken().
 * Every session-driven portal page calls this.
 *
 * Reads the guest session, verifies all referenced entities exist,
 * and loads bookings from DB. Does NOT call PMS adapters —
 * session-based pages show what we have in DB.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { getGuestSession } from "@/app/_lib/magic-link/session";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { mapPrismaBookingToNormalized } from "@/app/_lib/integrations/types";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { NormalizedBooking } from "@/app/_lib/integrations/types";

export type GuestContext = {
  tenant: { id: string; name: string };
  config: TenantConfig;
  guestAccount: { id: string; email: string };
  bookings: NormalizedBooking[];
  primaryBooking: NormalizedBooking | null;
};

/**
 * Resolve full guest context from the session cookie.
 *
 * Returns null if:
 * - No session exists
 * - Session lacks guestAccountId (legacy magic-link session)
 * - Tenant or guest account no longer exists in DB
 *
 * Callers should redirect to /login when null is returned.
 */
export async function resolveGuestContext(): Promise<GuestContext | null> {
  const session = await getGuestSession();
  if (!session) return null;

  // OTP sessions have guestAccountId; legacy magic-link sessions do not
  if (!session.guestAccountId) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) return null;

  const guestAccount = await prisma.guestAccount.findUnique({
    where: { id: session.guestAccountId },
    select: { id: true, email: true },
  });
  if (!guestAccount) return null;

  // Load all bookings linked to this guest account, most recent first
  const prismaBookings = await prisma.booking.findMany({
    where: { guestAccountId: guestAccount.id },
    orderBy: { arrival: "desc" },
  });

  const bookings = prismaBookings.map(mapPrismaBookingToNormalized);

  // Primary booking = most recent non-cancelled
  const primaryBooking =
    bookings.find((b) => b.status !== "cancelled") ?? null;

  const config = await getTenantConfig(tenant.id);

  return {
    tenant,
    config,
    guestAccount,
    bookings,
    primaryBooking,
  };
}
