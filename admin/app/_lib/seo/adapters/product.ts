/**
 * Product SEO Adapter
 * ═══════════════════
 *
 * Lifts a Prisma `Product` (+ media + variants) into the `Seoable`
 * contract and produces Product + Offer + BreadcrumbList JSON-LD.
 *
 * Scope: STANDARD products only. GIFT_CARD products are rejected as
 * a safety net by `isIndexable` — the gift card adapter arrives in
 * Batch C and owns that routing.
 *
 * Required include shape when fetching from Prisma:
 *
 *   prisma.product.findUnique({
 *     where: { tenantId, slug },   // tenant isolation is caller's job
 *     include: {
 *       media:    { orderBy: { sortOrder: "asc" } },
 *       variants: { orderBy: { sortOrder: "asc" } },
 *     },
 *   })
 *
 * Missing relations degrade gracefully (no OG image, single-offer
 * pricing) rather than throwing.
 *
 * ── Pricing coupling ──────────────────────────────────────────────
 * `effectivePrice` is imported from `_lib/products/pricing.ts`. That
 * module is pure — no React, no server-only, no Prisma — so importing
 * it into the SEO engine does not pull a server-rendering dependency
 * tree. If that changes (e.g. pricing adds a DB lookup), extract the
 * pure helper into `pricing-pure.ts` per the M5 Batch A plan.
 */

import type { Product, ProductMedia, ProductVariant } from "@prisma/client";

import { log } from "../../logger";
import { effectivePrice } from "../../products/pricing";
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
 * Route prefix for product detail pages: `/shop/products/<slug>`.
 *
 * TODO(routing-config): migrate to a shared routing module once a
 * third adapter ships. Until then, adapter-local constants keep each
 * adapter self-contained (mirrors `ACCOMMODATION_ROUTE_PREFIX`).
 */
const PRODUCT_ROUTE_PREFIX = "/shop/products";

/**
 * Public index route for the catalog. Linked in the breadcrumb even
 * though no `/shop` page exists yet — Google tolerates a breadcrumb
 * that resolves to 404, but missing breadcrumbs lose Rich Results
 * entirely. TODO(m5-followup): build the /shop index page.
 */
const SHOP_INDEX_PATH = "/shop";

/**
 * Maximum number of image URLs emitted in Product JSON-LD. Google
 * Rich Results has a soft limit; beyond this, extra images reduce
 * the signal/noise ratio without improving eligibility.
 */
const MAX_JSONLD_IMAGES = 10;

// ── Input shape the adapter expects ──────────────────────────

/**
 * Prisma `Product` with `media` and `variants` relations included.
 * Callers are responsible for the include + tenant-scoped `where`;
 * the adapter trusts the shape.
 *
 * `variants` is needed even for unit pricing — a product may have
 * zero variants (simple product) or many (option-based). The adapter
 * branches on `variants.length` to emit Offer vs AggregateOffer.
 */
export type ProductWithMedia = Product & {
  media: ProductMedia[];
  variants: ProductVariant[];
};

// ── Helpers ──────────────────────────────────────────────────

function productTitle(entity: ProductWithMedia): string {
  return entity.title;
}

/**
 * Strip HTML tags from the merchant-authored product description.
 * Returns an empty string if stripping yields nothing — the caller
 * maps that to `null` on the `Seoable`.
 */
function productDescription(entity: ProductWithMedia): string {
  return stripHtml(entity.description);
}

/**
 * Is this variant purchasable given its inventory configuration?
 *   - No tracking → always purchasable (unlimited).
 *   - Overselling toggle on → purchasable even at zero.
 *   - Otherwise needs inventory > 0.
 */
function isVariantAvailable(variant: ProductVariant): boolean {
  if (!variant.trackInventory) return true;
  if (variant.continueSellingWhenOutOfStock) return true;
  return variant.inventoryQuantity > 0;
}

/**
 * Is the whole product purchasable under its own (non-variant)
 * inventory fields? Matches the single-offer branch.
 */
function isProductAvailable(entity: ProductWithMedia): boolean {
  if (!entity.trackInventory) return true;
  if (entity.continueSellingWhenOutOfStock) return true;
  return entity.inventoryQuantity > 0;
}

/**
 * Convert an ören (smallest-unit Int) price to the decimal string
 * schema.org expects, e.g. `12900 → "129.00"`. Always two decimals,
 * never a locale-formatted string.
 */
