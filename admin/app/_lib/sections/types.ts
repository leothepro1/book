/**
 * Section System — Core Type System
 *
 * Three-level content hierarchy:
 *
 *   Section           (layout container — the HTML structure)
 *     └── Block[]     (items within the section — e.g. each slide in a slider)
 *           └── Slots (named containers — media, content, actions)
 *                └── Element[]  (atomic content — text, button, image)
 *
 * FIVE ARCHITECTURAL PILLARS:
 *
 *   1. VERSIONING
 *      Every definition level carries a semver version string.
 *      Instances record the version they were created against.
 *      This enables safe schema migrations over time.
 *
 *   2. ACTIONS (separated from content)
 *      Element content lives in `settings` (text, colour, size).
 *      Element behaviour lives in `action` (open URL, open modal, scroll).
 *      This separation keeps interaction logic consistent and composable.
 *
 *   3. SLOTS (structured layout within blocks)
 *      Blocks don't have a flat `elements[]`. They have named SLOTS:
 *        block.slots = { media: [...], content: [...], actions: [...] }
 *      Each slot declares which elements it accepts and its constraints.
 *      Renderers know exactly where each element goes — no guessing.
 *
 *   4. PRESET MIGRATION
 *      Switching presets can fundamentally change the content tree.
 *      Each preset declares a `changeStrategy`:
 *        - "reset":               wipe blocks, start from defaults
 *        - "migrate":             run migration function to transform blocks
 *        - "preserve_compatible": keep blocks whose types exist in new preset
 *      Optional `migrations` map: oldPresetKey → transform function.
 *
 *   5. STRICT RENDER CONTRACT
 *      resolve() → validate() → render()
 *      Renderers receive fully resolved, validated data.
 *      They never contain fallback logic or default handling.
 *      If data is invalid, it doesn't reach the renderer.
 *
 * CONSTRAINT FLOW:
 *   SectionDefinition → presets
 *   SectionPreset → block types
 *   BlockTypeDefinition → slots
 *   SlotDefinition → allowed element types
 *   ElementDefinition → settings schema + action support
 *
 * SETTINGS HIERARCHY:
 *   Theme    → design frame (colours, fonts, shapes)
 *   Section  → shared settings across all presets (padding, bg)
 *   Preset   → preset-specific settings (columns, animation)
 *   Block    → per-item configuration (background, overlay)
 *   Element  → content (text value, image src, label)
 *   Action   → behaviour (open URL, open modal, scroll to)
 */

import type { SettingField, SettingFieldType } from "@/app/(guest)/_lib/themes/types";

export type { SettingField, SettingFieldType };

// ═══════════════════════════════════════════════════════════════
// ACTION MODEL (behaviour separated from content)
// ═══════════════════════════════════════════════════════════════

/**
 * An action defines WHAT HAPPENS when an element is interacted with.
 *
 * Separated from element settings (content/visual) so that:
 *   - Interaction logic is consistent across all element types
 *   - New action types can be added without touching element schemas
 *   - Renderers can handle actions uniformly (onClick dispatcher)
 */
export type ElementAction =
  | { type: "none" }
  | { type: "open_url"; url: string; target?: "_blank" | "_self" }
  | { type: "open_modal"; modalId: string }
  | { type: "scroll_to"; sectionId: string }
  | { type: "phone"; number: string }
  | { type: "email"; address: string; subject?: string };

/**
 * All possible action types. Used for validation and UI generation.
 */
