import { prisma } from "../../../_lib/db/prisma";

export async function resolveBookingFromToken(token?: string | null) {
  if (!token) return null;

  // Dev shortcut: /p/test => senaste bokningen (utan magic links)
  if (token === "test") {
    const latest = await prisma.booking.findFirst({
      orderBy: { createdAt: "desc" },
      include: { tenant: true },
    });
    return latest ?? null;
  }

  // 1) MagicLink.token -> Booking (endast om inte expired/used)
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

  // 2) Fallback: token as Booking.id
  const booking = await prisma.booking.findUnique({
    where: { id: token },
    include: { tenant: true },
  });

  return booking ?? null;
}
