/**
 * Accommodation SEO Adapter
 * ═════════════════════════
 *
 * Lifts a Prisma `Accommodation` (with ordered media) into the
 * `Seoable` contract and produces accommodation-specific JSON-LD.
 *
 * Required include shape when fetching from Prisma:
 *
 *   prisma.accommodation.findUnique({
 *     where: { ... },
 *     include: { media: { orderBy: { sortOrder: "asc" } } },
 *   })
 *
 * Failing to include `media` yields `getAdapterOgImage === null`
 * (graceful degradation — resolver falls through to tenant default
 * or dynamic OG).
 */

import type {
  Accommodation,
  AccommodationMedia,
  AccommodationType,
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
import type { SeoAdapter, SitemapEntry } from "./base";
import { log } from "../../logger";

// ── Input shape the adapter expects ──────────────────────────

/**
 * Prisma `Accommodation` with the `media` relation included, ordered
 * by `sortOrder` ascending. Callers are responsible for the include
 * — the adapter trusts the shape.
 */
export type AccommodationWithMedia = Accommodation & {
  media: AccommodationMedia[];
};

// ── Helpers ──────────────────────────────────────────────────

/**
 * Map an internal `AccommodationType` enum to a schema.org `@type`.
 * schema.org has specific types for Hotel/Apartment/Campground but not
 * for all our internal variants — unknowns fall back to `Accommodation`,
 * which is a valid schema.org parent type.
 */
function mapAccommodationType(t: AccommodationType): string {
  switch (t) {
    case "HOTEL":
      return "Hotel";
    case "APARTMENT":
      return "Apartment";
    case "CAMPING":
    case "PITCH":
      return "Campground";
    case "CABIN":
    default:
      return "Accommodation";
  }
}

function resolvedTitle(entity: AccommodationWithMedia): string {
  return entity.nameOverride ?? entity.name;
}

function resolvedDescription(entity: AccommodationWithMedia): string {
  const raw = entity.descriptionOverride ?? entity.description;
  return stripHtml(raw);
}

// ── Adapter ──────────────────────────────────────────────────

export const accommodationSeoAdapter: SeoAdapter<AccommodationWithMedia> = {
  resourceType: "accommodation",

  toSeoable(entity, tenant) {
    const description = resolvedDescription(entity);
    return {
      resourceType: "accommodation",
      id: entity.id,
      tenantId: entity.tenantId,
      path: `/accommodations/${entity.slug}`,
      title: resolvedTitle(entity),
      description: description.length > 0 ? description : null,
      // Accommodation images live in `AccommodationMedia`, not MediaAsset,
      // so there is no ID to resolve through the ImageService. The
      // adapter exposes its first media image via `getAdapterOgImage`
      // instead — resolver honours that before falling through.
      featuredImageId: null,
      seoOverrides: safeParseSeoMetadata(entity.seo),
      updatedAt: entity.updatedAt,
      // Accommodation has no `publishedAt`. We synthesize one from the
      // state pair (ACTIVE + not archived) so downstream code reading
      // `publishedAt` for recency signals gets a reasonable value.
      publishedAt:
        entity.status === "ACTIVE" && entity.archivedAt === null
          ? entity.updatedAt
          : null,
      // Accommodation content is not per-locale; translations live in the
      // TenantTranslation table. Seoable.locale tracks the *entity* locale
      // (for hreflang-like downstream logic), which is the tenant default.
      locale: tenant.defaultLocale,
    };
  },

  getAdapterOgImage(entity) {
    const first = entity.media[0];
    if (!first) return null;
    // AccommodationMedia stores direct URLs without dimensions — we publish
    // nominal 1200x630 (the Facebook OG recommended size) because merchant
    // uploads are typically tall-aspect but CSS cover-cropping at that box
    // is what every scraper assumes.
    const image: ResolvedImage = {
      url: first.url,
      width: 1200,
      height: 630,
      alt: first.altText ?? resolvedTitle(entity),
    };
    return image;
  },

  isIndexable(entity) {
    if (entity.status !== "ACTIVE") return false;
    if (entity.archivedAt !== null) return false;
    const overrides = safeParseSeoMetadata(entity.seo);
    return !overrides?.noindex;
  },

  toStructuredData(entity, tenant, _locale) {
    const name = resolvedTitle(entity);
    const description = resolvedDescription(entity);

    // Base schema: Accommodation / Hotel / Apartment / Campground.
    const base: StructuredDataObject = {
      "@context": "https://schema.org",
      "@type": mapAccommodationType(entity.accommodationType),
      name,
      description,
      occupancy: {
        "@type": "QuantitativeValue",
        maxValue: entity.maxGuests,
      },
    };
    if (entity.bedrooms !== null) {
      base.numberOfRooms = entity.bedrooms;
    }
    if (entity.roomSizeSqm !== null) {
      base.floorSize = {
        "@type": "QuantitativeValue",
        value: entity.roomSizeSqm,
        unitCode: "MTK",
      };
    }

    const result: StructuredDataObject[] = [base];

    // Product/Offer schema for Google Merchant — emitted only when we
    // have a real price. Zero-priced Products get penalized by Google
    // more harshly than missing Product schema altogether.
    if (entity.basePricePerNight > 0) {
      // Prices are stored in smallest currency unit (ören). schema.org
      // expects the human-readable decimal, so divide by 100.
      const priceDecimal = (entity.basePricePerNight / 100).toFixed(2);
      const product: StructuredDataObject = {
        "@context": "https://schema.org",
        "@type": "Product",
        name,
        description,
        offers: {
          "@type": "Offer",
          price: priceDecimal,
          priceCurrency: entity.currency,
          // Static InStock for ACTIVE accommodations. Real per-date
          // availability is a PMS concern; merchants wanting dynamic
          // availability can supply via `structuredDataExtensions`.
          availability: "https://schema.org/InStock",
        },
      };
      result.push(product);
    } else {
      log("warn", "seo.structured_data.zero_price_skipped", {
        tenantId: tenant.id,
        resourceId: entity.id,
        resourceType: "accommodation",
      });
    }

    return result;
  },

  getSitemapEntries(entity, tenant, locales) {
    const basePath = `/accommodations/${entity.slug}`;
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
