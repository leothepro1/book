export const dynamic = "force-dynamic";

/**
 * Analytics Dashboard API
 * ═══════════════════════
 *
 * GET /api/analytics/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Reads ONLY from AnalyticsDailyMetric — never from AnalyticsEvent or Order.
 * Auth: Clerk admin session via getAuth() + getCurrentTenant().
 * TenantId resolved from authenticated session — never from query params.
 */

import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { log } from "@/app/_lib/logger";

const QuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: Request) {
  try {
    const { userId } = await getAuth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantData = await getCurrentTenant();
    if (!tenantData) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }
    const tenantId = tenantData.tenant.id;

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return Response.json({ error: "Invalid params — from and to required (YYYY-MM-DD)" }, { status: 400 });
    }

    const { from, to } = parsed.data;
    const fromDate = new Date(from + "T00:00:00.000Z");
    const toDate = new Date(to + "T23:59:59.999Z");

    if (fromDate > toDate) {
      return Response.json({ error: "from must be before to" }, { status: 400 });
    }

    // Fetch all metric rows — ONLY from AnalyticsDailyMetric
    const rows = await prisma.analyticsDailyMetric.findMany({
      where: {
        tenantId,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: "asc" },
    });

    // ── Helpers ────────────────────────────────────────────────

    const getRows = (metric: string, dimension: string) =>
      rows.filter((r) => r.metric === metric && r.dimension === dimension);

    const sumValue = (metric: string, dimension: string, dimensionValue: string) =>
      rows
        .filter((r) => r.metric === metric && r.dimension === dimension && r.dimensionValue === dimensionValue)
        .reduce((sum, r) => sum + r.value, 0);

    const timeSeries = (metric: string) =>
      getRows(metric, "TOTAL").map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        value: r.value,
      }));

    // ── Revenue ───────────────────────────────────────────────

    const revenueTotal = sumValue("REVENUE", "TOTAL", "TOTAL");
    const revenueOverTime = timeSeries("REVENUE");

    const channelMap = new Map<string, number>();
    for (const row of getRows("REVENUE", "CHANNEL")) {
      channelMap.set(row.dimensionValue, (channelMap.get(row.dimensionValue) ?? 0) + row.value);
    }
    const revenueByChannel = Array.from(channelMap.entries())
      .map(([channel, value]) => ({ channel, value }))
      .sort((a, b) => b.value - a.value);

    // ── Sessions ──────────────────────────────────────────────

    const sessionsTotal = sumValue("SESSIONS", "TOTAL", "TOTAL");
    const sessionsOverTime = timeSeries("SESSIONS");

    const cityMap = new Map<string, number>();
    for (const row of getRows("SESSIONS", "CITY")) {
      cityMap.set(row.dimensionValue, (cityMap.get(row.dimensionValue) ?? 0) + row.value);
    }
    const sessionsByCity = Array.from(cityMap.entries())
      .map(([city, sessions]) => ({ city, sessions }))
      .sort((a, b) => b.sessions - a.sessions);

    const deviceMap = new Map<string, number>();
    for (const row of getRows("SESSIONS", "DEVICE")) {
      deviceMap.set(row.dimensionValue, (deviceMap.get(row.dimensionValue) ?? 0) + row.value);
    }
    const sessionsByDevice = Array.from(deviceMap.entries())
      .map(([device, sessions]) => ({ device, sessions }));

    // ── Orders ────────────────────────────────────────────────

    const ordersTotal = sumValue("ORDERS", "TOTAL", "TOTAL");
    const ordersOverTime = timeSeries("ORDERS");

    // ── AOV (weighted average) ────────────────────────────────

    const aovRows = getRows("AVERAGE_ORDER_VALUE", "TOTAL");
    const ordersRows = getRows("ORDERS", "TOTAL");
    let weightedAov = 0;
    if (ordersTotal > 0) {
      const totalWeightedRevenue = aovRows.reduce((sum, row) => {
        const dateStr = row.date.toISOString().slice(0, 10);
        const ordersForDay = ordersRows.find(
          (r) => r.date.toISOString().slice(0, 10) === dateStr,
        )?.value ?? 0;
        return sum + row.value * ordersForDay;
      }, 0);
      weightedAov = Math.round(totalWeightedRevenue / ordersTotal);
    }
    const aovOverTime = timeSeries("AVERAGE_ORDER_VALUE");

    // ── Returning customer rate (weighted) ────────────────────

    const rcRows = getRows("RETURNING_CUSTOMER_RATE", "TOTAL");
    let weightedReturningRate = 0;
    if (ordersTotal > 0) {
      const totalWeightedRate = rcRows.reduce((sum, row) => {
        const dateStr = row.date.toISOString().slice(0, 10);
        const ordersForDay = ordersRows.find(
          (r) => r.date.toISOString().slice(0, 10) === dateStr,
        )?.value ?? 0;
        return sum + row.value * ordersForDay;
      }, 0);
      weightedReturningRate = Math.round(totalWeightedRate / ordersTotal);
    }
    const returningRateOverTime = timeSeries("RETURNING_CUSTOMER_RATE");

    // ── Revenue by product ────────────────────────────────────

    const productMap = new Map<string, number>();
    for (const row of getRows("REVENUE", "PRODUCT")) {
      productMap.set(row.dimensionValue, (productMap.get(row.dimensionValue) ?? 0) + row.value);
    }
    const revenueByProduct = Array.from(productMap.entries())
      .map(([productId, value]) => ({ productId, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    return Response.json({
      ok: true,
      period: { from, to },
      summary: {
        revenue: revenueTotal,
        sessions: sessionsTotal,
        orders: ordersTotal,
        averageOrderValue: weightedAov,
        returningCustomerRate: weightedReturningRate,
        visitors: sumValue("VISITORS", "TOTAL", "TOTAL"),
      },
      charts: {
        revenueOverTime,
        sessionsOverTime,
        ordersOverTime,
        aovOverTime,
        returningRateOverTime,
      },
      breakdowns: {
        revenueByChannel,
        sessionsByCity,
        sessionsByDevice,
        revenueByProduct,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "analytics.dashboard.failed", { error: msg });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