export const ACTION_TYPES = [
  "none",
  "open_url",
  "open_modal",
  "scroll_to",
  "phone",
  "email",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

/** Default action — no behaviour. */
export const NO_ACTION: ElementAction = { type: "none" };

// ═══════════════════════════════════════════════════════════════
// ELEMENT LAYER (leaf nodes)
// ═══════════════════════════════════════════════════════════════

/**
 * Built-in element types.
 *
 * Each type maps to a globally registered ElementDefinition.
 * New types extend this union and register their definition.
 */
export type ElementType =
  | "heading"
  | "text"
  | "button"
  | "image"
  | "divider"
  | "icon"
  | "richtext"
  | "collapsible"
  | "map"
  | "video"
  | "gallery";

/**
 * A named settings bundle for an element type.
 *
 * Element presets are lightweight — they override specific settings
 * to create meaningful starting points (e.g. "Center aligned heading").
 * Unlike section presets which control structure (blocks, slots),
 * element presets only control initial settings.
 */
export type ElementPreset = {
  /** Unique key within this element type. */
  key: string;

  /** Human-readable name (shown in preset picker). */
  name: string;

  /** Short description. */
  description: string;

  /** Preview thumbnail URL. */
  thumbnail: string;

  /** Settings applied on top of element defaults when this preset is chosen. */
  settingOverrides: Record<string, unknown>;
};

/**
 * Blueprint for an element type. Registered globally.
 */
export type ElementDefinition = {
  /** Element type key (matches ElementType union). */
  type: ElementType;

  /**
   * SemVer version. Increment when schema changes.
   * Enables migration of stored element instances.
   */
  version: string;

  /** Human-readable name (e.g. "Heading", "Button"). */
  name: string;

  /** Short description for element picker UI. */
  description: string;

  /** Icon identifier for the element picker. */
  icon: string;

  /**
   * Whether this element type supports actions.
   * If true, the editor shows an action picker.
   * If false, the element is purely presentational.
   */
  supportsAction: boolean;

  /**
   * Settings schema — CONTENT and VISUAL only.
   * No interaction behaviour here (that's in `action`).
   */
  settingsSchema: SettingField[];

  /** Default values for all settings. */
  settingDefaults: Record<string, unknown>;

  /**
   * Skip the preset picker and add the element directly with its first preset.
   * Useful for simple elements (heading, text, image) that don't need preset selection.
   */
  skipPresetPicker?: boolean;

  /**
   * Restricts this element to a specific page. If set, the element
   * cannot be added to any other page's sections.
   */
  pageScope?: import("@/app/_lib/pages/types").PageId;

  /**
   * Restricts this element to a specific section definition.
   * If set, the element cannot be added to other section types.
   */
  sectionScope?: string;

  /**
   * Available presets — named starting configurations.
   * First preset is the default. Min 1 required.
   */
  presets: ElementPreset[];
};

/**
 * A placed element inside a block slot.
 *
 * Leaf node of the content tree.
 * Content in `settings`, behaviour in `action`.
 */
export type ElementInstance = {
  /** Unique instance identifier. */
  id: string;

  /** Element type key — references a registered ElementDefinition. */
  type: ElementType;

  /**
   * Content + visual settings (merged over definition defaults at render).
   * Examples: text content, font size, colour, alignment.
   */
  settings: Record<string, unknown>;

  /**
   * Interaction behaviour. Only meaningful if the element's
   * definition has `supportsAction: true`.
   * Defaults to `{ type: "none" }` if omitted.
   */
  action: ElementAction;

  /** Display order within the parent slot (ascending). */
  sortOrder: number;

  /** Whether this element is visible. Defaults to true when omitted. */
  isActive?: boolean;

  /** ISO 8601 — element becomes visible at this time. */
  scheduledShow?: string;

  /** ISO 8601 — element becomes hidden at this time. */
  scheduledHide?: string;
};

// ═══════════════════════════════════════════════════════════════
// SLOT LAYER (structured layout within blocks)
// ═══════════════════════════════════════════════════════════════

/**
 * Defines a named container within a block type.
 *
 * Slots give renderers deterministic layout positions:
 *   block.slots.media    → image / video area
 *   block.slots.content  → heading + text area
 *   block.slots.actions  → buttons / links area
 *
 * Without slots, a flat elements[] forces renderers to
 * guess where each element should go. Slots eliminate that.
 */
export type SlotDefinition = {
  /** Unique key within the block type (e.g. "media", "content", "actions"). */
  key: string;

  /** Human-readable name shown in the editor panel. */
  name: string;

  /** Short description of what goes in this slot. */
  description: string;

  /** Which element types can be placed in this slot. */
  allowedElements: ElementType[];

  /** Minimum number of elements in this slot (0 = empty OK). */
  minElements: number;

  /** Maximum number of elements in this slot (-1 = unlimited). */
  maxElements: number;

  /**
   * Default elements placed in this slot when a new block is created.
   * IDs are generated at creation time, not stored here.
   */
  defaultElements: Omit<ElementInstance, "id">[];
};

// ═══════════════════════════════════════════════════════════════
// BLOCK LAYER (items within sections)
// ═══════════════════════════════════════════════════════════════

/**
 * Defines a block type within a preset.
 *
 * Block types are per-preset. A "slide" in Preset A may have
 * different slots/elements than a "slide" in Preset B.
 */
export type BlockTypeDefinition = {
  /** Unique type key within this preset (e.g. "slide", "card", "tab"). */
  type: string;

  /**
   * SemVer version. Increment when slot structure changes.
   */
  version: string;

  /** Human-readable name (e.g. "Slide", "Tab"). */
  name: string;

  /** Short description for the block picker. */
  description: string;

  /** Icon identifier for the block picker. */
  icon: string;

  // ─── Slots ───

  /**
   * Named slots within this block type.
   * Each slot declares which elements it accepts and constraints.
   *
   * Example for a hero slide:
   *   slots: [
   *     { key: "media",   allowedElements: ["image"],           maxElements: 1 },
   *     { key: "content", allowedElements: ["heading", "text"], maxElements: 2 },
   *     { key: "actions", allowedElements: ["button"],          maxElements: 2 },
   *   ]
   *
   * Must have at least one slot.
   */
  slots: SlotDefinition[];

  // ─── Block-Level Settings ───

  /** Settings schema for block-level configuration. */
  settingsSchema: SettingField[];

  /** Default values for block-level settings. */
  settingDefaults: Record<string, unknown>;
};

/**
 * A placed block inside a section.
 *
 * Each block is one "item" — a slide, a card, a tab.
 * Elements live in named slots, not a flat array.
 */
export type BlockInstance = {
  /** Unique instance identifier. */
  id: string;

  /** Block type key — references a BlockTypeDefinition.type. */
  type: string;

  /** Block-level settings overrides. */
  settings: Record<string, unknown>;

  /**
   * Elements organised by slot key.
   * Each value is an ordered array of elements within that slot.
   *
   * Example:
   *   slots: {
   *     media:   [{ id: "elm_1", type: "image", ... }],
   *     content: [{ id: "elm_2", type: "heading", ... }, { id: "elm_3", type: "text", ... }],
   *     actions: [{ id: "elm_4", type: "button", ... }],
   *   }
   */
  slots: Record<string, ElementInstance[]>;

  /** Display order within the parent section (ascending). */
  sortOrder: number;

  /** Whether this block is visible. */
  isActive: boolean;

  /** ISO 8601 — block becomes visible at this time. */
  scheduledShow?: string;

  /** ISO 8601 — block becomes hidden at this time. */
  scheduledHide?: string;
};

// ═══════════════════════════════════════════════════════════════
// PRESET LAYER (complete section templates)
// ═══════════════════════════════════════════════════════════════

/**
 * Strategy for handling existing content when switching TO a preset.
 *
 * - "reset":               Wipe all blocks, create defaults from new preset.
 * - "migrate":             Run migration function to transform blocks.
 * - "preserve_compatible": Keep blocks whose type exists in new preset,
 *                          drop incompatible ones, remap slots where possible.
 */
export type PresetChangeStrategy = "reset" | "migrate" | "preserve_compatible";

/**
 * A complete section preset — HTML, CSS, slots, constraints, defaults.
 */
export type SectionPreset = {
  /** Unique key within this section type. */
  key: string;

  /**
   * SemVer version. Increment when block types or slots change.
   * Enables migration of stored instances.
   */
  version: string;

  /** Human-readable name. */
  name: string;

  /** Short description. */
  description: string;

  /** Preview thumbnail URL. */
  thumbnail: string;

  /**
   * CSS class applied to the section container element.
   * Convention: "s-{sectionId}--{presetKey}"
   */
  cssClass: string;

  // ─── Block Configuration ───

  /** Block types available in this preset. Min 1. */
  blockTypes: BlockTypeDefinition[];

  /** Minimum number of blocks (0 = empty OK). */
  minBlocks: number;

  /** Maximum number of blocks (-1 = unlimited). */
  maxBlocks: number;

  // ─── Preset-Specific Settings ───

  /** Settings schema specific to this preset. */
  settingsSchema: SettingField[];

  /** Default values for preset-specific settings. */
  settingDefaults: Record<string, unknown>;

  // ─── Preset Change ───

  /**
   * How to handle existing content when switching TO this preset.
   */
  changeStrategy: PresetChangeStrategy;

  /**
   * Migration functions from other presets.
   * Key: source preset key. Value: transform function.
   *
   * Only used when `changeStrategy` is "migrate".
   * If no migration exists for the source preset, falls back to "reset".
   *
   * Example:
   *   migrations: {
   *     "underline": (blocks) => blocks.map(b => transformToCards(b)),
   *   }
   */
  migrations: Record<string, (blocks: BlockInstance[]) => BlockInstance[]>;

  // ─── Factory ───

  /**
   * Creates default blocks when a user picks this preset.
   * Returns block data without IDs (generated at creation time).
   */
  createDefaultBlocks: () => Omit<BlockInstance, "id">[];
};

// ═══════════════════════════════════════════════════════════════
// SECTION LAYER (top-level layout containers)
// ═══════════════════════════════════════════════════════════════

/** Unique identifier for a section type (kebab-case). */
export type SectionDefinitionId = string;

/**
 * Category for grouping in the section picker.
 */
export type SectionCategory =
  | "hero"
  | "navigation"
  | "content"
  | "media"
  | "utility";

/**
 * Defines a section type. The top-level blueprint.
 */
export type SectionDefinition = {
  /** Unique, stable identifier (kebab-case). */
  id: SectionDefinitionId;

  /**
   * SemVer version. Increment when presets or settings change.
   * Enables migration of stored instances.
   */
  version: string;

  /** Human-readable name. */
  name: string;

  /** Short description for the section picker. */
  description: string;

  /** Category for grouping. */
  category: SectionCategory;

  /** Searchable tags for filtering. */
  tags: string[];

  /** Thumbnail URL for the section picker. */
  thumbnail: string;

  // ─── Scope & Access Control ───

  /**
   * Whether this section can be freely added/removed by tenants
   * or is platform-controlled (locked).
   *
   *   "free"   — tenant can add, delete, reorder (default behaviour)
   *   "locked" — auto-seeded by the platform, cannot be deleted
   */
  scope: "free" | "locked";

  /**
   * For locked sections: restricts this section to a specific page.
   * The auto-seed effect only creates the section on this page.
   * Ignored for "free" scope sections.
   */
  lockedTo?: import("@/app/_lib/pages/types").PageId;

  /**
   * Platform-admin contract for DetailPanel rendering.
   *
   * When set, DetailPanel ONLY renders controls whose field key
   * appears in this array. Fields not listed are hidden even if
   * they exist in settingsSchema or presetSettingsSchema.
   *
   * When undefined (all "free" sections), all fields are rendered
   * — backward-compatible with the existing behaviour.
   *
   * This is enforced generically in DetailPanel — no section-specific
   * conditional rendering needed.
   */
  editableFields?: string[];

  // ─── Section-Level Settings (shared across all presets) ───

  /** Settings schema shared by all presets. */
  settingsSchema: SettingField[];

  /** Default values for section-level settings. */
  settingDefaults: Record<string, unknown>;

  // ─── Presets ───

  /** Available presets (min 1). First is the default. */
  presets: SectionPreset[];

  // ─── Factory ───

  /** Creates default instance data (everything except id + sortOrder). */
  createDefault: () => Omit<SectionInstance, "id" | "sortOrder">;
};

// ─── Section Instance ────────────────────────────────────────

/**
 * A concrete section placed on a page.
 * Stored in HomeConfig.sections[].
 */
export type SectionInstance = {
  /** Unique instance identifier. */
  id: string;

  /** References SectionDefinition.id. */
  definitionId: SectionDefinitionId;

  /**
   * Version of the SectionDefinition this instance was created/migrated against.
   * Used to detect when a migration is needed.
   */
  definitionVersion: string;

  /** Active preset key. */
  presetKey: string;

  /**
   * Version of the SectionPreset this instance was created/migrated against.
   * Used to detect when a migration is needed.
   */
  presetVersion: string;

  /** Display order on the page (ascending). */
  sortOrder: number;

  /** Whether this section is visible on the guest portal. */
  isActive: boolean;

  /**
   * Locked sections cannot be deleted by the tenant.
   * Used for platform-controlled sections like "Bokningar" on the stays page.
   */
  locked?: boolean;

  /** Section-level settings overrides (shared across presets). */
  settings: Record<string, unknown>;

  /** Preset-specific settings overrides. */
  presetSettings: Record<string, unknown>;

  /** Ordered blocks within this section. */
  blocks: BlockInstance[];

  /** Optional section heading. */
  title?: string;

  /** Optional section description. */
  description?: string;

  /** ISO 8601 — section becomes visible at this time. */
  scheduledShow?: string;

  /** ISO 8601 — section becomes hidden at this time. */
  scheduledHide?: string;

  /**
   * References a tenant-level ColorScheme by ID.
   * When set, the section and all its children inherit the scheme's
   * color tokens via CSS custom properties applied at section scope.
   * When undefined, falls back to TenantConfig.defaultColorSchemeId.
   * When no default exists either, the section inherits page-level tokens.
   */
  colorSchemeId?: import("@/app/_lib/color-schemes/types").ColorSchemeId;
};

// ═══════════════════════════════════════════════════════════════
// RENDERER CONTRACTS (strict: resolve → validate → render)
// ═══════════════════════════════════════════════════════════════

/**
 * Resolved element — fully merged, ready for rendering.
 * The renderer receives this. No fallback logic needed.
 */
export type ResolvedElement = {
  element: ElementInstance;
  /** Merged settings: elementDef.settingDefaults ← element.settings. */
  settings: Record<string, unknown>;
  /** Resolved action (defaults to NO_ACTION if not set). */
  action: ElementAction;
  /** The element definition. */
  definition: ElementDefinition;
};

/**
 * Resolved slot — elements within a specific slot, all merged.
 */
export type ResolvedSlot = {
  /** The slot definition (constraints, name, etc.). */
  definition: SlotDefinition;
  /** Resolved elements in order. */
  elements: ResolvedElement[];
};

/**
 * Resolved block — fully merged, all slots resolved.
 */
export type ResolvedBlock = {
  block: BlockInstance;
  /** Merged block settings. */
  settings: Record<string, unknown>;
  /** Resolved slots keyed by slot key. */
  slots: Record<string, ResolvedSlot>;
};

/**
 * Props passed to every section renderer component.
 *
 * This is the strict render contract. All data is:
 *   1. Resolved (settings merged, defaults applied)
 *   2. Validated (constraints checked, types verified)
 *
 * Renderers must NOT contain fallback logic, default
 * handling, or validation. They render what they receive.
 */
export type SectionRendererProps = {
  /** The section instance. */
  section: SectionInstance;

  /** The section definition. */
  definition: SectionDefinition;

  /** The active preset definition. */
  preset: SectionPreset;

  /** Merged section settings (definition defaults ← overrides). */
  settings: Record<string, unknown>;

  /** Merged preset settings (preset defaults ← overrides). */
  presetSettings: Record<string, unknown>;

  /** Resolved blocks in order, all slots resolved. */
  blocks: ResolvedBlock[];

  /** Full tenant config (design tokens, property info, etc.). */
  config: import("@/app/(guest)/_lib/tenant/types").TenantConfig;

  /**
   * Resolved color scheme for this section, if one is referenced.
   * Null when no scheme is set (section inherits page-level tokens).
   * Contains pre-computed CSS variables ready to apply on the section wrapper.
   */
  colorScheme: import("@/app/_lib/color-schemes/types").ResolvedColorScheme | null;
};

/**
 * A React component that renders a section preset.
 * Registry key: "definitionId/presetKey".
 */
export type SectionRendererComponent = React.ComponentType<SectionRendererProps>;

// ═══════════════════════════════════════════════════════════════
// REGISTRY KEYS
// ═══════════════════════════════════════════════════════════════

/** Composite key: "definitionId/presetKey". */
export type SectionRendererKey = `${string}/${string}`;

// ═══════════════════════════════════════════════════════════════
// ID GENERATION
// ═══════════════════════════════════════════════════════════════

/** Generate a unique section instance ID. */
export function createSectionId(): string {
  return `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a unique block instance ID. */
export function createBlockId(): string {
  return `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a unique element instance ID. */
export function createElementId(): string {
  return `elm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
