/**
 * Rich Results structural validation
 * ══════════════════════════════════
 *
 * Last verified against Google Rich Results docs: 2026-04-23.
 * Re-verify quarterly.
 *
 * ── What this file does ──────────────────────────────────────────
 * Every JSON-LD object emitted by `toStructuredData` across every
 * adapter scenario in Batch A is piped through a Zod schema that
 * encodes Google's current required-fields list for that `@type`.
 * If an adapter ever regresses — say someone drops `priceCurrency`
 * from an Offer, or emits an empty `itemListElement[]` array —
 * these tests fail in CI before Rich Results-eligible storefronts
 * silently lose their SERP treatment.
 *
 * Schemas are hand-authored (NOT auto-generated from schema.org)
 * because:
 *   - Google's Rich Results requirements are a STRICT SUBSET of
 *     schema.org's full spec — a schema.org-valid object can still
 *     fail Rich Results eligibility.
 *   - The requirement list is small and stable enough that an
 *     annual audit (more often if Google changes docs) beats a
 *     runtime-scraping approach.
 *   - No new devDependency (schema-dts) — we keep the test closed-
 *     system verifiable.
 *
 * ── Sources for required-field lists ─────────────────────────────
 *   Product + Offer:
 *     developers.google.com/search/docs/appearance/structured-data/product
 *   AggregateOffer:
 *     developers.google.com/search/docs/appearance/structured-data/product-variants
 *   BreadcrumbList:
 *     developers.google.com/search/docs/appearance/structured-data/breadcrumb
 *   ItemList / CollectionPage:
 *     developers.google.com/search/docs/appearance/structured-data/carousel
 *     schema.org/CollectionPage + ItemList definitions
 *
 * If Google changes a required-fields list, update the matching
 * schema here AND bump the "Last verified" date above.
 */

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("../../logger", () => ({ log: vi.fn() }));

import type {
  AccommodationCategory,
  AccommodationCategoryItem,
  AccommodationMedia,
  AccommodationStatus,
  AccommodationType,
  Product,
  ProductCollection,
  ProductCollectionItem,
  ProductMedia,
  ProductStatus,
  ProductType,
  ProductVariant,
} from "@prisma/client";

import type { AccommodationWithMedia } from "../adapters/accommodation";
import {
  accommodationCategorySeoAdapter,
  type AccommodationCategoryItemWithAccommodation,
  type AccommodationCategoryWithItems,
} from "../adapters/accommodation-category";
import {
  accommodationIndexSeoAdapter,
  type AccommodationIndexSeoInput,
} from "../adapters/accommodation-index";
import { productSeoAdapter, type ProductWithMedia } from "../adapters/product";
import {
  productCollectionSeoAdapter,
  type ProductCollectionItemWithProduct,
  type ProductCollectionWithItems,
} from "../adapters/product-collection";
import { searchSeoAdapter, type SearchSeoInput } from "../adapters/search";
import type { SeoTenantContext, StructuredDataObject } from "../types";

// ── Rich Results schemas ──────────────────────────────────────

/**
 * schema.org `@context` — always the canonical https URL.
 */
const SchemaOrgContext = z.literal("https://schema.org");

/**
 * Schema.org availability value — MUST be one of the enumerated
 * `ItemAvailability` URIs. Google accepts a short list; we only
 * emit InStock / OutOfStock today, but list the spec's enumeration
 * so the schema accepts any future adapter addition that stays
 * within schema.org.
 */
const AvailabilityEnum = z.enum([
  "https://schema.org/InStock",
  "https://schema.org/OutOfStock",
  "https://schema.org/PreOrder",
  "https://schema.org/BackOrder",
  "https://schema.org/Discontinued",
  "https://schema.org/InStoreOnly",
  "https://schema.org/LimitedAvailability",
  "https://schema.org/OnlineOnly",
  "https://schema.org/SoldOut",
]);

/** ISO 4217 three-letter currency code. */
const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);

/**
 * `Offer` required fields per Google Product Rich Results:
 *   - price (string or number)
 *   - priceCurrency (3-letter ISO code)
 *   - availability (schema.org ItemAvailability URI)
 */
const OfferSchema = z
  .object({
    "@type": z.literal("Offer"),
    price: z.union([z.string().min(1), z.number()]),
    priceCurrency: CurrencyCode,
    availability: AvailabilityEnum,
    url: z.string().url().optional(),
  })
  .strict();

