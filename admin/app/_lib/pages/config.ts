/**
 * Page Config Accessor — Durable API
 * ═══════════════════════════════════
 *
 * Single source of truth for mapping PageId → TenantConfig sub-paths.
 * This is the ONLY file that knows where page data lives in TenantConfig.
 *
 * V2 MIGRATION:
 *   Page data now lives in config.pages[pageId].
 *   Legacy data in config.home.{sections,header,footer} is read as fallback
 *   when config.pages is absent. All WRITES go to config.pages[pageId].
 *
 * Ownership:
 *   - Reads:              getPageSections, getPageHeader (global), getPageFooter (global)
 *   - Patch building:     buildSectionsPatch, buildHeaderPatch (global), buildFooterPatch (global)
 *   - Undo snapshots:     getPageUndoSnapshot
 *   - Page discovery:     getAllSectionBearingPageIds, getAllResourceBearingPageIds
 *   - Page config:        getPageConfig, getPageLayoutId, isPageEnabled
 *
 * Design:
 *   - Pure functions (no side effects, no state)
 *   - Unknown pages → safe empty defaults (never crash)
 *   - Snapshot/patch builders match saveDraft() partial-merge semantics
 *   - Page discovery driven by page registry (layout contract), not config data
 */

import type { PageId, PageDefinition } from "./types";
import { getAllPageDefinitions, getPageDefinition, isPageId } from "./registry";
import type {
  TenantConfig,
  PageConfig,
  HeaderConfig,
  PageFooterConfig,
  StaysCoreConfig,
} from "@/app/(guest)/_lib/tenant/types";
import { STAYS_CORE_DEFAULTS } from "@/app/(guest)/_lib/tenant/types";
import type { SectionInstance } from "@/app/_lib/sections/types";

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Read the PageConfig for a given page from the v2 pages map.
 * Returns undefined if no page config exists (legacy or uninitialized).
 */
function getPageEntry(
  config: TenantConfig | null | undefined,
  pageId: PageId,
): PageConfig | undefined {
  if (!config?.pages) return undefined;
  return config.pages[pageId];
}

// ═══════════════════════════════════════════════════════════════
// READ ACCESSORS
// ═══════════════════════════════════════════════════════════════

/**
 * Read the sections array for a given page.
 *
 * Accepts string to avoid unsafe `as PageId` casts at call sites.
 * Unknown page IDs safely return [].
 *
 * Priority: config.pages[pageId].sections → legacy fallback → []
 * Legacy fallback: config.home.sections (only for "home" page)
 */
export function getPageSections(
  config: TenantConfig | null | undefined,
  pageId: PageId | string,
): SectionInstance[] {
  if (!config) return [];
  if (!isPageId(pageId)) return [];

  // V2 path: config.pages[pageId].sections
  const entry = getPageEntry(config, pageId);
  if (entry) return entry.sections ?? [];

  // Legacy fallback: only "home" had sections in v1
  if (pageId === "home") return config.home?.sections ?? [];

  return [];
}

/**
 * Read the global header config.
 *
 * Priority: config.globalHeader → legacy per-page fallback → undefined
 * The pageId parameter is kept for API compatibility but is ignored —
 * header config is globally shared across all pages.
 */
export function getPageHeader(
  config: TenantConfig | null | undefined,
  _pageId?: PageId,
): HeaderConfig | undefined {
  if (!config) return undefined;

  // Global header (canonical location)
  if (config.globalHeader) return config.globalHeader;

  // Legacy fallback: old per-page storage or config.home.header
  const homeEntry = getPageEntry(config, "home");
  if ((homeEntry as any)?.header) return (homeEntry as any).header;
  return config.home?.header;
}

/**
 * Read the global footer config.
 *
 * Priority: config.globalFooter → legacy per-page fallback → undefined
 * The pageId parameter is kept for API compatibility but is ignored —
 * footer config is globally shared across all pages.
 */
export function getPageFooter(
  config: TenantConfig | null | undefined,
  _pageId?: PageId,
): PageFooterConfig | undefined {
  if (!config) return undefined;

  // Global footer (canonical location)
  if (config.globalFooter) return config.globalFooter;

  // Legacy fallback: old per-page storage or config.home.footer
  const homeEntry = getPageEntry(config, "home");
  if ((homeEntry as any)?.footer) return (homeEntry as any).footer;
  return config.home?.footer;
}

