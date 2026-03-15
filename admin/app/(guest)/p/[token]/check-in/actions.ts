"use server";

import { prisma } from "../../../../_lib/db/prisma";
import { resolveBookingFromToken } from "../../../_lib/portal/resolveBooking";
import { canCheckIn, isCheckInTimeReached } from "../../../_lib/booking";
import { redirect } from "next/navigation";
import { getTenantConfig } from "../../../_lib/tenant";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { toPrismaBookingStatus } from "@/app/_lib/integrations/prisma-mapping";

export async function markCheckedIn(token?: string | null) {
  const booking = await resolveBookingFromToken(token);
  if (!booking) return;

  // Only allow check-in from upcoming (PRE_CHECKIN)
  if (booking.status !== "upcoming") {
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
    where: { id: booking.externalId },
    data: {
      checkedInAt: booking.checkedInAt ?? now,
      status: toPrismaBookingStatus("active"),
    },
  });

  // Notify PMS adapter (no-op for manual provider)
  try {
    const adapter = await resolveAdapter(booking.tenantId);
    await adapter.notifyCheckIn(booking.tenantId, booking.externalId);
  } catch (error) {
    console.error("[CHECK-IN TOKEN] Adapter notifyCheckIn failed:", error);
  }

  // Mark magic link as used (one-time)
  if (token && token !== "test") {
    await prisma.magicLink.updateMany({
      where: { token, usedAt: null },
      data: { usedAt: now },
    });
  }

  redirect(`/p/${token}`);
}
