export const dynamic = "force-dynamic";

/**
 * Cron: Retry Failed App Webhook Deliveries
 * ──────────────────────────────────────────
 *
 * Runs every 5 minutes. Finds FAILED deliveries whose nextRetryAt
 * has passed and attempts redelivery. Marks deliveries with 5+
 * attempts as EXHAUSTED. Failure for one delivery never aborts others.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { deliverEvent } from "@/app/_lib/apps/webhooks";
import { log } from "@/app/_lib/logger";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();

  // Find FAILED deliveries due for retry
  const dueRetries = await prisma.appWebhookDelivery.findMany({
    where: {
      status: "FAILED",
      nextRetryAt: { lte: now },
    },
    include: {
      event: { select: { payload: true } },
    },
    take: 100, // Process in batches
  });

  let retried = 0;
  let delivered = 0;
  let errors = 0;

  for (const delivery of dueRetries) {
    try {
      await deliverEvent(
        delivery.tenantId,
        delivery.appId,
        delivery.eventId,
        delivery.eventType,
        (delivery.event.payload as Record<string, unknown>) ?? {},
      );

      // Check if delivery succeeded
      const updated = await prisma.appWebhookDelivery.findUnique({
        where: { id: delivery.id },
        select: { status: true },
      });

      retried++;
      if (updated?.status === "DELIVERED") delivered++;
    } catch (err) {
      errors++;
      log("error", "cron.retry_webhook_failed", {
        deliveryId: delivery.id,
        appId: delivery.appId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (retried > 0 || errors > 0) {
    log("info", "cron.retry_app_webhooks", { retried, delivered, errors });
  }

  return Response.json({ retried, delivered, errors });
}
