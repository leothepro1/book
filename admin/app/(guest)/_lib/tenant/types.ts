import type { ThemeConfig } from "../theme";
import type { HomeConfig } from "../portal/homeLinks";
import type { FooterConfig } from "../footer/types";
import type { FeatureFlags } from "../features/types";
import type { VisibilityRule } from "../rules/types";
import type { TenantSectionSettings } from "../themes/types";
import type { ColorScheme, ColorSchemeId } from "@/app/_lib/color-schemes/types";
import type { SectionInstance } from "@/app/_lib/sections/types";
import type { PageId } from "@/app/_lib/pages/types";

export type PropertySettings = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  checkInTime: string;
  checkOutTime: string;
  timezone: string;
};

// ─── Map Configuration ──────────────────────────────────────

export type MapMarkerConfig = {
  id: string;
  type?: "marker" | "category";
  lat: number;
  lng: number;
  title: string;
  description: string;
  content?: string;
  icon: string;
  color: string;
  address?: string;
  isActive?: boolean;
  sortOrder?: number;
  markerIds?: string[];
  layout?: string;
  showButton?: boolean;
  buttonLabel?: string;
  buttonUrl?: string;
  buttonOpenNewTab?: boolean;
};

// ─── Menu Configuration ──────────────────────────────────

export type MenuItemConfig = {
  id: string;
  label: string;
  url: string;
};

