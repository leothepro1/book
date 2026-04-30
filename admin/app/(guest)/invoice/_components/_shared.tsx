/**
 * Phase F — shared types, theme helper, and contact-block JSX for
 * `/invoice/[token]` status pages.
 *
 * All five pages share the same root container and tenant-themed
 * CSS-var injection. Mirroring `app/(guest)/no-booking/page.tsx`'s
 * pattern — one color scheme from `tenant.config.colorSchemes[0]`,
 * fall back to `DEFAULT_TOKENS`. Hardcoded Swedish copy with
 * `data-i18n` attributes on string-bearing elements for future
 * translation wiring.
 */

import type { CSSProperties } from "react";

import { DEFAULT_TOKENS } from "@/app/_lib/color-schemes/constants";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";

/**
 * Narrow tenant projection that the status pages render. The
 * `/invoice/[token]/page.tsx` route handler builds this shape from
 * the row returned by `resolveTenantFromHost`.
 */
export interface TenantForStatusPage {
  id: string;
  name: string;
  phone: string | null;
  emailFrom: string | null;
  portalSlug: string | null;
}

/**
 * Build the CSS-var bag the root container uses for theme
 * injection. Mirrors `no-booking/page.tsx:13-30`.
 */
export async function buildPageStyles(
  tenantId: string,
): Promise<CSSProperties> {
  const config = await getTenantConfig(tenantId);
  const tokens = config.colorSchemes?.[0]?.tokens ?? DEFAULT_TOKENS;
  return {
    "--background": tokens.background,
    "--text": tokens.text,
    "--button-bg": tokens.solidButtonBackground,
    "--button-fg": tokens.solidButtonLabel,
    "--surface": "#ffffff",
    "--page-bg": "#fafafa",
    "--border": "#e5e5e5",
    "--text-secondary": "#666",
  } as CSSProperties;
}

/**
 * Inline styles shared across the four "minimal status" pages
 * (Expired, Cancelled, UnitUnavailable, PaymentUnavailable). The
 * receipt page rolls its own layout because it has more structure.
 */
export const minimalPageStyles = {
  outer: {
    minHeight: "100vh",
    backgroundColor: "var(--page-bg)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "clamp(1.5rem, 5vw, 4rem) 1.5rem",
    fontFamily:
      '"Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  } satisfies CSSProperties,
  card: {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "clamp(1.5rem, 4vw, 2.5rem)",
    maxWidth: 480,
    width: "100%",
    textAlign: "center" as const,
    color: "var(--text)",
  } satisfies CSSProperties,
  title: {
    fontSize: "clamp(1.25rem, 1rem + 1vw, 1.625rem)",
    fontWeight: 600,
    margin: "0 0 0.75rem",
  } satisfies CSSProperties,
  body: {
    fontSize: "0.9375rem",
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,
  contact: {
    marginTop: "1.5rem",
    paddingTop: "1.5rem",
    borderTop: "1px solid var(--border)",
    fontSize: "0.875rem",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  contactLink: {
    color: "var(--text)",
    textDecoration: "underline",
  } satisfies CSSProperties,
};

/**
 * Tenant contact CTA. Renders a phone link, an email link, both,
 * or a generic "Kontakta {name}." line if neither is present.
 * Used by Expired/Cancelled/UnitUnavailable/PaymentUnavailable.
 */
export function ContactBlock({ tenant }: { tenant: TenantForStatusPage }) {
  const hasPhone = !!tenant.phone && tenant.phone.length > 0;
  const hasEmail = !!tenant.emailFrom && tenant.emailFrom.length > 0;

  if (!hasPhone && !hasEmail) {
    return (
      <div style={minimalPageStyles.contact}>
        <span data-i18n="invoice.shared.contact_generic">
          Kontakta {tenant.name}.
        </span>
      </div>
    );
  }

  return (
    <div style={minimalPageStyles.contact}>
      <span data-i18n="invoice.shared.contact_lead">
        Kontakta {tenant.name}:
      </span>{" "}
      {hasPhone && (
        <a href={`tel:${tenant.phone}`} style={minimalPageStyles.contactLink}>
          {tenant.phone}
        </a>
      )}
      {hasPhone && hasEmail && " · "}
      {hasEmail && (
        <a
          href={`mailto:${tenant.emailFrom}`}
          style={minimalPageStyles.contactLink}
        >
          {tenant.emailFrom}
        </a>
      )}
    </div>
  );
}
