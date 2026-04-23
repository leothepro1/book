/**
 * Tests for production-registry.ts.
 *
 * ── Guardrail tests ────────────────────────────────────────────
 * Assert the exact key set (SitemapResourceType) and that every
 * value is a callable. Behavior is covered in per-fetcher test
 * files; these tests catch wiring regressions only (a forgotten
 * fetcher, a typo'd key).
 *
 * ── End-to-end mocked scenarios ────────────────────────────────
 * Compose PRODUCTION_SHARD_REGISTRY with buildSitemapIndexForTenant
 * and drive the full stack with Prisma mocks. Proves aggregator +
 * fetchers + registry compose correctly. Exactly two scenarios:
 *   (1) Seeded tenant with realistic entities.
 *   (2) Empty tenant.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Accommodation,
  AccommodationCategory,
  Product,
  ProductCollection,
} from "@prisma/client";

// Mock prisma at the bottom of the stack so the real fetchers run.
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    accommodation: { findMany: vi.fn(), findFirst: vi.fn() },
    accommodationCategory: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    productCollection: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/app/_lib/db/prisma";

import { buildSitemapIndexForTenant } from "./aggregator";
import { PRODUCTION_SHARD_REGISTRY } from "./production-registry";
import {
  SITEMAP_RESOURCE_TYPES,
  type SitemapResourceType,
} from "./types";
import type { SeoTenantContext } from "../types";

// ── Prisma method aliases ───────────────────────────────────

type FindManyAccommodation = typeof prisma.accommodation.findMany;
type FindFirstAccommodation = typeof prisma.accommodation.findFirst;
type FindManyAccommodationCategory =
  typeof prisma.accommodationCategory.findMany;
type FindManyProduct = typeof prisma.product.findMany;
type FindManyProductCollection = typeof prisma.productCollection.findMany;

// ── Fixtures ────────────────────────────────────────────────

function makeTenant(
  overrides: Partial<SeoTenantContext> = {},
): SeoTenantContext {
  return {
    id: "tenant_e2e",
    siteName: "Apelviken",
    primaryDomain: "apelviken.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}" },
    activeLocales: ["sv", "en"],
    contentUpdatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

function accommodationRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "acc_1",
    tenantId: "tenant_e2e",
    name: "Stuga",
    slug: "stuga",
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
    description: "d",
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
    basePricePerNight: 100000,
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

function categoryRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "cat_1",
    tenantId: "tenant_e2e",
    title: "Stugor",
    description: "d",
    slug: "stugor",
    imageUrl: null,
    status: "ACTIVE",
    visibleInSearch: true,
    sortOrder: 0,
    pmsRef: null,
    version: 1,
    seo: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    items: [
      {
        id: "aci_1",
        categoryId: "cat_1",
        accommodationId: "acc_1",
        sortOrder: 0,
        createdAt: new Date("2026-02-01T00:00:00Z"),
        accommodation: accommodationRow(),
      },
    ],
    ...overrides,
  };
}

function productRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "prod_1",
    tenantId: "tenant_e2e",
    title: "Frukost",
    description: "d",
    slug: "frukost",
    status: "ACTIVE",
    productType: "STANDARD",
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
    media: [],
    variants: [],
    ...overrides,
  };
}

function collectionRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "coll_1",
    tenantId: "tenant_e2e",
    title: "Mat",
    description: "d",
    slug: "mat",
    imageUrl: null,
    status: "ACTIVE",
    sortOrder: 0,
    seo: null,
    version: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    items: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(prisma.accommodation.findMany as FindManyAccommodation).mockReset();
  vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation).mockReset();
  vi.mocked(
    prisma.accommodationCategory.findMany as FindManyAccommodationCategory,
  ).mockReset();
  vi.mocked(prisma.product.findMany as FindManyProduct).mockReset();
  vi.mocked(
    prisma.productCollection.findMany as FindManyProductCollection,
  ).mockReset();
});

// ──────────────────────────────────────────────────────────────
// Guardrail tests
// ──────────────────────────────────────────────────────────────

describe("PRODUCTION_SHARD_REGISTRY — structural guardrail", () => {
  it("has exactly the five SitemapResourceType keys, no extras", () => {
    const keys = Object.keys(PRODUCTION_SHARD_REGISTRY).sort();
    const expected = [...SITEMAP_RESOURCE_TYPES].sort();
    expect(keys).toEqual(expected);
  });

  it("every value is a callable function", () => {
    for (const key of SITEMAP_RESOURCE_TYPES) {
      const fetcher = PRODUCTION_SHARD_REGISTRY[key];
      expect(typeof fetcher).toBe("function");
    }
  });

  it("the 'search' resource type is absent (search has no sitemap)", () => {
    const asRecord = PRODUCTION_SHARD_REGISTRY as unknown as Record<
      string,
      unknown
    >;
    expect("search" in asRecord).toBe(false);
  });

  it("all five fetchers are distinct references (no accidental aliasing)", () => {
    const seen = new Set<unknown>();
    for (const key of SITEMAP_RESOURCE_TYPES) {
      const fetcher = PRODUCTION_SHARD_REGISTRY[key as SitemapResourceType];
      seen.add(fetcher);
    }
    expect(seen.size).toBe(SITEMAP_RESOURCE_TYPES.length);
  });
});

// ──────────────────────────────────────────────────────────────
// End-to-end mocked scenarios
// ──────────────────────────────────────────────────────────────

describe("PRODUCTION_SHARD_REGISTRY × buildSitemapIndexForTenant — end-to-end", () => {
  it("seeded tenant with 1 accommodation + 1 category + 1 product + 1 collection → 5 shard refs", async () => {
    // Accommodation list + accommodation-index pages-source queries.
    vi.mocked(prisma.accommodation.findMany as FindManyAccommodation)
      .mockResolvedValue([accommodationRow()] as unknown as Accommodation[]);
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(accommodationRow() as unknown as Accommodation);
    vi.mocked(
      prisma.accommodationCategory.findMany as FindManyAccommodationCategory,
    ).mockResolvedValue([categoryRow()] as unknown as AccommodationCategory[]);
    vi.mocked(prisma.product.findMany as FindManyProduct).mockResolvedValue(
      [productRow()] as unknown as Product[],
    );
    vi.mocked(
      prisma.productCollection.findMany as FindManyProductCollection,
    ).mockResolvedValue([collectionRow()] as unknown as ProductCollection[]);

    const index = await buildSitemapIndexForTenant(
      makeTenant(),
      PRODUCTION_SHARD_REGISTRY,
    );

    // Every resource type has ≥1 entry → one shard ref per type.
    expect(index.shards).toHaveLength(5);
    expect(index.shards.map((s) => s.resourceType)).toEqual([
      "accommodations",
      "accommodation_categories",
      "products",
      "product_collections",
      "pages",
    ]);
    for (const ref of index.shards) {
      expect(ref.shardIndex).toBe(1);
      expect(ref.url).toMatch(
        /^https:\/\/apelviken\.rutgr\.com\/sitemap_[a-z_]+_1\.xml$/,
      );
    }
  });

  it("empty tenant → only the pages shard (homepage always emitted)", async () => {
    // Every entity table returns empty.
    vi.mocked(prisma.accommodation.findMany as FindManyAccommodation)
      .mockResolvedValue([] as unknown as Accommodation[]);
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(null);
    vi.mocked(
      prisma.accommodationCategory.findMany as FindManyAccommodationCategory,
    ).mockResolvedValue([] as unknown as AccommodationCategory[]);
    vi.mocked(prisma.product.findMany as FindManyProduct).mockResolvedValue(
      [] as unknown as Product[],
    );
    vi.mocked(
      prisma.productCollection.findMany as FindManyProductCollection,
    ).mockResolvedValue([] as unknown as ProductCollection[]);

    const index = await buildSitemapIndexForTenant(
      makeTenant(),
      PRODUCTION_SHARD_REGISTRY,
    );

    // Homepage adapter always emits for every locale → pages shard
    // has entries → index has exactly one shard ref.
    expect(index.shards).toHaveLength(1);
    expect(index.shards[0].resourceType).toBe("pages");
    expect(index.shards[0].shardIndex).toBe(1);
  });
});
