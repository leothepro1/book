"use server";

import { prisma } from "../../../../_lib/db/prisma";
import { resolveBookingFromToken } from "../../../_lib/portal/resolveBooking";
import { redirect } from "next/navigation";

export async function markCheckedIn(token?: string | null) {
  const booking = await resolveBookingFromToken(token);
  if (!booking) return;

  if (booking.checkedInAt == null) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { checkedInAt: new Date(), status: "checked_in" },
    });
  }

  redirect(`/p/${token}`);
}
