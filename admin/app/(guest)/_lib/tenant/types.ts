import type { ThemeConfig } from "../theme";
import type { HomeConfig } from "../portal/homeLinks";
import type { FooterConfig } from "../footer/types";
import type { FeatureFlags } from "../features/types";
import type { VisibilityRule } from "../rules/types";
import type { TenantSectionSettings } from "../themes/types";

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
};

export type SupportLinks = {
  supportUrl?: string;
  faqUrl?: string;
  termsUrl?: string;
};