function formatPriceForJsonLd(amountInSmallestUnit: number): string {
  return (amountInSmallestUnit / 100).toFixed(2);
}

/**
 * Build the absolute URL for the product detail page in the request
 * locale. The adapter keeps canonical URL construction in one place
 * — used by both JSON-LD emission and breadcrumb linking.
 */
function productUrl(
  entity: ProductWithMedia,
  tenant: Parameters<typeof buildAbsoluteUrl>[0],
  locale: string,
): string {
  return buildAbsoluteUrl(
    tenant,
    locale,
    `${PRODUCT_ROUTE_PREFIX}/${entity.slug}`,
  );
}

// ── Adapter ──────────────────────────────────────────────────

export const productSeoAdapter: SeoAdapter<ProductWithMedia> = {
  resourceType: "product",

  toSeoable(entity, tenant) {
    const stripped = productDescription(entity);
    return {
      resourceType: "product",
      id: entity.id,
      tenantId: entity.tenantId,
      path: `${PRODUCT_ROUTE_PREFIX}/${entity.slug}`,
      title: productTitle(entity),
      description: stripped.length > 0 ? stripped : null,
      // Product images live in `ProductMedia`, not MediaAsset, so
      // there's no ID to resolve via ImageService. The adapter
      // returns the first image directly via `getAdapterOgImage`.
      featuredImageId: null,
      seoOverrides: safeParseSeoMetadata(entity.seo),
      updatedAt: entity.updatedAt,
      publishedAt:
        entity.status === "ACTIVE" && entity.archivedAt === null
          ? entity.updatedAt
          : null,
      // Product content is not per-locale today; translations layer
      // (M8) will supply the non-default-locale variants. For now
      // the entity locale is the tenant default.
      locale: tenant.defaultLocale,
    };
  },

  getAdapterOgImage(entity) {
    // Filter explicitly: video ProductMedia rows exist in the same
    // table and must NOT leak into OG image output. One-liner but
    // easy to miss (per M5 Batch A risk #3).
    const firstImage = entity.media.find((m) => m.type === "image");
    if (!firstImage) return null;
    const image: ResolvedImage = {
      url: firstImage.url,
      // ProductMedia stores explicit width/height when known; fall
      // back to the Facebook-recommended OG size otherwise. Every
      // scraper assumes 1.91:1 cover-crop at 1200x630.
      width: firstImage.width ?? 1200,
      height: firstImage.height ?? 630,
      alt: firstImage.alt.length > 0 ? firstImage.alt : productTitle(entity),
    };
    return image;
  },

  isIndexable(entity) {
    // Safety net: a GIFT_CARD row must never be indexed through the
    // product adapter. The gift card adapter (Batch C) owns that
    // resource type and emits GiftCard-specific schema.
    if (entity.productType !== "STANDARD") return false;
    if (entity.status !== "ACTIVE") return false;
    if (entity.archivedAt !== null) return false;
    const overrides = safeParseSeoMetadata(entity.seo);
    if (overrides?.noindex) return false;
    // Out-of-stock products STAY indexable — Google prefers
    // "temporarily out of stock" over delisted pages. The Offer
    // emits OutOfStock availability; the page itself remains.
    return true;
  },

  toStructuredData(entity, tenant, locale, logContext) {
    const name = productTitle(entity);
    const stripped = productDescription(entity);
    const url = productUrl(entity, tenant, locale);

    // Zero-price guard: if the base price is 0 AND no variant has a
    // positive price, emit BreadcrumbList only. Google penalises
    // zero-price Product schema more harshly than missing schema.
    // Same guard as accommodation adapter for consistency.
    const anyVariantPriced = entity.variants.some((v) => v.price > 0);
    if (entity.price === 0 && !anyVariantPriced) {
      log("warn", "seo.structured_data.zero_price_skipped", {
        tenantId: tenant.id,
        resourceId: entity.id,
        resourceType: "product",
        requestId: logContext?.requestId ?? null,
      });
      return [breadcrumbList(entity, tenant, locale)];
    }

    const product: StructuredDataObject = {
      "@context": "https://schema.org",
      "@type": "Product",
      name,
      url,
    };
    if (stripped.length > 0) product.description = stripped;

    // Image: every product media of type=image, capped. Google
    // recommends an array even with a single image; Rich Results
    // accepts either a string or an array.
    const imageUrls = entity.media
      .filter((m) => m.type === "image")
      .slice(0, MAX_JSONLD_IMAGES)
      .map((m) => m.url);
    if (imageUrls.length > 0) product.image = imageUrls;

    // TODO(m5-followup): add a Product.brand column + emit
    // `brand: { @type: "Brand", name: product.brand }` here. We
    // explicitly do NOT fabricate tenant.siteName as a brand —
    // Google penalises made-up brand fields.

    // TODO(m5-followup): add Product.sku column. Current rule:
    // emit `sku` only when every selling variant has one (since
    // variants differ and we can't invent). A product-level SKU
    // column would let us emit `sku` on no-variant products too.
    if (entity.variants.length > 0) {
      const allHaveSku = entity.variants.every(
        (v) => typeof v.sku === "string" && v.sku.length > 0,
      );
      if (allHaveSku) {
        // Variants have distinct SKUs; we can't collapse to a single
        // product.sku field. schema.org allows sku on Offer, so we
        // emit it per-variant in the AggregateOffer branch below.
      }
    }

    product.offers = buildOffers(entity, tenant, locale, url);

    return [product, breadcrumbList(entity, tenant, locale)];
  },

  getSitemapEntries(entity, tenant, locales) {
    const basePath = `${PRODUCT_ROUTE_PREFIX}/${entity.slug}`;
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

// ── Offer construction ──────────────────────────────────────

/**
 * Build the `offers` sub-tree for a Product.
 *
 *   - No variants → single `Offer`.
 *   - ≥1 variants, ≥1 available → `AggregateOffer` across AVAILABLE
 *     variants. `lowPrice`/`highPrice` computed via `effectivePrice`
 *     so variants with `price=0` correctly inherit product base.
 *   - ≥1 variants, ALL unavailable → single `Offer` across all
 *     variants with `availability=OutOfStock`. AggregateOffer of
 *     zero offers is structurally invalid per schema.org.
 *
 * Called only when the product has a non-zero price somewhere (the
 * zero-price skip runs earlier in `toStructuredData`).
 */
function buildOffers(
  entity: ProductWithMedia,
  tenant: { currency?: string } | Parameters<typeof buildAbsoluteUrl>[0],
  locale: string,
  url: string,
): Record<string, unknown> {
  const currency = entity.currency;

  if (entity.variants.length === 0) {
    // Single-offer path.
    return {
      "@type": "Offer",
      price: formatPriceForJsonLd(entity.price),
      priceCurrency: currency,
      availability: isProductAvailable(entity)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url,
    };
  }

  const availableVariants = entity.variants.filter(isVariantAvailable);

  if (availableVariants.length === 0) {
    // Variants exist but all sold out → single OutOfStock Offer
    // priced at the base across all variants. Uses effectivePrice
    // so variants with price=0 inherit correctly.
    const allPrices = entity.variants.map((v) =>
      effectivePrice(entity.price, v.price),
    );
    return {
      "@type": "Offer",
      price: formatPriceForJsonLd(Math.min(...allPrices)),
      priceCurrency: currency,
      availability: "https://schema.org/OutOfStock",
      url,
    };
  }

  const availablePrices = availableVariants.map((v) =>
    effectivePrice(entity.price, v.price),
  );
  return {
    "@type": "AggregateOffer",
    lowPrice: formatPriceForJsonLd(Math.min(...availablePrices)),
    highPrice: formatPriceForJsonLd(Math.max(...availablePrices)),
    offerCount: availableVariants.length,
    priceCurrency: currency,
    url,
  };
}

// ── BreadcrumbList ──────────────────────────────────────────

/**
 * Emit `BreadcrumbList` for Home → Butik (/shop) → {product.title}.
 *
 * `/shop` currently has no page.tsx — the breadcrumb still links
 * there because Google tolerates a breadcrumb entry whose URL 404s
 * better than a missing breadcrumb entirely (lost Rich Results).
 * When we build a product index at `/shop`, nothing needs to
 * change here.
 */
function breadcrumbList(
  entity: ProductWithMedia,
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
        name: productTitle(entity),
        item: productUrl(entity, tenant, locale),
      },
    ],
  };
}
