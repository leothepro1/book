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
  MediaAsset,
  Product,
  ProductCollection,
  Tenant,
  TenantLocale,
} from "@prisma/client";

import { prisma } from "../db/prisma";

import { _clearSeoAdaptersForTests } from "./adapters/base";
import { _resetSeoBootstrapForTests } from "./bootstrap";
import { previewSeoForEntity } from "./preview";

// ── Fixtures ──────────────────────────────────────────────────

type FindFirstAccommodation = typeof prisma.accommodation.findFirst;
type FindFirstCategory = typeof prisma.accommodationCategory.findFirst;
type FindFirstProduct = typeof prisma.product.findFirst;
type FindFirstCollection = typeof prisma.productCollection.findFirst;
type FindUniqueTenant = typeof prisma.tenant.findUnique;
type FindManyLocale = typeof prisma.tenantLocale.findMany;
type FindUniquePtd = typeof prisma.pageTypeSeoDefault.findUnique;
type FindFirstMediaAsset = typeof prisma.mediaAsset.findFirst;

function tenantRow(overrides: Partial<Tenant> = {}): Tenant {
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
    ...overrides,
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

// ── Common setup ─────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation).mockReset();
  vi.mocked(prisma.accommodationCategory.findFirst as FindFirstCategory).mockReset();
  vi.mocked(prisma.product.findFirst as FindFirstProduct).mockReset();
  vi.mocked(prisma.productCollection.findFirst as FindFirstCollection).mockReset();
  vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockReset();
  vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockReset();
  vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd).mockReset();
  vi.mocked(prisma.mediaAsset.findFirst as FindFirstMediaAsset).mockReset();
  _clearSeoAdaptersForTests();
  _resetSeoBootstrapForTests();
});

function primeTenant(): void {
  vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
    tenantRow(),
  );
  vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue([
    localeRow("sv", { primary: true }),
  ]);
  vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd).mockResolvedValue(
    null,
  );
  vi.mocked(prisma.mediaAsset.findFirst as FindFirstMediaAsset).mockResolvedValue(
    null,
  );
}

// ── Supported resource types — happy path ────────────────────

describe("previewSeoForEntity — happy path per supported resource type", () => {
  it("resolves homepage preview from tenant defaults + overrides (no entity fetch)", async () => {
    primeTenant();

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "homepage",
      entityId: "tenant_t",
      overrides: { title: "Välkommen hem" },
      locale: "sv",
    });

    expect(result.title).toBe("Välkommen hem");
    expect(result.canonicalUrl).toBe("https://apelviken-x.rutgr.com/");
    expect(result.displayUrl).toBe("apelviken-x.rutgr.com");
    // No entity fetch for homepage.
    expect(prisma.accommodation.findFirst).not.toHaveBeenCalled();
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it("resolves accommodation preview via the SEO resolver", async () => {
    primeTenant();
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(accommodationRow() as unknown as Accommodation);

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "accommodation",
      entityId: "acc_1",
      overrides: {},
      locale: "sv",
    });

    expect(result.title).toContain("Stuga Björk");
    expect(result.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/stays/stuga-bjork",
    );
    expect(result.displayUrl).toBe(
      "apelviken-x.rutgr.com › stays › stuga-bjork",
    );
  });

  it("resolves accommodation_category preview via the SEO resolver", async () => {
    primeTenant();
    vi.mocked(prisma.accommodationCategory.findFirst as FindFirstCategory)
      .mockResolvedValueOnce(null) // id lookup via getCategoryForSeo
      .mockResolvedValueOnce(
        categoryRow({
          items: [
            {
              id: "it_1",
              categoryId: "cat_1",
              accommodationId: "acc_1",
              sortOrder: 0,
              accommodation: accommodationRow(),
            },
          ],
        }) as unknown as AccommodationCategory,
      );

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "accommodation_category",
      entityId: "cat_1",
      overrides: {},
      locale: "sv",
    });

    expect(result.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/stays/categories/stugor",
    );
  });

  it("resolves product preview via the SEO resolver", async () => {
    primeTenant();
    vi.mocked(prisma.product.findFirst as FindFirstProduct)
      .mockResolvedValueOnce(null) // slug miss via getProductForSeo
      .mockResolvedValueOnce(productRow() as unknown as Product);

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "product",
      entityId: "prod_1",
      overrides: {},
      locale: "sv",
    });

    expect(result.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/shop/products/frukost-buffe",
    );
  });

  it("resolves product_collection preview via the SEO resolver", async () => {
    primeTenant();
    vi.mocked(prisma.productCollection.findFirst as FindFirstCollection)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(collectionRow() as unknown as ProductCollection);

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "product_collection",
      entityId: "col_1",
      overrides: {},
      locale: "sv",
    });

    expect(result.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/shop/collections/mat-och-dryck",
    );
  });
});

