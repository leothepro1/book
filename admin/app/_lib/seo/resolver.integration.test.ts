/**
 * Resolver integration tests
 * ══════════════════════════
 *
 * End-to-end verification that `SeoResolver.resolve()` produces a
 * fully-populated `ResolvedSeo` for a realistic Accommodation fixture.
 *
 * No Prisma — we inject fake repository + image service implementations
 * that satisfy the same interfaces. The real Accommodation adapter is
 * registered via the global registry (cleared before each test).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({ log: vi.fn() }));

import type {
  AccommodationCategory,
  AccommodationCategoryItem,
  AccommodationMedia,
  AccommodationStatus,
  PageTypeSeoDefault,
  Product,
  ProductCollection,
  ProductCollectionItem,
  ProductMedia,
  ProductStatus,
  ProductType,
  ProductVariant,
} from "@prisma/client";

import { log } from "../logger";
import type { SeoAdapter } from "./adapters/base";
import {
  _clearSeoAdaptersForTests,
  registerSeoAdapter,
} from "./adapters/base";
import {
  type AccommodationWithMedia,
  accommodationSeoAdapter,
} from "./adapters/accommodation";
import { homepageSeoAdapter } from "./adapters/homepage";
import {
  type ProductWithMedia,
  productSeoAdapter,
} from "./adapters/product";
import {
  type ProductCollectionItemWithProduct,
  type ProductCollectionWithItems,
  productCollectionSeoAdapter,
} from "./adapters/product-collection";
import {
  type AccommodationIndexSeoInput,
  accommodationIndexSeoAdapter,
} from "./adapters/accommodation-index";
import {
  type AccommodationCategoryItemWithAccommodation,
  type AccommodationCategoryWithItems,
  accommodationCategorySeoAdapter,
} from "./adapters/accommodation-category";
import {
  type SearchSeoInput,
  searchSeoAdapter,
} from "./adapters/search";
import type {
  ImageService,
  PageTypeSeoDefaultRepository,
} from "./dependencies";
import { SeoResolver } from "./resolver";
import type {
  ResolvedImage,
  Seoable,
  SeoResolutionContext,
  SeoTenantContext,
} from "./types";

// ── Fixtures ──────────────────────────────────────────────────

function makeTenant(
  overrides: Partial<SeoTenantContext> = {},
): SeoTenantContext {
  return {
    id: "tenant_t",
    siteName: "Apelviken",
    primaryDomain: "apelviken-x.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: {
      titleTemplate: "{entityTitle} | {siteName}",
      twitterSite: "@apelviken",
    },
    activeLocales: ["sv", "en", "de"],
    ...overrides,
  };
}

function makeMedia(
  overrides: Partial<AccommodationMedia> = {},
): AccommodationMedia {
  return {
    id: "media_1",
    accommodationId: "acc_1",
    url: "https://cdn.example/primary.jpg",
    altText: "Primary photo",
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
    tenantId: "tenant_t",
    name: "Stuga Björk",
    slug: "stuga-bjork",
    shortName: null,
    externalCode: null,
    externalId: null,
    pmsProvider: null,
    pmsSyncedAt: null,
    pmsData: null,
    seo: null,
    accommodationType: "CABIN",
    status: "ACTIVE",
    nameOverride: null,
    descriptionOverride: null,
    description: "A cosy cabin near the sea.",
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
    media: [makeMedia()],
    ...overrides,
  };
}

function makeCtx(
  tenant: SeoTenantContext,
  entity: AccommodationWithMedia,
  overrides: Partial<SeoResolutionContext> = {},
): SeoResolutionContext {
  return {
    tenant,
    resourceType: "accommodation",
    entity,
    locale: tenant.defaultLocale,
    ...overrides,
  };
}

// Fake repository: return a precomputed row if configured, else null.
function fakeRepo(
  row: PageTypeSeoDefault | null = null,
): PageTypeSeoDefaultRepository {
  return {
    async get() {
      return row;
    },
  };
}

// Fake ImageService that ignores all ids (OG image fallback is
// exercised via the adapter's `getAdapterOgImage` on the media[0]).
function fakeImgService(): ImageService {
  const dynamic: ResolvedImage = {
    url: "https://cdn/x-dynamic.jpg",
    width: 1200,
    height: 630,
    alt: "dynamic",
  };
  return {
    async getOgImage() {
      return null;
    },
    async generateDynamicOgImage() {
      return dynamic;
    },
  };
}

beforeEach(() => {
  _clearSeoAdaptersForTests();
  registerSeoAdapter(accommodationSeoAdapter);
});

// ──────────────────────────────────────────────────────────────

describe("SeoResolver.resolve — Accommodation (integration)", () => {
  it("populates every top-level field of ResolvedSeo", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant();
    const entity = makeAccommodation();
    const r = await resolver.resolve(makeCtx(tenant, entity));

    // Scalars
    expect(r.title).toBe("Stuga Björk | Apelviken");
    expect(r.description).toBe("A cosy cabin near the sea.");
    expect(r.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/stays/stuga-bjork",
    );
    expect(r.canonicalPath).toBe("/stays/stuga-bjork");
    expect(r.noindex).toBe(false);
    expect(r.nofollow).toBe(false);

    // Open Graph
    expect(r.openGraph).toMatchObject({
      type: "website",
      url: "https://apelviken-x.rutgr.com/stays/stuga-bjork",
      title: "Stuga Björk | Apelviken",
      siteName: "Apelviken",
      locale: "sv_SE",
    });
    // Adapter provides the OG image from media[0], so we should get it here.
    expect(r.openGraph.image).toEqual({
      url: "https://cdn.example/primary.jpg",
      width: 1200,
      height: 630,
      alt: "Primary photo",
    });

    // Twitter
    expect(r.twitterCard).toMatchObject({
      card: "summary_large_image",
      site: "@apelviken",
      title: "Stuga Björk | Apelviken",
    });
    expect(r.twitterCard.image?.url).toBe("https://cdn.example/primary.jpg");

    // Hreflang: sv + en + de + x-default
    expect(r.hreflang).toHaveLength(4);
    expect(r.hreflang.map((h) => h.code)).toEqual([
      "sv",
      "en",
      "de",
      "x-default",
    ]);

    // Structured data: base + Product
    expect(r.structuredData).toHaveLength(2);
    expect(r.structuredData[0]["@type"]).toBe("Accommodation");
    expect(r.structuredData[1]["@type"]).toBe("Product");
  });

  it("override wins for title, description, canonical, noindex (per-field precedence)", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant();
    const entity = makeAccommodation({
      seo: {
        title: "Custom SEO Title",
        description: "Custom SEO description",
        canonicalPath: "/custom/path",
        noindex: true,
        nofollow: true,
      },
    });
    const r = await resolver.resolve(makeCtx(tenant, entity));

    expect(r.title).toBe("Custom SEO Title");
    expect(r.description).toBe("Custom SEO description");
    expect(r.canonicalPath).toBe("/custom/path");
    expect(r.canonicalUrl).toBe("https://apelviken-x.rutgr.com/custom/path");
    expect(r.noindex).toBe(true);
    expect(r.nofollow).toBe(true);
  });

  it("pattern wins over tenant template when no entity override", async () => {
    const typeDefaults: PageTypeSeoDefault = {
      id: "ptd_1",
      tenantId: "tenant_t",
      pageType: "ACCOMMODATION",
      titlePattern: "{entity.title} — Bedfront Cabin",
      descriptionPattern: "Book {entity.title} today.",
      ogImagePattern: null,
      structuredDataEnabled: true,
    };
    const resolver = new SeoResolver(
      fakeImgService(),
      fakeRepo(typeDefaults),
    );
    const tenant = makeTenant();
    const entity = makeAccommodation();
    const r = await resolver.resolve(makeCtx(tenant, entity));

    expect(r.title).toBe("Stuga Björk — Bedfront Cabin");
    expect(r.description).toBe("Book Stuga Björk today.");
  });

  it("noindex propagates when adapter says the entity is not indexable (status INACTIVE)", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant();
    const entity = makeAccommodation({ status: "INACTIVE" });
    const r = await resolver.resolve(makeCtx(tenant, entity));
    expect(r.noindex).toBe(true);
  });

  it("self-canonical per locale: /en/ page canonicals to /en/, not /", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant();
    const entity = makeAccommodation();
    const r = await resolver.resolve(
      makeCtx(tenant, entity, { locale: "en" }),
    );
    expect(r.canonicalPath).toBe("/en/stays/stuga-bjork");
    expect(r.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/en/stays/stuga-bjork",
    );
    expect(r.openGraph.url).toBe(
      "https://apelviken-x.rutgr.com/en/stays/stuga-bjork",
    );
  });

  it("hreflang list includes every active locale + x-default with correct URLs", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant();
    const entity = makeAccommodation();
    const r = await resolver.resolve(makeCtx(tenant, entity));
    expect(r.hreflang).toEqual([
      {
        code: "sv",
        url: "https://apelviken-x.rutgr.com/stays/stuga-bjork",
      },
      {
        code: "en",
        url: "https://apelviken-x.rutgr.com/en/stays/stuga-bjork",
      },
      {
        code: "de",
        url: "https://apelviken-x.rutgr.com/de/stays/stuga-bjork",
      },
      {
        code: "x-default",
        url: "https://apelviken-x.rutgr.com/stays/stuga-bjork",
      },
    ]);
  });

  it("when canonical is overridden, every hreflang entry points at the override", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant();
    const entity = makeAccommodation({
      seo: { canonicalPath: "/custom" },
    });
    const r = await resolver.resolve(makeCtx(tenant, entity));
    const urls = new Set(r.hreflang.map((h) => h.url));
    expect(urls.size).toBe(1);
    expect(urls.has("https://apelviken-x.rutgr.com/custom")).toBe(true);
  });

  it("structured data merges tenant-level Organization on homepage context", async () => {
    // Register a tiny homepage adapter for this test.
    const homepageAdapter = {
      resourceType: "homepage" as const,
      toSeoable: () => ({
        resourceType: "homepage" as const,
        id: "home",
        tenantId: "tenant_t",
        path: "/",
        title: "Home",
        description: "Welcome",
        featuredImageId: null,
        seoOverrides: null,
        updatedAt: new Date(),
        publishedAt: new Date(),
        locale: "sv",
      }),
      toStructuredData: () => [],
      isIndexable: () => true,
      getSitemapEntries: () => [],
    };
    registerSeoAdapter(homepageAdapter);

    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "{entityTitle} | {siteName}",
        organizationSchema: {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Apelviken AB",
          url: "https://apelviken-x.rutgr.com",
        },
      },
    });
    const r = await resolver.resolve({
      tenant,
      resourceType: "homepage",
      entity: {},
      locale: "sv",
    });

    expect(
      r.structuredData.find((o) => o["@type"] === "Organization"),
    ).toBeDefined();
  });

  it("merchant-authored structuredDataExtensions are appended to the merged output", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant();
    const entity = makeAccommodation({
      seo: {
        structuredDataExtensions: [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            name: "FAQ",
          },
        ],
      },
    });
    const r = await resolver.resolve(makeCtx(tenant, entity));
    expect(
      r.structuredData.find((o) => o["@type"] === "FAQPage"),
    ).toBeDefined();
  });

  it("OG type = 'website' for accommodation (Next.js OpenGraph union excludes 'product')", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve(
      makeCtx(makeTenant(), makeAccommodation()),
    );
    expect(r.openGraph.type).toBe("website");
  });

  it("throws if no adapter is registered for the resource type", async () => {
    _clearSeoAdaptersForTests();
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    await expect(
      resolver.resolve(makeCtx(makeTenant(), makeAccommodation())),
    ).rejects.toThrow(/No SEO adapter registered/);
  });
});

// ──────────────────────────────────────────────────────────────
// Homepage integration (M5)
// ──────────────────────────────────────────────────────────────

describe("SeoResolver.resolve — Homepage (integration, M5)", () => {
  beforeEach(() => {
    _clearSeoAdaptersForTests();
    registerSeoAdapter(homepageSeoAdapter);
  });

  it("produces title === tenant.siteName when no merchant homepage config (no duplication)", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "homepage",
      entity: {},
      locale: "sv",
    });
    // Critically: NOT "Apelviken | Apelviken".
    expect(r.title).toBe("Apelviken");
  });

  it("produces merchant-configured homepage.title when set", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "{entityTitle} | {siteName}",
        homepage: { title: "Discover the cabins", noindex: false },
      },
    });
    const r = await resolver.resolve({
      tenant,
      resourceType: "homepage",
      entity: {},
      locale: "sv",
    });
    expect(r.title).toBe("Discover the cabins");
  });

  it("produces merchant-configured homepage.description when set", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "x",
        homepage: { description: "Cosy cabins by the sea.", noindex: false },
      },
    });
    const r = await resolver.resolve({
      tenant,
      resourceType: "homepage",
      entity: {},
      locale: "sv",
    });
    expect(r.description).toBe("Cosy cabins by the sea.");
  });

  it("honors homepage.noindex === true", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "x",
        homepage: { noindex: true },
      },
    });
    const r = await resolver.resolve({
      tenant,
      resourceType: "homepage",
      entity: {},
      locale: "sv",
    });
    expect(r.noindex).toBe(true);
  });

  it("canonical is root (no trailing-slash weirdness) on default locale", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "homepage",
      entity: {},
      locale: "sv",
    });
    expect(r.canonicalUrl).toBe("https://apelviken-x.rutgr.com/");
  });

  it("canonical prepends locale on non-default request", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "homepage",
      entity: {},
      locale: "en",
    });
    expect(r.canonicalUrl).toBe("https://apelviken-x.rutgr.com/en/");
  });

  it("hreflang covers every active locale + x-default", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "homepage",
      entity: {},
      locale: "sv",
    });
    expect(r.hreflang.map((h) => h.code)).toEqual([
      "sv",
      "en",
      "de",
      "x-default",
    ]);
  });

  it("structured data contains WebSite (adapter) + tenant-level Organization when configured", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant({
      seoDefaults: {
        titleTemplate: "x",
        organizationSchema: {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Apelviken AB",
        },
      },
    });
    const r = await resolver.resolve({
      tenant,
      resourceType: "homepage",
      entity: {},
      locale: "sv",
    });
    const types = r.structuredData.map((s) => s["@type"]);
    expect(types).toContain("WebSite");
    expect(types).toContain("Organization");
  });

  it("OG type is 'website' for homepage", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "homepage",
      entity: {},
      locale: "sv",
    });
    expect(r.openGraph.type).toBe("website");
  });
});

// ──────────────────────────────────────────────────────────────
// Adapter output hardening (M5 prep)
// ──────────────────────────────────────────────────────────────

describe("SeoResolver.resolve — adapter output validation (M5 prep)", () => {
  beforeEach(() => {
    _clearSeoAdaptersForTests();
    vi.mocked(log).mockClear();
  });

  it("substitutes a safe fallback Seoable when the adapter returns a malformed shape", async () => {
    // Adapter returns a Seoable missing the required `path` field.
    // The resolver must not throw — it must log and render safe SEO.
    const brokenAdapter: SeoAdapter = {
      resourceType: "accommodation",
      // Cast through unknown: we deliberately violate the adapter
      // contract at runtime to exercise the resolver's defensive path.
      toSeoable: () =>
        ({
          resourceType: "accommodation",
          id: "acc_1",
          tenantId: "tenant_t",
          // path: MISSING
          title: "Stuga Björk",
          description: null,
          featuredImageId: null,
          seoOverrides: null,
          updatedAt: new Date(),
          publishedAt: null,
          locale: "sv",
        }) as unknown as Seoable,
      toStructuredData: () => [],
      isIndexable: () => true,
      getSitemapEntries: () => [],
    };
    registerSeoAdapter(brokenAdapter);

    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant();
    const entity = makeAccommodation();

    // Must not throw.
    const r = await resolver.resolve(makeCtx(tenant, entity));

    // Fallback Seoable → path "/", title = tenant.siteName, noindex=true.
    expect(r.canonicalPath).toBe("/");
    expect(r.canonicalUrl).toBe("https://apelviken-x.rutgr.com/");
    expect(r.title).toBe("Apelviken | Apelviken");
    expect(r.noindex).toBe(true);

    // Log event emitted with resource + tenant context + issues list.
    const invalidCalls = vi
      .mocked(log)
      .mock.calls.filter((c) => c[1] === "seo.adapter.output_invalid");
    expect(invalidCalls).toHaveLength(1);
    const [, , logCtx] = invalidCalls[0];
    expect(logCtx).toMatchObject({
      tenantId: "tenant_t",
      resourceType: "accommodation",
      resourceId: "acc_1",
    });
    // `issues` is serialized to JSON for the logger's primitive-only
    // context type. Parse it back for assertion — we don't couple the
    // test to the exact issue list Zod emits, only to the presence of
    // the missing-field we deliberately omitted.
    const serialized = (logCtx as { issues: string }).issues;
    expect(typeof serialized).toBe("string");
    const issues = JSON.parse(serialized) as Array<{ path: string }>;
    expect(issues.some((i) => i.path === "path")).toBe(true);
  });

  it("propagates ctx.requestId into structured log events", async () => {
    // Use a tenant override whose canonical is set so hreflang
    // logs the `seo.hreflang.canonical_overridden` event — a log
    // with a requestId field wired through the resolver.
    registerSeoAdapter(accommodationSeoAdapter);
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant();
    const entity = makeAccommodation({
      seo: { canonicalPath: "/custom-canonical" },
    });
    const requestId = "req_test_fixed_id_42";

    await resolver.resolve(
      makeCtx(tenant, entity, { requestId }),
    );

    const overrideCalls = vi
      .mocked(log)
      .mock.calls.filter(
        (c) => c[1] === "seo.hreflang.canonical_overridden",
      );
    expect(overrideCalls).toHaveLength(1);
    expect(overrideCalls[0][2]).toMatchObject({
      tenantId: "tenant_t",
      resourceId: "acc_1",
      requestId,
    });
  });

  it("propagates ctx.requestId into adapter-emitted logs (zero-price warn)", async () => {
    // Accommodation with basePricePerNight === 0 triggers
    // `seo.structured_data.zero_price_skipped` inside the adapter.
    // The adapter receives logContext from the resolver and must
    // include requestId in its log call.
    registerSeoAdapter(accommodationSeoAdapter);
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const tenant = makeTenant();
    const entity = makeAccommodation({ basePricePerNight: 0 });
    const requestId = "req_zero_price_probe";

    await resolver.resolve(
      makeCtx(tenant, entity, { requestId }),
    );

    const calls = vi
      .mocked(log)
      .mock.calls.filter(
        (c) => c[1] === "seo.structured_data.zero_price_skipped",
      );
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toMatchObject({
      tenantId: "tenant_t",
      resourceId: "acc_1",
      requestId,
    });
  });
});

// ──────────────────────────────────────────────────────────────
// Product integration (M5 Batch A.1)
// ──────────────────────────────────────────────────────────────

function makeProductMedia(overrides: Partial<ProductMedia> = {}): ProductMedia {
  return {
    id: "pmed_1",
    productId: "prod_1",
    url: "https://cdn.example/product.jpg",
    type: "image",
    alt: "Product",
    sortOrder: 0,
    filename: "product.jpg",
    width: 1200,
    height: 630,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    ...overrides,
  };
}

function makeProductVariant(
  overrides: Partial<ProductVariant> = {},
): ProductVariant {
  return {
    id: "pvar_1",
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
    tenantId: "tenant_t",
    title: "Frukost-buffé",
    description: "Lokala råvaror.",
    slug: "frukost-buffe",
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

describe("SeoResolver.resolve — Product (integration, M5 Batch A.1)", () => {
  beforeEach(() => {
    _clearSeoAdaptersForTests();
    registerSeoAdapter(productSeoAdapter);
  });

  it("end-to-end: title / description / canonical / OG / JSON-LD shape", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "product",
      entity: makeProduct(),
      locale: "sv",
    });

    expect(r.title).toBe("Frukost-buffé | Apelviken");
    expect(r.description).toBe("Lokala råvaror.");
    expect(r.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/shop/products/frukost-buffe",
    );
    expect(r.canonicalPath).toBe("/shop/products/frukost-buffe");
    expect(r.noindex).toBe(false);

    // OG uses the first image from the adapter hook.
    expect(r.openGraph.image).toEqual({
      url: "https://cdn.example/product.jpg",
      width: 1200,
      height: 630,
      alt: "Product",
    });

    // JSON-LD: Product + BreadcrumbList.
    expect(r.structuredData).toHaveLength(2);
    expect(r.structuredData[0]["@type"]).toBe("Product");
    expect(r.structuredData[1]["@type"]).toBe("BreadcrumbList");
  });

  it("zero-price product: resolve succeeds, title/description retained, no Product JSON-LD", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "product",
      entity: makeProduct({
        price: 0,
        variants: [makeProductVariant({ price: 0 })],
      }),
      locale: "sv",
    });

    expect(r.title).toBe("Frukost-buffé | Apelviken");
    expect(r.description).toBe("Lokala råvaror.");
    // No Product schema, BreadcrumbList remains.
    const types = r.structuredData.map((o) => o["@type"]);
    expect(types).not.toContain("Product");
    expect(types).toContain("BreadcrumbList");
  });
});

// ──────────────────────────────────────────────────────────────
// ProductCollection integration (M5 Batch A.2)
// ──────────────────────────────────────────────────────────────

function makeCollectionItem(
  productOverrides: Partial<Product> = {},
  joinOverrides: Partial<ProductCollectionItem> = {},
  media: ProductMedia[] = [],
): ProductCollectionItemWithProduct {
  const base: Product = {
    id: "prod_m1",
    tenantId: "tenant_t",
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
    tenantId: "tenant_t",
    title: "Mat & Dryck",
    description: "Våra bästa erbjudanden.",
    slug: "mat-och-dryck",
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

describe("SeoResolver.resolve — ProductCollection (integration, M5 Batch A.2)", () => {
  beforeEach(() => {
    _clearSeoAdaptersForTests();
    registerSeoAdapter(productCollectionSeoAdapter);
  });

  it("end-to-end: title / description / canonical / OG / JSON-LD", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const entity = makeCollection({
      items: [
        makeCollectionItem(
          { id: "pm1", slug: "one", title: "One" },
          { sortOrder: 0 },
        ),
        makeCollectionItem(
          { id: "pm2", slug: "two", title: "Two" },
          { sortOrder: 1 },
        ),
      ],
    });

    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "product_collection",
      entity,
      locale: "sv",
    });

    expect(r.title).toBe("Mat & Dryck | Apelviken");
    expect(r.description).toBe("Våra bästa erbjudanden.");
    expect(r.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/shop/collections/mat-och-dryck",
    );
    expect(r.canonicalPath).toBe("/shop/collections/mat-och-dryck");
    expect(r.noindex).toBe(false);

    // OG pulled from imageUrl via the adapter hook.
    expect(r.openGraph.image?.url).toBe(
      "https://cdn.example/collection.jpg",
    );

    // JSON-LD: CollectionPage + ItemList + BreadcrumbList
    const types = r.structuredData.map((o) => o["@type"]);
    expect(types).toEqual(["CollectionPage", "ItemList", "BreadcrumbList"]);
  });

  it("empty collection: resolve succeeds, CollectionPage present, no ItemList", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "product_collection",
      entity: makeCollection({ items: [] }),
      locale: "sv",
    });

    // resolve succeeds end-to-end.
    expect(r.title).toBe("Mat & Dryck | Apelviken");

    const types = r.structuredData.map((o) => o["@type"]);
    expect(types).toContain("CollectionPage");
    expect(types).toContain("BreadcrumbList");
    // Empty collection must not emit ItemList (empty ItemList fails
    // Rich Results validation).
    expect(types).not.toContain("ItemList");
  });
});

// ──────────────────────────────────────────────────────────────
// Accommodation index integration (M5 Batch B.1)
// ──────────────────────────────────────────────────────────────

function makeAccommodationIndexInput(
  overrides: Partial<AccommodationIndexSeoInput> = {},
): AccommodationIndexSeoInput {
  return {
    tenantId: "tenant_t",
    activeLocales: ["sv", "en", "de"],
    featuredAccommodations: [],
    ...overrides,
  };
}

describe("SeoResolver.resolve — AccommodationIndex (integration, M5 Batch B.1)", () => {
  beforeEach(() => {
    _clearSeoAdaptersForTests();
    registerSeoAdapter(accommodationIndexSeoAdapter);
  });

  it("end-to-end: title 'Boenden | {siteName}', canonical /stays, JSON-LD shape", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "accommodation_index",
      entity: makeAccommodationIndexInput({
        featuredAccommodations: [makeAccommodation()],
      }),
      locale: "sv",
    });

    expect(r.title).toBe("Boenden | Apelviken");
    expect(r.canonicalUrl).toBe("https://apelviken-x.rutgr.com/stays");
    expect(r.canonicalPath).toBe("/stays");
    expect(r.noindex).toBe(false);

    const types = r.structuredData.map((o) => o["@type"]);
    expect(types).toEqual(["CollectionPage", "ItemList", "BreadcrumbList"]);
  });

  it("canonical stays /stays even on page 5 (no query, no pagination in canonical)", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "accommodation_index",
      entity: makeAccommodationIndexInput(),
      locale: "sv",
      pagination: { page: 5, totalPages: 10 },
    });

    expect(r.canonicalPath).toBe("/stays");
    expect(r.canonicalUrl).toBe("https://apelviken-x.rutgr.com/stays");
    // Pagination DOES suffix the title (resolver behavior).
    expect(r.title).toBe("Boenden | Apelviken – Page 5");
  });

  it("hreflang alternates all point to /stays (never /stays?page=N)", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "accommodation_index",
      entity: makeAccommodationIndexInput(),
      locale: "sv",
      pagination: { page: 3, totalPages: 10 },
    });
    for (const entry of r.hreflang) {
      expect(entry.url).not.toContain("?");
      expect(entry.url).not.toMatch(/page/i);
    }
    // Entries cover sv + en + de + x-default.
    expect(r.hreflang.map((h) => h.code)).toEqual([
      "sv",
      "en",
      "de",
      "x-default",
    ]);
  });

  it("empty featured list: resolve succeeds, CollectionPage + BreadcrumbList remain, no ItemList", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "accommodation_index",
      entity: makeAccommodationIndexInput({ featuredAccommodations: [] }),
      locale: "sv",
    });
    const types = r.structuredData.map((o) => o["@type"]);
    expect(types).toContain("CollectionPage");
    expect(types).toContain("BreadcrumbList");
    expect(types).not.toContain("ItemList");
  });
});

// ──────────────────────────────────────────────────────────────
// Accommodation category integration (M5 Batch B.2)
// ──────────────────────────────────────────────────────────────

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
    categoryId: "cat_1",
    accommodationId: accommodation.id,
    sortOrder: 0,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    ...joinOverrides,
  };
  return { ...join, accommodation };
}

function makeCategory(
  overrides: Partial<AccommodationCategoryWithItems> = {},
): AccommodationCategoryWithItems {
  const base: AccommodationCategory = {
    id: "cat_1",
    tenantId: "tenant_t",
    title: "Stugor",
    description: "Våra hemtrevliga stugor",
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

describe("SeoResolver.resolve — AccommodationCategory (integration, M5 Batch B.2)", () => {
  beforeEach(() => {
    _clearSeoAdaptersForTests();
    registerSeoAdapter(accommodationCategorySeoAdapter);
  });

  it("happy path: CollectionPage + ItemList + BreadcrumbList (3 level)", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const entity = makeCategory({
      items: [
        makeCategoryItem({ id: "a1", slug: "a1", name: "A1" }, { sortOrder: 0 }),
        makeCategoryItem({ id: "a2", slug: "a2", name: "A2" }, { sortOrder: 1 }),
      ],
    });
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "accommodation_category",
      entity,
      locale: "sv",
    });

    expect(r.title).toBe("Stugor | Apelviken");
    expect(r.description).toBe("Våra hemtrevliga stugor");
    expect(r.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/stays/categories/stugor",
    );
    expect(r.noindex).toBe(false);

    const types = r.structuredData.map((o) => o["@type"]);
    expect(types).toEqual(["CollectionPage", "ItemList", "BreadcrumbList"]);

    // Breadcrumb is 3 levels exactly (Hem → Boenden → Stugor).
    const crumb = r.structuredData.find(
      (o) => o["@type"] === "BreadcrumbList",
    );
    expect((crumb?.itemListElement as unknown[]).length).toBe(3);
  });

  it("empty category: resolveSeo succeeds, robots: noindex, NO JSON-LD", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "accommodation_category",
      entity: makeCategory({ items: [] }),
      locale: "sv",
    });

    // Resolve succeeds.
    expect(r.title).toBe("Stugor | Apelviken");
    // Empty category is noindex (thin content guard).
    expect(r.noindex).toBe(true);
    // No JSON-LD (adapter short-circuits).
    expect(r.structuredData).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────
// Search integration (M5 Batch B.3)
// ──────────────────────────────────────────────────────────────

function makeSearchInput(
  overrides: Partial<SearchSeoInput> = {},
): SearchSeoInput {
  return {
    tenantId: "tenant_t",
    activeLocales: ["sv", "en", "de"],
    ...overrides,
  };
}

describe("SeoResolver.resolve — Search (integration, M5 Batch B.3)", () => {
  beforeEach(() => {
    _clearSeoAdaptersForTests();
    registerSeoAdapter(searchSeoAdapter);
  });

  it("always emits robots: noindex, never JSON-LD (no query)", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "search",
      entity: makeSearchInput(),
      locale: "sv",
    });

    expect(r.noindex).toBe(true);
    expect(r.structuredData).toEqual([]);
    // Default title falls through tenant template: "Sök | {siteName}".
    expect(r.title).toBe("Sök | Apelviken");
  });

  it("resolver's searchQuery branch overrides the title, noindex remains true", async () => {
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "search",
      entity: makeSearchInput(),
      locale: "sv",
      searchQuery: "stuga",
    });

    // Resolver's existing branch: 'Search results for "stuga" | Apelviken'.
    expect(r.title).toBe('Search results for "stuga" | Apelviken');
    expect(r.noindex).toBe(true);
    expect(r.structuredData).toEqual([]);
  });

  it("canonical on /search is still constructed (even though noindex)", async () => {
    // A noindex page still has a canonical; Google uses canonical to
    // consolidate signals regardless of indexability.
    const resolver = new SeoResolver(fakeImgService(), fakeRepo());
    const r = await resolver.resolve({
      tenant: makeTenant(),
      resourceType: "search",
      entity: makeSearchInput(),
      locale: "sv",
    });
    expect(r.canonicalUrl).toBe("https://apelviken-x.rutgr.com/search");
    expect(r.canonicalPath).toBe("/search");
  });
});
