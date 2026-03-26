/**
 * App Health Monitoring — Server actions + check logic.
 *
 * checkAppHealth() is the ONLY function that writes to TenantAppHealth.
 * TenantAppHealthHistory is append-only — never UPDATE, never DELETE.
 * 3 consecutive UNHEALTHY checks → TenantApp.status = ERROR.
 * PAUSED apps are never health-checked.
 * Apps without healthCheck config are always considered HEALTHY.
 */

"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getApp } from "./registry";
import type { HealthStatus } from "./types";

// Import all app definitions
import "./definitions";

// ── Types ───────────────────────────────────────────────────────

export type AppHealthState = {
  status: HealthStatus;
  latencyMs: number | null;
  message: string | null;
  lastCheckedAt: string | null;
  consecutiveFailures: number;
};

export type HealthHistoryDay = {
  date: string; // YYYY-MM-DD
  status: "healthy" | "degraded" | "unhealthy" | "none";
};

// ── Check App Health (called by cron + manual trigger) ──────────

const CONSECUTIVE_FAILURE_THRESHOLD = 3;

export async function checkAppHealth(
  tenantId: string,
  appId: string,
  internalApiSecret: string,
): Promise<AppHealthState> {
  const app = getApp(appId);
  if (!app?.healthCheck) {
    return { status: "HEALTHY", latencyMs: null, message: null, lastCheckedAt: null, consecutiveFailures: 0 };
  }

  const hc = app.healthCheck;
  const now = new Date();
  let status: HealthStatus = "HEALTHY";
  let latencyMs: number | null = null;
  let message: string | null = null;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const url = `${baseUrl}${hc.endpoint}?tenantId=${tenantId}&appId=${appId}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), hc.timeoutMs);

    const start = Date.now();
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${internalApiSecret}` },
      signal: controller.signal,
    });
    latencyMs = Date.now() - start;
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      status = "UNHEALTHY";
      message = body.slice(0, 500) || `HTTP ${res.status}`;
    } else if (latencyMs > hc.degradedThresholdMs) {
      status = "DEGRADED";
      message = `Svarstid ${latencyMs}ms överstiger tröskelvärdet ${hc.degradedThresholdMs}ms`;
    }
  } catch (err) {
    status = "UNHEALTHY";
    message = err instanceof Error ? err.message : "Anslutningsfel";
    if (err instanceof Error && err.name === "AbortError") {
      message = `Timeout efter ${hc.timeoutMs}ms`;
    }
  }

  // Upsert health state — atomic operation
  // DEGRADED should NOT reset consecutive failures (only HEALTHY resets)
  const nextCheckAt = new Date(now.getTime() + hc.intervalMinutes * 60 * 1000);

  const baseData = { status, latencyMs, message, lastCheckedAt: now, nextCheckAt };

  const existing = await prisma.tenantAppHealth.upsert({
    where: { tenantId_appId: { tenantId, appId } },
    create: {
      tenantId,
      appId,
      ...baseData,
      consecutiveFailures: status === "UNHEALTHY" ? 1 : 0,
    },
    update: {
      ...baseData,
      consecutiveFailures: status === "HEALTHY"
        ? 0                       // HEALTHY: reset counter
        : status === "UNHEALTHY"
          ? { increment: 1 }      // UNHEALTHY: atomic increment
          : undefined,            // DEGRADED: leave unchanged
    },
  });

  // Append to history
  await prisma.tenantAppHealthHistory.create({
    data: { tenantId, appId, status, latencyMs, message },
  });

  // Re-read consecutive failures after atomic update
  const currentHealth = existing;

  // 3 consecutive failures → set TenantApp.status = ERROR
  if (currentHealth.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
    const tenantApp = await prisma.tenantApp.findUnique({
      where: { tenantId_appId: { tenantId, appId } },
    });
    if (tenantApp && tenantApp.status === "ACTIVE") {
      await prisma.tenantApp.update({
        where: { id: tenantApp.id },
        data: { status: "ERROR", errorMessage: message },
      });
      await prisma.tenantAppEvent.create({
        data: {
          appId,
          tenantId,
          type: "ERROR_OCCURRED",
          message: `Hälsokontroll misslyckades ${currentHealth.consecutiveFailures} gånger i rad: ${message}`,
        },
      });
    }
  }

  // If now healthy and app is in ERROR → resolve
  if (status === "HEALTHY") {
    const tenantApp = await prisma.tenantApp.findUnique({
      where: { tenantId_appId: { tenantId, appId } },
    });
    if (tenantApp && tenantApp.status === "ERROR") {
      await prisma.tenantApp.update({
        where: { id: tenantApp.id },
        data: { status: "ACTIVE", errorMessage: null },
      });
      await prisma.tenantAppEvent.create({
        data: { appId, tenantId, type: "ERROR_RESOLVED", message: "Hälsokontroll återställd" },
      });
    }
  }

  return {
    status,
    latencyMs,
    message,
    lastCheckedAt: now.toISOString(),
    consecutiveFailures: existing.consecutiveFailures,
  };
}

