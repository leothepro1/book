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

import type { PageId, BasePageId, PageDefinition, PageLayout, LayoutVariant } from "./types";

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
    label: "Sökning",
    icon: "travel_explore",
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
    editorVisible: false,
    steps: [
      { id: "find-booking", label: "Hitta bokning", icon: "search" },
      { id: "confirm", label: "Bekräfta bokning", icon: "fact_check" },
      { id: "tasks", label: "Uppgifter", icon: "assignment" },
      { id: "success", label: "Bekräftelse", icon: "check_circle" },
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
      },
    },
  },
  {
    id: "login",
    label: "Logga in",
    icon: "login",
    layout: { header: false, body: "fixed", footer: false },
    editorMode: "settings",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
    pageSettings: {
      fields: [
        {
          key: "backgroundColor",
          type: "color",
          label: "Bakgrundsfärg",
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
          key: "logoUrl",
          type: "image",
          label: "Logotyp",
          group: "Logotyp",
        },
        {
          key: "logoWidth",
          type: "range",
          label: "Logotypbredd",
          group: "Logotyp",
          min: 40,
          max: 280,
          step: 4,
          unit: "px",
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
        logoUrl: "",
        logoWidth: 120,
        headingFont: "inter",
        bodyFont: "inter",
        buttonFont: "inter",
        accentColor: "#121212",
        buttonColor: "#121212",
        textColor: "#121212",
        borderColor: "#D7DADE",
      },
    },
  },
  {
    id: "product",
    label: "Boende",
    icon: "bed",
    layout: { header: true, body: "sections", footer: true },
    editorMode: "full",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
    previewResource: {
      pickerType: "accommodationPicker",
      label: "Förhandsvisar",
      dataKey: "product",
    },
  },
  {
    id: "shop-product",
    label: "Produktsida",
    icon: "shopping_bag",
    layout: { header: true, body: "sections", footer: true },
    editorMode: "full",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
    previewResource: {
      pickerType: "productPicker",
      label: "Förhandsvisar",
      dataKey: "product",
    },
  },
  {
    id: "checkout",
    label: "Kassa",
    icon: "shopping_cart",
    layout: { header: false, body: "fixed", footer: false },
    editorMode: "settings",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
    pageSettings: {
      fields: [
        // ── Sidhuvud ──────────────────────────────────────
        {
          key: "logoUrl",
          type: "image",
          label: "Logotyp",
          group: "Sidhuvud",
        },
        {
          key: "logoAlignment",
          type: "segmented",
          label: "Logotypens justering",
          group: "Sidhuvud",
          options: [
            { value: "left", label: "Vänster" },
            { value: "center", label: "Mitten" },
          ],
        },
        // ── Allmänt ────────────────────────────────────────
        {
          key: "backgroundColor",
          type: "color",
          label: "Bakgrundsfärg",
          description: "Bakgrunden för kassaformuläret.",
          group: "Allmänt",
        },
        {
          key: "summaryBackgroundColor",
          type: "color",
          label: "Ordersammanfattning",
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
        // ── Färger ────────────────────────────────────────
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
          key: "errorColor",
          type: "color",
          label: "Felfärg",
          group: "Färger",
        },
        // ── Typografi ─────────────────────────────────────
        {
          key: "headingFont",
          type: "fontPicker" as any,
          label: "Rubriker",
          group: "Typografi",
        },
        {
          key: "bodyFont",
          type: "fontPicker" as any,
          label: "Brödtext",
          group: "Typografi",
        },
      ],
      defaults: {
        logoUrl: "",
        logoAlignment: "center",
        backgroundColor: "#FFFFFF",
        summaryBackgroundColor: "#FFFFFF",
        fieldStyle: "white",
        accentColor: "#121212",
        buttonColor: "#121212",
        errorColor: "#c13515",
        headingFont: "inter",
        bodyFont: "inter",
      },
    },
  },
  {
    id: "thank-you",
    label: "Tack",
    icon: "celebration",
    layout: { header: false, body: "fixed", footer: false },
    editorMode: "settings",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
    settingsSource: "checkout",
  },
  {
    id: "bookings",
    label: "Bokningar",
    icon: "calendar_month",
    layout: { header: true, body: "fixed", footer: false },
    editorMode: "settings",
    settingsSource: "profile" as any,
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
  },
  {
    id: "order-status",
    label: "Orderstatus",
    icon: "local_shipping",
    layout: { header: false, body: "fixed", footer: false },
    editorMode: "settings",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
    pageSettings: {
      fields: [
        {
          key: "backgroundColor",
          type: "color",
          label: "Bakgrundsfärg",
          group: "Allmänt",
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
          key: "headingFont",
          type: "fontPicker" as any,
          label: "Rubriker",
          group: "Typografi",
        },
        {
          key: "bodyFont",
          type: "fontPicker" as any,
          label: "Brödtext",
          group: "Typografi",
        },
      ],
      defaults: {
        backgroundColor: "#FFFFFF",
        accentColor: "#121212",
        buttonColor: "#121212",
        headingFont: "inter",
        bodyFont: "inter",
      },
    },
  },
  {
    id: "profile",
    label: "Profil",
    icon: "person",
    layout: { header: true, body: "fixed", footer: false },
    editorMode: "settings",
    availableLayouts: [{ id: "default", label: "Standard" }],
    defaultLayout: "default",
    editorVisible: true,
    pageSettings: {
      fields: [
        {
          key: "backgroundColor",
          type: "color",
          label: "Bakgrundsfärg",
          group: "Allmänt",
        },
        {
          key: "textColor",
          type: "color",
          label: "Textfärg",
          group: "Färger",
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
          key: "borderColor",
          type: "color",
          label: "Ramar",
          group: "Färger",
        },
        {
          key: "headingFont",
          type: "fontPicker" as any,
          label: "Rubriker",
          group: "Typografi",
        },
        {
          key: "bodyFont",
          type: "fontPicker" as any,
          label: "Brödtext",
          group: "Typografi",
        },
      ],
      defaults: {
        backgroundColor: "#fafafa",
        textColor: "#1a1a1a",
        accentColor: "#1a1a1a",
        buttonColor: "#1a1a1a",
        borderColor: "#ebebeb",
        headingFont: "inter",
        bodyFont: "inter",
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

/** Index for O(1) lookup by base page ID. */
const PAGE_MAP = new Map<BasePageId, PageDefinition>(
  PAGE_DEFINITIONS.map((p) => [p.id as BasePageId, p]),
);

/** Pattern for template page IDs: "shop-product.{suffix}" where suffix is [a-z0-9-]+ */
const TEMPLATE_PAGE_PATTERN = /^shop-product\.[a-z0-9-]+$/;

/** Type guard: checks whether a string is a valid PageId (base or template). */
export function isPageId(id: string): id is PageId {
  return PAGE_MAP.has(id as BasePageId) || TEMPLATE_PAGE_PATTERN.test(id);
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
  const def = PAGE_MAP.get(pageId as BasePageId);
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
