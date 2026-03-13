import type { ThemeConfig } from "../theme";
import type { HomeConfig } from "../portal/homeLinks";
import type { FooterConfig } from "../footer/types";
import type { FeatureFlags } from "../features/types";
import type { VisibilityRule } from "../rules/types";
import type { TenantSectionSettings } from "../themes/types";
import type { ColorScheme, ColorSchemeId } from "@/app/_lib/color-schemes/types";

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

// ─── Page-scoped Header Configuration ───────────────────────

export type HeaderConfig = {
  /** Logo horizontal alignment within the header bar. */
  logoPosition: "left" | "center";
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

// ─── Page-scoped Footer Configuration ───────────────────────

export type FooterActiveMode = "background" | "icon-only";

export type PageFooterConfig = {
  /** How the active tab is visually indicated. */
  activeMode: FooterActiveMode;
  /** Whether text labels are shown below icons. */
  showLabels: boolean;
  /** Whether to show a top border dividing footer from content. */
  showDivider: boolean;
  /** Color scheme applied to the footer area. */
  colorSchemeId?: ColorSchemeId;
  /** Footer container spacing (px). */
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
};

export const PAGE_FOOTER_DEFAULTS: PageFooterConfig = {
  activeMode: "background",
  showLabels: true,
  showDivider: true,
  paddingTop: 5,
  paddingRight: 5,
  paddingBottom: 5,
  paddingLeft: 5,
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
};

export type SupportLinks = {
  supportUrl?: string;
  faqUrl?: string;
  termsUrl?: string;
};