/**
 * `AggregateOffer` required fields:
 *   - lowPrice
 *   - priceCurrency
 * Recommended: highPrice, offerCount.
 */
const AggregateOfferSchema = z
  .object({
    "@type": z.literal("AggregateOffer"),
    lowPrice: z.union([z.string().min(1), z.number()]),
    highPrice: z.union([z.string().min(1), z.number()]).optional(),
    offerCount: z.number().int().positive().optional(),
    priceCurrency: CurrencyCode,
    url: z.string().url().optional(),
  })
  .strict();

/**
 * `Product` required fields per Google Product Rich Results:
 *   - name
 *   - at least ONE of: image, offers, review, aggregateRating
 * We only emit image + offers today; `refine()` enforces the
 * at-least-one rule.
 */
const ProductSchema = z
  .object({
    "@context": SchemaOrgContext,
    "@type": z.literal("Product"),
    name: z.string().trim().min(1),
    description: z.string().min(1).optional(),
    url: z.string().url().optional(),
    image: z
      .union([
        z.string().url(),
        z.array(z.string().url()).min(1).max(10),
      ])
      .optional(),
    offers: z.union([OfferSchema, AggregateOfferSchema]).optional(),
  })
  .strict()
  .refine((obj) => obj.image !== undefined || obj.offers !== undefined, {
    message:
      "Product requires at least one of: image, offers, review, aggregateRating",
  });

/** A single `ListItem` inside a BreadcrumbList. */
const BreadcrumbItemSchema = z
  .object({
    "@type": z.literal("ListItem"),
    position: z.number().int().positive(),
    name: z.string().min(1),
    item: z.string().url(),
  })
  .strict();

/**
 * `BreadcrumbList` required fields:
 *   - itemListElement with ≥ 1 ListItem
 *   - each ListItem must have position, name, and item (URL)
 */
const BreadcrumbListSchema = z
  .object({
    "@context": SchemaOrgContext,
    "@type": z.literal("BreadcrumbList"),
    itemListElement: z.array(BreadcrumbItemSchema).min(1),
  })
  .strict();

/**
 * `CollectionPage` required fields:
 *   - name (or about, inverse pattern)
 * We always emit name; `url` is strongly recommended. `description`
 * is optional but emitted when the source collection has one.
 *
 * `about` is optional: accommodation-index and accommodation-
 * category emit `about: { @type: "Accommodation" }` to disambiguate
 * accommodation-listing pages from product-listing pages. The
 * structured value (`{ @type: "Accommodation" }`) is schema.org's
 * idiomatic shape — a Thing reference specifying what the page
 * is primarily about.
 */
const CollectionPageAboutSchema = z
  .object({
    "@type": z.string().min(1),
  })
  .passthrough();

const CollectionPageSchema = z
  .object({
    "@context": SchemaOrgContext,
    "@type": z.literal("CollectionPage"),
    name: z.string().min(1),
    url: z.string().url().optional(),
    description: z.string().min(1).optional(),
    about: CollectionPageAboutSchema.optional(),
  })
  .strict();

/** `ListItem` inside an ItemList (looser than BreadcrumbList). */
const ItemListItemSchema = z
  .object({
    "@type": z.literal("ListItem"),
    position: z.number().int().positive(),
    name: z.string().min(1).optional(),
    url: z.string().url().optional(),
    image: z.string().url().optional(),
  })
  .strict();

/**
 * `ItemList` required fields:
 *   - itemListElement with ≥ 1 entry
 */
const ItemListSchema = z
  .object({
    "@context": SchemaOrgContext,
    "@type": z.literal("ItemList"),
    itemListElement: z.array(ItemListItemSchema).min(1),
  })
  .strict();

// ── Dispatcher ────────────────────────────────────────────────

/**
 * Route one JSON-LD object to the matching validator. Returns the
 * `SafeParseReturnType` so the test can assert success and surface
 * a useful error message when a schema fails.
 */
function validateRichResultObject(obj: StructuredDataObject) {
  switch (obj["@type"]) {
    case "Product":
      return ProductSchema.safeParse(obj);
    case "BreadcrumbList":
      return BreadcrumbListSchema.safeParse(obj);
    case "CollectionPage":
      return CollectionPageSchema.safeParse(obj);
    case "ItemList":
      return ItemListSchema.safeParse(obj);
    default:
      throw new Error(
        `rich-results.test: no validator for @type="${obj["@type"]}"`,
      );
  }
}

