export const dynamic = "force-dynamic";

/**
 * Cron: Deliver Scheduled Gift Cards
 * ───────────────────────────────────
 *
 * Finds ACTIVE gift cards where scheduledAt <= now and sentAt IS NULL,
 * sends the gift card email, and sets sentAt on success.
 *
 * Idempotency: sentAt is only set after confirmed send. Re-running
 * the cron produces the same result — already-sent cards are skipped.
 *
 * Error isolation: a single send failure never stops the batch.
 * The failed card will be retried on the next cron run.
 *
 * Run every 5 minutes via Vercel cron.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { portalSlugToUrl } from "@/app/_lib/tenant/portal-slug";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Fetch gift cards ready for delivery
  const cards = await prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      sentAt: null,
      scheduledAt: { lte: new Date() },
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          portalSlug: true,
          emailLogoUrl: true,
        },
      },
      design: {
        select: {
          renderedImageUrl: true,
        },
      },
    },
  });

  let delivered = 0;
  let failed = 0;

  for (const card of cards) {
    try {
      // Lazy import to avoid circular dependency at module load
      const { sendEmailEvent } = await import("@/app/_lib/email/send");

      const portalUrl = card.tenant.portalSlug
        ? portalSlugToUrl(card.tenant.portalSlug)
        : card.tenant.name;

      const result = await sendEmailEvent(
        card.tenantId,
        "GIFT_CARD_SENT",
        card.recipientEmail,
        {
          recipientName: card.recipientName,
          senderName: card.senderName,
          message: card.message ?? "",
          amount: formatPriceDisplay(card.initialAmount, "SEK"),
          code: card.code,
          hotelName: card.tenant.name,
          portalUrl,
          giftCardImageUrl: card.design?.renderedImageUrl ?? "",
        },
        { giftCardId: card.id },
      );

      if (result.status === "sent") {
        await prisma.giftCard.update({
          where: { id: card.id },
          data: { sentAt: new Date() },
        });
        delivered++;

        log("info", "cron.gift_card_delivered", {
          giftCardId: card.id,
          tenantId: card.tenantId,
          recipientEmail: card.recipientEmail,
        });
      } else {
        // rate_limited or skipped_unsubscribed — not an error, but not delivered
        log("warn", "cron.gift_card_skipped", {
          giftCardId: card.id,
          tenantId: card.tenantId,
          reason: result.status,
        });
        failed++;
      }
    } catch (err) {
      // Isolate error — never stop the batch
      log("error", "cron.gift_card_send_failed", {
        giftCardId: card.id,
        tenantId: card.tenantId,
        error: String(err),
      });
      failed++;
    }
  }

  if (cards.length > 0) {
    log("info", "cron.deliver_gift_cards", {
      processed: cards.length,
      delivered,
      failed,
    });
  }

  return Response.json({
    ok: true,
    processed: cards.length,
    delivered,
    failed,
  });
}
