export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — matches Vercel Pro limit

/**
 * Cron: Analytics Daily Aggregation
 * ═════════════════════════════════
 *
 * Runs every 5 minutes. Aggregates yesterday (complete) + today (partial, idempotent).
 * Processes all tenants with analytics events or orders.
 * Tenants are processed in parallel batches of 5 for performance.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { aggregateDay } from "@/app/_lib/analytics/aggregation";
import { log } from "@/app/_lib/logger";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  try {
    const activeTenants = await prisma.tenant.findMany({
      select: { id: true },
      where: {
        OR: [
          { analyticsEvents: { some: {} } },
          { orders: { some: {} } },
        ],
      },
    });

    const results: { date: string; tenantId: string; rowsWritten: number; errors: string[] }[] = [];

    // Process tenants in parallel batches of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < activeTenants.length; i += BATCH_SIZE) {
      const batch = activeTenants.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.flatMap((tenant) => [
          aggregateDay(tenant.id, yesterday),
          aggregateDay(tenant.id, today),
        ]),
      );
      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            date: "",
            tenantId: "",
            rowsWritten: 0,
            errors: [result.reason?.message ?? "Unknown error"],
          });
        }
      }
    }

    const totalRows = results.reduce((sum, r) => sum + r.rowsWritten, 0);
    const errors = results.flatMap((r) => r.errors);

    log("info", "cron.aggregate_analytics.complete", {
      tenants: activeTenants.length,
      totalRows,
      errorCount: errors.length,
    });

    return Response.json({
      ok: true,
      tenants: activeTenants.length,
      totalRows,
      errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "cron.aggregate_analytics.failed", { error: msg });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
