export const dynamic = "force-dynamic";

/**
 * Cron: Segment Membership Sync
 * ═════════════════════════════
 *
 * Runs daily at 03:00. Iterates all tenants, re-evaluates every segment
 * against all guests. Catches date-based segment changes (e.g.
 * "last_order_date < -90d") that shift with time without data changes.
 *
 * Pagination: 100 tenants per batch to avoid timeout.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { syncSegmentMembers } from "@/app/_lib/segments/sync";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const batchSize = 100;
  let totalJoined = 0;
  let totalLeft = 0;
  let totalSegments = 0;
  let failed = 0;

  // Paginate tenants
  let cursor: string | undefined;

  while (true) {
    const tenants = await prisma.tenant.findMany({
      select: { id: true },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    if (tenants.length === 0) break;
    cursor = tenants[tenants.length - 1].id;

    for (const tenant of tenants) {
      const segments = await prisma.guestSegment.findMany({
        where: { tenantId: tenant.id },
        select: { id: true },
      });

      for (const segment of segments) {
        totalSegments++;
        try {
          const result = await syncSegmentMembers(segment.id, tenant.id);
          totalJoined += result.joined.length;
          totalLeft += result.left.length;

          if (result.joined.length > 0 || result.left.length > 0) {
            log("info", "cron.segment_sync.segment_updated", {
              tenantId: tenant.id,
              segmentId: segment.id,
              joined: result.joined.length,
              left: result.left.length,
            });
          }
        } catch (err) {
          failed++;
          log("error", "cron.segment_sync.segment_failed", {
            tenantId: tenant.id,
            segmentId: segment.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  log("info", "cron.segment_sync.completed", {
    totalSegments,
    totalJoined,
    totalLeft,
    failed,
  });

  return Response.json({
    ok: true,
    totalSegments,
    totalJoined,
    totalLeft,
    failed,
  });
}
