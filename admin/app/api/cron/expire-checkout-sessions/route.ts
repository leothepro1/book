export const dynamic = "force-dynamic";

/**
 * Cron: Expire & Clean Up Checkout Sessions
 * ──────────────────────────────────────────
 *
 * 1. Marks expired sessions (expiresAt < now, status still active)
 * 2. Hard-deletes sessions older than 7 days (GDPR — no guest data lingers)
 *
 * Runs every 15 minutes. Idempotent — safe to run concurrently.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

const HARD_DELETE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();

  // 1. Mark expired sessions
  const expired = await prisma.checkoutSession.updateMany({
    where: {
      expiresAt: { lt: now },
      status: { in: ["PENDING", "ADDON_SELECTION", "CHECKOUT"] },
    },
    data: { status: "EXPIRED" },
  });

  // 2. Hard-delete sessions older than 7 days
  const cutoff = new Date(now.getTime() - HARD_DELETE_AGE_MS);
  const deleted = await prisma.checkoutSession.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  if (expired.count > 0 || deleted.count > 0) {
    log("info", "cron.expire_checkout_sessions", {
      expiredCount: expired.count,
      deletedCount: deleted.count,
    });
  }

  return Response.json({
    expired: expired.count,
    deleted: deleted.count,
  });
}