// ── Override merge semantics ─────────────────────────────────

describe("previewSeoForEntity — override merge semantics", () => {
  it("override.title wins over entity.seo.title; untouched fields preserved", async () => {
    primeTenant();
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(
        accommodationRow({
          seo: {
            title: "Original titel",
            description: "Original beskrivning",
          },
        }) as unknown as Accommodation,
      );

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "accommodation",
      entityId: "acc_1",
      overrides: { title: "Ny titel" },
      locale: "sv",
    });

    // Override won for title.
    expect(result.title).toBe("Ny titel");
    // Description preserved from stored entity.seo — not clobbered.
    expect(result.description).toBe("Original beskrivning");
  });

  it("empty-string override clears the field (merchant typed then deleted)", async () => {
    primeTenant();
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(
        accommodationRow({
          seo: { title: "Original titel" },
        }) as unknown as Accommodation,
      );

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "accommodation",
      entityId: "acc_1",
      overrides: { title: "" },
      locale: "sv",
    });

    // Empty override → resolver falls through its normal fallback
    // chain. For accommodation the chain lands on the entity name
    // as the synthesized title.
    expect(result.title).toContain("Stuga Björk");
  });
});

// ── Unsupported resource types ───────────────────────────────

describe("previewSeoForEntity — unsupported resource types", () => {
  it("throws a descriptive error for accommodation_index (deferred)", async () => {
    await expect(
      previewSeoForEntity({
        tenantId: "tenant_t",
        resourceType: "accommodation_index",
        entityId: "tenant_t",
        overrides: {},
        locale: "sv",
      }),
    ).rejects.toThrow(/does not support resourceType accommodation_index/);
  });

  it("throws a descriptive error for search (always noindex)", async () => {
    await expect(
      previewSeoForEntity({
        tenantId: "tenant_t",
        resourceType: "search",
        entityId: "tenant_t",
        overrides: {},
        locale: "sv",
      }),
    ).rejects.toThrow(/does not support resourceType search/);
  });
});

// ── Missing entity fallback ──────────────────────────────────

describe("previewSeoForEntity — missing entity", () => {
  it("returns a tenant-defaults-based preview when the entity cannot be fetched", async () => {
    primeTenant();
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(null);

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "accommodation",
      entityId: "ghost-slug",
      overrides: { title: "Merchant-typed" },
      locale: "sv",
    });

    // Merchant override surfaces directly; URL uses the unresolved
    // slug so the breadcrumb still renders coherently.
    expect(result.title).toBe("Merchant-typed");
    expect(result.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/stays/ghost-slug",
    );
    expect(result.displayUrl).toBe(
      "apelviken-x.rutgr.com › stays › ghost-slug",
    );
  });
});

// ── displayUrl breadcrumb formatting ─────────────────────────

describe("previewSeoForEntity — displayUrl breadcrumb", () => {
  it("renders `host › segment › segment` for nested paths", async () => {
    primeTenant();
    vi.mocked(prisma.product.findFirst as FindFirstProduct)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(productRow() as unknown as Product);

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "product",
      entityId: "prod_1",
      overrides: {},
      locale: "sv",
    });

    expect(result.displayUrl).toBe(
      "apelviken-x.rutgr.com › shop › products › frukost-buffe",
    );
  });

  it("collapses a bare domain to the host (no trailing separator)", async () => {
    primeTenant();

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "homepage",
      entityId: "tenant_t",
      overrides: {},
      locale: "sv",
    });

    expect(result.displayUrl).toBe("apelviken-x.rutgr.com");
  });
});

// ── Tenant isolation ─────────────────────────────────────────

describe("previewSeoForEntity — tenant isolation", () => {
  it("scopes every Prisma query by tenantId — never crosses tenants", async () => {
    primeTenant();
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(accommodationRow() as unknown as Accommodation);

    await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "accommodation",
      entityId: "acc_1",
      overrides: {},
      locale: "sv",
    });

    for (const call of vi.mocked(prisma.accommodation.findFirst).mock.calls) {
      const whereArg = (call[0] as { where?: { tenantId?: string } })?.where;
      expect(whereArg?.tenantId).toBe("tenant_t");
    }
  });
});

// ── Favicon resolution ───────────────────────────────────────

