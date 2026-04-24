/**
 * AccommodationCategory SEO Adapter
 * ═════════════════════════════════
 *
 * `/stays/categories/{slug}` — a category landing page that groups
 * accommodations. Emits:
 *
 *   CollectionPage  (per-category)
 *   ItemList        (member accommodations — only when ≥ 1)
 *   BreadcrumbList  (3-level: Hem → Boenden → {category.title})
 *
 * ── Input contract ───────────────────────────────────────────────
 * Callers MUST pre-filter items to ACTIVE accommodations (not
 * archived), order by AccommodationCategoryItem.sortOrder asc, and
 * cap at MAX_ITEMLIST_MEMBERS at the DATABASE layer. The adapter
 * does NOT re-query or re-order — it consumes what it is given.
 * See `categorySeoInclude()` for the canonical Prisma include.
 *
 * ── Empty category: noindex ──────────────────────────────────────
 * A category with zero indexable members is treated as thin content
 * and is marked noindex (`isIndexable → false`). Rationale:
 *   - Google's Quality Guidelines rank pages with little to no
 *     original content as low-value — being noindex is safer for
 *     the domain's overall crawl budget than indexing empty shells.
 *   - Shopify's conservative default: empty collections don't
 *     surface in sitemaps or feeds.
 *   - The signal auto-inverts: when a merchant adds the first
 *     accommodation to the category, the adapter immediately flips
 *     back to isIndexable=true on the next resolve — no manual
 *     intervention needed.
 *
 * ── visibleInSearch is NOT an SEO signal ─────────────────────────
 * `AccommodationCategory.visibleInSearch` controls whether the
 * category surfaces in the guest-facing search form filter. That's
 * a pure UX concern; search engines don't see the in-app search
 * form. The SEO adapter deliberately ignores this column.
 *
 * ── OG image fallback ────────────────────────────────────────────
 * The adapter hook returns the raw `category.imageUrl` when set.
 * When a future migration moves categories to MediaAsset-backed
 * imagery, swap the single helper `getCategoryOgImage()` below —
 * the rest of the adapter doesn't change.
 */

import type {
  AccommodationCategory,
  AccommodationCategoryItem,
} from "@prisma/client";

import { buildAbsoluteUrl } from "../paths";
import { stripHtml } from "../text";
import {
  type ResolvedImage,
  type Seoable,
  type SeoTenantContext,
  type StructuredDataObject,
  safeParseSeoMetadata,
} from "../types";
import type { AccommodationWithMedia } from "./accommodation";
import { buildAccommodationItemList } from "./_itemlist";
import type { SeoAdapter, SitemapEntry } from "./base";

// ── Constants ─────────────────────────────────────────────────

/**
 * Route prefix for category detail pages: `/stays/categories/<slug>`.
 * Adapter-local per the pattern established in the accommodation
 * + product adapters.
 */
const CATEGORY_ROUTE_PREFIX = "/stays/categories";

/** Shared prefix for the parent breadcrumb anchor. */
const STAYS_INDEX_PATH = "/stays";

/**
 * Cap on ItemList member count. Enforced at the DB layer via
 * `categorySeoInclude()`. Same 20-item ceiling as the
 * product-collection and accommodation-index adapters for platform
 * consistency.
 */
export const MAX_ITEMLIST_MEMBERS = 20;

// ── Input shape ───────────────────────────────────────────────

/**
 * A `AccommodationCategoryItem` with its linked accommodation
 * (including media for the ItemList image).
 */
export type AccommodationCategoryItemWithAccommodation =
  AccommodationCategoryItem & {
    accommodation: AccommodationWithMedia;
  };

/**
 * What the adapter consumes. Caller is responsible for filtering,
 * ordering, and capping via `categorySeoInclude`.
 */
export type AccommodationCategoryWithItems = AccommodationCategory & {
  items: AccommodationCategoryItemWithAccommodation[];
};

// ── Prisma include helper ────────────────────────────────────

/**
 * Canonical Prisma `include` for fetching a category for SEO.
 * Tests assert the structural guarantees:
 *   - LIMIT MAX_ITEMLIST_MEMBERS at query time (no post-query slice).
 *   - Filter to ACTIVE, non-archived accommodations only.
 *   - Tenant-scoped join (defensive — outer `where` also scopes).
 *   - Accommodation media ordered by sortOrder ascending so ItemList
 *     shows the merchant's preferred cover image.
 */
