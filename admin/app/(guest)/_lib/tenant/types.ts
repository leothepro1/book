import type { ThemeConfig } from "../theme";
import type { HomeConfig } from "../portal/homeLinks";
import type { FooterConfig } from "../footer/types";
import type { FeatureFlags } from "../features/types";
import type { VisibilityRule } from "../rules/types";

export type PropertySettings = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  checkInTime: string;
  checkOutTime: string;
  timezone: string;
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
};

export type SupportLinks = {
  supportUrl?: string;
  faqUrl?: string;
  termsUrl?: string;
};
