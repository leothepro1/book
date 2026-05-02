import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/prisma", () => ({
  prisma: {
    accommodation: { findFirst: vi.fn() },
    accommodationCategory: { findFirst: vi.fn() },
    product: { findFirst: vi.fn() },
    productCollection: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    tenantLocale: { findMany: vi.fn() },
    pageTypeSeoDefault: { findUnique: vi.fn() },
    mediaAsset: { findFirst: vi.fn() },
  },
}));

vi.mock("../logger", () => ({ log: vi.fn() }));

import type {
  Accommodation,
  AccommodationCategory,
  Product,
  ProductCollection,
  Tenant,
  TenantLocale,
} from "@prisma/client";

import { prisma } from "../db/prisma";

import {
  _clearSeoAdaptersForTests,
} from "./adapters/base";
import { _resetSeoBootstrapForTests } from "./bootstrap";
import {
  getAccommodationForSeo,
  getCategoryForSeo,
  getCollectionForSeo,
  getProductForSeo,
  resolveSeoForRequest,
} from "./request-cache";

// ── Fixtures ──────────────────────────────────────────────────

type FindFirstAccommodation = typeof prisma.accommodation.findFirst;
type FindFirstCategory = typeof prisma.accommodationCategory.findFirst;
type FindFirstProduct = typeof prisma.product.findFirst;
type FindFirstCollection = typeof prisma.productCollection.findFirst;
type FindUniqueTenant = typeof prisma.tenant.findUnique;
type FindManyLocale = typeof prisma.tenantLocale.findMany;
type FindUniquePtd = typeof prisma.pageTypeSeoDefault.findUnique;

function accommodationRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
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
    description: "A cosy cabin",
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

function productRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "prod_1",
    tenantId: "tenant_t",
    title: "Frukost-buffé",
    slug: "frukost-buffe",
    description: "Morgonens vackraste ritual.",
    status: "ACTIVE",
    productType: "STANDARD",
    archivedAt: null,
    price: 14900,
    currency: "SEK",
    compareAtPrice: null,
    taxable: true,
    trackInventory: false,
    inventoryQuantity: 0,
    continueSellingWhenOutOfStock: false,
    version: 1,
    sortOrder: 0,
    templateId: null,
    seo: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    media: [],
    variants: [],
    ...overrides,
  };
}

function collectionRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "col_1",
    tenantId: "tenant_t",
    title: "Mat & Dryck",
    slug: "mat-och-dryck",
    description: "Kvällar med vin.",
    imageUrl: null,
    status: "ACTIVE",
    version: 1,
    sortOrder: 0,
    seo: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    items: [],
    ...overrides,
  };
}

function categoryRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "cat_1",
    tenantId: "tenant_t",
    title: "Stugor",
    slug: "stugor",
    description: "Fristående boenden.",
    imageUrl: null,
    status: "ACTIVE",
    visibleInSearch: true,
    sortOrder: 0,
    seo: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    items: [],
    ...overrides,
  };
}

function tenantRow(): Tenant {
  return {
    id: "tenant_t",
    clerkOrgId: "org_1",
    name: "Apelviken",
    slug: "apelviken",
    portalSlug: "apelviken-x",
    ownerClerkUserId: null,
    settings: null,
    seoDefaults: null,
    draftSettings: null,
    draftUpdatedAt: null,
    draftUpdatedBy: null,
    settingsVersion: 0,
    previousSettings: null,
    legalName: null,
    businessType: null,
    nickname: null,
    phone: null,
    addressStreet: null,
    addressPostalCode: null,
    addressCity: null,
    addressCountry: null,
    organizationNumber: null,
    vatNumber: null,
    emailFrom: null,
    emailFromName: null,
    pendingEmailFrom: null,
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    emailVerificationSentTo: null,
    emailLogoUrl: null,
    emailLogoWidth: null,
    emailAccentColor: null,
    orderNumberPrefix: "",
    orderNumberSuffix: "",
    checkinEnabled: false,
    checkoutEnabled: false,
    earlyCheckinEnabled: false,
    earlyCheckinDays: 0,
    screenshotDesktopUrl: null,
    screenshotMobileUrl: null,
    screenshotHash: null,
    screenshotUpdatedAt: null,
    screenshotPending: false,
    stripeAccountId: null,
    stripeOnboardingComplete: false,
    stripeLivemode: false,
    stripeConnectedAt: null,
    paymentMethodConfig: null,
    subscriptionPlan: "BASIC",
    platformFeeBps: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    discountsEnabled: true,
    showLoginLinks: true,
    environment: "production",
  };
}

