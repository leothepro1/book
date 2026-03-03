import { prisma } from "../../../_lib/db/prisma";
import { createGlobalMockBooking } from "@/app/_lib/mockData";

export async function resolveBookingFromToken(token?: string | null) {
  if (!token) return null;

  // PREVIEW MODE eller TEST MODE: Använd global mock booking
  if (token === "preview" || token === "test") {
    console.log(`[resolveBooking] ${token.toUpperCase()} mode - using global mock`);

    try {
      const firstTenant = await prisma.tenant.findFirst();

      if (firstTenant) {
        const mockBooking = createGlobalMockBooking(firstTenant.id);
        console.log("[resolveBooking] Mock booking created for first tenant:", firstTenant.id);

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
