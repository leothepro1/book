/**
 * Theme Engine — Core Type System
 *
 * Modelled after Shopify's theme architecture:
 *
 *   ThemeManifest
 *     ├── templates        (per-page layouts: home, shop, account, stays…)
 *     │     └── sections[] (ordered section slots with variants)
 *     ├── sectionGroups    (shared across all pages: header, footer)
 *     │     └── sections[]
 *     └── settings         (theme-level config schema)
 *
 * CRITICAL SEPARATION:
 *   • Theme  = LAYOUT  (which sections on which pages, in what order, which variant)
 *   • Design = STYLING (colours, fonts, button shapes, tile styles, logo)
 *   These are fully orthogonal. Any theme works with any design config.
 *   Design is managed via ThemeConfig in the Design admin page.
 *   Theme layout is managed via ThemeManifest in the Themes admin tab.
 *
 * EXTENSIBILITY:
 *   • SectionType is `string` — new types (product-grid, stay-list, etc.)
 *     can be added by registering a component, no core type changes needed.
 *   • TemplateKey is `string` — new page types are added by defining a
 *     template in the manifest, no engine changes needed.
 *   • Marketplace-ready — themes self-register via registerTheme().
 */

import type { Booking } from "@prisma/client";
import type { BookingStatus } from "../booking";
import type { TenantConfig } from "../tenant/types";
import type { ThemeConfig } from "../theme/types";

// ─── Theme Manifest ──────────────────────────────────────

export type ThemeManifest = {
  /** Unique, stable identifier (kebab-case). Used in DB + URLs. */
  id: string;

  /** Human-readable display name. */
  name: string;

  /** SemVer version string. Theme updates preserve tenant content. */
  version: string;

  /** Theme author metadata. */
  author: ThemeAuthor;

  /** Short marketing description for theme browser/marketplace. */
  description: string;

  /** Card thumbnail shown in the theme picker grid. */
  thumbnail: string;

  /** Preview screenshot URLs for detailed theme browsing. */
  previewImages: string[];

  /** Searchable tags for marketplace filtering. */
  tags: string[];

  /**
   * Per-page templates.
   *
   * Each key is a page/route identifier (e.g. "home", "shop", "account").
   * The value defines which sections appear on that page, in what order,
   * with what variant.
   *
   * Equivalent to Shopify's templates/*.json files.
   */
  templates: Record<string, TemplateDefinition>;

  /**
   * Section groups shared across ALL pages.
   *
   * Equivalent to Shopify's section groups (header-group, footer-group).
   * "header" sections render before the template.
   * "footer" sections render after the template.
   */
  sectionGroups: {
    header: ThemeSectionSlot[];
    footer: ThemeSectionSlot[];
  };

  /**
   * Theme-level settings schema.
   * Layout-related settings that apply across all templates.
   * NOT design settings (colours, fonts) — those stay in ThemeConfig.
   */
  settings: SettingField[];

  /** Default values for theme-level settings. */
  settingDefaults: Record<string, unknown>;

  /** Detail page content for admin theme browser. */
  detail: ThemeDetailData;

  /**
   * Schema migrations — run when a tenant's themeVersion < manifest.version.
   *
   * Each entry maps a target version to a migration function that transforms
   * stored section settings to match the new schema. Migrations run in order
   * from the tenant's version to the manifest's current version.
   *
   * Example:
   *   migrations: {
   *     "2.0.0": (settings) => {
   *       // Rename "hero" slot → "hero-banner"
   *       if (settings["classic:hero"]) {
   *         settings["classic:hero-banner"] = settings["classic:hero"];
   *         delete settings["classic:hero"];
   *       }
   *       return settings;
   *     },
   *   }
   */
  migrations?: Record<string, (settings: TenantSectionSettings) => TenantSectionSettings>;

  /**
   *
   * Applied to `config.theme` when the tenant selects this theme.
   * Contains a complete ThemeConfig so every design property is
   * explicitly set (no partial merging ambiguity).
   *
   * The tenant can customise these values afterwards in the Design tab.
   * Undo reverts to the tenant's previous design.
   *
   * Equivalent to Shopify's theme style presets (settings_data.json).
   */
  designPreset: ThemeConfig;
};

export type ThemeAuthor = {
  name: string;
  url?: string;
};

// ─── Theme Detail Page ──────────────────────────────────

/**
 * Content shown on the theme detail/browse page in admin.
 * Every field varies per theme — the layout is always the same.
 */
