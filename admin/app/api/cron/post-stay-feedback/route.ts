export const dynamic = "force-dynamic";

/**
 * Cron: Post-Stay Feedback Emails
 * ────────────────────────────────
 *
 * Finds orders fulfilled ~24 hours ago and sends a feedback request.
 * Uses a 2-hour window (23h–25h) to tolerate cron scheduling jitter.
 *
 * Runs daily at 10:00 UTC via Vercel cron.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const windowStart = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() - 23 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      fulfillmentStatus: "FULFILLED",
      fulfilledAt: { gte: windowStart, lte: windowEnd },
      guestEmail: { not: "" },
    },
    include: { tenant: { select: { id: true, name: true, portalSlug: true } } },
  });

  let sent = 0;

  for (const order of orders) {
    // Dedup
    const alreadySent = await prisma.emailSendLog.findFirst({
      where: { orderId: order.id, eventType: "POST_STAY_FEEDBACK" },
      select: { id: true },
    });
    if (alreadySent) continue;

    const meta = (order.metadata ?? {}) as Record<string, unknown>;
    const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "bedfront.com";
    const portalBase = order.tenant.portalSlug
      ? `https://${order.tenant.portalSlug}.${baseDomain}`
      : "";

    try {
      const { sendEmailEvent } = await import("@/app/_lib/email/send");
      await sendEmailEvent(
        order.tenant.id,
        "POST_STAY_FEEDBACK" as Parameters<typeof sendEmailEvent>[1],
        order.guestEmail,
        {
          guestName: order.guestName || "Gäst",
          hotelName: order.tenant.name,
          checkIn: (meta.checkIn as string) ?? "",
          checkOut: (meta.checkOut as string) ?? "",
          feedbackUrl: `${portalBase}/portal/feedback`,
        },
      );

      await prisma.emailSendLog.updateMany({
        where: {
          tenantId: order.tenant.id,
          toEmail: order.guestEmail,
          eventType: "POST_STAY_FEEDBACK",
          orderId: null,
        },
        data: { orderId: order.id },
      });

      sent++;
    } catch (err) {
      log("error", "cron.post_stay_feedback.send_failed", {
        orderId: order.id, error: String(err),
      });
    }
  }

  log("info", "cron.post_stay_feedback.completed", {
    checked: orders.length, sent,
  });

  return Response.json({ ok: true, checked: orders.length, sent });
}
