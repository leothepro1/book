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
  | "help-center"
  | "support";

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
 * Complete page definition — identity + layout + metadata.
 */
export type PageDefinition = {
  /** Unique page identifier. */
  id: PageId;
  /** Display name shown in the editor (Swedish). */
  label: string;
  /** Layout contract — controls rendering and editor UI. */
  layout: PageLayout;
};
