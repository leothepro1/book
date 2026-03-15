import { prisma } from "../../../_lib/db/prisma";
import { createMockNormalizedBookings } from "@/app/_lib/mockData";
import { env } from "@/app/_lib/env";
import { mapPrismaBookingToNormalized } from "@/app/_lib/integrations/types";
import type { NormalizedBooking } from "@/app/_lib/integrations/types";

export async function resolveBookingFromToken(token?: string | null): Promise<NormalizedBooking | null> {
  if (!token) return null;

  // PREVIEW MODE eller TEST MODE: Använd global mock booking
  if (token === "preview" || token === "test") {
    console.log(`[resolveBooking] ${token.toUpperCase()} mode - using global mock`);

    try {
      const firstTenant = process.env.NODE_ENV === "development" && env.DEV_ORG_ID
        ? await prisma.tenant.findUnique({ where: { clerkOrgId: env.DEV_ORG_ID } })
        : await prisma.tenant.findFirst();

      if (firstTenant) {
        const mockBookings = createMockNormalizedBookings(firstTenant.id);
        console.log("[resolveBooking] Mock booking created for tenant:", firstTenant.id, firstTenant.name);
        // Return the first (current/active) mock booking
        return mockBookings[0] ?? null;
      }
    } catch (error) {
      console.error("[resolveBooking] Mock mode error:", error);
    }

    return null;
  }

  // NORMAL FLOW: Real bookings
  const magic = await prisma.magicLink.findUnique({
    where: { token },
    include: { booking: true },
  });

  if (magic?.booking) {
    const now = new Date();
    const isExpired = magic.expiresAt < now;
    const isUsed = !!magic.usedAt;
    if (!isExpired && !isUsed) return mapPrismaBookingToNormalized(magic.booking);
  }

  const booking = await prisma.booking.findUnique({
    where: { id: token },
  });

  return booking ? mapPrismaBookingToNormalized(booking) : null;
}