export type ThemeDetailData = {
  /** Heading shown below the preview. */
  heading: string;

  /** Description paragraph. */
  description: string;

  /** 3-column feature grid items. */
  features: ThemeFeatureItem[];
};

export type ThemeFeatureItem = {
  image: string;
  title: string;
  description: string;
};

// ─── Template Definition ─────────────────────────────────

/**
 * Defines the section layout for a single page type.
 *
 * A template is a named list of section slots that together
 * form the content area of a page (between header and footer).
 */
export type TemplateDefinition = {
  /** Human-readable name shown in admin (e.g. "Startsida", "Butik"). */
  name: string;

  /** Ordered section slots for this page. */
  sections: ThemeSectionSlot[];
};

// ─── Section Slot ────────────────────────────────────────

/**
 * A slot in the theme layout for a specific section.
 *
 * The `type` + `variant` together form the registry key that
 * resolves to a React component: "hero/contained", "card-feed/standard".
 *
 * `type` is a free-form string — any section type can be used as long
 * as a component is registered for it. This allows adding new section
 * types (product-grid, stay-list, checkout-form…) without modifying
 * the core type system.
 */
export type ThemeSectionSlot = {
  /** Unique identifier within this theme (e.g. "hero", "main-links"). */
  id: string;

  /**
   * Section type — identifies the component family.
   * Free-form string for extensibility.
   * Built-in types: "hero", "info-bar", "quick-links", "card-feed".
   */
  type: string;

  /**
   * Which variant of the section to render.
   * Maps to a registered section component (e.g., "contained", "fullscreen").
   */
  variant: string;

  /** Display order (ascending). */
  order: number;

  /**
   * Default settings for this slot.
   * Merged with tenant overrides: { ...defaults, ...tenantOverrides }.
   */
  defaults: Record<string, unknown>;

  /**
   * Settings schema — declares what the tenant can customize.
   * Used by the admin theme editor to generate form fields.
   */
  schema: SettingField[];
};

// ─── Settings Schema ─────────────────────────────────────

export type SettingFieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "image"
  | "color"
  | "select"
  | "segmented"
  | "toggle"
  | "number"
  | "range"
  | "url"
  | "link"
  | "cornerRadius"
  | "weightRange"
  | "markers"
  | "mapPicker";

export type SettingField = {
  key: string;
  type: SettingFieldType;
  label: string;
  description?: string;
  /** External link rendered below description (e.g. { href: "https://...", label: "See icons" }). */
  descriptionLink?: { href: string; label: string };
  default?: unknown;
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  group?: string;
  /** Hidden fields are not rendered in the settings form but pass through resolveSettings. */
  hidden?: boolean;
  /** When true, the label and description are not shown in the editor form. */
  hideLabel?: boolean;
  /** Unit label displayed next to range input (e.g. "%", "px"). */
  unit?: string;
};

// ─── Section Component Contract ──────────────────────────

/**
 * Props passed to every section component.
 *
 * This is the universal contract between the theme engine
 * and individual section renderers. Every section receives
 * the same shape — the variant component decides what to use.
 */
export type SectionProps<TSettings extends Record<string, unknown> = Record<string, unknown>> = {
  /** Merged settings: theme slot defaults ← tenant overrides. */
  settings: TSettings;

  /** The section slot definition from the theme manifest. */
  slot: ThemeSectionSlot;

  /** Full tenant configuration (for content: cards, links, images). */
  config: TenantConfig;

  /** Current booking data. */
  booking: Booking;

  /** Resolved booking status enum. */
  bookingStatus: BookingStatus;

  /** Access token for building internal URLs (check-in, etc.). */
  token?: string;

  /** Theme-level merged settings. */
  themeSettings: Record<string, unknown>;
};

export type SectionComponent<TSettings extends Record<string, unknown> = Record<string, unknown>> =
  React.ComponentType<SectionProps<TSettings>>;

// ─── Registry Key ────────────────────────────────────────

/** Composite key for section component lookup: "hero/contained". */
export type SectionRegistryKey = `${string}/${string}`;

// ─── Tenant Config Extension ─────────────────────────────

/**
 * Per-section settings overrides stored in tenant config.
 * Keys are section slot IDs (scoped by template), values are settings.
 *
 * Namespacing: "home:hero" for slot "hero" in template "home".
 * Or flat: "hero" if slot IDs are globally unique within the theme.
 */
export type TenantSectionSettings = Record<string, Record<string, unknown>>;
