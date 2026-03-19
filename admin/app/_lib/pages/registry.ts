/**
 * Page Registry
 * ═════════════
 *
 * Static registry of all platform-defined page types.
 * This is the single source of truth for page layouts.
 *
 * To add a new page type:
 *   1. Add the PageId to types.ts
 *   2. Add a PageDefinition here
 *   3. Add the guest route
 *   4. (Optional) Add editor support if body === "sections"
 *
 * No database migration required — page definitions are code-level constants.
 */

import type { PageId, PageDefinition, PageLayout, LayoutVariant } from "./types";

// ═══════════════════════════════════════════════════════════════
// PAGE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const PAGE_DEFINITIONS: readonly PageDefinition[] = [
  {
    id: "home",
    label: "Startsida",
    icon: "storefront",
    layout: { header: true, body: "sections", footer: true },
    editorMode: "full",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
  },
  {
    id: "stays",
    label: "Bokningar",
    icon: "calendar_today",
    layout: { header: true, body: "sections", footer: true },
    editorMode: "full",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
  },
  {
    id: "account",
    label: "Kundkonton",
    icon: "person",
    layout: { header: true, body: "fixed", footer: true },
    editorMode: "locked",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
  },
  {
    id: "check-in",
    label: "Checka in",
    icon: "task_alt",
    layout: { header: false, body: "fixed", footer: false },
    editorMode: "settings",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
    steps: [
      { id: "find-booking", label: "Hitta bokning", icon: "search" },
      { id: "confirm", label: "Bekräfta bokning", icon: "fact_check" },
      { id: "tasks", label: "Uppgifter", icon: "assignment" },
      { id: "wallet-card", label: "Wallet-card", icon: "wallet" },
    ],
    pageSettings: {
      fields: [
        {
          key: "backgroundColor",
          type: "color",
          label: "Bakgrundsfärg",
          description: "Bakgrunden för formuläret.",
          group: "Allmänt",
        },
        {
          key: "fieldStyle",
          type: "segmented",
          label: "Fält och kort",
          group: "Allmänt",
          options: [
            { value: "transparent", label: "Genomskinlig" },
            { value: "white", label: "Vit" },
          ],
        },
        {
          key: "headingFont",
          type: "fontPicker" as any,
          label: "Rubrik",
          group: "Typografi",
        },
        {
          key: "bodyFont",
          type: "fontPicker" as any,
          label: "Brödtext",
          group: "Typografi",
        },
        {
          key: "buttonFont",
          type: "fontPicker" as any,
          label: "Knappar",
          group: "Typografi",
        },
        {
          key: "accentColor",
          type: "color",
          label: "Accentfärg",
          group: "Färger",
        },
        {
          key: "buttonColor",
          type: "color",
          label: "Knappar",
          group: "Färger",
        },
        {
          key: "textColor",
          type: "color",
          label: "Text",
          group: "Färger",
        },
        {
          key: "borderColor",
          type: "color",
          label: "Konturer",
          group: "Färger",
        },
      ],
      defaults: {
        backgroundColor: "#FFFFFF",
        fieldStyle: "white",
        headingFont: "inter",
        bodyFont: "inter",
        buttonFont: "inter",
        accentColor: "#121212",
        buttonColor: "#121212",
        textColor: "#121212",
        borderColor: "#D7DADE",
        walletBgColor: "#1a1a2e",
        walletBgImageUrl: "",
        walletOverlayOpacity: 0.3,
        walletLogoUrl: "",
        walletDateColor: "#ffffff",
      },
    },
  },
  {
    id: "help-center",
    label: "Hjälpcenter",
    icon: "help",
    layout: { header: false, body: "fixed", footer: false },
    editorMode: "locked",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: false,
  },
  {
    id: "support",
    label: "Support",
    icon: "support_agent",
    layout: { header: false, body: "fixed", footer: false },
    editorMode: "locked",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: false,
  },
] as const;

// ═══════════════════════════════════════════════════════════════
// LOOKUP
// ═══════════════════════════════════════════════════════════════

/** Index for O(1) lookup by page ID. */
const PAGE_MAP = new Map<PageId, PageDefinition>(
  PAGE_DEFINITIONS.map((p) => [p.id, p]),
);

/** Type guard: checks whether a string is a valid PageId. */
export function isPageId(id: string): id is PageId {
  return PAGE_MAP.has(id as PageId);
}

/**
 * Default layout used when a page definition is not found.
 * Matches current behavior: header + sections + footer.
 * Ensures backward compatibility for any unregistered page.
 */
const DEFAULT_LAYOUT: PageLayout = {
  header: true,
  body: "sections",
  footer: true,
};

/**
 * Resolves the page definition for a given page ID.
 * Returns the full definition, or a safe fallback if the page is unknown.
 */
export function getPageDefinition(pageId: PageId | string): PageDefinition {
  const def = PAGE_MAP.get(pageId as PageId);
  if (def) return def;

  // Unknown page → safe fallback (full layout)
  return {
    id: pageId as PageId,
    label: pageId,
    icon: "article",
    layout: DEFAULT_LAYOUT,
    editorMode: "full",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: false,
  };
}

/**
 * Resolves just the layout contract for a given page ID.
 * Convenience wrapper over getPageDefinition().
 */
export function getPageLayout(pageId: PageId | string): PageLayout {
  return getPageDefinition(pageId).layout;
}

/**
 * Returns all registered page definitions.
 * Used by admin UI to list available pages.
 */
export function getAllPageDefinitions(): readonly PageDefinition[] {
  return PAGE_DEFINITIONS;
}