function localeRow(
  locale: string,
  overrides: Partial<TenantLocale> = {},
): TenantLocale {
  return {
    id: `loc_${locale}`,
    tenantId: "tenant_t",
    locale,
    published: true,
    primary: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Common setup ─────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation).mockReset();
  vi.mocked(prisma.accommodationCategory.findFirst as FindFirstCategory).mockReset();
  vi.mocked(prisma.product.findFirst as FindFirstProduct).mockReset();
  vi.mocked(prisma.productCollection.findFirst as FindFirstCollection).mockReset();
  vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockReset();
  vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockReset();
  vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd).mockReset();
  _clearSeoAdaptersForTests();
  _resetSeoBootstrapForTests();
});

// ── getAccommodationForSeo ────────────────────────────────────

describe("getAccommodationForSeo", () => {
  it("queries by slug with tenant scope, archivedAt null, status ACTIVE", async () => {
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValueOnce(accommodationRow() as unknown as Accommodation);

    await getAccommodationForSeo("tenant_t", "stuga-bjork-unique-1");

    expect(prisma.accommodation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant_t",
          slug: "stuga-bjork-unique-1",
          archivedAt: null,
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("falls back to externalId lookup when slug lookup misses", async () => {
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(accommodationRow() as unknown as Accommodation);

    const result = await getAccommodationForSeo("tenant_t", "ext-1234");

    expect(prisma.accommodation.findFirst).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
    const secondCall = vi.mocked(prisma.accommodation.findFirst).mock.calls[1][0];
    expect(secondCall).toMatchObject({
      where: { tenantId: "tenant_t", externalId: "ext-1234" },
    });
  });

  it("returns null when neither slug nor externalId matches", async () => {
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const r = await getAccommodationForSeo("tenant_t", "nobody-unique-2");
    expect(r).toBeNull();
  });

  it("repeat calls for the same (tenantId, slug) return structurally identical results", async () => {
    // Note on dedup: React's `cache()` only memoizes within an active
    // server render context (AsyncLocalStorage-backed). Outside of that
    // — e.g., in plain vitest calls — each call re-invokes the wrapped
    // function. We therefore test behavioural correctness here and rely
    // on the manual verification checklist ("one SQL query per request
    // in the server logs") to confirm real-render dedup.
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(accommodationRow() as unknown as Accommodation);

    const a = await getAccommodationForSeo("tenant_t", "dedup-corr-1");
    const b = await getAccommodationForSeo("tenant_t", "dedup-corr-1");
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });
});

// ── getProductForSeo ─────────────────────────────────────────

describe("getProductForSeo", () => {
  it("queries by slug with tenant scope, ACTIVE, non-archived, STANDARD", async () => {
    vi.mocked(prisma.product.findFirst as FindFirstProduct).mockResolvedValue(
      productRow() as unknown as Product,
    );

    await getProductForSeo("tenant_t", "frukost-buffe-q-1");

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant_t",
          slug: "frukost-buffe-q-1",
          status: "ACTIVE",
          archivedAt: null,
          productType: "STANDARD",
        }),
        include: expect.objectContaining({
          media: expect.any(Object),
          variants: expect.any(Object),
        }),
      }),
    );
  });

  it("returns the raw Prisma row with media + variants relations (NOT ResolvedProduct)", async () => {
    const row = productRow({
      media: [
        {
          id: "med_1",
          productId: "prod_1",
          url: "https://example.com/a.jpg",
          type: "image",
          alt: "",
          filename: "a.jpg",
          width: null,
          height: null,
          sortOrder: 0,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      variants: [],
    });
    vi.mocked(prisma.product.findFirst as FindFirstProduct).mockResolvedValue(
      row as unknown as Product,
    );

    const result = await getProductForSeo("tenant_t", "with-media");

    expect(result).not.toBeNull();
    // The raw Prisma shape must carry `media` + `variants` directly
    // — the SEO adapter consumes these fields.
    expect(Array.isArray(result?.media)).toBe(true);
    expect(Array.isArray(result?.variants)).toBe(true);
    expect(result?.media).toHaveLength(1);
  });

  it("returns null when the product does not exist", async () => {
    vi.mocked(prisma.product.findFirst as FindFirstProduct).mockResolvedValue(
      null,
    );

    const r = await getProductForSeo("tenant_t", "no-such-product");
    expect(r).toBeNull();
  });

  it("returns the row for indexable products even when seo.noindex is set (adapter filters)", async () => {
    // The fetcher's job is to load the row; whether it is indexed is
    // the adapter's `isIndexable` concern. A row with
    // `seo: { noindex: true }` still comes through here — the
    // resolver will see noindex=true downstream and emit the
    // appropriate robots meta.
    const row = productRow({ seo: { noindex: true } });
    vi.mocked(prisma.product.findFirst as FindFirstProduct).mockResolvedValue(
      row as unknown as Product,
    );

    const result = await getProductForSeo("tenant_t", "noindex-override");
    expect(result).not.toBeNull();
    expect((result as unknown as { seo: { noindex: boolean } }).seo.noindex).toBe(true);
  });
});

