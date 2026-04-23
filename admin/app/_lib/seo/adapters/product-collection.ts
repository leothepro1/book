/**
 * ProductCollection SEO Adapter
 * ═════════════════════════════
 *
 * Lifts a Prisma `ProductCollection` (+ items + member products)
 * into the `Seoable` contract and emits:
 *
 *   CollectionPage     (per-collection)
 *   ItemList           (members — only when ≥ 1 member)
 *   BreadcrumbList     (Hem → Butik → collection.title)
 *
 * Canonical URL: `/shop/collections/{slug}` (locale-prefixed by
 * the resolver).
 *
 * ── Member filtering ──────────────────────────────────────────────
 * Members are filtered to ACTIVE STANDARD products at the Prisma
 * query level via `collectionSeoInclude` + capped at 20 rows with
 * `take: 20`. Defensive filtering in the adapter body (same
 * predicate) belt-and-suspenders against future callers that hand
 * us pre-fetched data from an unfiltered source.
 *
 * Rationale for LIMIT at the DB:
 *   - CollectionPage with 1k members in ItemList hurts Rich Results
 *     signal/noise; first 20 is the Shopify-standard cap.
 *   - Pulling 1k rows + their media into memory on every SEO
 *     resolution is wasteful and unnecessary. LIMIT at query time
 *     keeps the hot path cheap.
 *
 * ── Empty collection is still indexable ──────────────────────────
 * `isIndexable` returns true for a published collection with zero
 * members — removing an empty-today-but-populated-tomorrow landing
 * page from search is worse than showing a sparse page. When empty,
 * the ItemList block is simply omitted (empty ItemList fails Rich
 * Results validation).
 */

import type {
  Product,
  ProductCollection,
  ProductCollectionItem,
  ProductMedia,
} from "@prisma/client";

import { buildAbsoluteUrl } from "../paths";
import { stripHtml } from "../text";
import {
  type ResolvedImage,
  type StructuredDataObject,
  safeParseSeoMetadata,
} from "../types";
import type { SeoAdapter, SitemapEntry } from "./base";

// ── Constants ─────────────────────────────────────────────────

/**
 * Route prefix for collection pages: `/shop/collections/<slug>`.
 * Adapter-local per the same convention as `accommodation` /
 * `product` until a shared routing module exists.
 */
const COLLECTION_ROUTE_PREFIX = "/shop/collections";

/** Index page for the whole shop — the breadcrumb anchor. */
const SHOP_INDEX_PATH = "/shop";

/**
 * Hard cap on the number of products surfaced in CollectionPage
 * ItemList. Enforced at the DB layer (`take: MAX_ITEMLIST_MEMBERS`)
 * AND defensively in the adapter body (see module header).
 */
export const MAX_ITEMLIST_MEMBERS = 20;

// ── Input shape the adapter expects ──────────────────────────

/**
 * Each item in the collection includes the Product row plus the
 * first image (to build the ItemList entry's `image`).
 */
export type ProductCollectionItemWithProduct = ProductCollectionItem & {
  product: Product & { media: ProductMedia[] };
};

/**
 * Prisma `ProductCollection` with items + member products + each
 * member's media. Items MUST be pre-filtered to ACTIVE STANDARD
 * products ordered by `sortOrder` asc, capped at
 * `MAX_ITEMLIST_MEMBERS`. Use `collectionSeoInclude()` to build the
 * correct `include` arg.
 */
export type ProductCollectionWithItems = ProductCollection & {
  items: ProductCollectionItemWithProduct[];
};

// ── Prisma include + fetch helpers ──────────────────────────

/**
 * Build the `include` argument for fetching a collection for SEO.
 * Pure — returns a plain object — so tests can assert that LIMIT 20
 * is applied at the database level and that the filter predicate is
 * correct.
 *
 * Callers pass the same `tenantId` used in the outer `where` so
 * the inner `items.where.product.tenantId` stays aligned (belt-
 * and-suspenders against joining across tenants via the ORM).
 */