describe("previewSeoForEntity — favicon resolution", () => {
  it("returns null when tenant has no faviconId in seoDefaults", async () => {
    primeTenant();
    vi.mocked(prisma.product.findFirst as FindFirstProduct)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(productRow() as unknown as Product);

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "product",
      entityId: "prod_1",
      overrides: {},
      locale: "sv",
    });

    expect(result.faviconUrl).toBeNull();
  });

  it("resolves faviconId tenant-scoped to the MediaAsset URL", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow({
        seoDefaults: { faviconId: "media_favicon_1" } as Tenant["seoDefaults"],
      }),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue([
      localeRow("sv", { primary: true }),
    ]);
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd).mockResolvedValue(
      null,
    );
    vi.mocked(prisma.mediaAsset.findFirst as FindFirstMediaAsset).mockResolvedValue(
      {
        url: "https://cdn.example.com/favicon.png",
      } as unknown as MediaAsset,
    );
    vi.mocked(prisma.product.findFirst as FindFirstProduct)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(productRow() as unknown as Product);

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "product",
      entityId: "prod_1",
      overrides: {},
      locale: "sv",
    });

    expect(result.faviconUrl).toBe("https://cdn.example.com/favicon.png");

    // The MediaAsset lookup was tenant-scoped + id-scoped — never a
    // naked publicId lookup that could cross tenants.
    const mediaCall = vi.mocked(prisma.mediaAsset.findFirst).mock.calls[0][0];
    expect(mediaCall).toMatchObject({
      where: {
        id: "media_favicon_1",
        tenantId: "tenant_t",
        deletedAt: null,
      },
    });
  });
});

// ── /new-flow placeholder previews (entityId=null) ───────────
//
// These tests exercise the `M6.3-prep` widening. Each /new-capable
// resource type must render a preview URL using its Swedish
// placeholder slug, and must NOT trigger any entity fetch.

describe("previewSeoForEntity — entityId=null (/new flow)", () => {
  it("product: returns /shop/products/ny-produkt as the canonical slug", async () => {
    primeTenant();

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "product",
      entityId: null,
      overrides: { title: "Min nya produkt" },
      locale: "sv",
    });

    expect(result.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/shop/products/ny-produkt",
    );
    expect(result.displayUrl).toBe(
      "apelviken-x.rutgr.com › shop › products › ny-produkt",
    );
    // No entity fetch should have happened on the /new path.
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
    // Merchant-typed title surfaces on the preview without a resolver run.
    expect(result.title).toBe("Min nya produkt");
  });

  it("product_collection: returns /shop/collections/ny-produktserie", async () => {
    primeTenant();

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "product_collection",
      entityId: null,
      overrides: {},
      locale: "sv",
    });

    expect(result.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/shop/collections/ny-produktserie",
    );
    expect(prisma.productCollection.findFirst).not.toHaveBeenCalled();
  });

  it("accommodation: returns /stays/ny-boendetyp", async () => {
    primeTenant();

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "accommodation",
      entityId: null,
      overrides: {},
      locale: "sv",
    });

    expect(result.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/stays/ny-boendetyp",
    );
    expect(prisma.accommodation.findFirst).not.toHaveBeenCalled();
  });

  it("accommodation_category: returns /stays/categories/ny-boendekategori", async () => {
    primeTenant();

    const result = await previewSeoForEntity({
      tenantId: "tenant_t",
      resourceType: "accommodation_category",
      entityId: null,
      overrides: {},
      locale: "sv",
    });

    expect(result.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/stays/categories/ny-boendekategori",
    );
    expect(prisma.accommodationCategory.findFirst).not.toHaveBeenCalled();
  });

  it("throws for homepage — no /new flow (one homepage per tenant)", async () => {
    await expect(
      previewSeoForEntity({
        tenantId: "tenant_t",
        resourceType: "homepage",
        entityId: null,
        overrides: {},
        locale: "sv",
      }),
    ).rejects.toThrow(
      /does not support resourceType homepage with entityId=null/,
    );
  });

  it("throws for search — always-noindex resource, no placeholder in the map", async () => {
    // `search` already throws (not previewable), but the caller-
    // facing error when both unsupported AND entityId=null falls
    // through the /new gate — the existing isPreviewable check
    // wins. Assert the /new error surfaces only for the more
    // specific case and search keeps its existing message.
    await expect(
      previewSeoForEntity({
        tenantId: "tenant_t",
        resourceType: "search",
        entityId: null,
        overrides: {},
        locale: "sv",
      }),
    ).rejects.toThrow(/does not support resourceType search/);
  });
});
