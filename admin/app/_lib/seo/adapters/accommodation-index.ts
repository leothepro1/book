/**
 * Accommodation Index SEO Adapter
 * ═══════════════════════════════
 *
 * `/stays` — the primary accommodation landing page for a tenant.
 * Not backed by a Prisma row (the tenant IS the resource), so the
 * adapter takes a synthetic `AccommodationIndexSeoInput` instead of
 * an entity.
 *
 * Fetching is the caller's responsibility. The input carries:
 *   - `tenantId` — owner of the index page; used for synthetic id
 *     and tenant-isolation correlation.
 *   - `activeLocales` — mirrored into the Seoable but not otherwise
 *     consumed here (hreflang comes from tenant context at resolve
 *     time).
 *   - `featuredAccommodations` — the top-N active accommodations
 *     the caller wants surfaced in `ItemList`. MUST be pre-filtered
 *     + pre-capped by the caller. The adapter defensively slices
 *     at `MAX_ITEMLIST_MEMBERS` and logs if the input exceeded it.
 *
 * ── Pagination + canonical ───────────────────────────────────────
 * `/stays?page=2` canonicalises to `/stays` (no query). The adapter
 * returns `seoable.path = "/stays"` regardless of request query;
 * the resolver derives the canonical URL from that path. Pagination
 * context (`ctx.pagination`) is consumed by the resolver to append
 * a " – Page N" suffix to the TITLE but never leaks into canonical
 * or hreflang.
 *
 * ── Stable synthetic id ──────────────────────────────────────────
 * `id = "accommodation-index:" + tenantId`. Stable across requests
 * in the same Node process so React `cache()` dedup works correctly
 * when `generateMetadata` and the page body both call into the
 * resolver for the same tenant. Never includes locale, path, or
 * request-specific data.
 */

import { log } from "../../logger";
import { buildAbsoluteUrl } from "../paths";
import type {
  ResolvedImage,
  Seoable,
  SeoTenantContext,
  StructuredDataObject,
} from "../types";
import type { AccommodationWithMedia } from "./accommodation";
import { buildAccommodationItemList } from "./_itemlist";
import type { SeoAdapter, SitemapEntry } from "./base";

// ── Constants ─────────────────────────────────────────────────

/**
 * Route prefix for the index page: `/stays`. Adapter-local per the
 * convention established in the accommodation + product adapters.
 */
const STAYS_ROUTE_PREFIX = "/stays";

/**
 * Synthetic entity title. The resolver layers the tenant title
 * template (`{entityTitle} | {siteName}`) on top, so the rendered
 * title typically becomes `"Boenden | Apelviken"`. Merchants who
 * want a different label configure a per-type pattern in
 * `PageTypeSeoDefault.titlePattern`.
 */
const INDEX_ENTITY_TITLE = "Boenden";

/**
 * Hard cap on ItemList member count. Mirrors the
 * `ProductCollection` cap for platform consistency. Google Rich
 * Results degrades signal/noise beyond this bound; first-N is the
 * Shopify-grade convention.
 */
export const MAX_ITEMLIST_MEMBERS = 20;

// ── Input shape ───────────────────────────────────────────────

/**
 * What the adapter consumes. Built by the caller (typically a
 * tenant-scoped Prisma query limited to MAX_ITEMLIST_MEMBERS rows).
 */
export interface AccommodationIndexSeoInput {
  readonly tenantId: string;
  readonly activeLocales: readonly string[];
  /**
   * Top-N active accommodations in a platform-defined order. The
   * adapter does NOT sort or re-filter — defensively slices at
   * `MAX_ITEMLIST_MEMBERS` only as a belt-and-suspenders safety
   * check (logs if caller violated the cap).
   */
  readonly featuredAccommodations: readonly AccommodationWithMedia[];
}

// ── Helpers ──────────────────────────────────────────────────

function indexUrl(tenant: SeoTenantContext, locale: string): string {
  return buildAbsoluteUrl(tenant, locale, STAYS_ROUTE_PREFIX);
}

// ── Adapter ──────────────────────────────────────────────────