export function collectionSeoInclude(tenantId: string) {
  return {
    items: {
      where: {
        product: {
          tenantId,
          status: "ACTIVE" as const,
          productType: "STANDARD" as const,
          archivedAt: null,
        },
      },
      orderBy: { sortOrder: "asc" as const },
      take: MAX_ITEMLIST_MEMBERS,
      include: {
        product: {
          include: {
            media: {
              where: { type: "image" as const },
              orderBy: { sortOrder: "asc" as const },
              take: 1,
            },
          },
        },
      },
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────

function collectionTitle(entity: ProductCollectionWithItems): string {
  return entity.title;
}

function collectionDescription(entity: ProductCollectionWithItems): string {
  return stripHtml(entity.description);
}

function collectionUrl(
  entity: ProductCollectionWithItems,
  tenant: Parameters<typeof buildAbsoluteUrl>[0],
  locale: string,
): string {
  return buildAbsoluteUrl(
    tenant,
    locale,
    `${COLLECTION_ROUTE_PREFIX}/${entity.slug}`,
  );
}

/**
 * Defensive member filter: only ACTIVE STANDARD products, not
 * archived. Mirrors `collectionSeoInclude`'s DB filter so the
 * adapter stays correct even if called with unfiltered data.
 */
function isMemberVisible(
  item: ProductCollectionItemWithProduct,
): boolean {
  const p = item.product;
  return (
    p.productType === "STANDARD" &&
    p.status === "ACTIVE" &&
    p.archivedAt === null
  );
}

function productHref(
  product: Product,
  tenant: Parameters<typeof buildAbsoluteUrl>[0],
  locale: string,
): string {
  return buildAbsoluteUrl(
    tenant,
    locale,
    `/shop/products/${product.slug}`,
  );
}

// ── Adapter ──────────────────────────────────────────────────

export const productCollectionSeoAdapter: SeoAdapter<ProductCollectionWithItems> =
  {
    resourceType: "product_collection",

    toSeoable(entity, tenant) {
      const stripped = collectionDescription(entity);
      return {
        resourceType: "product_collection",
        id: entity.id,
        tenantId: entity.tenantId,
        path: `${COLLECTION_ROUTE_PREFIX}/${entity.slug}`,
        title: collectionTitle(entity),
        description: stripped.length > 0 ? stripped : null,
        // Collection imageUrl is a raw Cloudinary string, not a
        // MediaAsset id — no ImageService lookup path. The adapter
        // constructs a ResolvedImage inline via `getAdapterOgImage`.
        featuredImageId: null,
        seoOverrides: safeParseSeoMetadata(entity.seo),
        updatedAt: entity.updatedAt,
        publishedAt:
          entity.status === "ACTIVE" ? entity.updatedAt : null,
        // Content is not per-locale today (M8 will layer
        // TenantTranslation on top). The entity locale is the
        // tenant default.
        locale: tenant.defaultLocale,
      };
    },

    getAdapterOgImage(entity) {
      if (entity.imageUrl === null || entity.imageUrl.length === 0) {
        return null;
      }
      const image: ResolvedImage = {
        url: entity.imageUrl,
        // Collection.imageUrl has no stored dimensions — publish
        // nominal OG box. Every scraper cover-crops at 1.91:1
        // at 1200×630 regardless of source aspect ratio.
        width: 1200,
        height: 630,
        alt: collectionTitle(entity),
      };
      return image;
    },

    isIndexable(entity) {
      if (entity.status !== "ACTIVE") return false;
      const overrides = safeParseSeoMetadata(entity.seo);
      if (overrides?.noindex) return false;
      // Empty collections STAY indexable — an empty-today-
      // populated-tomorrow collection should not be delisted by
      // search engines. ItemList is omitted from JSON-LD
      // separately (empty ItemList fails Rich Results).
      return true;
    },

    toStructuredData(entity, tenant, locale) {
      const name = collectionTitle(entity);
      const stripped = collectionDescription(entity);
      const url = collectionUrl(entity, tenant, locale);

      const collectionPage: StructuredDataObject = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name,
        url,
      };
      if (stripped.length > 0) collectionPage.description = stripped;

      const result: StructuredDataObject[] = [collectionPage];

      // ItemList only when ≥ 1 visible member. Empty ItemList fails
      // Rich Results structural validation.
      const visibleItems = entity.items.filter(isMemberVisible);
      if (visibleItems.length > 0) {
        result.push(buildItemList(visibleItems, tenant, locale));
      }

      result.push(breadcrumbList(entity, tenant, locale));
      return result;
    },

    getSitemapEntries(entity, tenant, locales) {
      const basePath = `${COLLECTION_ROUTE_PREFIX}/${entity.slug}`;
      return locales.map((locale): SitemapEntry => ({
        url: buildAbsoluteUrl(tenant, locale, basePath),
        lastmod: entity.updatedAt,
        alternates: locales.map((l) => ({
          hreflang: l,
          url: buildAbsoluteUrl(tenant, l, basePath),
        })),
      }));
    },
  };

// ── JSON-LD fragment builders ───────────────────────────────

/**
 * Build the ItemList object for the collection page. Positions are
 * 1-indexed (schema.org convention — NOT 0-indexed array indices).
 * `image` emitted only when the member product actually has one.
 */
function buildItemList(
  items: ProductCollectionItemWithProduct[],
  tenant: Parameters<typeof buildAbsoluteUrl>[0],
  locale: string,
): StructuredDataObject {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, idx) => {
      const listItem: Record<string, unknown> = {
        "@type": "ListItem",
        position: idx + 1,
        name: item.product.title,
        url: productHref(item.product, tenant, locale),
      };
      const first = item.product.media[0];
      if (first) listItem.image = first.url;
      return listItem;
    }),
  };
}

function breadcrumbList(
  entity: ProductCollectionWithItems,
  tenant: Parameters<typeof buildAbsoluteUrl>[0],
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
        name: "Butik",
        item: buildAbsoluteUrl(tenant, locale, SHOP_INDEX_PATH),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: collectionTitle(entity),
        item: collectionUrl(entity, tenant, locale),
      },
    ],
  };
}