// ── Manual Trigger (UI button) ──────────────────────────────────

export async function triggerHealthCheck(appId: string): Promise<AppHealthState | null> {
  const auth = await requireAdmin();
  if (!auth.ok) return null;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const app = getApp(appId);
  if (!app?.healthCheck) return null;

  // Use INTERNAL_API_SECRET lazily — only when actually triggering
  let secret: string;
  try {
    const { env } = await import("@/app/_lib/env");
    secret = env.INTERNAL_API_SECRET;
  } catch {
    return {
      status: "UNHEALTHY",
      latencyMs: null,
      message: "INTERNAL_API_SECRET ej konfigurerad",
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: 0,
    };
  }

  return checkAppHealth(tenantData.tenant.id, appId, secret);
}

// ── Read Health State ───────────────────────────────────────────

export async function getAppHealth(appId: string): Promise<AppHealthState | null> {
  const auth = await requireAdmin();
  if (!auth.ok) return null;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const app = getApp(appId);
  if (!app?.healthCheck) return null; // No health check configured

  const health = await prisma.tenantAppHealth.findUnique({
    where: { tenantId_appId: { tenantId: tenantData.tenant.id, appId } },
  });

  if (!health) {
    return { status: "UNCHECKED", latencyMs: null, message: null, lastCheckedAt: null, consecutiveFailures: 0 };
  }

  return {
    status: health.status as HealthStatus,
    latencyMs: health.latencyMs,
    message: health.message,
    lastCheckedAt: health.lastCheckedAt?.toISOString() ?? null,
    consecutiveFailures: health.consecutiveFailures,
  };
}

// ── Health History (30-day uptime chart) ─────────────────────────

export async function getAppHealthHistory(appId: string): Promise<HealthHistoryDay[]> {
  const auth = await requireAdmin();
  if (!auth.ok) return [];

  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const history = await prisma.tenantAppHealthHistory.findMany({
    where: {
      tenantId: tenantData.tenant.id,
      appId,
      checkedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { checkedAt: "asc" },
    select: { status: true, checkedAt: true },
  });

  // Group by day
  const dayMap = new Map<string, string[]>();
  for (const h of history) {
    const day = h.checkedAt.toISOString().slice(0, 10);
    const arr = dayMap.get(day) ?? [];
    arr.push(h.status);
    dayMap.set(day, arr);
  }

  // Build 30-day array
  const result: HealthHistoryDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const statuses = dayMap.get(key);

    if (!statuses || statuses.length === 0) {
      result.push({ date: key, status: "none" });
    } else if (statuses.includes("UNHEALTHY")) {
      result.push({ date: key, status: "unhealthy" });
    } else if (statuses.includes("DEGRADED")) {
      result.push({ date: key, status: "degraded" });
    } else {
      result.push({ date: key, status: "healthy" });
    }
  }

  return result;
}

// ── Bulk Health for App Store page ──────────────────────────────

export type AppHealthSummary = {
  appId: string;
  status: HealthStatus;
};

export async function getHealthForApps(): Promise<AppHealthSummary[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const healthRecords = await prisma.tenantAppHealth.findMany({
    where: { tenantId: tenantData.tenant.id },
    select: { appId: true, status: true },
  });

  return healthRecords.map((h) => ({
    appId: h.appId,
    status: h.status as HealthStatus,
  }));
}
