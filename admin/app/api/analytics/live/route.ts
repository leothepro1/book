export const dynamic = "force-dynamic";

/**
 * Analytics Live View API
 * ═══════════════════════
 *
 * GET /api/analytics/live
 *
 * Real-time data for the Live View dashboard.
 * Reads directly from AnalyticsEvent and Order — NOT from AnalyticsDailyMetric.
 * Polled every 5 seconds from admin browser.
 *
 * Time windows:
 *   "now" metrics  → last 5 minutes (active visitors, globe, city list)
 *   "today" metrics → since UTC midnight (sessions, orders, revenue)
 *   "funnel" metrics → last 30 minutes (carts, checkout, purchased)
 */

import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { log } from "@/app/_lib/logger";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const { userId } = await getAuth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }

    const tenantData = await getCurrentTenant();
    if (!tenantData) {
      return Response.json({ error: "Tenant not found" }, { status: 404, headers: NO_STORE });
    }
    const tenantId = tenantData.tenant.id;

    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const utcMidnight = new Date(now);
    utcMidnight.setUTCHours(0, 0, 0, 0);

    // ── 1. Active visitors NOW (last 5 min) — SINGLE SOURCE OF TRUTH ──
    // This ONE query drives: visitorsNow, globePoints, and sessionsByCity.
    // All three are mathematically derived from the same event set.
    const activeWithGeo = await prisma.analyticsEvent.findMany({
      where: {
        tenantId,
        occurredAt: { gte: fiveMinAgo },
        visitorId: { not: "server" },
        locationId: { not: null },
      },
      select: {
        visitorId: true,
        location: { select: { city: true, country: true, lat: true, lng: true } },
      },
      distinct: ["visitorId"],
    });

    // Visitors without geo — still count toward visitorsNow but no pin/city
    const activeNoGeo = await prisma.analyticsEvent.findMany({
      where: {
        tenantId,
        occurredAt: { gte: fiveMinAgo },
        visitorId: { not: "server" },
        locationId: null,
      },
      select: { visitorId: true },
      distinct: ["visitorId"],
    });

    // Deduplicate: visitors with geo already deduped by distinct, but
    // some no-geo visitors might also appear in with-geo set
    const geoVisitorIds = new Set(activeWithGeo.map((e) => e.visitorId));
    const noGeoOnlyCount = activeNoGeo.filter((e) => !geoVisitorIds.has(e.visitorId)).length;
    const visitorsNow = geoVisitorIds.size + noGeoOnlyCount;

    // Group by city — one pin per city, count visitors per city
    const cityMap = new Map<string, { lat: number; lng: number; city: string; country: string; count: number }>();
    for (const event of activeWithGeo) {
      if (!event.location) continue;
      const key = `${event.location.city},${event.location.country}`;
      const existing = cityMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        cityMap.set(key, {
          lat: event.location.lat,
          lng: event.location.lng,
          city: event.location.city,
          country: event.location.country,
          count: 1,
        });
      }
    }

    const globePoints = Array.from(cityMap.values());
    const sessionsByCity = globePoints
      .map((p) => ({ city: p.city, sessions: p.count }))
      .sort((a, b) => b.sessions - a.sessions);

    // ── 2. Today's orders — since UTC midnight ──
    const todayOrders = await prisma.order.findMany({
      where: { tenantId, financialStatus: "PAID", paidAt: { gte: utcMidnight } },
      select: {
        id: true,
        totalAmount: true,
        lineItems: { select: { productId: true, title: true, totalAmount: true } },
      },
    });

    const revenueToday = todayOrders.reduce((s, o) => s + o.totalAmount, 0);

    // ── 3. Sessions today — since UTC midnight, dedup by sessionId ──
    const todaySessions = await prisma.analyticsEvent.findMany({
      where: { tenantId, occurredAt: { gte: utcMidnight }, visitorId: { not: "server" } },
      select: { sessionId: true, visitorId: true },
      distinct: ["sessionId"],
    });

    const sessionsToday = todaySessions.length;
    const visitorsToday = new Set(todaySessions.map((e) => e.visitorId)).size;

    // ── 4. Funnel — last 30 minutes (rolling window) ──
    const funnelEvents = await prisma.analyticsEvent.findMany({
      where: {
        tenantId,
        occurredAt: { gte: thirtyMinAgo },
        eventType: { in: ["ADDON_ADDED", "CHECKOUT_STARTED", "CHECKOUT_COMPLETED"] },
        visitorId: { not: "server" },
      },
      select: { sessionId: true, eventType: true },
    });

    const cartsActive = new Set(funnelEvents.filter((e) => e.eventType === "ADDON_ADDED").map((e) => e.sessionId)).size;
    const inCheckout = new Set(funnelEvents.filter((e) => e.eventType === "CHECKOUT_STARTED").map((e) => e.sessionId)).size;
    const purchased = new Set(funnelEvents.filter((e) => e.eventType === "CHECKOUT_COMPLETED").map((e) => e.sessionId)).size;

    // ── 5. Revenue by product today — since UTC midnight ──
    const productMap = new Map<string, { title: string; revenue: number }>();
    for (const order of todayOrders) {
      for (const item of order.lineItems) {
        const existing = productMap.get(item.productId);
        productMap.set(item.productId, {
          title: item.title,
          revenue: (existing?.revenue ?? 0) + item.totalAmount,
        });
      }
    }

    return Response.json({
      ok: true,
      updatedAt: now.toISOString(),
      now: {
        visitorsNow,
        globePoints,
      },
      today: {
        revenue: revenueToday,
        sessions: sessionsToday,
        orders: todayOrders.length,
        visitors: visitorsToday,
      },
      funnel: {
        cartsActive,
        inCheckout,
        purchased,
      },
      map: {
        sessionsByCity,
      },
      products: {
        revenueByProduct: Array.from(productMap.entries())
          .map(([productId, { title, revenue }]) => ({ productId, title, revenue }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10),
      },
    }, { headers: NO_STORE });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "analytics.live.failed", { error: msg });
    return Response.json({ error: "Internal error" }, { status: 500, headers: NO_STORE });
  }
}
