/**
 * SEO Engine — URL path helpers
 * ═════════════════════════════
 *
 * Single source of truth for building SEO URLs from tenant + locale +
 * relative path. Used by the resolver, hreflang resolver, and adapter
 * sitemap generation. If URL shape ever changes (e.g., custom domains,
 * non-Rutgr subdomains), this file is the one place to edit.
 */

import type { SeoTenantContext } from "./types";

/**
 * Build the locale-prefixed relative path for a resource.
 *
 * Default-locale pages live at the bare path (`/accommodations/x`);
 * non-default locales are prefixed with the locale code (`/en/accommodations/x`).
 * This is a codebase-wide routing convention — merchants and search engines
 * both rely on it.
 */
export function buildLocalePath(
  tenant: SeoTenantContext,
  locale: string,
  basePath: string,
): string {
  if (locale === tenant.defaultLocale) return basePath;
  return `/${locale}${basePath}`;
}

/**
 * Build the absolute URL for a resource in a specific locale.
 * Always HTTPS — every tenant subdomain has an automatic TLS cert.
 */
export function buildAbsoluteUrl(
  tenant: SeoTenantContext,
  locale: string,
  basePath: string,
): string {
  return `https://${tenant.primaryDomain}${buildLocalePath(tenant, locale, basePath)}`;
}
