/**
 * Theme Rendering Engine
 *
 * Renders a specific page template from the active theme manifest.
 *
 * Pipeline:
 *   1. Bootstrap registries (once)
 *   2. Resolve theme manifest from tenant's themeId
 *   3. Resolve the template for the requested page (templateKey)
 *   4. Render: sectionGroups.header → template.sections → sectionGroups.footer
 *   5. For each section slot: resolve component, merge settings, render
 *
 * Settings namespacing:
 *   Section settings are stored with theme-scoped keys: "{themeId}:{slotId}"
 *   This prevents settings from one theme bleeding into another when switching.
 *   The engine reads from the namespaced key, falling back to the bare slot ID
 *   for backwards compatibility.
 */

import type { NormalizedBooking, NormalizedBookingStatus } from "@/app/_lib/integrations/types";
import type { TenantConfig } from "../tenant/types";
import type { ThemeManifest, ThemeSectionSlot, TenantSectionSettings } from "./types";
import { ensureRegistered, getTheme, getAllThemes, getSectionComponent, hasTheme } from "./registry";
import { getActiveThemeIdOrDefault } from "./selection";
import { SectionErrorBoundary } from "./SectionErrorBoundary";
import { sanitizeSectionSettings } from "./sanitizeSettings";
import { migrateSettings } from "./migrations";
import { resolvePageItems } from "@/app/_lib/sections/resolve";
import { resolveDataSources } from "@/app/_lib/sections/data-sources";
import { ensureSectionsRegistered } from "@/app/_lib/sections/registry";
import { getPageSections } from "@/app/_lib/pages/config";

const DEFAULT_PAGE_PADDING = 17;
import { CategorySection } from "../../_components/cards/CategorySection";
import { LooseCardItem } from "../../_components/cards/LooseCardItem";
import { SectionItem } from "../../_components/sections";
import { MapsProvider } from "../../_components/sections/elements/MapsContext";
import { MenusProvider } from "../../_components/sections/elements/MenusContext";
import { SpecialLinkProvider } from "../../_components/SpecialLinkProvider";
import type { ResolvedDataMap } from "@/app/_lib/sections/data-sources";

export type ThemeRendererProps = {
  /** Which page template to render (e.g. "home", "shop", "account"). */
  templateKey: string;
  config: TenantConfig;
  booking: NormalizedBooking;
  bookingStatus: NormalizedBookingStatus;
  token?: string;
  /**
   * Page-level resolved data, injected into every section's resolvedData.
   * Used by the product page to provide accommodation data to all sections.
   * Section-level dataSources override page-level keys if both exist.
   */
  pageResolvedData?: ResolvedDataMap;
};

/**
 * Resolve section settings for a slot, using namespaced key with bare-key fallback.
 *
 * Priority: "{themeId}:{slotId}" → "{slotId}" → slot.defaults
 */
function resolveSlotSettings(
  slot: ThemeSectionSlot,
  themeId: string,
  overrides: TenantSectionSettings,
): Record<string, unknown> {
  const namespacedKey = `${themeId}:${slot.id}`;
  const namespacedOverrides = overrides[namespacedKey];
  const bareOverrides = overrides[slot.id];

  return {
    ...slot.defaults,
    ...(namespacedOverrides ?? bareOverrides ?? {}),
  };
}

/**
 * Merge page-level resolvedData into every section's resolvedData.
 * Section-level dataSources override page-level keys if both exist.
 */
function mergePageResolvedData(
  items: import("@/app/_lib/sections/resolve").PageItem[],
  pageData?: ResolvedDataMap,
): void {
  if (!pageData) return;
  for (const item of items) {
    if (item.kind !== "section") continue;
    item.renderProps.resolvedData = {
      ...pageData,
      ...item.renderProps.resolvedData,
    };
  }
}

/**
 * Renders a themed page. Async server component.
 *
 * If the requested template doesn't exist in the active theme,
 * falls back to rendering nothing (allows incremental theme adoption —
 * a theme doesn't need to define every template from day one).
 */
