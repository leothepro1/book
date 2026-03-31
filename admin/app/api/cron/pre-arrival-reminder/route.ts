export const dynamic = "force-dynamic";

/**
 * Cron: Pre-Arrival Reminder Emails
 * ──────────────────────────────────
 *
 * Finds bookings with check-in in 1 or 3 days.
 * Sends a reminder with check-in time and portal link.
 *
 * Runs daily at 08:00 UTC via Vercel cron.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const today = new Date();
  const day1Start = startOfDay(addDays(today, 1));
  const day1End = endOfDay(addDays(today, 1));
  const day3Start = startOfDay(addDays(today, 3));
  const day3End = endOfDay(addDays(today, 3));

  const bookings = await prisma.booking.findMany({
    where: {
      guestEmail: { not: "" },
      status: { not: "CANCELLED" },
      OR: [
        { arrival: { gte: day1Start, lte: day1End } },
        { arrival: { gte: day3Start, lte: day3End } },
      ],
    },
    include: { tenant: { select: { id: true, name: true, portalSlug: true, settings: true } } },
  });

  let sent = 0;

  for (const booking of bookings) {
    // Dedup — skip if already sent for this booking
    const alreadySent = await prisma.emailSendLog.findFirst({
      where: { bookingId: booking.id, eventType: "PRE_ARRIVAL_REMINDER" },
      select: { id: true },
    });
    if (alreadySent) continue;

    const daysUntilArrival = Math.ceil(
      (booking.arrival.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    const settings = (booking.tenant.settings ?? {}) as Record<string, unknown>;
    const property = (settings.property ?? {}) as Record<string, unknown>;
    const checkInTime = (property.checkInTime as string) ?? "14:00";

    const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "rutgr.com";
    const portalBase = booking.tenant.portalSlug
      ? `https://${booking.tenant.portalSlug}.${baseDomain}`
      : "";

    try {
      const { sendEmailEvent } = await import("@/app/_lib/email/send");
      await sendEmailEvent(
        booking.tenant.id,
        "PRE_ARRIVAL_REMINDER" as Parameters<typeof sendEmailEvent>[1],
        booking.guestEmail,
        {
          guestName: `${booking.firstName} ${booking.lastName}`.trim(),
          hotelName: booking.tenant.name,
          checkIn: booking.arrival.toISOString().slice(0, 10),
          checkOut: booking.departure.toISOString().slice(0, 10),
          roomType: booking.unit,
          checkInTime,
          portalUrl: `${portalBase}/portal/home`,
          daysUntilArrival: String(daysUntilArrival),
        },
      );

      // Tag log entry with bookingId for dedup
      await prisma.emailSendLog.updateMany({
        where: {
          tenantId: booking.tenant.id,
          toEmail: booking.guestEmail,
          eventType: "PRE_ARRIVAL_REMINDER",
          bookingId: null,
        },
        data: { bookingId: booking.id },
      });

      sent++;
    } catch (err) {
      log("error", "cron.pre_arrival_reminder.send_failed", {
        bookingId: booking.id, error: String(err),
      });
    }
  }

  log("info", "cron.pre_arrival_reminder.completed", {
    checked: bookings.length, sent,
  });

  return Response.json({ ok: true, checked: bookings.length, sent });
}
