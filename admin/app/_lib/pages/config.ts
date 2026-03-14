/**
 * Page Config Accessor — Durable API
 * ═══════════════════════════════════
 *
 * Single source of truth for mapping PageId → TenantConfig sub-paths.
 * This is the ONLY file that knows where page data lives in TenantConfig.
 *
 * This is a durable API, not a temporary compatibility bridge.
 * If the internal config shape changes (e.g. config.home → config.pages[pageId]),
 * only this file is updated. All consumers remain unchanged.
 *
 * Ownership:
 *   - Reads:              getPageSections, getPageHeader, getPageFooter
 *   - Patch building:     buildSectionsPatch, buildHeaderPatch, buildFooterPatch
 *   - Undo snapshots:     getPageUndoSnapshot
 *   - Page discovery:     getAllSectionBearingPageIds, getAllResourceBearingPageIds
 *
 * Config shape knowledge is NOT a UI concern.
 * UI components ask this layer — they never access config paths directly.
 *
 * Design:
 *   - Pure functions (no side effects, no state)
 *   - Unknown pages → safe empty defaults (never crash)
 *   - Snapshot/patch builders match saveDraft() partial-merge semantics
 *   - Page discovery driven by page registry (layout contract), not config data
 */

import type { PageId, PageDefinition } from "./types";
import { getAllPageDefinitions } from "./registry";
import type {
  TenantConfig,
  HeaderConfig,
  PageFooterConfig,
} from "@/app/(guest)/_lib/tenant/types";
import type { SectionInstance } from "@/app/_lib/sections/types";

// ═══════════════════════════════════════════════════════════════
// READ ACCESSORS
// ═══════════════════════════════════════════════════════════════

/**
 * Read the sections array for a given page.
 * Returns [] for pages without sections or unknown pages.
 */
export function getPageSections(
  config: TenantConfig | null | undefined,
  pageId: PageId,
): SectionInstance[] {
  if (!config) return [];
  switch (pageId) {
    case "home":
      return config.home?.sections ?? [];
    default:
      return [];
  }
}

/**
 * Read the header config for a given page.
 *
 * SHARED RESOURCE: Header config is currently a singleton stored in
 * config.home.header. All pages that support a header share the same
 * configuration. The editor presents header editing as page-scoped UI,
 * but the underlying resource is shared.
 *
 * Next step for per-page ownership: add a `header` field to each page's
 * config object, then add page-specific cases to this switch.
 */
export function getPageHeader(
  config: TenantConfig | null | undefined,
  pageId: PageId,
): HeaderConfig | undefined {
  if (!config) return undefined;
  // All pages share the global header config (stored in home)
  return config.home?.header;
}

/**
 * Read the footer config for a given page.
 *
 * SHARED RESOURCE: Same pattern as header — singleton stored in
 * config.home.footer, shared across all footer-capable pages.
 * See getPageHeader() for architectural notes on future per-page ownership.
 */
export function getPageFooter(
  config: TenantConfig | null | undefined,
  pageId: PageId,
): PageFooterConfig | undefined {
  if (!config) return undefined;
  // All pages share the global footer config (stored in home)
  return config.home?.footer;
}

// ═══════════════════════════════════════════════════════════════
// UNDO SNAPSHOT
// ═══════════════════════════════════════════════════════════════

/**
 * Build the undo snapshot for a page's content.
 * Returns a Partial<TenantConfig> that captures the current state.
 *
 * The PublishBar undo system stores these snapshots and applies them
 * via updateConfig() to restore previous state.
 */
export function getPageUndoSnapshot(
  config: TenantConfig | null | undefined,
  pageId: PageId,
): Partial<TenantConfig> {
  if (!config) return {};
  switch (pageId) {
    case "home":
      return { home: config.home };
    default:
      return {};
  }
}

// ═══════════════════════════════════════════════════════════════
// SAVE PATCH BUILDERS
// ═══════════════════════════════════════════════════════════════

/**
 * Build a save patch that writes updated sections for a page.
 * Returns a Partial<TenantConfig> to pass to saveDraft().
 */
export function buildSectionsPatch(
  config: TenantConfig,
  pageId: PageId,
  sections: SectionInstance[],
): Partial<TenantConfig> {
  switch (pageId) {
    case "home":
      return { home: { ...config.home, sections } };
    default:
      return {};
  }
}

/**
 * Build a save patch that writes updated header config for a page.
 */
export function buildHeaderPatch(
  config: TenantConfig,
  pageId: PageId,
  header: HeaderConfig,
): Partial<TenantConfig> {
  switch (pageId) {
    case "home":
      return { home: { ...config.home, header } } as Partial<TenantConfig>;
    default:
      return {};
  }
}

/**
 * Build a save patch that writes updated footer config for a page.
 */
export function buildFooterPatch(
  config: TenantConfig,
  pageId: PageId,
  footer: PageFooterConfig,
): Partial<TenantConfig> {
  switch (pageId) {
    case "home":
      return { home: { ...config.home, footer } } as Partial<TenantConfig>;
    default:
      return {};
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE ITERATION (derived from page registry, not config data)
// ═══════════════════════════════════════════════════════════════

/**
 * Returns all PageIds where the platform defines body === "sections".
 * Driven by the page registry (layout contract), not by config presence.
 * A page is section-bearing by platform capability, regardless of
 * whether its config currently contains data.
 *
 * Used by traversal.ts to collect all sections across pages.
 */
export function getAllSectionBearingPageIds(): PageId[] {
  return getAllPageDefinitions()
    .filter((p) => p.layout.body === "sections")
    .map((p) => p.id);
}

/**
 * Returns all PageIds where the platform defines header or footer.
 * Driven by the page registry, not by config presence.
 * A page is resource-bearing by platform capability, regardless of
 * whether its config currently exists.
 *
 * Used by color scheme reference detection.
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
 * No separate allowlist — the registry is the single source of truth.
 */
export function getEditorPages(): PageDefinition[] {
  return getAllPageDefinitions().filter((p) => p.editorVisible);
}
