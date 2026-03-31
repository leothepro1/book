"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";

export type StoreThemeData = {
  tenantId: string;
  tenantName: string;
  publishedThemeId: string | null;
  publishedThemeName: string | null;
  settingsVersion: number;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
  lastPublishedAt: string | null;
  draftUpdatedBy: string | null;
  portalSlug: string | null;
  portalUrl: string | null;
  screenshot: {
    desktopUrl: string | null;
    mobileUrl: string | null;
    hash: string | null;
    pending: boolean;
    updatedAt: string | null;
  };
};

export async function getStoreThemeData(): Promise<StoreThemeData | null> {
  const { orgId } = await getAuth();
  if (!orgId) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: {
      id: true,
      name: true,
      settings: true,
      updatedAt: true,
      draftSettings: true,
      draftUpdatedAt: true,
      draftUpdatedBy: true,
      settingsVersion: true,
      portalSlug: true,
      screenshotDesktopUrl: true,
      screenshotMobileUrl: true,
      screenshotHash: true,
      screenshotPending: true,
      screenshotUpdatedAt: true,
    },
  });
  if (!tenant) return null;

  // Resolve theme name from manifests
  const config = (tenant.settings ?? {}) as Record<string, unknown>;
  const themeId = (config.themeId as string) ?? null;

  let themeName: string | null = null;

  if (themeId) {
    try {
      const { getTheme } = await import("@/app/(guest)/_lib/themes/registry");
      const manifest = getTheme(themeId);
      if (manifest) {
        themeName = manifest.name;
      }
    } catch {
      // Theme registry not loaded — fall back
    }
  }

  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "rutgr.com";

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    publishedThemeId: themeId,
    publishedThemeName: themeName ?? "Standard",
    lastPublishedAt: tenant.updatedAt.toISOString(),
    settingsVersion: tenant.settingsVersion,
    hasDraft: !!tenant.draftSettings,
    draftUpdatedAt: tenant.draftUpdatedAt?.toISOString() ?? null,
    draftUpdatedBy: tenant.draftUpdatedBy,
    portalSlug: tenant.portalSlug,
    portalUrl: tenant.portalSlug ? `https://${tenant.portalSlug}.${baseDomain}` : null,
    screenshot: {
      desktopUrl: tenant.screenshotDesktopUrl,
      mobileUrl: tenant.screenshotMobileUrl,
      hash: tenant.screenshotHash,
      pending: tenant.screenshotPending,
      updatedAt: tenant.screenshotUpdatedAt?.toISOString() ?? null,
    },
  };
}
