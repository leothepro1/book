/**
 * Discount Status Sync
 * ════════════════════
 *
 * Automatically transitions discount statuses:
 *   SCHEDULED → ACTIVE  when startsAt has passed
 *   ACTIVE → EXPIRED    when endsAt has passed
 *
 * Called by the sync-discount-statuses cron job every 15 minutes.
 * No business logic in the cron route — all work lives here.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

export async function syncDiscountStatuses(): Promise<{
  activated: number;
  expired: number;
  errors: number;
}> {
  try {
    const now = new Date();

    // ── Step 1: Activate scheduled discounts ──────────────────

    const toActivate = await prisma.discount.findMany({
      where: {
        status: "SCHEDULED",
        startsAt: { lte: now },
        OR: [
          { endsAt: null },
          { endsAt: { gt: now } },
        ],
      },
      select: { id: true, tenantId: true, title: true },
    });

    if (toActivate.length > 0) {
      await prisma.discount.updateMany({
        where: { id: { in: toActivate.map((d) => d.id) } },
        data: { status: "ACTIVE" },
      });

      await prisma.discountEvent.createMany({
        data: toActivate.map((d) => ({
          discountId: d.id,
          tenantId: d.tenantId,
          type: "ENABLED" as const,
          message: "Rabatt aktiverades automatiskt (schemalagd starttid passerades)",
          metadata: { triggeredBy: "cron", cronJob: "sync-discount-statuses" },
        })),
      });
    }

    // ── Step 2: Expire active discounts ───────────────────────

    const toExpire = await prisma.discount.findMany({
      where: {
        status: "ACTIVE",
        endsAt: { not: null, lte: now },
      },
      select: { id: true, tenantId: true, title: true },
    });

    if (toExpire.length > 0) {
      await prisma.discount.updateMany({
        where: { id: { in: toExpire.map((d) => d.id) } },
        data: { status: "EXPIRED" },
      });

      await prisma.discountEvent.createMany({
        data: toExpire.map((d) => ({
          discountId: d.id,
          tenantId: d.tenantId,
          type: "DISABLED" as const,
          message: "Rabatt upphörde automatiskt (slutdatum passerades)",
          metadata: { triggeredBy: "cron", cronJob: "sync-discount-statuses" },
        })),
      });
    }

    // ── Step 3: Log and return ────────────────────────────────

    if (toActivate.length > 0 || toExpire.length > 0) {
      log("info", "discount.status_sync_complete", {
        activated: toActivate.length,
        expired: toExpire.length,
      });
    }

    return {
      activated: toActivate.length,
      expired: toExpire.length,
      errors: 0,
    };
  } catch (err) {
    log("error", "discount.status_sync_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { activated: 0, expired: 0, errors: 1 };
  }
}
