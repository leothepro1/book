/**
 * Page Layout Contract
 * ════════════════════
 *
 * Platform-controlled definitions that determine which layout
 * resources exist for each page type. Tenants cannot create or
 * modify page types — they are predefined by the platform.
 *
 * This contract controls BOTH:
 *   1. Guest rendering — which layout resources are rendered
 *   2. Editor UI — which items appear in the editor panel
 *
 * Architectural invariants:
 *   - Page definitions are static constants, never stored in DB
 *   - Header and footer remain singleton page resources (not SectionInstances)
 *   - Sections remain the only builder area
 *   - Missing definitions fall back to full layout (backward-compatible)
 */

// ═══════════════════════════════════════════════════════════════
// PAGE IDENTITY
// ═══════════════════════════════════════════════════════════════

/**
 * Platform-defined page identifiers.
 *
 * Each key maps to a specific route and config path.
 * New pages are added here as the platform grows.
 */
export type PageId =
  | "home"
  | "stays"
  | "account"
  | "check-in"
  | "login"
  | "help-center"
  | "support"
  | "product"
  | "checkout";

// ═══════════════════════════════════════════════════════════════
// EDITOR MODE
// ═══════════════════════════════════════════════════════════════

/**
 * How the editor behaves for this page.
 *
 * Separate from BodyMode (which controls portal rendering).
 * These are different responsibilities and must never be mixed.
 *
 *   "full"     — full section builder with DnD and picker
 *   "locked"   — fixed content, no builder, no picker
 *   "settings" — no section panel at all, settings panel takes over
 */
export type EditorMode = "full" | "locked" | "settings";

// ═══════════════════════════════════════════════════════════════
// BODY MODE
// ═══════════════════════════════════════════════════════════════

/**
 * How the page body is rendered.
 *
 *   "sections" — tenant-editable section builder (DnD, add/remove)
 *   "fixed"    — platform-controlled content (no builder UI)
 */
export type BodyMode = "sections" | "fixed";

// ═══════════════════════════════════════════════════════════════
// LAYOUT CONTRACT
// ═══════════════════════════════════════════════════════════════

/**
 * Defines which layout resources a page type supports.
 *
 * This is the core contract. Guest rendering and the editor
 * both read from this to decide what to show.
 */
export type PageLayout = {
  /** Whether the page renders a header. */
  header: boolean;
  /** How the page body is rendered. */
  body: BodyMode;
  /** Whether the page renders a footer. */
  footer: boolean;
};

/**
 * A named layout variant available for a page.
 * Tenants switch between layouts — they cannot create new ones.
 */
export type LayoutVariant = {
  /** Unique key within this page (e.g. "default", "grid", "minimal"). */
  id: string;
  /** Display name shown in the editor. */
  label: string;
};

/**
 * Complete page definition — identity + layout + metadata.
 */
export type PageDefinition = {
  /** Unique page identifier. */
  id: PageId;
  /** Display name shown in the editor (Swedish). */
  label: string;
  /** Material Symbols icon name for the editor page switcher. */
  icon: string;
  /** Layout contract — controls portal rendering (NOT editor behavior). */
  layout: PageLayout;
  /** Editor behavior mode — controls how the editor panel behaves for this page. */
  editorMode: EditorMode;
  /** Available layout variants for this page. First is the default. */
  availableLayouts: readonly LayoutVariant[];
  /** Default layout ID (must match an entry in availableLayouts). */
  defaultLayout: string;
  /**
   * Whether this page appears in the editor page switcher.
   * Pages with editorVisible=false exist in the guest portal
   * but cannot be targeted by the editor yet.
   * This is the single source of truth — no separate allowlist.
   */
  editorVisible: boolean;
  /** If set, this page is only available when this feature flag is true. */
  requiresFeatureFlag?: string;
  /** Sub-steps for flow pages (e.g. check-in). Shown as a submenu in the editor page switcher. */
  steps?: readonly PageStep[];
  /**
   * Declarative page-level settings for editorMode === "settings".
   * Same pattern as editableFields on SectionDefinition — SettingsPanel
   * reads this and renders the defined fields generically.
   */
  pageSettings?: PageSettingsDefinition;
};

/**
 * Declarative settings schema for a page.
 * Reuses SettingField — the universal field type across the platform.
 */
export type PageSettingsDefinition = {
  /** Setting fields to render in the editor SettingsPanel. */
  fields: import("@/app/(guest)/_lib/themes/types").SettingField[];
  /** Default values for each field key. */
  defaults: Record<string, unknown>;
};

/**
 * A step within a multi-step flow page.
 * Platform-defined — tenants can style but not reorder or remove steps.
 */
export type PageStep = {
  id: string;
  label: string;
  icon: string;
};