/**
 * Read the active layout ID for a page.
 * Falls back to the page's defaultLayout from the registry.
 */
export function getPageLayoutId(
  config: TenantConfig | null | undefined,
  pageId: PageId,
): string {
  const entry = getPageEntry(config, pageId);
  if (entry?.layoutId) return entry.layoutId;
  return getPageDefinition(pageId).defaultLayout;
}

/**
 * Check whether a page is enabled for this tenant.
 * Defaults to true if no explicit config exists.
 */
export function isPageEnabled(
  config: TenantConfig | null | undefined,
  pageId: PageId,
): boolean {
  const entry = getPageEntry(config, pageId);
  if (entry) return entry.enabled;
  return true; // Pages are enabled by default
}

/**
 * Get the full PageConfig for a page, with safe defaults.
 */
export function getPageConfig(
  config: TenantConfig | null | undefined,
  pageId: PageId,
): PageConfig {
  const entry = getPageEntry(config, pageId);
  if (entry) return entry;

  const def = getPageDefinition(pageId);
  return {
    enabled: true,
    layoutId: def.defaultLayout,
    sections: getPageSections(config, pageId),
  };
}

// ═══════════════════════════════════════════════════════════════
// STAYS-SPECIFIC ACCESSORS
// ═══════════════════════════════════════════════════════════════

/**
 * Read the stays core config, merging stored values over defaults.
 */
export function getStaysCoreConfig(
  config: TenantConfig | null | undefined,
): StaysCoreConfig {
  // Primary source: bokningar section settings + presetSettings
  const sections = getPageSections(config, "stays");
  const bokningar = sections.find((s) => s.definitionId === "bokningar");
  if (bokningar) {
    const merged = { ...bokningar.presetSettings, ...bokningar.settings };
    return {
      heading: (merged.heading as string) || STAYS_CORE_DEFAULTS.heading,
      description: (merged.description as string) ?? "",
      headingSize: 28,
      headingMarginBottom: (merged.headingMarginBottom as number) ?? STAYS_CORE_DEFAULTS.headingMarginBottom,
      layout: (merged.layout as "tabs" | "list") || STAYS_CORE_DEFAULTS.layout,
      cardShadow: (merged.cardShadow as boolean) ?? STAYS_CORE_DEFAULTS.cardShadow,
      tabCurrentLabel: (merged.tabCurrentLabel as string) || STAYS_CORE_DEFAULTS.tabCurrentLabel,
      tabPreviousLabel: (merged.tabPreviousLabel as string) || STAYS_CORE_DEFAULTS.tabPreviousLabel,
      cardImageUrl: (merged.cardImageUrl as string) ?? STAYS_CORE_DEFAULTS.cardImageUrl,
      paddingTop: (merged.paddingTop as number) ?? STAYS_CORE_DEFAULTS.paddingTop,
      paddingRight: (merged.paddingRight as number) ?? STAYS_CORE_DEFAULTS.paddingRight,
      paddingBottom: (merged.paddingBottom as number) ?? STAYS_CORE_DEFAULTS.paddingBottom,
      paddingLeft: (merged.paddingLeft as number) ?? STAYS_CORE_DEFAULTS.paddingLeft,
      colorSchemeId: bokningar.colorSchemeId,
    };
  }

  // Fallback: legacy coreComponent storage
  const stored = getPageEntry(config, "stays")?.coreComponent;
  if (!stored) return STAYS_CORE_DEFAULTS;
  return { ...STAYS_CORE_DEFAULTS, ...stored };
}

/**
 * Build a save patch that writes updated stays core config.
 */
