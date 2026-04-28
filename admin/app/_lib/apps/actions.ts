/**
 * App Store — Server actions for install lifecycle.
 *
 * All functions use requireAdmin() + getCurrentTenant().
 * tenantId is NEVER from request body — resolved from auth.
 * TenantAppEvent is append-only — never UPDATE, never DELETE.
 */

"use server";

import { prisma } from "@/app/_lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getApp } from "./registry";
import { getSetupStatus } from "./setup";
import { startWizard } from "./wizard";
import type { InstallResult, AppStatus, AppCategory, AppPage } from "./types";
import { log } from "@/app/_lib/logger";

// Import all app definitions
import "./definitions";

// ── Helpers ─────────────────────────────────────────────────────

async function resolveTenantId(): Promise<string | null> {
  const tenantData = await getCurrentTenant();
  return tenantData?.tenant.id ?? null;
}

// ── Sidebar Data (lightweight, for server layout) ───────────────

/**
 * One sub-item under a sidebar app (or sales-channel) in the admin.
 * When an app declares sub-items, the sidebar renders the item as an
 * accordion using the same chevron + CSS as Produkter / Boenden /
 * Webbshop. Absence of `subItems` keeps the flat rendering.
 */
export type SidebarAppSubItem = {
  /** Absolute route path — must start with `/`. */
  href: string;
  label: string;
};

export type SidebarApp = {
  appId: string;
  name: string;
  icon: string;
  iconUrl?: string;
  category: AppCategory;
  isSalesChannel: boolean;
  channelHandle?: string;
  /**
   * Optional accordion sub-items rendered under this app's sidebar
   * entry. Empty or undefined → flat link (current default).
   */
  subItems?: SidebarAppSubItem[];
  /**
   * Pages declared by the app (mirrors `AppDefinition.pages`). When
   * length ≥ 2 the app becomes a sidebar drill-in section: clicking
   * the row navigates to the first page AND opens a sub-nav listing
   * each declared page.
   */
  pages?: AppPage[];
};

/**
 * Fetch ACTIVE apps for the sidebar. Lightweight — no auth guard,
 * called from the server layout where auth is already resolved.
 */
export async function getActiveAppsForSidebar(): Promise<SidebarApp[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const apps = await prisma.tenantApp.findMany({
    where: { tenantId: tenantData.tenant.id, status: "ACTIVE" },
    select: { appId: true },
    orderBy: { installedAt: "asc" },
  });

  const result: SidebarApp[] = [];
  for (const a of apps) {
    const def = getApp(a.appId);
    if (!def) continue;
    result.push({
      appId: def.id,
      name: def.name,
      icon: def.icon,
      iconUrl: def.iconUrl,
      category: def.category,
      isSalesChannel: !!def.salesChannel,
      channelHandle: def.salesChannel?.handle,
      pages: def.pages,
    });
  }
  return result;
}

// ── Install ─────────────────────────────────────────────────────

export async function installApp(appId: string): Promise<InstallResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  // 1. App exists in registry
  const app = getApp(appId);
  if (!app) return { ok: false, error: `Appen "${appId}" finns inte` };

  // 2. Setup requirements met
  const setup = await getSetupStatus(tenantId);
  for (const req of app.requiredSetup) {
    if (req === "pms" && !setup.pms.complete) {
      return { ok: false, error: "PMS-integration krävs — anslut under Inställningar → Integrationer" };
    }
    if (req === "payments" && !setup.payments.complete) {
      return { ok: false, error: "Betalningar krävs — anslut Stripe under Inställningar → Betalningar" };
    }
  }

  // 3. Dependencies installed
  for (const depId of app.dependencies) {
    const dep = await prisma.tenantApp.findUnique({
      where: { tenantId_appId: { tenantId, appId: depId } },
      select: { status: true },
    });
    if (!dep || dep.status === "UNINSTALLED") {
      const depApp = getApp(depId);
      return {
        ok: false,
        error: `Kräver att "${depApp?.name ?? depId}" är installerad`,
      };
    }
  }

  // 4. Atomic install — transaction prevents race conditions
  const defaultTier = app.pricing.length > 0 ? app.pricing[0].tier : null;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.tenantApp.findUnique({
      where: { tenantId_appId: { tenantId, appId } },
    });

    // Already installed — return existing (idempotent)
    if (existing && existing.status !== "UNINSTALLED") {
      return { tenantApp: existing, isNew: false };
    }

    // Upsert — handles both fresh install and reinstall atomically
    const tenantApp = await tx.tenantApp.upsert({
      where: { tenantId_appId: { tenantId, appId } },
      create: {
        tenantId,
        appId,
        status: "PENDING_SETUP",
        pricingTier: defaultTier,
      },
      update: {
        status: "PENDING_SETUP",
        installedAt: new Date(),
        activatedAt: null,
        errorMessage: null,
        pricingTier: defaultTier,
        settings: {},
      },
    });

    await tx.tenantAppEvent.create({
      data: {
        appId,
        tenantId,
        type: "INSTALLED",
        message: existing ? "App ominstallerad" : "App installerad",
      },
    });

    return { tenantApp, isNew: true };
  });

  // Auto-create wizard record so setup page can render immediately
  if (result.isNew) {
    await startWizard(appId);
  }

  return { ok: true, tenantAppId: result.tenantApp.id };
}

