import { prisma } from "../../../_lib/db/prisma";
import { createGlobalMockBooking } from "@/app/_lib/mockData";

export async function resolveBookingFromToken(token?: string | null) {
  if (!token) return null;

  // PREVIEW MODE eller TEST MODE: Använd global mock booking
  if (token === "preview" || token === "test") {
    console.log(`[resolveBooking] ${token.toUpperCase()} mode - using global mock`);

    // Use the same tenant as the admin dev fallback (getCurrentTenant.ts)
    const DEV_ORG_ID = "org_3ARDCw7QTcQ0s1v0KCbF1DSrLip";

    try {
      const firstTenant = process.env.NODE_ENV === "development"
        ? await prisma.tenant.findUnique({ where: { clerkOrgId: DEV_ORG_ID } })
        : await prisma.tenant.findFirst();

      if (firstTenant) {
        const mockBooking = createGlobalMockBooking(firstTenant.id);
        console.log("[resolveBooking] Mock booking created for tenant:", firstTenant.id, firstTenant.name);

        return {
          ...mockBooking,
          tenant: firstTenant,
        } as any;
      }
    } catch (error) {
      console.error("[resolveBooking] Mock mode error:", error);
    }

    return null;
  }

  // NORMAL FLOW: Real bookings
  const magic = await prisma.magicLink.findUnique({
    where: { token },
    include: { booking: { include: { tenant: true } } },
  });

  if (magic?.booking) {
    const now = new Date();
    const isExpired = magic.expiresAt < now;
    const isUsed = !!magic.usedAt;
    if (!isExpired && !isUsed) return magic.booking;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: token },
    include: { tenant: true },
  });

  return booking ?? null;
}