export async function ThemeRenderer({
  templateKey,
  config,
  booking,
  bookingStatus,
  token,
  pageResolvedData,
}: ThemeRendererProps) {
  await Promise.all([ensureRegistered(), ensureSectionsRegistered()]);

  const themeId = getActiveThemeIdOrDefault(config);

  // Validate theme exists in registry
  if (!hasTheme(themeId)) {
    const registered = getAllThemes().map((t) => t.id);
    console.error(
      `[ThemeEngine] Theme "${themeId}" not found in registry. ` +
      `Registered themes: [${registered.join(", ")}]. ` +
      `Falling back to "classic".`
    );
  }

  const resolvedManifest = getTheme(themeId) ?? getTheme("classic");
  if (!resolvedManifest) {
    throw new Error("[ThemeEngine] Fatal: Classic theme not registered.");
  }
  // Local const so TypeScript narrows to non-null (avoids `manifest!` assertions)
  const manifest = resolvedManifest;

  const template = manifest.templates[templateKey];
  // No theme template — render page sections only (no theme slots)
  if (!template) {
    await ensureSectionsRegistered();
    const pageSections = getPageSections(config, templateKey);
    console.log(`[ThemeEngine] No template for "${templateKey}", rendering ${pageSections.length} page sections. Config pages: ${Object.keys(config.pages || {}).join(",")}`);
    if (pageSections.length > 0) {
      console.log(`[ThemeEngine] First section: ${pageSections[0].definitionId} active=${pageSections[0].isActive}`);
    }
    const pageItems = resolvePageItems([], pageSections, config);
    await resolveDataSources(pageItems, config.tenantId);
    mergePageResolvedData(pageItems, pageResolvedData);
    console.log(`[ThemeEngine] Resolved ${pageItems.length} page items for "${templateKey}"`);
    if (pageItems.length === 0) {
      console.log(`[ThemeEngine] WARNING: 0 page items, returning null for "${templateKey}"`);
      return null;
    }
    return (
      <MapsProvider maps={config.maps ?? []}>
      <MenusProvider menus={config.menus ?? []}>
      <SpecialLinkProvider maps={config.maps ?? []}>
      <div style={{ padding: `${DEFAULT_PAGE_PADDING}px ${DEFAULT_PAGE_PADDING}px 124px ${DEFAULT_PAGE_PADDING}px` }}>
        {pageItems.map((item) => {
          if (item.kind === "section") {
            return (
              <SectionErrorBoundary key={item.renderProps.section.id} sectionId={item.renderProps.section.id} sectionType={item.renderProps.definition.id}>
                <SectionItem renderProps={item.renderProps} />
              </SectionErrorBoundary>
            );
          }
          return null;
        })}
      </div>
      </SpecialLinkProvider>
      </MenusProvider>
      </MapsProvider>
    );
  }

  // ── Render context (observability) ──────────────────────
  // Captures exactly which manifest rendered this page — critical for debugging
  const renderContext = {
    themeId: manifest.id,
    manifestVersion: manifest.version,
    tenantVersion: config.themeVersion,
    templateKey,
  };

  // ── Settings migration ────────────────────────────────
  // If tenant's themeVersion < manifest.version, run migration chain
  const rawSettings = config.sectionSettings ?? {};
  const migration = migrateSettings(rawSettings, manifest, config.themeVersion);

  if (migration.migrated) {
    console.info(
      `[ThemeEngine] Migrated settings for "${manifest.id}": ` +
      `${config.themeVersion ?? "null"} → ${migration.resolvedVersion} ` +
      `(applied: ${migration.appliedVersions.join(" → ")})`,
    );
  }

  // Merge theme-level settings
  const themeSettings: Record<string, unknown> = {
    ...manifest.settingDefaults,
    ...(config.themeSettings ?? {}),
  };

  // Sanitize migrated settings: strips orphaned slots/fields
  const sectionOverrides: TenantSectionSettings = sanitizeSectionSettings(
    migration.settings,
    manifest,
  );
  const pagePadding = (themeSettings.pagePadding as number) ?? DEFAULT_PAGE_PADDING;

  // Collect all sections: header group → template → footer group
  const headerSlots = [...manifest.sectionGroups.header].sort((a, b) => a.order - b.order);
  const templateSlots = [...template.sections].sort((a, b) => a.order - b.order);
  const footerSlots = [...manifest.sectionGroups.footer].sort((a, b) => a.order - b.order);

  const renderSlot = (slot: ThemeSectionSlot) => {
    const Component = getSectionComponent(slot.type, slot.variant);

    if (!Component) {
      console.error(
        `[ThemeEngine] Missing section component "${slot.type}/${slot.variant}" ` +
        `(slot "${slot.id}" in theme "${manifest.id}"). ` +
        `This section will be skipped.`
      );
      return null;
    }

    const settings = resolveSlotSettings(slot, manifest.id, sectionOverrides);

    return (
      <SectionErrorBoundary key={slot.id} sectionId={slot.id} sectionType={slot.type}>
        <Component
          slot={slot}
          settings={settings}
          config={config}
          booking={booking}
          bookingStatus={bookingStatus}
          token={token}
          themeSettings={themeSettings}
        />
      </SectionErrorBoundary>
    );
  };

  // ── Content feed: sections + cards interleaved by sortOrder ──
  // Cards are home-specific legacy content; sections are per-page via config accessor.
  //
  // Two section namespaces exist:
  //   1. Theme manifest slots (templateSlots) — defined by the theme author
  //   2. Tenant page sections (pageSections) — placed by the tenant in the editor
  // If a section type was already rendered via a theme slot, skip it in the
  // content feed to prevent double-rendering the same section type.
  const themeRenderedTypes = new Set(
    [...headerSlots, ...templateSlots, ...footerSlots].map((s) => s.type),
  );
  const pageCards: typeof config.home.cards = [];
  const pageSections = getPageSections(config, templateKey);
  const pageItems = resolvePageItems(pageCards, pageSections, config).filter(
    (item) => item.kind !== "section" || !themeRenderedTypes.has(item.renderProps.definition.id),
  );
  await resolveDataSources(pageItems, config.tenantId);
  mergePageResolvedData(pageItems, pageResolvedData);

  return (
    <MapsProvider maps={config.maps ?? []}>
    <MenusProvider menus={config.menus ?? []}>
    <SpecialLinkProvider maps={config.maps ?? []}>
    <div
      style={{ padding: `${pagePadding}px ${pagePadding}px 124px ${pagePadding}px` }}
      data-theme-id={renderContext.themeId}
      data-theme-version={renderContext.manifestVersion}
      data-tenant-version={renderContext.tenantVersion ?? "unversioned"}
    >
      {/* Section group: header */}
      {headerSlots.map(renderSlot)}

      {/* Template sections (theme-controlled) */}
      {templateSlots.map(renderSlot)}

      {/* Content feed: sections + cards sorted by sortOrder */}
      {pageItems.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {pageItems.map((item) => {
            if (item.kind === "section") {
              return (
                <SectionErrorBoundary
                  key={item.renderProps.section.id}
                  sectionId={item.renderProps.section.id}
                  sectionType={item.renderProps.definition.id}
                >
                  <SectionItem renderProps={item.renderProps} />
                </SectionErrorBoundary>
              );
            }
            if (item.kind === "category") {
              return (
                <CategorySection
                  key={item.category.id}
                  category={item.category}
                  cards={item.cards}
                  radius={config.theme.buttons.radius}
                />
              );
            }
            return (
              <LooseCardItem
                key={item.card.id}
                card={item.card}
                token={token}
                radius={config.theme.buttons.radius}
              />
            );
          })}
        </div>
      )}

      {/* Section group: footer */}
      {footerSlots.map(renderSlot)}
    </div>
    </SpecialLinkProvider>
    </MenusProvider>
    </MapsProvider>
  );
}

