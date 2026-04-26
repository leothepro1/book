/**
 * Tenant → SeoTenantContext converter
 * ═══════════════════════════════════
 *
 * Bridges Prisma's `Tenant` + `TenantLocale[]` into the minimal
 * `SeoTenantContext` shape the SEO engine consumes. Lives outside
 * `lib/seo/` so the engine stays decoupled from Prisma's Tenant shape
 * (~60 unrelated fields).
 *
 * This is the ONLY supported way to construct a `SeoTenantContext`
 * for production code. Tests can still build one inline — the
 * contract is an interface, not a branded type.
 */

import type { Tenant, TenantLocale } from "@prisma/client";

import { getPlatformBaseDomain } from "../platform/constants";
import {
  safeParseSeoDefaults,
  type SeoTenantContext,
} from "../seo/types";
import { PRIMARY_LOCALE } from "../translations/locales";

/**
 * Convert a Prisma `Tenant` plus its locale rows into the SEO engine's
 * tenant context.
 *
 * Caller is responsible for fetching both: typically
 *   prisma.tenant.findUnique({ where, include: { locales: true } })
 *
 * @param args.tenant  Full Prisma Tenant row.
 * @param args.locales All `TenantLocale` rows for this tenant. Order-
 *                     insensitive — primary is detected via `primary: true`
 *                     and active locales are filtered by `published: true`.
 *
 * Rules:
 *   - `defaultLocale` = locale row with `primary: true`, falling back to
 *     `PRIMARY_LOCALE` ("sv") when none is marked primary.
 *   - `activeLocales` = rows with `published: true`. If the primary isn't
 *     itself published (edge case: admin unpublished primary by mistake),
 *     it's prepended so hreflang still emits a valid entry for the default.
 *   - `primaryDomain` = `{portalSlug}.{platformBaseDomain}`, or just
 *     `{platformBaseDomain}` if the tenant has no portalSlug (pre-backfill —
 *     should not happen in steady state, but we emit a usable URL rather
 *     than crashing).
 *   - `seoDefaults` is parsed through `safeParseSeoDefaults` — malformed
 *     JSONB degrades to schema defaults.
 */
export function tenantToSeoContext(args: {
  tenant: Tenant;
  locales: readonly TenantLocale[];
}): SeoTenantContext {
  const { tenant, locales } = args;

  const primaryRow = locales.find((l) => l.primary);
  const defaultLocale = primaryRow?.locale ?? PRIMARY_LOCALE;

  const publishedLocales = locales
    .filter((l) => l.published)
    .map((l) => l.locale);

  // Ensure the default locale is always represented, even if the
  // primary row isn't flagged published.
  const activeLocales = publishedLocales.includes(defaultLocale)
    ? publishedLocales
    : [defaultLocale, ...publishedLocales];

  const baseDomain = getPlatformBaseDomain();
  const primaryDomain = tenant.portalSlug
    ? `${tenant.portalSlug}.${baseDomain}`
    : baseDomain;

  return {
    id: tenant.id,
    siteName: tenant.name,
    primaryDomain,
    defaultLocale,
    seoDefaults: safeParseSeoDefaults(tenant.seoDefaults),
    activeLocales,
    // `Tenant.updatedAt` is Prisma `@updatedAt` — guaranteed non-null
    // on any persisted row. See SeoTenantContext.contentUpdatedAt JSDoc
    // for the semantic-proxy rationale and the M7 followup that will
    // migrate this to a dedicated publish-timestamp column.
    contentUpdatedAt: tenant.updatedAt,
  };
}
