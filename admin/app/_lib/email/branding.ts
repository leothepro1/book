/**
 * Email Branding
 * ══════════════
 *
 * resolveBranding() is the single source of truth for email branding.
 * No template hardcodes colors or conditionally checks for logo.
 */

export const DEFAULT_LOGO_WIDTH = 120;

export interface EmailBranding {
  logoUrl: string | null;
  logoWidth: number;
  accentColor: string;
}

export const DEFAULT_BRANDING: EmailBranding = {
  logoUrl: null,
  logoWidth: DEFAULT_LOGO_WIDTH,
  accentColor: "#1A56DB",
};

export function resolveBranding(tenant: {
  emailLogoUrl: string | null;
  emailLogoWidth: number | null;
  emailAccentColor: string | null;
}): EmailBranding {
  return {
    logoUrl: tenant.emailLogoUrl ?? DEFAULT_BRANDING.logoUrl,
    logoWidth: tenant.emailLogoWidth ?? DEFAULT_BRANDING.logoWidth,
    accentColor: tenant.emailAccentColor ?? DEFAULT_BRANDING.accentColor,
  };
}
