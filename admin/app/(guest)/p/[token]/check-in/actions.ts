"use server";

import { prisma } from "../../../../_lib/db/prisma";
import { resolveBookingFromToken } from "../../../_lib/portal/resolveBooking";
import { BookingStatus } from "../../../_lib/booking";
import { redirect } from "next/navigation";
import { canCheckIn, isCheckInTimeReached } from "../../../_lib/booking";
import { getTenantConfig } from "../../../_lib/tenant";

export async function markCheckedIn(token?: string | null) {
  const booking = await resolveBookingFromToken(token);
  if (!booking) return;

  // Only allow check-in from PRE_CHECKIN
  if (booking.status !== BookingStatus.PRE_CHECKIN) {
    redirect(`/p/${token}`);
  }

  const config = await getTenantConfig(booking.tenantId ?? "default");
  const checkInTime = config.property.checkInTime || "14:00";
  const now = new Date();

  const ok = canCheckIn(booking, now) && isCheckInTimeReached(booking, checkInTime, now);
  const isDevBypass = token === "test";
  if (!ok && !isDevBypass) {
    redirect(`/p/${token}`);
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      checkedInAt: booking.checkedInAt ?? now,
      status: BookingStatus.ACTIVE,
    },
  });

  // Mark magic link as used (one-time)
  if (token && token !== "test") {
    await prisma.magicLink.updateMany({
      where: { token, usedAt: null },
      data: { usedAt: now },
    });
  }

  redirect(`/p/${token}`);
}
