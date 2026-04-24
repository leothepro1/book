/**
 * Homepage SEO Adapter
 * ════════════════════
 *
 * The `/` route is the tenant itself — there is no Prisma model for
 * "homepage". The adapter's `TEntity` is therefore a placeholder
 * (`Record<string, never>`); all data comes from `tenant`.
 *
 * Title-fallback design (option (v) in the M5 plan):
 *   `toSeoable` PROMOTES `tenant.seoDefaults.homepage.*` into
 *   `seoOverrides.*`. That short-circuits the resolver's fallback
 *   chain at rung 1 (entity override). Without this, the tenant
 *   `titleTemplate` `"{entityTitle} | {siteName}"` would produce
 *   `"Apelviken | Apelviken"` on the homepage — duplicated siteName.
 *   By promoting at the adapter, rung 1 wins with either the
 *   merchant-configured title or a bare `tenant.siteName`. No
 *   resolver change; fallback-chain invariant preserved.
 */

import { buildAbsoluteUrl } from "../paths";
import type {
  Seoable,
  SeoMetadata,
  SeoTenantContext,
  StructuredDataObject,
} from "../types";
import type { SeoAdapter, SitemapEntry } from "./base";

/**
 * The homepage has no DB model. Callers pass a placeholder `{}` via
 * `resolveSeoForRequest`; the adapter ignores `entity` and reads
 * everything from `tenant`.
 */
export type HomepageEntity = Record<string, never>;

export const homepageSeoAdapter: SeoAdapter<HomepageEntity> = {
  resourceType: "homepage",

  toSeoable(_entity, tenant) {
    const h = tenant.seoDefaults.homepage;

    // Populate `seoOverrides` so the resolver's rung-1 override-win
    // path always triggers. Title is ALWAYS present (merchant value
    // or fallback to siteName) — description and ogImageId only when
    // merchant has set them, so null remains null downstream.
    const overrides: SeoMetadata = {
      title: h?.title ?? tenant.siteName,
      noindex: h?.noindex ?? false,
      nofollow: false,
    };
    if (h?.description !== undefined) overrides.description = h.description;
    if (h?.ogImageId !== undefined) overrides.ogImageId = h.ogImageId;

    // Deterministic content-change signal for the synthetic
    // homepage Seoable. Sourced from tenant-level
    // `contentUpdatedAt` — currently a proxy for `Tenant.updatedAt`
    // (see SeoTenantContext JSDoc). Never `new Date()`: crawlers
    // use lastmod as a cache-busting hint and churn across resolves
    // made every render look like a fresh publish.
    const seoable: Seoable = {
      resourceType: "homepage",
      id: tenant.id,
      tenantId: tenant.id,
      path: "/",
      title: tenant.siteName,
      description: null,
      featuredImageId: null,
      seoOverrides: overrides,
      updatedAt: tenant.contentUpdatedAt,
      publishedAt: tenant.contentUpdatedAt,
      locale: tenant.defaultLocale,
    };
    return seoable;
  },

  /**
   * Only the WebSite schema is emitted here. The resolver's
   * `mergeStructuredData` separately injects tenant-level
   * Organization and LocalBusiness schemas when
   * `resourceType === "homepage"`; the adapter does NOT duplicate
   * that logic.
   *
   * M9 can extend this with `potentialAction` / SearchAction for
   * sitelinks-searchbox affordances.
   */
  toStructuredData(_entity, tenant, _locale): StructuredDataObject[] {
    return [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: tenant.siteName,
        url: `https://${tenant.primaryDomain}`,
      },
    ];
  },

  /**
   * Homepage is always indexable from the adapter's perspective.
   * Merchant noindex is carried via `seoDefaults.homepage.noindex`
   * → promoted into `seoOverrides.noindex` by `toSeoable` above →
   * resolver's `resolveNoindex` short-circuits on the override.
   */
  isIndexable: () => true,

  /**
   * Homepage sitemap entries. `lastmod = tenant.contentUpdatedAt` —
   * the best available signal for "something on the site changed."
   * Always a real Date for any persisted tenant (Prisma
   * `@updatedAt`), so no null fallback needed here.
   */
  getSitemapEntries(
    _entity: HomepageEntity,
    tenant: SeoTenantContext,
    locales: readonly string[],
  ): SitemapEntry[] {
    // TODO(m8): emit entries for all activeLocales once the hreflang
    // pipeline + locale-prefix route segments land. Until then we
    // restrict to defaultLocale to avoid advertising 404-returning
    // /{locale}/... URLs in the sitemap.
    void locales;
    const sitemapLocales = [tenant.defaultLocale];
    return sitemapLocales.map((locale) => ({
      url: buildAbsoluteUrl(tenant, locale, "/"),
      lastmod: tenant.contentUpdatedAt,
      alternates: sitemapLocales.map((l) => ({
        hreflang: l,
        url: buildAbsoluteUrl(tenant, l, "/"),
      })),
    }));
  },
};

