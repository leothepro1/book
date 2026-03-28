/**
 * RUM Aggregation v2 — P75 on raw data, unique sessions.
 *
 * calculateP75() — exact percentile on raw values.
 * aggregateTenantDay() — one tenant, one day → upsert aggregate.
 * cleanupRumData() — raw events 30d, aggregates 90d, rate limits 5min.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

const MIN_SAMPLES = 10;

export function calculateP75(values: number[]): number | null {
  if (values.length < MIN_SAMPLES) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.75) - 1;
  return Math.round(sorted[idx] * 100) / 100;
}

function lcpBucket(v: number): "good" | "needsWork" | "poor" {
  if (v < 2500) return "good";
  if (v <= 4000) return "needsWork";
  return "poor";
}

function inpBucket(v: number): "good" | "needsWork" | "poor" {
  if (v < 200) return "good";
  if (v <= 500) return "needsWork";
  return "poor";
}

function clsBucket(v: number): "good" | "needsWork" | "poor" {
  if (v < 0.1) return "good";
  if (v <= 0.25) return "needsWork";
  return "poor";
}

export async function aggregateTenantDay(tenantId: string, date: Date): Promise<void> {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const events = await prisma.rumEvent.findMany({
    where: { tenantId, occurredAt: { gte: dayStart, lt: dayEnd } },
    select: { lcp: true, inp: true, cls: true, sessionId: true, deviceType: true, isHardReload: true },
  });

  if (events.length === 0) return;

  // Unique sessions per device type
  const sessionDevices = new Map<string, string>(); // sessionId → first deviceType
  for (const e of events) {
    if (!sessionDevices.has(e.sessionId)) sessionDevices.set(e.sessionId, e.deviceType);
  }

  let sessions = 0, sessionsDesktop = 0, sessionsMobile = 0, sessionsTablet = 0, sessionsOther = 0;
  for (const dt of sessionDevices.values()) {
    sessions++;
    switch (dt) {
      case "desktop": sessionsDesktop++; break;
      case "mobile": sessionsMobile++; break;
      case "tablet": sessionsTablet++; break;
      default: sessionsOther++; break;
    }
  }

  // LCP — hard reload only
  const lcpValues = events.filter((e) => e.isHardReload && e.lcp != null).map((e) => e.lcp!);
  const lcpGood = lcpValues.filter((v) => lcpBucket(v) === "good").length;
  const lcpNeedsWork = lcpValues.filter((v) => lcpBucket(v) === "needsWork").length;
  const lcpPoor = lcpValues.filter((v) => lcpBucket(v) === "poor").length;

  // INP — all events
  const inpValues = events.filter((e) => e.inp != null).map((e) => e.inp!);
  const inpGood = inpValues.filter((v) => inpBucket(v) === "good").length;
  const inpNeedsWork = inpValues.filter((v) => inpBucket(v) === "needsWork").length;
  const inpPoor = inpValues.filter((v) => inpBucket(v) === "poor").length;

  // CLS — all events
  const clsValues = events.filter((e) => e.cls != null).map((e) => e.cls!);
  const clsGood = clsValues.filter((v) => clsBucket(v) === "good").length;
  const clsNeedsWork = clsValues.filter((v) => clsBucket(v) === "needsWork").length;
  const clsPoor = clsValues.filter((v) => clsBucket(v) === "poor").length;

  await prisma.rumDailyAggregate.upsert({
    where: { tenantId_date: { tenantId, date: dayStart } },
    create: {
      tenantId, date: dayStart,
      sessions, sessionsDesktop, sessionsMobile, sessionsTablet, sessionsOther,
      lcpP75: calculateP75(lcpValues), lcpGoodCount: lcpGood, lcpNeedsWork, lcpPoor, lcpCount: lcpValues.length,
      inpP75: calculateP75(inpValues), inpGoodCount: inpGood, inpNeedsWork, inpPoor, inpCount: inpValues.length,
      clsP75: calculateP75(clsValues), clsGoodCount: clsGood, clsNeedsWork, clsPoor, clsCount: clsValues.length,
    },
    update: {
      sessions, sessionsDesktop, sessionsMobile, sessionsTablet, sessionsOther,
      lcpP75: calculateP75(lcpValues), lcpGoodCount: lcpGood, lcpNeedsWork, lcpPoor, lcpCount: lcpValues.length,
      inpP75: calculateP75(inpValues), inpGoodCount: inpGood, inpNeedsWork, inpPoor, inpCount: inpValues.length,
      clsP75: calculateP75(clsValues), clsGoodCount: clsGood, clsNeedsWork, clsPoor, clsCount: clsValues.length,
    },
  });
}

export async function cleanupRumData(): Promise<{ rawDeleted: number; aggregatesDeleted: number; rateLimitsDeleted: number }> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const fiveMinAgo = new Date();
  fiveMinAgo.setMinutes(fiveMinAgo.getMinutes() - 5);

  const [rawResult, aggResult, rlResult] = await Promise.all([
    prisma.rumEvent.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
    prisma.rumDailyAggregate.deleteMany({ where: { date: { lt: ninetyDaysAgo } } }),
    prisma.rumRateLimit.deleteMany({ where: { windowStart: { lt: fiveMinAgo } } }),
  ]);

  log("info", "rum.cleanup", { rawDeleted: rawResult.count, aggregatesDeleted: aggResult.count, rateLimitsDeleted: rlResult.count });
  return { rawDeleted: rawResult.count, aggregatesDeleted: aggResult.count, rateLimitsDeleted: rlResult.count };
}
