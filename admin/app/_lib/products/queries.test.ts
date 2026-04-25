/**
 * Tests for products/queries.ts — SEO sitemap fetchers for Product
 * and ProductCollection. Mirrors accommodations/queries.test.ts.
 *
 * Load-bearing describe block: "isIndexable alignment" — search
 * this name when changing any adapter's isIndexable rules.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Product, ProductCollection } from "@prisma/client";

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    product: { findMany: vi.fn() },
    productCollection: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/app/_lib/db/prisma";

import {
  fetchProductCollectionsForSitemap,
  fetchProductsForSitemap,
} from "./queries";
import type { SeoTenantContext } from "../seo/types";

// ── Prisma method aliases ───────────────────────────────────

type FindManyProduct = typeof prisma.product.findMany;
type FindManyProductCollection = typeof prisma.productCollection.findMany;

// ── Fixtures ────────────────────────────────────────────────

function makeTenant(
  overrides: Partial<SeoTenantContext> = {},
): SeoTenantContext {
  return {
    id: "tenant_test",
    siteName: "Apelviken",
    primaryDomain: "apelviken.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}", noindex: false },
    activeLocales: ["sv", "en"],
    contentUpdatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

function productRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "prod_1",
    tenantId: "tenant_test",
    title: "Frukost-buffé",
    description: "Lokala råvaror",
    slug: "frukost-buffe",
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
    tenantId: "tenant_test",
    title: "Mat & Dryck",
    description: "Våra erbjudanden",
    slug: "mat-och-dryck",
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

function mockFindManyProduct(
  rows: ReadonlyArray<Record<string, unknown>>,
): void {
  vi.mocked(prisma.product.findMany as FindManyProduct).mockResolvedValue(
    rows as unknown as Product[],
  );
}

function mockFindManyProductCollection(
  rows: ReadonlyArray<Record<string, unknown>>,
): void {
  vi.mocked(
    prisma.productCollection.findMany as FindManyProductCollection,
  ).mockResolvedValue(rows as unknown as ProductCollection[]);
}

beforeEach(() => {
  vi.mocked(prisma.product.findMany as FindManyProduct).mockReset();
  vi.mocked(
    prisma.productCollection.findMany as FindManyProductCollection,
  ).mockReset();
});

// ──────────────────────────────────────────────────────────────
// fetchProductsForSitemap
// ──────────────────────────────────────────────────────────────

describe("fetchProductsForSitemap — happy path & contract", () => {
  it("(M8 defer) returns one BuiltShardEntry per row with absolute URLs — defaultLocale only until hreflang ships", async () => {
    mockFindManyProduct([productRow()]);
    const tenant = makeTenant({ activeLocales: ["sv", "en"] });
    const entries = await fetchProductsForSitemap({
      tenant,
      limit: 50_000,
      offset: 0,
    });
    expect(entries).toHaveLength(1);
    for (const e of entries) {
      expect(e.url).toMatch(/^https:\/\//);
      expect(e.url).toContain("/shop/products/");
    }
  });

  it("returns empty array when no rows", async () => {
    mockFindManyProduct([]);
    const entries = await fetchProductsForSitemap({
      tenant: makeTenant(),
      limit: 50_000,
      offset: 0,
    });
    expect(entries).toEqual([]);
  });

  it("always normalizes alternates to an array", async () => {
    mockFindManyProduct([productRow()]);
    const entries = await fetchProductsForSitemap({
      tenant: makeTenant(),
      limit: 50_000,
      offset: 0,
    });
    for (const e of entries) expect(Array.isArray(e.alternates)).toBe(true);
  });

  it("passes limit + offset as take + skip", async () => {
    mockFindManyProduct([]);
    await fetchProductsForSitemap({
      tenant: makeTenant(),
      limit: 50_000,
      offset: 100_000,
    });
    const call = vi.mocked(prisma.product.findMany as FindManyProduct).mock
      .calls[0][0];
    expect(call?.take).toBe(50_000);
    expect(call?.skip).toBe(100_000);
  });

  it("uses orderBy: { id: 'asc' }", async () => {
    mockFindManyProduct([]);
    await fetchProductsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const call = vi.mocked(prisma.product.findMany as FindManyProduct).mock
      .calls[0][0];
    expect(call?.orderBy).toEqual({ id: "asc" });
  });

  it("hydrates media + variants (ProductWithMedia adapter shape)", async () => {
    mockFindManyProduct([]);
    await fetchProductsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const call = vi.mocked(prisma.product.findMany as FindManyProduct).mock
      .calls[0][0];
    expect(call?.include).toEqual({
      media: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
    });
  });
});

describe("fetchProductsForSitemap — tenant isolation", () => {
  it("WHERE.tenantId === args.tenant.id", async () => {
    mockFindManyProduct([]);
    await fetchProductsForSitemap({
      tenant: makeTenant({ id: "tenant_A" }),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(prisma.product.findMany as FindManyProduct).mock
      .calls[0][0]?.where;
    expect((whereArg as { tenantId?: unknown })?.tenantId).toBe("tenant_A");
  });
});

describe("fetchProductsForSitemap — isIndexable alignment", () => {
  // Load-bearing describe name. Product adapter's isIndexable:
  //   productType === "STANDARD"  — SQL-expressible
  //   status === "ACTIVE"         — SQL-expressible
  //   archivedAt === null         — SQL-expressible
  //   !seoOverrides.noindex       — JSON, post-fetch filter

  it("WHERE includes status: 'ACTIVE'", async () => {
    mockFindManyProduct([]);
    await fetchProductsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(prisma.product.findMany as FindManyProduct).mock
      .calls[0][0]?.where;
    expect((whereArg as { status?: unknown })?.status).toBe("ACTIVE");
  });

  it("WHERE includes archivedAt: null", async () => {
    mockFindManyProduct([]);
    await fetchProductsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(prisma.product.findMany as FindManyProduct).mock
      .calls[0][0]?.where;
    expect((whereArg as { archivedAt?: unknown })?.archivedAt).toBeNull();
  });

  it("WHERE includes productType: 'STANDARD' (gift cards excluded at SQL)", async () => {
    mockFindManyProduct([]);
    await fetchProductsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(prisma.product.findMany as FindManyProduct).mock
      .calls[0][0]?.where;
    expect((whereArg as { productType?: unknown })?.productType).toBe(
      "STANDARD",
    );
  });

  it("post-fetch drops rows with seo.noindex=true (JSON override)", async () => {
    mockFindManyProduct([
      productRow({ seo: { noindex: true }, slug: "hidden-product" }),
      productRow({ id: "prod_ok", slug: "visible-product" }),
    ]);
    const entries = await fetchProductsForSitemap({
      tenant: makeTenant({ activeLocales: ["sv"] }),
      limit: 50_000,
      offset: 0,
    });
    expect(entries.some((e) => e.url.includes("hidden-product"))).toBe(false);
    expect(entries.some((e) => e.url.includes("visible-product"))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// fetchProductCollectionsForSitemap
// ──────────────────────────────────────────────────────────────

describe("fetchProductCollectionsForSitemap — happy path & contract", () => {
  it("(M8 defer) returns one BuiltShardEntry per row with absolute URLs — defaultLocale only until hreflang ships", async () => {
    mockFindManyProductCollection([collectionRow()]);
    const tenant = makeTenant({ activeLocales: ["sv", "en"] });
    const entries = await fetchProductCollectionsForSitemap({
      tenant,
      limit: 50_000,
      offset: 0,
    });
    expect(entries).toHaveLength(1);
    for (const e of entries) {
      expect(e.url).toMatch(/^https:\/\//);
      expect(e.url).toContain("/shop/collections/");
    }
  });

  it("empty collection STAYS indexable (unlike empty accommodation-category)", async () => {
    // product-collection.isIndexable explicitly permits empty.
    mockFindManyProductCollection([collectionRow({ items: [] })]);
    const entries = await fetchProductCollectionsForSitemap({
      tenant: makeTenant({ activeLocales: ["sv"] }),
      limit: 50_000,
      offset: 0,
    });
    expect(entries).toHaveLength(1);
  });

  it("uses orderBy id asc", async () => {
    mockFindManyProductCollection([]);
    await fetchProductCollectionsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const call = vi.mocked(
      prisma.productCollection.findMany as FindManyProductCollection,
    ).mock.calls[0][0];
    expect(call?.orderBy).toEqual({ id: "asc" });
  });

  it("honors limit + offset via take + skip", async () => {
    mockFindManyProductCollection([]);
    await fetchProductCollectionsForSitemap({
      tenant: makeTenant(),
      limit: 100,
      offset: 50,
    });
    const call = vi.mocked(
      prisma.productCollection.findMany as FindManyProductCollection,
    ).mock.calls[0][0];
    expect(call?.take).toBe(100);
    expect(call?.skip).toBe(50);
  });

  it("include structure has items (reuses collectionSeoInclude fragment)", async () => {
    mockFindManyProductCollection([]);
    await fetchProductCollectionsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const call = vi.mocked(
      prisma.productCollection.findMany as FindManyProductCollection,
    ).mock.calls[0][0];
    const include = call?.include as { items?: unknown } | undefined;
    expect(include?.items).toBeDefined();
  });
});

describe("fetchProductCollectionsForSitemap — tenant isolation", () => {
  it("WHERE.tenantId === args.tenant.id", async () => {
    mockFindManyProductCollection([]);
    await fetchProductCollectionsForSitemap({
      tenant: makeTenant({ id: "tenant_B" }),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(
      prisma.productCollection.findMany as FindManyProductCollection,
    ).mock.calls[0][0]?.where;
    expect((whereArg as { tenantId?: unknown })?.tenantId).toBe("tenant_B");
  });
});

describe("fetchProductCollectionsForSitemap — isIndexable alignment", () => {
  // Load-bearing describe name. product-collection.isIndexable:
  //   status === "ACTIVE"        — SQL-expressible
  //   !seoOverrides.noindex      — JSON, post-fetch filter
  //   (no archivedAt column on ProductCollection — status encodes it)
  //   empty collections STAY indexable (do NOT filter)

  it("WHERE includes status: 'ACTIVE'", async () => {
    mockFindManyProductCollection([]);
    await fetchProductCollectionsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(
      prisma.productCollection.findMany as FindManyProductCollection,
    ).mock.calls[0][0]?.where;
    expect((whereArg as { status?: unknown })?.status).toBe("ACTIVE");
  });

  it("WHERE does NOT include archivedAt (schema has no archivedAt column)", async () => {
    mockFindManyProductCollection([]);
    await fetchProductCollectionsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(
      prisma.productCollection.findMany as FindManyProductCollection,
    ).mock.calls[0][0]?.where as Record<string, unknown> | undefined;
    expect(whereArg).toBeDefined();
    expect("archivedAt" in (whereArg ?? {})).toBe(false);
  });

  it("post-fetch drops rows with seo.noindex=true (JSON override)", async () => {
    mockFindManyProductCollection([
      collectionRow({ seo: { noindex: true }, slug: "hidden-coll" }),
      collectionRow({ id: "coll_ok", slug: "visible-coll" }),
    ]);
    const entries = await fetchProductCollectionsForSitemap({
      tenant: makeTenant({ activeLocales: ["sv"] }),
      limit: 50_000,
      offset: 0,
    });
    expect(entries.some((e) => e.url.includes("hidden-coll"))).toBe(false);
    expect(entries.some((e) => e.url.includes("visible-coll"))).toBe(true);
  });
});