export type MenuConfig = {
  id: string;
  title: string;
  handle: string;
  items: MenuItemConfig[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Default footer menu — seeded on first config load if no menus exist.
 * Contains the same navigation links as the app footer tab bar.
 */
export const DEFAULT_FOOTER_MENU: MenuConfig = {
  id: "menu_footer",
  title: "Sidfotsmeny",
  handle: "footer",
  items: [
    { id: "mi_home", label: "Hem", url: "/" },
    { id: "mi_stays", label: "Bokningar", url: "/search" },
    { id: "mi_account", label: "Konto", url: "/account" },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export type MapConfig = {
  id: string;
  name: string;
  address?: string;
  style: string;
  customStyle: string;
  zoom: number;
  pitch: number;
  bearing: number;
  centerLat: number;
  centerLng: number;
  buildings3d: boolean;
  scrollZoom: boolean;
  navControls: boolean;
  showPropertyMarker: boolean;
  showPlaceLabels: boolean;
  showRoadLabels: boolean;
  markers: MapMarkerConfig[];
  createdAt: string;
  updatedAt: string;
};

// ─── Global Header Configuration ────────────────────────────

export type HeaderConfig = {
  /** Logo horizontal alignment within the header bar. */
  logoPosition: "left" | "center";
  /** Menu horizontal position within the header bar. */
  menuPosition?: "left" | "right";
  /** Selected menu ID — rendered as navigation links in the header. */
  headerMenuId?: string;
  /** Whether the language switcher is shown in the header. */
  showLanguageSwitcher?: boolean;
  /** Whether language flags are shown next to language labels. */
  showFlags?: boolean;
  /** Language switcher horizontal position. */
  languageSwitcherPosition?: "left" | "right";
  /** Menu item font style. */
  menuFont?: "body" | "heading" | "accent";
  /** Whether to show a bottom border dividing header from content. */
  showDivider: boolean;
  /** Color scheme applied to the header area. */
  colorSchemeId?: ColorSchemeId;
  /** Header spacing (px). */
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
};

export const HEADER_DEFAULTS: HeaderConfig = {
  logoPosition: "left",
  showDivider: true,
  paddingTop: 12,
  paddingRight: 16,
  paddingBottom: 12,
  paddingLeft: 16,
};

// ─── Global Footer Configuration ────────────────────────────

export type FooterActiveMode = "background" | "icon-only";
export type FooterLayout = "app" | "classic";

export type PageFooterConfig = {
  /** Whether the footer is visible on the guest portal. */
  isActive?: boolean;
  /** Footer layout style — "app" (tab bar) or "classic" (traditional footer). */
  footerLayout: FooterLayout;
  /** How the active tab is visually indicated. */
  activeMode: FooterActiveMode;
  /** Whether text labels are shown below icons. */
  showLabels: boolean;
  /** Whether to show a top border dividing footer from content. */
  showDivider: boolean;
  /** Color scheme applied to the footer area. */
  colorSchemeId?: ColorSchemeId;
  /** Classic layout element groups. Top: menus + buttons. Bottom: divider + content. */
  classicGroups?: {
    top: import("@/app/_lib/sections/types").ElementInstance[];
    bottom: import("@/app/_lib/sections/types").ElementInstance[];
  };
  /** Footer container spacing (px). */
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
};

export const PAGE_FOOTER_DEFAULTS: PageFooterConfig = {
  footerLayout: "app",
  activeMode: "background",
  showLabels: true,
  showDivider: true,
  paddingTop: 5,
  paddingRight: 5,
  paddingBottom: 5,
  paddingLeft: 5,
};

// ─── Stays Page Configuration ────────────────────────────────

export type StaysCoreConfig = {
  /** Page heading text (may contain HTML from richtext). */
  heading: string;
  /** Optional description shown below heading (may contain HTML). */
  description: string;
  /** Heading font size (px). */
  headingSize: number;
  /** Space below heading (px). */
  headingMarginBottom: number;
  /** Layout mode: "tabs" (grouped by current/previous) or "list" (flat chronological). */
  layout: "tabs" | "list";
  /** Tab label for current/upcoming bookings. */
  tabCurrentLabel: string;
  /** Tab label for previous bookings. */
  tabPreviousLabel: string;
  /** Whether booking cards have a box-shadow. */
  cardShadow: boolean;
  /** Fallback hero image URL for booking cards. */
  cardImageUrl: string;
  /** Section padding (px). */
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  /** Color scheme applied to the stays page body. */
  colorSchemeId?: ColorSchemeId;
};

export const STAYS_CORE_DEFAULTS: StaysCoreConfig = {
  heading: "Bokningar",
  description: "",
  headingSize: 22,
  headingMarginBottom: 10,
  layout: "tabs",
  cardShadow: true,
  tabCurrentLabel: "Aktuella",
  tabPreviousLabel: "Tidigare",
  cardImageUrl:
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=600&q=60",
  paddingTop: 19,
  paddingRight: 17,
  paddingBottom: 124,
  paddingLeft: 17,
};

// ─── Per-Page Configuration (v2) ─────────────────────────────

/**
 * Per-page configuration stored in TenantConfig.pages[pageId].
 *
 * Each page can have its own sections, header, and footer config.
 * Tenants cannot create or delete pages — only the platform defines pages.
 * Tenants can enable/disable pages and switch layouts via layoutId.
 */
export type PageConfig = {
  /** Whether this page is active for the tenant. */
  enabled: boolean;
  /** Which layout variant is active for this page. */
  layoutId: string;
  /** Section instances placed on this page (section-bearing pages only). */
  sections: SectionInstance[];
  /** Stays-specific core config (heading, tabs, card image). */
  coreComponent?: StaysCoreConfig;
  /** Check-in card configuration (check-in page only). */
  checkinCards?: import("@/app/_lib/checkin-cards/types").CheckinCardConfig;
  /** Page-level settings (editorMode === "settings" pages). */
  pageSettings?: Record<string, unknown>;
};

export type TenantConfig = {
  supportLinks: SupportLinks;
  tenantId: string;
  property: PropertySettings;
  theme: ThemeConfig;
  home: HomeConfig;
  footer: FooterConfig;
  features: FeatureFlags;
  rules: VisibilityRule[];

  /**
   * Global header configuration shared across all pages.
   * Previously stored per-page in pages[pageId].header.
   */
  globalHeader?: HeaderConfig;

  /**
   * Global footer configuration shared across all pages.
   * Previously stored per-page in pages[pageId].footer.
   */
  globalFooter?: PageFooterConfig;

  /**
   * Per-page configuration (v2).
   * Keyed by PageId. Each entry stores sections, layout,
   * and enabled state for that page.
   *
   * This is the canonical location for page-scoped data.
   * Legacy data in `home.sections` is migrated on read via migrateToV2Pages().
   */
  pages?: Partial<Record<PageId, PageConfig>>;

  /** Active portal theme ID. null = no theme selected yet. */
  themeId: string | null;

  /**
   * Manifest version that was active when the tenant last selected/configured this theme.
   * Used by the engine to detect manifest upgrades and apply migrations.
   * Format: SemVer string matching ThemeManifest.version (e.g. "1.0.0").
   * null = legacy tenant that selected before versioning was added.
   */
  themeVersion: string | null;

  /**
   * Per-section settings overrides.
   * Keys are section slot IDs from the active theme manifest.
   * Values are partial settings objects merged over slot defaults.
   */
  sectionSettings: TenantSectionSettings;

  /**
   * Theme-level settings overrides.
   * Merged over the active theme's settingDefaults.
   */
  themeSettings: Record<string, unknown>;

  /**
   * Saved map configurations.
   * Created/managed in the /maps admin page.
   * Referenced by map elements via map_id.
   */
  maps?: MapConfig[];

  /**
   * Navigation menus.
   * Created/managed in the /menus admin page.
   * Referenced by footer and other navigation components via menu handle.
   */
  menus?: MenuConfig[];

  /**
   * Global layout settings for the booking engine.
   * Controls max-width and desktop-specific spacing.
   */
  layout?: LayoutConfig;

  /**
   * Tenant-level color scheme definitions.
   * Sections reference a scheme by ID via colorSchemeId.
   * The resolve pipeline maps scheme tokens → CSS variables
   * applied at section scope.
   */
  colorSchemes?: ColorScheme[];

  /**
   * ID of the default color scheme.
   * New sections automatically receive this scheme.
   * Legacy sections without colorSchemeId resolve to this scheme.
   * The default scheme cannot be deleted.
   * Must always point to a valid scheme in colorSchemes[].
   */
  defaultColorSchemeId?: string;

  /**
   * Runtime-only: published locale codes for this tenant.
   * Populated by getTenantConfig(), not stored in JSON settings.
   * Used by the language switcher in the guest portal header.
   */
  _publishedLocales?: string[];

  /** Runtime-only: the active locale for the current request. */
  _currentLocale?: string;

  /** Runtime-only: the tenant's primary locale. */
  _primaryLocale?: string;
};

// ─── Layout Configuration ────────────────────────────────────

export type LayoutConfig = {
  /** Max content width in pixels for desktop viewport. Default 1250. */
  maxWidth: number;
};

export const LAYOUT_DEFAULTS: LayoutConfig = {
  maxWidth: 1250,
};

export type SupportLinks = {
  supportUrl?: string;
  faqUrl?: string;
  termsUrl?: string;
};
