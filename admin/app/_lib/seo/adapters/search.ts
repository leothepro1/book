/**
 * Search SEO Adapter
 * ══════════════════
 *
 * `/search` — the in-app accommodation search results page. Always
 * `noindex`. Emits no JSON-LD. Never appears in a sitemap.
 *
 * ── Why noindex ──────────────────────────────────────────────────
 * Google's Search Quality Guidelines explicitly treat auto-
 * generated search result pages as low-value, thin content:
 *
 *   "Don't let your internal search result pages be crawled by
 *    Google. Users dislike clicking a search engine result only
 *    to land on another search result page on your site."
 *   — developers.google.com/search/docs/crawling-indexing/robots/intro
 *
 * Serving a noindex search page is the unambiguous, Shopify-grade
 * default. Merchants who want a landing page indexed should build
 * a Page or Collection, not a search URL.
 *
 * ── Signaling via isIndexable (not seoOverrides) ────────────────
 * The noindex signal here is a RESOURCE-TYPE semantic, not an
 * entity-level config. Synthesizing `seoOverrides.noindex = true`
 * would muddle the signal path — an override is for a MERCHANT
 * decision about a specific entity, while `isIndexable: () =>
 * false` reads as "this resource type is never indexable." The
 * resolver's `resolveNoindex` reaches the same result either way,
 * but keeping the two channels distinct helps future maintainers
 * understand intent.
 *
 * ── Title handling ───────────────────────────────────────────────
 * The resolver's existing `ctx.searchQuery` branch overrides title
 * when a search term is present. When `/search` is hit without a
 * query, this adapter's synthetic title ("Sök") flows through the
 * tenant's titleTemplate — typically rendering "Sök | {siteName}".
 * The adapter does NOT duplicate the search-query handling.
 */

import { buildAbsoluteUrl } from "../paths";
import type {
  ResolvedImage,
  Seoable,
  SeoTenantContext,
  StructuredDataObject,
} from "../types";
import type { SeoAdapter, SitemapEntry } from "./base";

// ── Constants ─────────────────────────────────────────────────

/**
 * Route for the search page: `/search`. Adapter-local constant per
 * the platform convention.
 */
const SEARCH_ROUTE = "/search";

/**
 * Synthetic entity title used when the request has no search query.
 * The resolver's title template layers over this (e.g. "Sök |
 * Apelviken"). When `ctx.searchQuery` is present, the resolver's
 * existing `searchQuery` branch fully replaces the title, so this
 * value is dormant for every real-world query request.
 *
 * Swedish because platform UI is Swedish-first. Does not need to
 * be translatable — the resolver's searchQuery branch emits the
 * visible title for queried-search pages, which are the SEO-
 * interesting case.
 */
const SEARCH_ENTITY_TITLE = "Sök";

// ── Input shape ───────────────────────────────────────────────

/**
 * Minimal input — the search page doesn't have a Prisma entity.
 * `activeLocales` is declared here for API symmetry with the
 * accommodation-index adapter even though the search adapter
 * doesn't surface per-locale sitemap alternates (it emits no
 * sitemap entries at all).
 */
export interface SearchSeoInput {
  readonly tenantId: string;
  readonly activeLocales: readonly string[];
}

// ── Adapter ──────────────────────────────────────────────────

export const searchSeoAdapter: SeoAdapter<SearchSeoInput> = {
  resourceType: "search",

  toSeoable(entity, tenant) {
    const seoable: Seoable = {
      resourceType: "search",
      // Stable across requests — same tenant → same id — keeps
      // React cache() dedup correct.
      id: `search:${entity.tenantId}`,
      tenantId: entity.tenantId,
      path: SEARCH_ROUTE,
      // Synthetic title — resolver's searchQuery branch overrides
      // this when a query is present. When there isn't one, tenant
      // titleTemplate wraps: "Sök | {siteName}".
      title: SEARCH_ENTITY_TITLE,
      description: null,
      featuredImageId: null,
      seoOverrides: null,
      updatedAt: new Date(),
      publishedAt: new Date(),
      locale: tenant.defaultLocale,
    };
    return seoable;
  },

  /**
   * Search pages are never indexable. See module header for the
   * Google Quality Guidelines rationale.
   */
  isIndexable() {
    return false;
  },

  /**
   * No JSON-LD for search results. Google explicitly discourages
   * structured data on thin/auto-generated pages — even well-formed
   * JSON-LD on a noindex page is wasteful noise.
   */
  toStructuredData(): StructuredDataObject[] {
    return [];
  },

  /**
   * Never include `/search` in the sitemap. Google's guidance is
   * that noindex URLs don't belong in sitemaps.
   */
  getSitemapEntries(): SitemapEntry[] {
    return [];
  },

  /**
   * No adapter-specific OG image. The resolver falls through to
   * tenant default → dynamic. Since the page is noindex, OG meta
   * is largely cosmetic for shared-link previews, not SERP.
   */
  getAdapterOgImage(): ResolvedImage | null {
    return null;
  },
};

// Helper exported for tests + future ergonomics — keeps
// route-construction in one place.
export function searchPageUrl(
  tenant: SeoTenantContext,
  locale: string,
): string {
  return buildAbsoluteUrl(tenant, locale, SEARCH_ROUTE);
}