// ── getCollectionForSeo ──────────────────────────────────────

describe("getCollectionForSeo", () => {
  it("queries by slug with tenant scope + status ACTIVE", async () => {
    vi.mocked(prisma.productCollection.findFirst as FindFirstCollection)
      .mockResolvedValue(collectionRow() as unknown as ProductCollection);

    await getCollectionForSeo("tenant_t", "mat-och-dryck-q-1");

    expect(prisma.productCollection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant_t",
          slug: "mat-och-dryck-q-1",
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("uses collectionSeoInclude — members pre-filtered at DB layer (ACTIVE STANDARD, cap 20)", async () => {
    vi.mocked(prisma.productCollection.findFirst as FindFirstCollection)
      .mockResolvedValue(collectionRow() as unknown as ProductCollection);

    await getCollectionForSeo("tenant_t", "checks-include-shape");

    const call = vi.mocked(prisma.productCollection.findFirst).mock.calls[0][0];
    // Assert the `include.items` shape matches collectionSeoInclude's
    // contract — ACTIVE STANDARD products only, ordered by sortOrder
    // asc, capped at 20. These invariants are what keeps the SEO
    // ItemList bounded and correct.
    expect(call).toMatchObject({
      include: {
        items: {
          where: {
            product: {
              tenantId: "tenant_t",
              status: "ACTIVE",
              productType: "STANDARD",
              archivedAt: null,
            },
          },
          orderBy: { sortOrder: "asc" },
          take: 20,
        },
      },
    });
  });

  it("returns null when the collection does not exist", async () => {
    vi.mocked(prisma.productCollection.findFirst as FindFirstCollection)
      .mockResolvedValue(null);

    const r = await getCollectionForSeo("tenant_t", "no-such-collection");
    expect(r).toBeNull();
  });

  it("returns the row for an empty (zero-member) collection — adapter keeps it indexable", async () => {
    // Empty collections stay indexable per the
    // productCollectionSeoAdapter contract: an empty-today-
    // populated-tomorrow collection must not be delisted by search.
    // The fetcher returns the row unchanged; ItemList emission is
    // the adapter's concern.
    const row = collectionRow({ items: [] });
    vi.mocked(prisma.productCollection.findFirst as FindFirstCollection)
      .mockResolvedValue(row as unknown as ProductCollection);

    const result = await getCollectionForSeo("tenant_t", "empty-collection");
    expect(result).not.toBeNull();
    expect((result as unknown as { items: unknown[] }).items).toHaveLength(0);
  });
});

// ── getCategoryForSeo ────────────────────────────────────────

describe("getCategoryForSeo", () => {
  it("queries by slug with tenant scope + status ACTIVE", async () => {
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstCategory)
      .mockResolvedValue(categoryRow() as unknown as AccommodationCategory);

    await getCategoryForSeo("tenant_t", "stugor-q-1");

    expect(prisma.accommodationCategory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant_t",
          slug: "stugor-q-1",
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("uses categorySeoInclude — accommodations pre-filtered at DB layer (ACTIVE, non-archived, cap 20)", async () => {
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstCategory)
      .mockResolvedValue(categoryRow() as unknown as AccommodationCategory);

    await getCategoryForSeo("tenant_t", "checks-include-shape");

    const call = vi.mocked(prisma.accommodationCategory.findFirst).mock.calls[0][0];
    expect(call).toMatchObject({
      include: {
        items: {
          where: {
            accommodation: {
              tenantId: "tenant_t",
              status: "ACTIVE",
              archivedAt: null,
            },
          },
          orderBy: { sortOrder: "asc" },
          take: 20,
        },
      },
    });
  });

  it("returns null when the category does not exist", async () => {
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstCategory)
      .mockResolvedValue(null);

    const r = await getCategoryForSeo("tenant_t", "no-such-category");
    expect(r).toBeNull();
  });

  it("returns the row for an empty category — adapter flips to noindex via isIndexable", async () => {
    // Empty categories are noindex per the
    // accommodationCategorySeoAdapter contract (thin content). The
    // fetcher still returns the row; the adapter's isIndexable → false
    // drives the resolver's robots-meta decision.
    const row = categoryRow({ items: [] });
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstCategory)
      .mockResolvedValue(row as unknown as AccommodationCategory);

    const result = await getCategoryForSeo("tenant_t", "empty-category");
    expect(result).not.toBeNull();
    expect((result as unknown as { items: unknown[] }).items).toHaveLength(0);
  });
});

// ── resolveSeoForRequest ─────────────────────────────────────

describe("resolveSeoForRequest", () => {
  it("returns null when tenant does not exist", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      null,
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [],
    );
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValueOnce(accommodationRow() as unknown as Accommodation);

    const r = await resolveSeoForRequest(
      "ghost-tenant",
      "anything",
      "sv",
      "accommodation",
    );
    expect(r).toBeNull();
  });

  it("returns null when accommodation does not exist", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(null);
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "no-such-slug",
      "sv",
      "accommodation",
    );
    expect(r).toBeNull();
  });

  it("resolves accommodation SEO end-to-end with full tenant + locale data", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true }), localeRow("en")],
    );
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(accommodationRow() as unknown as Accommodation);
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "stuga-bjork-e2e",
      "sv",
      "accommodation",
    );
    expect(r).not.toBeNull();
    expect(r?.title).toContain("Stuga Björk");
    expect(r?.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/stays/stuga-bjork",
    );
    // Two locales + x-default
    expect(r?.hreflang).toHaveLength(3);
  });

  it("repeat end-to-end calls return structurally identical ResolvedSeo", async () => {
    // See dedup note on `getAccommodationForSeo` above. The React
    // cache() guarantee applies only inside a real render; here we
    // assert that the pipeline is deterministic for the same inputs.
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(accommodationRow() as unknown as Accommodation);
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const a = await resolveSeoForRequest(
      "tenant_t",
      "dedup-rfr",
      "sv",
      "accommodation",
    );
    const b = await resolveSeoForRequest(
      "tenant_t",
      "dedup-rfr",
      "sv",
      "accommodation",
    );
    expect(a).toEqual(b);
  });

  it("throws for resource types not yet wired (future-milestone stub)", async () => {
    // `article` is in SeoResourceTypes but has no adapter + no
    // request-cache wiring yet. The guard surfaces that as a
    // programmer-error path, never a runtime 500 for merchant content.
    await expect(
      resolveSeoForRequest("tenant_t", "x", "sv", "article"),
    ).rejects.toThrow(/not wired in request-cache/);
  });

  // ── M5: homepage resourceType ──────────────────────────────

  it("resolves homepage SEO without a slug", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "",
      "sv",
      "homepage",
    );

    expect(r).not.toBeNull();
    // Title === siteName (no duplication via titleTemplate).
    expect(r?.title).toBe("Apelviken");
    expect(r?.canonicalUrl).toBe("https://apelviken-x.rutgr.com/");
    // Accommodation.findFirst must NOT have been called — homepage
    // path has no per-entity fetch.
    expect(prisma.accommodation.findFirst).not.toHaveBeenCalled();
  });

  it("homepage resolution returns null when tenant doesn't exist", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      null,
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [],
    );

    const r = await resolveSeoForRequest(
      "ghost-tenant",
      "",
      "sv",
      "homepage",
    );
    expect(r).toBeNull();
  });

  // ── M5-followup: product resourceType ─────────────────────

  it("resolves product SEO end-to-end with tenant + product row", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.product.findFirst as FindFirstProduct).mockResolvedValue(
      productRow() as unknown as Product,
    );
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "frukost-buffe-e2e",
      "sv",
      "product",
    );

    expect(r).not.toBeNull();
    expect(r?.title).toContain("Frukost-buffé");
    expect(r?.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/shop/products/frukost-buffe",
    );
  });

  it("returns null when product does not exist", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.product.findFirst as FindFirstProduct).mockResolvedValue(
      null,
    );

    const r = await resolveSeoForRequest(
      "tenant_t",
      "no-such-product",
      "sv",
      "product",
    );
    expect(r).toBeNull();
  });

  // ── M5-followup: product_collection resourceType ──────────

  it("resolves product_collection SEO end-to-end with tenant + collection row", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.productCollection.findFirst as FindFirstCollection)
      .mockResolvedValue(collectionRow() as unknown as ProductCollection);
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "mat-och-dryck-e2e",
      "sv",
      "product_collection",
    );

    expect(r).not.toBeNull();
    expect(r?.title).toContain("Mat & Dryck");
    expect(r?.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/shop/collections/mat-och-dryck",
    );
  });

  it("returns null when collection does not exist", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.productCollection.findFirst as FindFirstCollection)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "no-such-collection",
      "sv",
      "product_collection",
    );
    expect(r).toBeNull();
  });

  // ── M5-followup: accommodation_category resourceType ──────

  it("resolves accommodation_category SEO end-to-end with tenant + category row", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    // Non-empty items so the category is indexable (empty categories
    // emit noindex). The exact item shape isn't asserted here — the
    // resolver only needs `items.length > 0` for the indexable gate.
    const categoryWithItems = categoryRow({
      items: [
        {
          id: "it_1",
          categoryId: "cat_1",
          accommodationId: "acc_1",
          sortOrder: 0,
          accommodation: accommodationRow(),
        },
      ],
    });
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstCategory)
      .mockResolvedValue(categoryWithItems as unknown as AccommodationCategory);
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "stugor-e2e",
      "sv",
      "accommodation_category",
    );

    expect(r).not.toBeNull();
    expect(r?.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/stays/categories/stugor",
    );
  });

  it("returns null when accommodation_category does not exist", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstCategory)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "no-such-category",
      "sv",
      "accommodation_category",
    );
    expect(r).toBeNull();
  });

  // ── M5-followup: search resourceType ──────────────────────

  it("resolves search SEO with no entity fetch and always emits noindex", async () => {
    // Search has no Prisma entity — fetchAndResolveSearch synthesizes
    // SearchSeoInput from the tenant context. The adapter's
    // isIndexable is always false, so the resolver emits
    // noindex=true regardless of merchant-level config.
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "",
      "sv",
      "search",
    );

    expect(r).not.toBeNull();
    expect(r?.noindex).toBe(true);
    expect(r?.canonicalUrl).toBe("https://apelviken-x.rutgr.com/search");
    // No per-entity fetcher should have been invoked for search.
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
    expect(prisma.productCollection.findFirst).not.toHaveBeenCalled();
    expect(prisma.accommodationCategory.findFirst).not.toHaveBeenCalled();
  });

  it("search resolution returns null when tenant doesn't exist", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      null,
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [],
    );

    const r = await resolveSeoForRequest(
      "ghost-tenant",
      "",
      "sv",
      "search",
    );
    expect(r).toBeNull();
  });
});