export function buildStaysCorePatch(
  config: TenantConfig,
  core: Partial<StaysCoreConfig>,
): Partial<TenantConfig> {
  const current = getPageConfig(config, "stays");
  const merged = { ...getStaysCoreConfig(config), ...core };

  return {
    pages: {
      ...config.pages,
      stays: { ...current, coreComponent: merged },
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// UNDO SNAPSHOT
// ═══════════════════════════════════════════════════════════════

/**
 * Build the undo snapshot for a page's content.
 * Returns a Partial<TenantConfig> that captures the current state.
 *
 * Includes page-scoped data (sections, layout) and global shared
 * resources (header, footer) since both can be edited from any page.
 */
export function getPageUndoSnapshot(
  config: TenantConfig | null | undefined,
  pageId: PageId,
): Partial<TenantConfig> {
  if (!config) return {};

  const pageConfig = getPageConfig(config, pageId);

  return {
    pages: {
      [pageId]: pageConfig,
    },
    globalHeader: config.globalHeader,
    globalFooter: config.globalFooter,
  };
}

// ═══════════════════════════════════════════════════════════════
// SAVE PATCH BUILDERS
// ═══════════════════════════════════════════════════════════════

/**
 * Build a save patch that writes updated sections for a page.
 * All writes go to config.pages[pageId] (v2 path).
 */
export function buildSectionsPatch(
  config: TenantConfig,
  pageId: PageId,
  sections: SectionInstance[],
): Partial<TenantConfig> {
  const current = getPageConfig(config, pageId);

  return {
    pages: {
      ...config.pages,
      [pageId]: { ...current, sections },
    },
  };
}

/**
 * Build a save patch that writes updated global header config.
 * The pageId parameter is kept for API compatibility but is ignored.
 */
export function buildHeaderPatch(
  _config: TenantConfig,
  _pageId: PageId,
  header: HeaderConfig,
): Partial<TenantConfig> {
  return { globalHeader: header };
}

/**
 * Build a save patch that writes updated global footer config.
 * The pageId parameter is kept for API compatibility but is ignored.
 */
export function buildFooterPatch(
  _config: TenantConfig,
  _pageId: PageId,
  footer: PageFooterConfig,
): Partial<TenantConfig> {
  return { globalFooter: footer };
}

/**
 * Build a save patch that writes updated layout ID for a page.
 */
export function buildLayoutPatch(
  config: TenantConfig,
  pageId: PageId,
  layoutId: string,
): Partial<TenantConfig> {
  const current = getPageConfig(config, pageId);

  return {
    pages: {
      ...config.pages,
      [pageId]: { ...current, layoutId },
    },
  };
}

/**
 * Build a save patch that toggles a page's enabled state.
 */
export function buildEnabledPatch(
  config: TenantConfig,
  pageId: PageId,
  enabled: boolean,
): Partial<TenantConfig> {
  const current = getPageConfig(config, pageId);

  return {
    pages: {
      ...config.pages,
      [pageId]: { ...current, enabled },
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// PAGE ITERATION (derived from page registry, not config data)
// ═══════════════════════════════════════════════════════════════

/**
 * Returns all PageIds where the platform defines body === "sections".
 * Driven by the page registry (layout contract), not by config presence.
 */
export function getAllSectionBearingPageIds(): PageId[] {
  return getAllPageDefinitions()
    .filter((p) => p.layout.body === "sections")
    .map((p) => p.id);
}

/**
 * Returns all PageIds where the platform defines header or footer.
 * Driven by the page registry, not by config presence.
 */
export function getAllResourceBearingPageIds(): PageId[] {
  return getAllPageDefinitions()
    .filter((p) => p.layout.header || p.layout.footer)
    .map((p) => p.id);
}

// ═══════════════════════════════════════════════════════════════
// PREVIEW ROUTE MAPPING
// ═══════════════════════════════════════════════════════════════

/** Maps PageId → the PreviewRoute expected by GuestPreviewFrame. */
const PAGE_TO_PREVIEW_ROUTE: Record<PageId, string> = {
  home: "/p/[token]",
  stays: "/p/[token]/stays",
  account: "/p/[token]/account",
  "check-in": "/check-in",
  "help-center": "/p/[token]/help-center",
  support: "/p/[token]/support",
};

/**
 * Resolve the preview route for a given page.
 * Used by EditorCanvas to drive the iframe src.
 */
export function getPreviewRoute(pageId: PageId): string {
  return PAGE_TO_PREVIEW_ROUTE[pageId] ?? PAGE_TO_PREVIEW_ROUTE.home;
}

// ═══════════════════════════════════════════════════════════════
// EDITOR-VISIBLE PAGES
// ═══════════════════════════════════════════════════════════════

/**
 * Returns the page definitions that should appear in the editor
 * page switcher. Derived from the page registry's editorVisible flag.
 */
export function getEditorPages(): PageDefinition[] {
  return getAllPageDefinitions().filter((p) => p.editorVisible);
}
