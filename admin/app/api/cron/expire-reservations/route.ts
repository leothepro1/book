export const dynamic = "force-dynamic";

/**
 * Cron: Expire Stale Inventory Reservations + Booking Locks
 * ──────────────────────────────────────────────────────────
 *
 * Safety net for reservations that were never consumed or released
 * (e.g. Stripe webhook never fired due to network issue).
 * Also cleans up expired PendingBookingLock records.
 *
 * Run every 5 minutes via Vercel cron or external scheduler.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { releaseExpiredReservations } from "@/app/_lib/products/inventory";
import { log } from "@/app/_lib/logger";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await releaseExpiredReservations();

  // Clean up expired PMS booking idempotency locks
  const locks = await prisma.pendingBookingLock.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  // Clean up old webhook dedup records (>30 days)
  const webhookEvents = await prisma.stripeWebhookEvent.deleteMany({
    where: { processedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
  });

  if (result.released > 0 || locks.count > 0 || webhookEvents.count > 0) {
    log("info", "cron.expire_reservations", {
      releasedReservations: result.released,
      expiredLocks: locks.count,
      expiredWebhookEvents: webhookEvents.count,
    });
  }

  return Response.json({
    ok: true,
    released: result.released,
    expiredLocks: locks.count,
    expiredWebhookEvents: webhookEvents.count,
  });
}