/**
 * Validate a list of JSON-LD blocks (as `toStructuredData` returns).
 * Every object passes or the test fails with the first error surfaced.
 */
function expectAllRichResultsValid(objects: readonly StructuredDataObject[]) {
  for (const obj of objects) {
    const result = validateRichResultObject(obj);
    if (!result.success) {
      throw new Error(
        `Rich Results validation failed for @type=${obj["@type"]}:\n${JSON.stringify(
          result.error.issues,
          null,
          2,
        )}`,
      );
    }
    expect(result.success).toBe(true);
  }
}

// ── Shared fixtures (minimal, scenario-specific overrides inline) ──

function makeTenant(overrides: Partial<SeoTenantContext> = {}): SeoTenantContext {
  return {
    id: "tenant_rich",
    siteName: "Apelviken",
    primaryDomain: "apelviken.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}", noindex: false },
    activeLocales: ["sv"],
    contentUpdatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

function makeProductMedia(
  overrides: Partial<ProductMedia> = {},
): ProductMedia {
  return {
    id: "pm_1",
    productId: "prod_1",
    url: "https://cdn.example/img.jpg",
    type: "image",
    alt: "",
    sortOrder: 0,
    filename: "img.jpg",
    width: 1200,
    height: 900,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    ...overrides,
  };
}

function makeProductVariant(
  overrides: Partial<ProductVariant> = {},
): ProductVariant {
  return {
    id: "pv_1",
    productId: "prod_1",
    option1: null,
    option2: null,
    option3: null,
    imageUrl: null,
    price: 0,
    compareAtPrice: null,
    sku: null,
    trackInventory: false,
    inventoryQuantity: 0,
    continueSellingWhenOutOfStock: false,
    version: 1,
    sortOrder: 0,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    updatedAt: new Date("2026-03-01T00:00:00Z"),
    ...overrides,
  };
}

function makeProduct(
  overrides: Partial<ProductWithMedia> = {},
): ProductWithMedia {
  const base: Product = {
    id: "prod_1",
    tenantId: "tenant_rich",
    title: "Breakfast Buffet",
    description: "A hearty breakfast.",
    slug: "breakfast",
    status: "ACTIVE" as ProductStatus,
    productType: "STANDARD" as ProductType,
    price: 12900,
    currency: "SEK",
    compareAtPrice: null,
    trackInventory: false,
    inventoryQuantity: 0,
    continueSellingWhenOutOfStock: false,
    taxable: true,
    seo: null,
    version: 1,
    sortOrder: 0,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    templateId: null,
  };
  return {
    ...base,
    media: [makeProductMedia()],
    variants: [],
    ...overrides,
  };
}

function makeCollectionItem(
  productOverrides: Partial<Product> = {},
  joinOverrides: Partial<ProductCollectionItem> = {},
  media: ProductMedia[] = [],
): ProductCollectionItemWithProduct {
  const base: Product = {
    id: "prod_m",
    tenantId: "tenant_rich",
    title: "Member",
    description: "",
    slug: "member",
    status: "ACTIVE" as ProductStatus,
    productType: "STANDARD" as ProductType,
    price: 10000,
    currency: "SEK",
    compareAtPrice: null,
    trackInventory: false,
    inventoryQuantity: 0,
    continueSellingWhenOutOfStock: false,
    taxable: true,
    seo: null,
    version: 1,
    sortOrder: 0,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-03-01T00:00:00Z"),
    templateId: null,
    ...productOverrides,
  };
  const join: ProductCollectionItem = {
    id: `pci_${base.id}`,
    collectionId: "coll_1",
    productId: base.id,
    sortOrder: 0,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    ...joinOverrides,
  };
  return { ...join, product: { ...base, media } };
}

function makeCollection(
  overrides: Partial<ProductCollectionWithItems> = {},
): ProductCollectionWithItems {
  const base: ProductCollection = {
    id: "coll_1",
    tenantId: "tenant_rich",
    title: "Food",
    description: "Food collection",
    slug: "food",
    imageUrl: "https://cdn.example/collection.jpg",
    status: "ACTIVE" as ProductStatus,
    sortOrder: 0,
    seo: null,
    version: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
  };
  return { ...base, items: [], ...overrides };
}

// ── Product adapter scenarios ─────────────────────────────────

describe("Rich Results — Product adapter output", () => {
  const tenant = makeTenant();

  it("single-offer in-stock", () => {
    const out = productSeoAdapter.toStructuredData(
      makeProduct({ trackInventory: true, inventoryQuantity: 5 }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("single-offer out-of-stock (tracked inventory, zero on hand)", () => {
    const out = productSeoAdapter.toStructuredData(
      makeProduct({
        trackInventory: true,
        inventoryQuantity: 0,
        continueSellingWhenOutOfStock: false,
      }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("single-offer unlimited stock (trackInventory off)", () => {
    const out = productSeoAdapter.toStructuredData(
      makeProduct({ trackInventory: false }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("AggregateOffer with all variants available", () => {
    const out = productSeoAdapter.toStructuredData(
      makeProduct({
        variants: [
          makeProductVariant({ id: "v1", price: 10000 }),
          makeProductVariant({ id: "v2", price: 15000 }),
          makeProductVariant({ id: "v3", price: 20000 }),
        ],
      }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("AggregateOffer with partial variant availability", () => {
    const out = productSeoAdapter.toStructuredData(
      makeProduct({
        variants: [
          makeProductVariant({
            id: "v1",
            price: 5000,
            trackInventory: true,
            inventoryQuantity: 0,
          }),
          makeProductVariant({ id: "v2", price: 15000 }),
        ],
      }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("all-variants-unavailable → single OutOfStock Offer", () => {
    const out = productSeoAdapter.toStructuredData(
      makeProduct({
        variants: [
          makeProductVariant({
            id: "v1",
            price: 10000,
            trackInventory: true,
            inventoryQuantity: 0,
          }),
          makeProductVariant({
            id: "v2",
            price: 15000,
            trackInventory: true,
            inventoryQuantity: 0,
          }),
        ],
      }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("zero-price product skips Product schema; BreadcrumbList remains valid", () => {
    const out = productSeoAdapter.toStructuredData(
      makeProduct({
        price: 0,
        variants: [makeProductVariant({ price: 0 })],
      }),
      tenant,
      "sv",
    );
    // Only BreadcrumbList expected — still validates.
    expectAllRichResultsValid(out);
    expect(out.find((o) => o["@type"] === "Product")).toBeUndefined();
  });

  it("product without images — Product still valid because offers is present", () => {
    const out = productSeoAdapter.toStructuredData(
      makeProduct({ media: [] }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("product with 15 images — image array capped at 10, still valid", () => {
    const media: ProductMedia[] = Array.from({ length: 15 }, (_, i) =>
      makeProductMedia({
        id: `m_${i}`,
        url: `https://cdn.example/img-${i}.jpg`,
        sortOrder: i,
      }),
    );
    const out = productSeoAdapter.toStructuredData(
      makeProduct({ media }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
    const product = out.find((o) => o["@type"] === "Product");
    expect((product?.image as string[]).length).toBe(10);
  });
});

// ── ProductCollection adapter scenarios ───────────────────────

describe("Rich Results — ProductCollection adapter output", () => {
  const tenant = makeTenant();

  it("empty collection — CollectionPage + BreadcrumbList only", () => {
    const out = productCollectionSeoAdapter.toStructuredData(
      makeCollection({ items: [] }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
    // Verify ItemList is absent (empty ItemList fails Rich Results).
    expect(out.find((o) => o["@type"] === "ItemList")).toBeUndefined();
  });

  it("collection with 1 member", () => {
    const out = productCollectionSeoAdapter.toStructuredData(
      makeCollection({
        items: [
          makeCollectionItem(
            { id: "a", slug: "a", title: "A" },
            { sortOrder: 0 },
            [makeProductMedia()],
          ),
        ],
      }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("collection with 20 members (the fetcher's hard cap)", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeCollectionItem(
        { id: `p${i}`, slug: `p-${i}`, title: `P${i}` },
        { sortOrder: i },
      ),
    );
    const out = productCollectionSeoAdapter.toStructuredData(
      makeCollection({ items }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("collection member with no image — ItemList still valid", () => {
    const out = productCollectionSeoAdapter.toStructuredData(
      makeCollection({
        items: [
          makeCollectionItem(
            { id: "a", slug: "a", title: "A" },
            { sortOrder: 0 },
            [], // no media
          ),
        ],
      }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("collection description omitted when source is empty — still valid", () => {
    const out = productCollectionSeoAdapter.toStructuredData(
      makeCollection({ description: "" }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });
});

// ── Locale variants ──────────────────────────────────────────

describe("Rich Results — locale variants", () => {
  const tenant = makeTenant({ activeLocales: ["sv", "en"] });

  it("Product @ /en locale still produces valid Rich Results", () => {
    const out = productSeoAdapter.toStructuredData(
      makeProduct(),
      tenant,
      "en",
    );
    expectAllRichResultsValid(out);
  });

  it("ProductCollection @ /en locale still produces valid Rich Results", () => {
    const out = productCollectionSeoAdapter.toStructuredData(
      makeCollection({
        items: [
          makeCollectionItem({ id: "a", slug: "a", title: "A" }, {}, [
            makeProductMedia(),
          ]),
        ],
      }),
      tenant,
      "en",
    );
    expectAllRichResultsValid(out);
  });
});

// ──────────────────────────────────────────────────────────────
// M5 Batch B adapters
// ──────────────────────────────────────────────────────────────
//
// Every JSON-LD block emitted by the three Batch B adapters
// (accommodation-index, accommodation-category, search) passes
// the same validators used by Batch A, plus the newly loosened
// CollectionPageSchema that accepts `about: { @type }`.

function makeAccommodationMedia(
  overrides: Partial<AccommodationMedia> = {},
): AccommodationMedia {
  return {
    id: "am1",
    accommodationId: "acc_1",
    url: "https://cdn.example/acc.jpg",
    altText: "",
    sortOrder: 0,
    source: "MANUAL",
    ...overrides,
  };
}

function makeAccommodation(
  overrides: Partial<AccommodationWithMedia> = {},
): AccommodationWithMedia {
  return {
    id: "acc_1",
    tenantId: "tenant_rich",
    name: "Stuga",
    slug: "stuga",
    shortName: null,
    externalCode: null,
    externalId: null,
    pmsProvider: null,
    pmsSyncedAt: null,
    pmsData: null,
    seo: null,
    accommodationType: "CABIN" as AccommodationType,
    status: "ACTIVE",
    nameOverride: null,
    descriptionOverride: null,
    description: "",
    maxGuests: 4,
    minGuests: 1,
    defaultGuests: 2,
    maxAdults: null,
    minAdults: null,
    maxChildren: null,
    minChildren: null,
    extraBeds: 0,
    roomSizeSqm: 30,
    bedrooms: 2,
    bathrooms: 1,
    floorNumber: null,
    basePricePerNight: 120000,
    currency: "SEK",
    taxRate: 1200,
    totalUnits: 1,
    baseAvailability: 1,
    roomTypeGroupId: null,
    sortOrder: 0,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    media: [],
    ...overrides,
  };
}

function makeIndexInput(
  overrides: Partial<AccommodationIndexSeoInput> = {},
): AccommodationIndexSeoInput {
  return {
    tenantId: "tenant_rich",
    activeLocales: ["sv"],
    featuredAccommodations: [],
    ...overrides,
  };
}

function makeCategoryItem(
  accommodationOverrides: Partial<AccommodationWithMedia> = {},
  joinOverrides: Partial<AccommodationCategoryItem> = {},
  media: AccommodationMedia[] = [],
): AccommodationCategoryItemWithAccommodation {
  const accommodation = makeAccommodation({
    ...accommodationOverrides,
    media,
  });
  const join: AccommodationCategoryItem = {
    id: `aci_${accommodation.id}`,
    categoryId: "cat_rich",
    accommodationId: accommodation.id,
    sortOrder: 0,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    ...joinOverrides,
  };
  return { ...join, accommodation };
}

function makeAccommodationCategory(
  overrides: Partial<AccommodationCategoryWithItems> = {},
): AccommodationCategoryWithItems {
  const base: AccommodationCategory = {
    id: "cat_rich",
    tenantId: "tenant_rich",
    title: "Stugor",
    description: "Våra stugor",
    slug: "stugor",
    imageUrl: "https://cdn.example/stugor.jpg",
    status: "ACTIVE" as AccommodationStatus,
    visibleInSearch: true,
    sortOrder: 0,
    pmsRef: null,
    version: 1,
    seo: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
  };
  return { ...base, items: [], ...overrides };
}

function makeSearchInput(overrides: Partial<SearchSeoInput> = {}): SearchSeoInput {
  return {
    tenantId: "tenant_rich",
    activeLocales: ["sv"],
    ...overrides,
  };
}

// ── accommodation-index ──────────────────────────────────────

describe("Rich Results — accommodation-index adapter", () => {
  const tenant = makeTenant();

  it("empty featured list: CollectionPage + BreadcrumbList only, still valid", () => {
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeIndexInput({ featuredAccommodations: [] }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
    expect(out.find((o) => o["@type"] === "ItemList")).toBeUndefined();
  });

  it("CollectionPage.about={@type:Accommodation} is accepted by the validator", () => {
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeIndexInput(),
      tenant,
      "sv",
    );
    const page = out.find((o) => o["@type"] === "CollectionPage");
    expect(page?.about).toEqual({ "@type": "Accommodation" });
    expectAllRichResultsValid(out);
  });

  it("with 1 featured accommodation: CollectionPage + ItemList + BreadcrumbList all valid", () => {
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeIndexInput({
        featuredAccommodations: [
          makeAccommodation({ media: [makeAccommodationMedia()] }),
        ],
      }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("with 20 featured accommodations: full ItemList still valid", () => {
    const featured = Array.from({ length: 20 }, (_, i) =>
      makeAccommodation({ id: `a${i}`, slug: `a-${i}`, name: `A${i}` }),
    );
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeIndexInput({ featuredAccommodations: featured }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("with 21 featured accommodations (oversize): output is capped to 20, still valid", () => {
    const featured = Array.from({ length: 21 }, (_, i) =>
      makeAccommodation({ id: `a${i}`, slug: `a-${i}`, name: `A${i}` }),
    );
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeIndexInput({ featuredAccommodations: featured }),
      tenant,
      "sv",
    );
    const list = out.find((o) => o["@type"] === "ItemList");
    expect((list?.itemListElement as unknown[]).length).toBe(20);
    expectAllRichResultsValid(out);
  });

  it("BreadcrumbList is 2-level (Hem → Boenden)", () => {
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeIndexInput(),
      tenant,
      "sv",
    );
    const crumb = out.find((o) => o["@type"] === "BreadcrumbList");
    expect((crumb?.itemListElement as unknown[]).length).toBe(2);
    expectAllRichResultsValid(out);
  });
});

// ── accommodation-category ──────────────────────────────────

describe("Rich Results — accommodation-category adapter", () => {
  const tenant = makeTenant();

  it("non-indexable (empty items): returns no JSON-LD to validate", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeAccommodationCategory({ items: [] }),
      tenant,
      "sv",
    );
    // Empty list — nothing to validate. Explicit assertion that no
    // invalid objects leaked through.
    expect(out).toEqual([]);
  });

  it("non-indexable (DRAFT / INACTIVE): returns no JSON-LD", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeAccommodationCategory({
        status: "INACTIVE" as AccommodationStatus,
        items: [makeCategoryItem()],
      }),
      tenant,
      "sv",
    );
    expect(out).toEqual([]);
  });

  it("indexable with 1 member: CollectionPage + ItemList + BreadcrumbList all valid", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeAccommodationCategory({
        items: [makeCategoryItem({}, {}, [makeAccommodationMedia()])],
      }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });

  it("BreadcrumbList is 3-level (Hem → Boenden → {category.title})", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeAccommodationCategory({ items: [makeCategoryItem()] }),
      tenant,
      "sv",
    );
    const crumb = out.find((o) => o["@type"] === "BreadcrumbList");
    expect((crumb?.itemListElement as unknown[]).length).toBe(3);
    expectAllRichResultsValid(out);
  });

  it("indexable with 20 members: full ItemList valid", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeCategoryItem(
        { id: `a${i}`, slug: `a-${i}`, name: `A${i}` },
        { sortOrder: i },
      ),
    );
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeAccommodationCategory({ items }),
      tenant,
      "sv",
    );
    expectAllRichResultsValid(out);
  });
});

// ── search ──────────────────────────────────────────────────

describe("Rich Results — search adapter", () => {
  const tenant = makeTenant();

  it("always returns an empty structured-data array (no JSON-LD to validate)", () => {
    expect(
      searchSeoAdapter.toStructuredData(makeSearchInput(), tenant, "sv"),
    ).toEqual([]);
  });
});
