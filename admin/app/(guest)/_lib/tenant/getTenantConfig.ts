import { prisma } from "@/app/_lib/db/prisma";
import type { TenantConfig } from "./types";

/**
 * Hämtar tenant config för guest portal.
 * 
 * preferDraft: true → använd draftSettings (anropas från preview-route)
 * preferDraft: false/undefined → använd live settings (default)
 * 
 * Auth hanteras INTE här – det sker i preview-routen.
 */
export async function getTenantConfig(
  tenantIdOrSlug: string,
  options?: { preferDraft?: boolean }
): Promise<TenantConfig> {
  const useDraft = options?.preferDraft || false;

  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { id: tenantIdOrSlug },
        { slug: tenantIdOrSlug },
      ],
    },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantIdOrSlug}`);
  }

  // Prioritize draft if explicitly requested
  const defaults = getDefaultConfig(tenant.id);

  if (useDraft && tenant.draftSettings && typeof tenant.draftSettings === 'object') {
    const draft = tenant.draftSettings as any;
    return {
      ...defaults,
      ...draft,
      tenantId: tenant.id,
      home: { ...defaults.home, ...(draft.home || {}), cards: draft.home?.cards || defaults.home.cards },
    };
  }

  // Use live settings
  if (tenant.settings && typeof tenant.settings === 'object') {
    const live = tenant.settings as any;
    return {
      ...defaults,
      ...live,
      tenantId: tenant.id,
      home: { ...defaults.home, ...(live.home || {}), cards: live.home?.cards || defaults.home.cards },
    };
  }

  return getDefaultConfig(tenant.id);
}

function getDefaultConfig(tenantId: string): TenantConfig {
  return {
    tenantId,
    property: {
      name: "Default Property",
      address: "",
      latitude: 0,
      longitude: 0,
      checkInTime: "14:00",
      checkOutTime: "11:00",
      timezone: "Europe/Stockholm",
    },
    theme: {
      version: 1,
      colors: {
        background: "#fff",
        text: "#2D2C2B",
        buttonBg: "#8B3DFF",
        buttonText: "#fff",
      },
      header: {
        logoUrl: undefined,
        logoWidth: 120,
      },
      background: {
        mode: "fill",
      },
      buttons: {
        variant: "solid",
        radius: "rounder",
        shadow: "soft",
      },
      typography: {
        headingFont: "inter",
        bodyFont: "inter",
        mutedOpacity: 0.72,
      },
    },
    home: {
      version: 1,
      links: [],
      cards: [],
    },
    footer: {
      version: 1,
      items: [],
    },
    features: {
      commerceEnabled: false,
      accountEnabled: false,
      notificationsEnabled: true,
      languageSwitcherEnabled: true,
    },
    supportLinks: {},
    rules: [],
  };
}
