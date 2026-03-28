export const dynamic = "force-dynamic";

/**
 * Cron: RUM Daily Aggregation v2
 * ══════════════════════════════
 *
 * Runs daily at 01:00 UTC. Aggregates yesterday's raw events into
 * daily summaries. P75 from raw data, unique sessions by sessionId.
 * Cleans up: raw events >30d, aggregates >90d, rate limits >5min.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { aggregateTenantDay, cleanupRumData } from "@/app/_lib/rum/aggregate";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);

  let succeeded = 0;
  let failed = 0;
  let cursor: string | undefined;
  const batchSize = 50;

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
      try {
        await aggregateTenantDay(tenant.id, yesterday);
        succeeded++;
      } catch (err) {
        failed++;
        log("error", "cron.rum_aggregate.tenant_failed", {
          tenantId: tenant.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const cleanup = await cleanupRumData();

  log("info", "cron.rum_aggregate.completed", { succeeded, failed, ...cleanup });

  return Response.json({ ok: true, succeeded, failed, cleanup });
}
