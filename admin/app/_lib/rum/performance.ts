"use server";

/**
 * Portal Performance — P75 from raw data over 30 days.
 *
 * getPortalPerformance() is the ONLY entry point for admin UI.
 * P75 calculated on full raw dataset — not aggregated approximation.
 * 50-session threshold before showing any metrics.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { calculateP75 } from "./aggregate";

export interface MetricResult {
  p75: number;
  rating: "good" | "needs-improvement" | "poor";
  goodPct: number;
  needsWorkPct: number;
  poorPct: number;
}

export interface PerformanceResult {
  hasEnoughData: boolean;
  totalSessions: number;
  lcp: MetricResult | null;
  inp: MetricResult | null;
  cls: MetricResult | null;
  sessionsByDevice: {
    desktop: number;
    mobile: number;
    tablet: number;
    other: number;
  };
}

const SESSION_THRESHOLD = 50;

function buildMetric(
  values: number[],
  goodMax: number,
  poorMin: number,
): MetricResult | null {
  const p75 = calculateP75(values);
  if (p75 === null) return null;

  const total = values.length;
  const good = values.filter((v) => v < goodMax).length;
  const poor = values.filter((v) => v > poorMin).length;
  const needsWork = total - good - poor;

  let rating: MetricResult["rating"];
  if (p75 < goodMax) rating = "good";
  else if (p75 <= poorMin) rating = "needs-improvement";
  else rating = "poor";

  return {
    p75,
    rating,
    goodPct: total > 0 ? Math.round((good / total) * 100) : 0,
    needsWorkPct: total > 0 ? Math.round((needsWork / total) * 100) : 0,
    poorPct: total > 0 ? Math.round((poor / total) * 100) : 0,
  };
}

export async function getPortalPerformance(
  tenantId: string,
  days: 1 | 7 | 30 = 30,
): Promise<PerformanceResult> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const events = await prisma.rumEvent.findMany({
    where: { tenantId, createdAt: { gte: since } },
    select: { lcp: true, inp: true, cls: true, sessionId: true, deviceType: true, isHardReload: true },
  });

  // Unique sessions
  const sessionDevices = new Map<string, string>();
  for (const e of events) {
    if (!sessionDevices.has(e.sessionId)) sessionDevices.set(e.sessionId, e.deviceType);
  }

  const totalSessions = sessionDevices.size;
  let desktop = 0, mobile = 0, tablet = 0, other = 0;
  for (const dt of sessionDevices.values()) {
    switch (dt) {
      case "desktop": desktop++; break;
      case "mobile": mobile++; break;
      case "tablet": tablet++; break;
      default: other++; break;
    }
  }

  if (totalSessions < SESSION_THRESHOLD) {
    return {
      hasEnoughData: false,
      totalSessions,
      lcp: null,
      inp: null,
      cls: null,
      sessionsByDevice: { desktop, mobile, tablet, other },
    };
  }

  // P75 on raw data
  const lcpValues = events.filter((e) => e.isHardReload && e.lcp != null).map((e) => e.lcp!);
  const inpValues = events.filter((e) => e.inp != null).map((e) => e.inp!);
  const clsValues = events.filter((e) => e.cls != null).map((e) => e.cls!);

  return {
    hasEnoughData: true,
    totalSessions,
    lcp: buildMetric(lcpValues, 2500, 4000),
    inp: buildMetric(inpValues, 200, 500),
    cls: buildMetric(clsValues, 0.1, 0.25),
    sessionsByDevice: { desktop, mobile, tablet, other },
  };
}
