/**
 * Analytics Aggregation Engine
 * ════════════════════════════
 *
 * aggregateDay() computes all AnalyticsDailyMetric rows for a single tenant × date.
 * Fully idempotent — upserts all rows, safe to call multiple times.
 *
 * Data sources:
 * - Revenue, orders, AOV, returning customer rate → Order (financialStatus = PAID)
 * - Sessions, visitors → AnalyticsEvent
 * - Channel breakdown → Order.sourceChannel
 * - City breakdown → AnalyticsEvent + AnalyticsLocation
 * - Device breakdown → AnalyticsEvent.deviceType
 * - Product breakdown → OrderLineItem
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import type { AnalyticsMetric, AnalyticsDimension, Prisma } from "@prisma/client";

export type AggregationResult = {
  date: string;
  tenantId: string;
  rowsWritten: number;
  errors: string[];
};

export async function aggregateDay(
  tenantId: string,
  date: Date,
): Promise<AggregationResult> {
  const result: AggregationResult = {
    date: date.toISOString().slice(0, 10),
    tenantId,
    rowsWritten: 0,
    errors: [],
  };

  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setUTCHours(23, 59, 59, 999);

  try {
    // ── 1. Commerce metrics from Order ────────────────────────────

    const paidOrders = await prisma.order.findMany({
      where: {
        tenantId,
        financialStatus: "PAID",
        paidAt: { gte: dayStart, lte: dayEnd },
      },
      select: {
        id: true,
        totalAmount: true,
        currency: true,
        sourceChannel: true,
        guestAccountId: true,
        lineItems: {
          select: { productId: true, title: true, totalAmount: true },
        },
      },
    });

    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalOrders = paidOrders.length;
    const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Returning customer rate
    let returningOrders = 0;
    if (totalOrders > 0) {
      const guestAccountIds = paidOrders
        .map((o) => o.guestAccountId)
        .filter((id): id is string => id !== null);

      if (guestAccountIds.length > 0) {
        const returningGuests = await prisma.order.groupBy({
          by: ["guestAccountId"],
          where: {
            tenantId,
            financialStatus: "PAID",
            guestAccountId: { in: guestAccountIds },
            paidAt: { lt: dayStart },
          },
          _count: { id: true },
        });

        const returningGuestIds = new Set(
          returningGuests
            .filter((g) => g.guestAccountId !== null)
            .map((g) => g.guestAccountId as string),
        );

        returningOrders = paidOrders.filter(
          (o) => o.guestAccountId && returningGuestIds.has(o.guestAccountId),
        ).length;
      }
    }

    const returningCustomerRate =
      totalOrders > 0 ? Math.round((returningOrders / totalOrders) * 10000) : 0;

    // Revenue + orders by channel
    const revenueByChannel = new Map<string, number>();
    const ordersByChannel = new Map<string, number>();
    for (const order of paidOrders) {
      const channel = order.sourceChannel ?? "direct";
      revenueByChannel.set(channel, (revenueByChannel.get(channel) ?? 0) + order.totalAmount);
      ordersByChannel.set(channel, (ordersByChannel.get(channel) ?? 0) + 1);
    }

    // Revenue by product
    const revenueByProduct = new Map<string, number>();
    for (const order of paidOrders) {
      for (const item of order.lineItems) {
        revenueByProduct.set(item.productId, (revenueByProduct.get(item.productId) ?? 0) + item.totalAmount);
      }
    }

    // ── 2. Session metrics from AnalyticsEvent ────────────────────

    const sessionEvents = await prisma.analyticsEvent.findMany({
      where: {
        tenantId,
        occurredAt: { gte: dayStart, lte: dayEnd },
        eventType: { in: ["SESSION_STARTED", "PAGE_VIEWED"] },
      },
      select: {
        sessionId: true,
        visitorId: true,
        deviceType: true,
        location: { select: { city: true } },
      },
    });

    const uniqueSessionIds = new Set(sessionEvents.map((e) => e.sessionId));
    const uniqueVisitorIds = new Set(
      sessionEvents.filter((e) => e.visitorId !== "server").map((e) => e.visitorId),
    );

    const totalSessions = uniqueSessionIds.size;
    const totalVisitors = uniqueVisitorIds.size;

    // Sessions by device
    const sessionsByDevice = new Map<string, Set<string>>();
    for (const event of sessionEvents) {
      const device = event.deviceType ?? "DESKTOP";
      if (!sessionsByDevice.has(device)) sessionsByDevice.set(device, new Set());
      sessionsByDevice.get(device)!.add(event.sessionId);
    }

    // Sessions by city
    const sessionsByCity = new Map<string, Set<string>>();
    for (const event of sessionEvents) {
      const city = event.location?.city ?? null;
      if (!city) continue;
      if (!sessionsByCity.has(city)) sessionsByCity.set(city, new Set());
      sessionsByCity.get(city)!.add(event.sessionId);
    }

    // ── 3. Build metric rows ──────────────────────────────────────

    type MetricRow = {
      tenantId: string;
      date: Date;
      metric: AnalyticsMetric;
      dimension: AnalyticsDimension;
      dimensionValue: string;
      value: number;
    };

    const rows: MetricRow[] = [];

    const addRow = (metric: AnalyticsMetric, dimension: AnalyticsDimension, dimensionValue: string, value: number) => {
      rows.push({ tenantId, date: dayStart, metric, dimension, dimensionValue, value });
    };

    // Revenue
    addRow("REVENUE", "TOTAL", "TOTAL", totalRevenue);
    for (const [channel, revenue] of revenueByChannel) {
      addRow("REVENUE", "CHANNEL", channel, revenue);
    }
    for (const [productId, revenue] of revenueByProduct) {
      addRow("REVENUE", "PRODUCT", productId, revenue);
    }

    // Orders
    addRow("ORDERS", "TOTAL", "TOTAL", totalOrders);
    for (const [channel, count] of ordersByChannel) {
      addRow("ORDERS", "CHANNEL", channel, count);
    }

    // AOV
    addRow("AVERAGE_ORDER_VALUE", "TOTAL", "TOTAL", aov);

    // Returning customer rate
    addRow("RETURNING_CUSTOMER_RATE", "TOTAL", "TOTAL", returningCustomerRate);

    // Sessions
    addRow("SESSIONS", "TOTAL", "TOTAL", totalSessions);
    for (const [device, sessions] of sessionsByDevice) {
      addRow("SESSIONS", "DEVICE", device, sessions.size);
    }
    for (const [city, sessions] of sessionsByCity) {
      addRow("SESSIONS", "CITY", city, sessions.size);
    }

    // Visitors
    addRow("VISITORS", "TOTAL", "TOTAL", totalVisitors);

    // ── 4. Upsert all rows ────────────────────────────────────────

    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      await Promise.all(
        batch.map((row) =>
          prisma.analyticsDailyMetric.upsert({
            where: {
              tenantId_date_metric_dimension_dimensionValue: {
                tenantId: row.tenantId,
                date: row.date,
                metric: row.metric,
                dimension: row.dimension,
                dimensionValue: row.dimensionValue,
              },
            },
            create: row,
            update: { value: row.value },
          }),
        ),
      );
    }

    result.rowsWritten = rows.length;

    log("info", "analytics.aggregate_day.complete", {
      tenantId,
      date: result.date,
      rowsWritten: result.rowsWritten,
      totalRevenue,
      totalOrders,
      totalSessions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "analytics.aggregate_day.failed", { tenantId, date: result.date, error: msg });
    result.errors.push(msg);
  }

  return result;
}