export function categorySeoInclude(tenantId: string) {
  return {
    items: {
      where: {
        accommodation: {
          tenantId,
          status: "ACTIVE" as const,
          archivedAt: null,
        },
      },
      orderBy: { sortOrder: "asc" as const },
      take: MAX_ITEMLIST_MEMBERS,
      include: {
        accommodation: {
          include: {
            media: { orderBy: { sortOrder: "asc" as const } },
          },
        },
      },
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────

function categoryUrl(
  entity: AccommodationCategoryWithItems,
  tenant: SeoTenantContext,
  locale: string,
): string {
  return buildAbsoluteUrl(
    tenant,
    locale,
    `${CATEGORY_ROUTE_PREFIX}/${entity.slug}`,
  );
}

/**
 * Single predicate shared by `isIndexable` and the `toStructuredData`
 * short-circuit. Factored out because two methods must stay in
 * lockstep — splitting them is how adapter/resolver drift starts.
 */
function isCategoryIndexable(
  entity: AccommodationCategoryWithItems,
): boolean {
  if (entity.status !== "ACTIVE") return false;
  const overrides = safeParseSeoMetadata(entity.seo);
  if (overrides?.noindex === true) return false;
  // Empty category = thin content. See module header rationale.
  if (entity.items.length === 0) return false;
  return true;
}

/**
 * Build the OG image for a category from the sync data available in
 * the entity.
 *
 * Today: returns a ResolvedImage from `category.imageUrl` (a raw
 * Cloudinary URL) at nominal OG dimensions, or null if unset. When
 * categories migrate to MediaAsset-backed imagery, extend this
 * function (likely taking an ImageService and becoming async — at
 * which point the `getAdapterOgImage` hook would need the resolver
 * to route through a new async path). Localising the change to
 * this one helper keeps the migration surface minimal.
 */
function getCategoryOgImage(
  category: AccommodationCategoryWithItems,
): ResolvedImage | null {
  const url = category.imageUrl;
  if (url === null || url.length === 0) return null;
  return {
    url,
    // Raw URLs have no stored dimensions — publish the Facebook OG
    // nominal box. Every scraper cover-crops to 1.91:1 anyway.
    width: 1200,
    height: 630,
    alt: category.title,
  };
}

// ── Adapter ──────────────────────────────────────────────────

export const accommodationCategorySeoAdapter: SeoAdapter<AccommodationCategoryWithItems> =
  {
    resourceType: "accommodation_category",

    toSeoable(entity, tenant) {
      const stripped = stripHtml(entity.description);
      const seoable: Seoable = {
        resourceType: "accommodation_category",
        // Prefix makes the id space explicit; the category's own id
        // is sufficient but the prefix avoids collisions with
        // synthetic ids if another subsystem ever introspects
        // Seoable.id.
        id: `accommodation-category:${entity.id}`,
        tenantId: entity.tenantId,
        path: `${CATEGORY_ROUTE_PREFIX}/${entity.slug}`,
        title: entity.title,
        description: stripped.length > 0 ? stripped : null,
        // Categories use raw imageUrl — resolver's MediaAsset
        // resolution path doesn't apply. See getCategoryOgImage.
        featuredImageId: null,
        seoOverrides: safeParseSeoMetadata(entity.seo),
        updatedAt: entity.updatedAt,
        publishedAt: entity.status === "ACTIVE" ? entity.updatedAt : null,
        locale: tenant.defaultLocale,
      };
      return seoable;
    },

    isIndexable(entity) {
      return isCategoryIndexable(entity);
    },

    toStructuredData(entity, tenant, locale) {
      // Non-indexable category → emit no JSON-LD. The page still
      // renders with robots: noindex via resolveNoindex; no reason
      // to advertise a noindex page's structure to crawlers.
      if (!isCategoryIndexable(entity)) return [];

      const url = categoryUrl(entity, tenant, locale);
      const stripped = stripHtml(entity.description);

      const collectionPage: StructuredDataObject = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: entity.title,
        url,
        about: { "@type": "Accommodation" },
      };
      if (stripped.length > 0) collectionPage.description = stripped;

      const result: StructuredDataObject[] = [collectionPage];

      // `isCategoryIndexable` already guarantees items.length > 0,
      // but the explicit check future-proofs against that predicate
      // ever loosening.
      const accommodations = entity.items.map((item) => item.accommodation);
      if (accommodations.length > 0) {
        result.push(
          buildAccommodationItemList(accommodations, tenant, locale),
        );
      }

      result.push(breadcrumbList(entity, tenant, locale));
      return result;
    },

    getAdapterOgImage(entity) {
      return getCategoryOgImage(entity);
    },

    /**
     * Sitemap entries only when indexable. Empty categories don't
     * pollute the sitemap with pages that would emit robots:noindex
     * anyway — Google's own guidance is to keep noindex pages out
     * of sitemaps.
     */
    getSitemapEntries(entity, tenant, locales) {
      if (!isCategoryIndexable(entity)) return [];
      // TODO(m8): emit entries for all activeLocales once the hreflang
      // pipeline + locale-prefix route segments land. Until then we
      // restrict to defaultLocale to avoid advertising 404-returning
      // /{locale}/... URLs in the sitemap.
      void locales;
      const sitemapLocales = [tenant.defaultLocale];
      const basePath = `${CATEGORY_ROUTE_PREFIX}/${entity.slug}`;
      return sitemapLocales.map((locale): SitemapEntry => ({
        url: buildAbsoluteUrl(tenant, locale, basePath),
        lastmod: entity.updatedAt,
        alternates: sitemapLocales.map((l) => ({
          hreflang: l,
          url: buildAbsoluteUrl(tenant, l, basePath),
        })),
      }));
    },
  };

// ── JSON-LD builders ────────────────────────────────────────
// `buildAccommodationItemList` is shared with accommodation-index;
// see `./_itemlist.ts` for the extracted helper and rationale.

/**
 * 3-level breadcrumb: Hem → Boenden → {category.title}. The
 * accommodation-index adapter emits the parallel 2-level
 * breadcrumb. Breadcrumbs stay adapter-local because their
 * shape differs — extracting them would be a bad abstraction
 * (2-level vs 3-level switching would pollute the helper).
 */
function breadcrumbList(
  entity: AccommodationCategoryWithItems,
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
        name: "Boenden",
        item: buildAbsoluteUrl(tenant, locale, STAYS_INDEX_PATH),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: entity.title,
        item: categoryUrl(entity, tenant, locale),
      },
    ],
  };
}