export const accommodationIndexSeoAdapter: SeoAdapter<AccommodationIndexSeoInput> =
  {
    resourceType: "accommodation_index",

    toSeoable(entity, tenant) {
      const seoable: Seoable = {
        resourceType: "accommodation_index",
        // Stable across requests — same tenant → same id — so
        // React cache() keys collide as intended.
        id: `accommodation-index:${entity.tenantId}`,
        tenantId: entity.tenantId,
        // Pagination canonical: always the bare path. Query strings
        // (`?page=N`) live on the request but not on the canonical.
        path: STAYS_ROUTE_PREFIX,
        title: INDEX_ENTITY_TITLE,
        // Description deliberately left null so the resolver can
        // layer PageTypeSeoDefault pattern → tenant.descriptionDefault.
        description: null,
        featuredImageId: null,
        seoOverrides: null,
        // No meaningful "updated" signal — index content is
        // synthetic. `now()` is fine for lastmod / publishedAt
        // because crawlers use it as a cache-busting hint and
        // "recently updated" is honest for a synthetic page.
        updatedAt: new Date(),
        publishedAt: new Date(),
        locale: tenant.defaultLocale,
      };
      return seoable;
    },

    /**
     * Always indexable today. TODO(m5-followup): add a tenant-level
     * "hide /stays from search engines" toggle to `seoDefaults` so
     * merchants with a single accommodation can opt out of the
     * index being crawled as a separate page.
     */
    isIndexable() {
      return true;
    },

    toStructuredData(entity, tenant, locale, logContext) {
      const featured = entity.featuredAccommodations;

      // Defensive cap — input contract says ≤ MAX_ITEMLIST_MEMBERS,
      // log + slice if violated. Keeps Rich Results within bounds
      // even if a caller forgets to apply the DB LIMIT.
      let members = featured;
      if (featured.length > MAX_ITEMLIST_MEMBERS) {
        log("warn", "seo.structured_data.itemlist_oversized", {
          tenantId: entity.tenantId,
          resourceId: `accommodation-index:${entity.tenantId}`,
          resourceType: "accommodation_index",
          received: featured.length,
          cap: MAX_ITEMLIST_MEMBERS,
          requestId: logContext?.requestId ?? null,
        });
        members = featured.slice(0, MAX_ITEMLIST_MEMBERS);
      }

      const url = indexUrl(tenant, locale);

      const collectionPage: StructuredDataObject = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: INDEX_ENTITY_TITLE,
        url,
        about: { "@type": "Accommodation" },
      };

      const result: StructuredDataObject[] = [collectionPage];

      // ItemList only when ≥ 1 accommodation. Empty ItemList fails
      // Rich Results structural validation.
      if (members.length > 0) {
        result.push(buildAccommodationItemList(members, tenant, locale));
      }

      result.push(breadcrumbList(tenant, locale));
      return result;
    },

    /**
     * One entry per active locale plus per-entry alternates. No
     * priority/changefreq — SitemapEntry doesn't carry those today
     * (TODO(m5-followup): extend the sitemap type if ops request
     * explicit priorities).
     */
    getSitemapEntries(entity, tenant, locales) {
      return locales.map((locale): SitemapEntry => ({
        url: indexUrl(tenant, locale),
        lastmod: new Date(),
        alternates: locales.map((l) => ({
          hreflang: l,
          url: indexUrl(tenant, l),
        })),
      }));
    },

    /**
     * No adapter-specific OG image. The resolver falls through to
     * tenant default → dynamic generation. The index page is a
     * landing page; merchants set the branding at tenant scope.
     */
    getAdapterOgImage(): ResolvedImage | null {
      return null;
    },
  };

// ── JSON-LD builders ────────────────────────────────────────
// `buildAccommodationItemList` is shared with accommodation-category;
// see `./_itemlist.ts` for the extracted helper and rationale.

/**
 * 2-level breadcrumb: Home → Boenden. The index itself is the
 * leaf, so the final ListItem points at its own URL.
 */
function breadcrumbList(
  tenant: SeoTenantContext,
  locale: string,
): StructuredDataObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Hem",
        item: buildAbsoluteUrl(tenant, locale, "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: INDEX_ENTITY_TITLE,
        item: indexUrl(tenant, locale),
      },
    ],
  };
}
