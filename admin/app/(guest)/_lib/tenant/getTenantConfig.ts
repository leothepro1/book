import { prisma } from "@/app/_lib/db/prisma";
import type { TenantConfig } from "./types";
import { migrateToV2Pages } from "@/app/_lib/pages/migrate";

/**
 * Resolves the full TenantConfig for a tenant.
 *
 * preferDraft: true  → merges draftSettings over live (admin preview)
 * preferDraft: false → uses live settings only (guest portal)
 *
 * Merge strategy: shallow spread with explicit home.cards handling
 * to prevent deepmerge from concatenating card arrays.
 *
 * Auth is NOT handled here — caller is responsible.
 */
export async function getTenantConfig(
  tenantIdOrSlug: string,
  options?: { preferDraft?: boolean },
): Promise<TenantConfig> {
  const useDraft = options?.preferDraft || false;

  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }],
    },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantIdOrSlug}`);
  }

  const defaults = getDefaultConfig(tenant.id);

  // Pick the right settings source
  const raw = useDraft
    ? (tenant.draftSettings ?? tenant.settings)
    : tenant.settings;

  if (!raw || typeof raw !== "object") {
    return migrateToV2Pages(defaults);
  }

  const stored = raw as Record<string, unknown>;

  return migrateToV2Pages(mergeConfig(defaults, stored, tenant.id));
}

/**
 * Merge stored JSON into typed defaults.
 *
 * Explicit per-field merge ensures we never lose nested defaults
 * and never concatenate arrays that should be replaced.
 */
function mergeConfig(
  defaults: TenantConfig,
  stored: Record<string, unknown>,
  tenantId: string,
): TenantConfig {
  const storedHome = (stored.home ?? {}) as Record<string, unknown>;

  return {
    ...defaults,
    ...stored,
    tenantId,
    // home arrays are replaced entirely (not merged) — same as updateDraft's overwriteArrays
    home: {
      ...defaults.home,
      ...storedHome,
      cards: Array.isArray(storedHome.cards) ? storedHome.cards : defaults.home.cards,
      sections: Array.isArray(storedHome.sections) ? storedHome.sections : defaults.home.sections,
      archivedCards: Array.isArray(storedHome.archivedCards)
        ? storedHome.archivedCards
        : defaults.home.archivedCards,
    },
    // Ensure these always exist (may be missing in old stored data)
    sectionSettings: (stored.sectionSettings as Record<string, Record<string, unknown>>) ?? {},
    themeSettings: (stored.themeSettings as Record<string, unknown>) ?? {},
    themeId: (stored.themeId as string | null) ?? null,
    themeVersion: (stored.themeVersion as string | null) ?? null,
    // Preserve v2 pages if already stored
    pages: (stored.pages as TenantConfig["pages"]) ?? undefined,
    // Preserve global header/footer if already stored
    globalHeader: (stored.globalHeader as TenantConfig["globalHeader"]) ?? undefined,
    globalFooter: (stored.globalFooter as TenantConfig["globalFooter"]) ?? undefined,
  } as TenantConfig;
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
      tiles: {
        background: "#F1F0EE",
        radius: "round",
        shadow: "none",
      },
    },
    home: {
      version: 1,
      links: [],
      cards: [],
      sections: [],
      archivedCards: [],
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
    themeId: null,
    themeVersion: null,
    sectionSettings: {},
    themeSettings: {},
  };
}