// ── Uninstall ───────────────────────────────────────────────────

export async function uninstallApp(appId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const existing = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });

  if (!existing || existing.status === "UNINSTALLED") {
    return { ok: true }; // Idempotent
  }

  // Check if other installed apps depend on this one
  const allInstalled = await prisma.tenantApp.findMany({
    where: { tenantId, status: { not: "UNINSTALLED" } },
    select: { appId: true },
  });

  for (const installed of allInstalled) {
    if (installed.appId === appId) continue;
    const installedApp = getApp(installed.appId);
    if (installedApp?.dependencies.includes(appId)) {
      return {
        ok: false,
        error: `Kan inte avinstallera — "${installedApp.name}" beror på denna app`,
      };
    }
  }

  // Soft delete — keep for billing history
  await prisma.tenantApp.update({
    where: { id: existing.id },
    data: { status: "UNINSTALLED" },
  });

  await prisma.tenantAppEvent.create({
    data: {
      appId,
      tenantId,
      type: "UNINSTALLED",
      message: "App avinstallerad",
    },
  });

  // Cancel pending webhook deliveries
  await prisma.appWebhookDelivery.updateMany({
    where: { tenantId, appId, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "EXHAUSTED", exhaustedAt: new Date(), errorMessage: "App avinstallerad" },
  });

  // Record billing (fire-and-forget)
  if (existing.pricingTier) {
    import("./billing").then(({ recordUninstall }) =>
      recordUninstall(tenantId, appId, existing.pricingTier!),
    ).catch((err) => log("error", "app.billing_record_failed", { appId, error: String(err) }));
  }

  return { ok: true };
}

// ── Read ────────────────────────────────────────────────────────

export async function getInstalledApps(): Promise<
  Array<{
    id: string;
    appId: string;
    status: AppStatus;
    installedAt: Date;
    activatedAt: Date | null;
    errorMessage: string | null;
    pricingTier: string | null;
    settings: Record<string, unknown>;
  }>
> {
  const auth = await requireAdmin();
  if (!auth.ok) return [];

  const tenantId = await resolveTenantId();
  if (!tenantId) return [];

  const apps = await prisma.tenantApp.findMany({
    where: { tenantId, status: { not: "UNINSTALLED" } },
    orderBy: { installedAt: "desc" },
  });

  return apps.map((a) => ({
    id: a.id,
    appId: a.appId,
    status: a.status as AppStatus,
    installedAt: a.installedAt,
    activatedAt: a.activatedAt,
    errorMessage: a.errorMessage,
    pricingTier: a.pricingTier,
    settings: (a.settings as Record<string, unknown>) ?? {},
  }));
}

export async function getAppStatus(appId: string): Promise<AppStatus | null> {
  const auth = await requireAdmin();
  if (!auth.ok) return null;

  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
    select: { status: true },
  });

  if (!tenantApp) return null;
  return tenantApp.status as AppStatus;
}

// ── Pause / Resume ──────────────────────────────────────────────

export async function pauseApp(appId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const existing = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });
  if (!existing || existing.status !== "ACTIVE") {
    return { ok: false, error: "Appen kan bara pausas om den är aktiv" };
  }

  await prisma.tenantApp.update({
    where: { id: existing.id },
    data: { status: "PAUSED" },
  });

  await prisma.tenantAppEvent.create({
    data: { appId, tenantId, type: "PAUSED", message: "App pausad" },
  });

  return { ok: true };
}

export async function resumeApp(appId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const existing = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });
  if (!existing || existing.status !== "PAUSED") {
    return { ok: false, error: "Appen kan bara återaktiveras om den är pausad" };
  }

  await prisma.tenantApp.update({
    where: { id: existing.id },
    data: { status: "ACTIVE", activatedAt: new Date() },
  });

  await prisma.tenantAppEvent.create({
    data: { appId, tenantId, type: "ACTIVATED", message: "App återaktiverad" },
  });

  return { ok: true };
}

