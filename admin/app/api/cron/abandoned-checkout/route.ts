export const dynamic = "force-dynamic";

/**
 * Cron: Abandoned Checkout Emails
 * ───────────────────────────────
 *
 * Finds PENDING orders older than 1 hour but less than 24 hours,
 * where the guest has an email. Sends a reminder to complete checkout.
 *
 * Runs hourly via Vercel cron.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      financialStatus: "PENDING",
      guestEmail: { not: "" },
      createdAt: { lt: oneHourAgo, gt: twentyFourHoursAgo },
    },
    include: { tenant: { select: { name: true, portalSlug: true } } },
  });

  let sent = 0;

  for (const order of orders) {
    // Dedup — skip if already sent for this order
    const alreadySent = await prisma.emailSendLog.findFirst({
      where: { orderId: order.id, eventType: "ABANDONED_CHECKOUT" },
      select: { id: true },
    });
    if (alreadySent) continue;

    const meta = (order.metadata ?? {}) as Record<string, unknown>;
    const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "rutgr.com";
    const portalBase = order.tenant.portalSlug
      ? `https://${order.tenant.portalSlug}.${baseDomain}`
      : "";

    try {
      const { sendEmailEvent } = await import("@/app/_lib/email/send");
      await sendEmailEvent(
        order.tenantId,
        "ABANDONED_CHECKOUT" as Parameters<typeof sendEmailEvent>[1],
        order.guestEmail,
        {
          guestName: order.guestName || "Gäst",
          hotelName: order.tenant.name,
          checkIn: (meta.checkIn as string) ?? "",
          checkOut: (meta.checkOut as string) ?? "",
          roomType: (meta.roomType as string) ?? "",
          resumeUrl: `${portalBase}/stays`,
        },
      );

      // Tag the log entry with orderId for dedup
      await prisma.emailSendLog.updateMany({
        where: {
          tenantId: order.tenantId,
          toEmail: order.guestEmail,
          eventType: "ABANDONED_CHECKOUT",
          orderId: null,
        },
        data: { orderId: order.id },
      });

      sent++;
    } catch (err) {
      log("error", "cron.abandoned_checkout.send_failed", {
        orderId: order.id, error: String(err),
      });
    }
  }

  log("info", "cron.abandoned_checkout.completed", {
    checked: orders.length, sent,
  });

  return Response.json({ ok: true, checked: orders.length, sent });
}
