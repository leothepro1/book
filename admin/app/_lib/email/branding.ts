/**
 * Email Branding
 * ══════════════
 *
 * resolveBranding() is the single source of truth for email branding.
 * No template hardcodes colors or conditionally checks for logo.
 */

export interface EmailBranding {
  logoUrl: string | null;
  accentColor: string;
}

export const DEFAULT_BRANDING: EmailBranding = {
  logoUrl: null,
  accentColor: "#1A56DB",
};

export function resolveBranding(tenant: {
  emailLogoUrl: string | null;
  emailAccentColor: string | null;
}): EmailBranding {
  return {
    logoUrl: tenant.emailLogoUrl ?? DEFAULT_BRANDING.logoUrl,
    accentColor: tenant.emailAccentColor ?? DEFAULT_BRANDING.accentColor,
  };
}