// ── Events ──────────────────────────────────────────────────────

export type AppEvent = {
  id: string;
  type: string;
  message: string | null;
  createdAt: string;
};

export async function getAppEvents(appId: string, limit: number = 50): Promise<AppEvent[]> {
  const auth = await requireAdmin();
  if (!auth.ok) return [];

  const tenantId = await resolveTenantId();
  if (!tenantId) return [];

  const events = await prisma.tenantAppEvent.findMany({
    where: { tenantId, appId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return events.map((e) => ({
    id: e.id,
    type: e.type,
    message: e.message,
    createdAt: e.createdAt.toISOString(),
  }));
}

// ── Get Full App Detail ─────────────────────────────────────────

export type AppDetail = {
  id: string;
  appId: string;
  status: AppStatus;
  installedAt: string;
  activatedAt: string | null;
  errorMessage: string | null;
  pricingTier: string | null;
  settings: Record<string, unknown>;
};

export async function getAppDetail(appId: string): Promise<AppDetail | null> {
  const auth = await requireAdmin();
  if (!auth.ok) return null;

  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });

  if (!tenantApp || tenantApp.status === "UNINSTALLED") return null;

  return {
    id: tenantApp.id,
    appId: tenantApp.appId,
    status: tenantApp.status as AppStatus,
    installedAt: tenantApp.installedAt.toISOString(),
    activatedAt: tenantApp.activatedAt?.toISOString() ?? null,
    errorMessage: tenantApp.errorMessage,
    pricingTier: tenantApp.pricingTier,
    settings: (tenantApp.settings as Record<string, unknown>) ?? {},
  };
}

// ── Update Settings ─────────────────────────────────────────────

export async function updateAppSettings(
  appId: string,
  settings: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const existing = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });

  if (!existing || existing.status === "UNINSTALLED") {
    return { ok: false, error: "Appen är inte installerad" };
  }

  await prisma.tenantApp.update({
    where: { id: existing.id },
    data: { settings: settings as Prisma.InputJsonValue },
  });

  await prisma.tenantAppEvent.create({
    data: {
      appId,
      tenantId,
      type: "SETTINGS_UPDATED",
      message: "Inställningar uppdaterade",
    },
  });

  return { ok: true };
}

// ── Webhook Deliveries ──────────────────────────────────────────

export type WebhookDeliveryItem = {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  responseTimeMs: number | null;
  errorMessage: string | null;
  createdAt: string;
};

export async function getWebhookDeliveries(appId: string, limit: number = 20): Promise<WebhookDeliveryItem[]> {
  const auth = await requireAdmin();
  if (!auth.ok) return [];

  const tenantId = await resolveTenantId();
  if (!tenantId) return [];

  const deliveries = await prisma.appWebhookDelivery.findMany({
    where: { tenantId, appId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return deliveries.map((d) => ({
    id: d.id,
    eventType: d.eventType,
    status: d.status,
    attempts: d.attempts,
    responseTimeMs: d.responseTimeMs,
    errorMessage: d.errorMessage,
    createdAt: d.createdAt.toISOString(),
  }));
}

export async function retryDelivery(deliveryId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const delivery = await prisma.appWebhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { event: { select: { payload: true } } },
  });

  if (!delivery || delivery.tenantId !== tenantId) {
    return { ok: false, error: "Leverans hittades inte" };
  }

  if (delivery.status !== "EXHAUSTED") {
    return { ok: false, error: "Bara uttömda leveranser kan göras om manuellt" };
  }

  // Reset to FAILED with attempts=4 (one more attempt before exhausting again)
  await prisma.appWebhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "FAILED",
      exhaustedAt: null,
      attempts: 4,
      nextRetryAt: new Date(),
    },
  });

  // Attempt delivery now
  const { deliverEvent } = await import("./webhooks");
  await deliverEvent(
    delivery.tenantId,
    delivery.appId,
    delivery.eventId,
    delivery.eventType,
    (delivery.event.payload as Record<string, unknown>) ?? {},
  );

  return { ok: true };
}

/**
 * Revoke OAuth access for an app. Server-side only — crypto modules
 * cannot be imported in client components.
 */
export async function revokeOAuthAccess(appId: string): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false };

  const ctx = await getCurrentTenant();
  if (!ctx) return { ok: false };

  if (appId === "google-ads") {
    const { revokeAccess } = await import("./google-ads/oauth");
    await revokeAccess(ctx.tenant.id);
  } else if (appId === "meta-ads") {
    const { revokeAccess } = await import("./meta-ads/oauth");
    await revokeAccess(ctx.tenant.id);
  }

  return { ok: true };
}
