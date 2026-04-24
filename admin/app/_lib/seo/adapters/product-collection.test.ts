import { describe, expect, it, vi } from "vitest";

vi.mock("../../logger", () => ({ log: vi.fn() }));

import type {
  Product,
  ProductCollection,
  ProductCollectionItem,
  ProductMedia,
  ProductStatus,
  ProductType,
} from "@prisma/client";

import {
  collectionSeoInclude,
  MAX_ITEMLIST_MEMBERS,
  productCollectionSeoAdapter,
  type ProductCollectionItemWithProduct,
  type ProductCollectionWithItems,
} from "./product-collection";
import { SeoableSchema, type SeoTenantContext } from "../types";

// ── Fixtures ──────────────────────────────────────────────────

function makeTenant(overrides: Partial<SeoTenantContext> = {}): SeoTenantContext {
  return {
    id: "tenant_test",
    siteName: "Apelviken",
    primaryDomain: "apelviken.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}" },
    activeLocales: ["sv", "en"],
    contentUpdatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

function makeProductMedia(
  overrides: Partial<ProductMedia> = {},
): ProductMedia {
  return {
    id: "pmed_1",
    productId: "prod_1",
    url: "https://cdn.example/p.jpg",
    type: "image",
    alt: "P",
    sortOrder: 0,
    filename: "p.jpg",
    width: 1200,
    height: 900,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod_1",
    tenantId: "tenant_test",
    title: "Frukost",
    description: "",
    slug: "frukost",
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
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    templateId: null,
    ...overrides,
  };
}

function makeItem(
  productOverrides: Partial<Product> = {},
  joinOverrides: Partial<ProductCollectionItem> = {},
  mediaRows: ProductMedia[] = [],
): ProductCollectionItemWithProduct {
  const product = makeProduct(productOverrides);
  const join: ProductCollectionItem = {
    id: "pci_1",
    collectionId: "coll_1",
    productId: product.id,
    sortOrder: 0,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    ...joinOverrides,
  };
  return {
    ...join,
    product: { ...product, media: mediaRows },
  };
}

function makeCollection(
  overrides: Partial<ProductCollectionWithItems> = {},
): ProductCollectionWithItems {
  const base: ProductCollection = {
    id: "coll_1",
    tenantId: "tenant_test",
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

// ── collectionSeoInclude (LIMIT 20 at query time) ────────────

describe("collectionSeoInclude", () => {
  it("applies LIMIT 20 at the DATABASE layer (not post-query slice)", () => {
    const include = collectionSeoInclude("tenant_test");
    expect(include.items.take).toBe(20);
    expect(include.items.take).toBe(MAX_ITEMLIST_MEMBERS);
  });

  it("filters members to ACTIVE STANDARD products with matching tenant and non-archived", () => {
    const include = collectionSeoInclude("tenant_abc");
    expect(include.items.where.product).toEqual({
      tenantId: "tenant_abc",
      status: "ACTIVE",
      productType: "STANDARD",
      archivedAt: null,
    });
  });

  it("orders members by ProductCollectionItem.sortOrder ascending", () => {
    const include = collectionSeoInclude("tenant_test");
    expect(include.items.orderBy).toEqual({ sortOrder: "asc" });
  });

  it("loads only the first product media (type=image) per item", () => {
    const include = collectionSeoInclude("tenant_test");
    const mediaInclude = include.items.include.product.include.media;
    expect(mediaInclude.take).toBe(1);
    expect(mediaInclude.where).toEqual({ type: "image" });
    expect(mediaInclude.orderBy).toEqual({ sortOrder: "asc" });
  });
});

// ── toSeoable ────────────────────────────────────────────────

describe("productCollectionSeoAdapter.toSeoable", () => {
  it("maps the collection fields into Seoable shape", () => {
    const seoable = productCollectionSeoAdapter.toSeoable(
      makeCollection(),
      makeTenant(),
    );
    expect(seoable).toMatchObject({
      resourceType: "product_collection",
      id: "coll_1",
      tenantId: "tenant_test",
      path: "/shop/collections/mat-och-dryck",
      title: "Mat & Dryck",
      description: "Våra bästa erbjudanden.",
      featuredImageId: null,
      seoOverrides: null,
      locale: "sv",
    });
  });

  it("strips HTML from description", () => {
    const seoable = productCollectionSeoAdapter.toSeoable(
      makeCollection({
        description: "<p>Våra <em>bästa</em> erbjudanden</p>",
      }),
      makeTenant(),
    );
    expect(seoable.description).toBe("Våra bästa erbjudanden");
  });

  it("returns null description when stripped to empty", () => {
    const seoable = productCollectionSeoAdapter.toSeoable(
      makeCollection({ description: "" }),
      makeTenant(),
    );
    expect(seoable.description).toBeNull();
  });

  it("synthesizes publishedAt from ACTIVE status", () => {
    const a = productCollectionSeoAdapter.toSeoable(
      makeCollection({ status: "ACTIVE" as ProductStatus }),
      makeTenant(),
    );
    expect(a.publishedAt).toEqual(new Date("2026-04-01T00:00:00Z"));

    const b = productCollectionSeoAdapter.toSeoable(
      makeCollection({ status: "DRAFT" as ProductStatus }),
      makeTenant(),
    );
    expect(b.publishedAt).toBeNull();
  });

  it("parses seo JSONB into seoOverrides when valid", () => {
    const seoable = productCollectionSeoAdapter.toSeoable(
      makeCollection({ seo: { title: "Custom", noindex: false } }),
      makeTenant(),
    );
    expect(seoable.seoOverrides).toMatchObject({
      title: "Custom",
      noindex: false,
    });
  });

  it("returns null seoOverrides when seo JSONB is malformed", () => {
    const seoable = productCollectionSeoAdapter.toSeoable(
      makeCollection({ seo: { gibberishKey: 123 } }),
      makeTenant(),
    );
    expect(seoable.seoOverrides).toBeNull();
  });
});

// ── Zod output validation ────────────────────────────────────

describe("productCollectionSeoAdapter.toSeoable — Zod output contract", () => {
  it("passes SeoableSchema.safeParse on the default fixture", () => {
    const seoable = productCollectionSeoAdapter.toSeoable(
      makeCollection(),
      makeTenant(),
    );
    expect(SeoableSchema.safeParse(seoable).success).toBe(true);
  });

  it("passes SeoableSchema with seo overrides set", () => {
    const seoable = productCollectionSeoAdapter.toSeoable(
      makeCollection({ seo: { title: "Custom", description: "D", noindex: false } }),
      makeTenant(),
    );
    expect(SeoableSchema.safeParse(seoable).success).toBe(true);
  });

  it("passes SeoableSchema when description strips to null", () => {
    const seoable = productCollectionSeoAdapter.toSeoable(
      makeCollection({ description: "" }),
      makeTenant(),
    );
    expect(SeoableSchema.safeParse(seoable).success).toBe(true);
  });
});

// ── Tenant isolation — non-authorization contract ────────────

describe("productCollectionSeoAdapter — tenant isolation contract", () => {
  it("returns a Seoable using entity.tenantId even when tenant context disagrees", () => {
    const collection = makeCollection({ tenantId: "tenant_A" });
    const tenantB = makeTenant({
      id: "tenant_B",
      primaryDomain: "b.rutgr.com",
    });
    const seoable = productCollectionSeoAdapter.toSeoable(collection, tenantB);
    expect(seoable.tenantId).toBe("tenant_A");
  });
});

// ── getAdapterOgImage ─────────────────────────────────────────

describe("productCollectionSeoAdapter.getAdapterOgImage", () => {
  it("returns a ResolvedImage from the raw imageUrl with nominal dimensions", () => {
    const img = productCollectionSeoAdapter.getAdapterOgImage?.(
      makeCollection(),
      makeTenant(),
    );
    expect(img).toEqual({
      url: "https://cdn.example/collection.jpg",
      width: 1200,
      height: 630,
      alt: "Mat & Dryck",
    });
  });

  it("returns null when imageUrl is null", () => {
    const img = productCollectionSeoAdapter.getAdapterOgImage?.(
      makeCollection({ imageUrl: null }),
      makeTenant(),
    );
    expect(img).toBeNull();
  });

  it("returns null when imageUrl is empty string", () => {
    const img = productCollectionSeoAdapter.getAdapterOgImage?.(
      makeCollection({ imageUrl: "" }),
      makeTenant(),
    );
    expect(img).toBeNull();
  });
});

// ── isIndexable ──────────────────────────────────────────────

describe("productCollectionSeoAdapter.isIndexable", () => {
  it("returns true for ACTIVE collection with no noindex override", () => {
    expect(
      productCollectionSeoAdapter.isIndexable(makeCollection()),
    ).toBe(true);
  });

  it("returns false for DRAFT", () => {
    expect(
      productCollectionSeoAdapter.isIndexable(
        makeCollection({ status: "DRAFT" as ProductStatus }),
      ),
    ).toBe(false);
  });

  it("returns false when seo.noindex is true", () => {
    expect(
      productCollectionSeoAdapter.isIndexable(
        makeCollection({ seo: { noindex: true } }),
      ),
    ).toBe(false);
  });

  it("returns true for empty collections (indexable, ItemList omitted separately)", () => {
    expect(
      productCollectionSeoAdapter.isIndexable(
        makeCollection({ items: [] }),
      ),
    ).toBe(true);
  });

  it("returns true when seo JSON is malformed (noindex cannot be trusted, default indexable)", () => {
    expect(
      productCollectionSeoAdapter.isIndexable(
        makeCollection({ seo: { unknownKey: true } }),
      ),
    ).toBe(true);
  });
});

// ── toStructuredData ─────────────────────────────────────────

describe("productCollectionSeoAdapter.toStructuredData", () => {
  it("emits CollectionPage + BreadcrumbList for an empty collection (no ItemList)", () => {
    const result = productCollectionSeoAdapter.toStructuredData(
      makeCollection({ items: [] }),
      makeTenant(),
      "sv",
    );
    expect(result).toHaveLength(2);
    expect(result[0]["@type"]).toBe("CollectionPage");
    expect(result[1]["@type"]).toBe("BreadcrumbList");
    // Empty ItemList fails Rich Results validation; must not be present.
    expect(result.find((o) => o["@type"] === "ItemList")).toBeUndefined();
  });

  it("CollectionPage carries name, url, description", () => {
    const [page] = productCollectionSeoAdapter.toStructuredData(
      makeCollection(),
      makeTenant(),
      "sv",
    );
    expect(page.name).toBe("Mat & Dryck");
    expect(page.url).toBe(
      "https://apelviken.rutgr.com/shop/collections/mat-och-dryck",
    );
    expect(page.description).toBe("Våra bästa erbjudanden.");
  });

  it("omits description when collection description is empty", () => {
    const [page] = productCollectionSeoAdapter.toStructuredData(
      makeCollection({ description: "" }),
      makeTenant(),
      "sv",
    );
    expect(page.description).toBeUndefined();
  });

  it("emits CollectionPage + ItemList + BreadcrumbList when there is exactly 1 member", () => {
    const items = [
      makeItem({ id: "p1", slug: "one", title: "One" }, { sortOrder: 0 }, [makeProductMedia()]),
    ];
    const result = productCollectionSeoAdapter.toStructuredData(
      makeCollection({ items }),
      makeTenant(),
      "sv",
    );
    expect(result.map((o) => o["@type"])).toEqual([
      "CollectionPage",
      "ItemList",
      "BreadcrumbList",
    ]);
  });

  it("ItemList positions are 1-indexed (schema.org convention, not 0)", () => {
    const items = [
      makeItem({ id: "p1", slug: "one", title: "One" }, { sortOrder: 0 }),
      makeItem({ id: "p2", slug: "two", title: "Two" }, { sortOrder: 1 }),
    ];
    const result = productCollectionSeoAdapter.toStructuredData(
      makeCollection({ items }),
      makeTenant(),
      "sv",
    );
    const list = result.find((o) => o["@type"] === "ItemList");
    const elements = list?.itemListElement as Array<{ position: number }>;
    expect(elements[0].position).toBe(1);
    expect(elements[1].position).toBe(2);
  });

  it("ItemList entries include name, url, and optional image from product.media[0]", () => {
    const items = [
      makeItem(
        { id: "p1", slug: "one", title: "One" },
        { sortOrder: 0 },
        [makeProductMedia({ url: "https://cdn/one.jpg" })],
      ),
      // Product with no media → no image key.
      makeItem({ id: "p2", slug: "two", title: "Two" }, { sortOrder: 1 }, []),
    ];
    const result = productCollectionSeoAdapter.toStructuredData(
      makeCollection({ items }),
      makeTenant(),
      "sv",
    );
    const elements = (result.find((o) => o["@type"] === "ItemList")
      ?.itemListElement) as Array<Record<string, unknown>>;
    expect(elements[0]).toMatchObject({
      "@type": "ListItem",
      position: 1,
      name: "One",
      url: "https://apelviken.rutgr.com/shop/products/one",
      image: "https://cdn/one.jpg",
    });
    expect(elements[1]).toMatchObject({
      "@type": "ListItem",
      position: 2,
      name: "Two",
      url: "https://apelviken.rutgr.com/shop/products/two",
    });
    expect(elements[1].image).toBeUndefined();
  });

  it("handles 20 items (DB cap already applied upstream)", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeItem({ id: `p${i}`, slug: `p-${i}`, title: `P${i}` }, {
        sortOrder: i,
      }),
    );
    const result = productCollectionSeoAdapter.toStructuredData(
      makeCollection({ items }),
      makeTenant(),
      "sv",
    );
    const list = result.find((o) => o["@type"] === "ItemList");
    expect((list?.itemListElement as unknown[]).length).toBe(20);
  });

  it("respects whatever the upstream query returns (adapter does NOT slice) — 50 inputs ship 50 out", () => {
    // This test enforces the invariant that the adapter does not
    // re-slice at serialization time. LIMIT 20 is the fetcher's job;
    // the adapter is given what it's given. Concretely: if the
    // fetcher changes its cap, the adapter must reflect that change.
    const items = Array.from({ length: 50 }, (_, i) =>
      makeItem({ id: `p${i}`, slug: `p-${i}`, title: `P${i}` }, {
        sortOrder: i,
      }),
    );
    const result = productCollectionSeoAdapter.toStructuredData(
      makeCollection({ items }),
      makeTenant(),
      "sv",
    );
    const list = result.find((o) => o["@type"] === "ItemList");
    expect((list?.itemListElement as unknown[]).length).toBe(50);
  });

  it("filters out GIFT_CARD and non-ACTIVE members defensively (belt-and-suspenders)", () => {
    const items = [
      makeItem({ id: "s1", slug: "s1", title: "Standard Active" }),
      makeItem({
        id: "gc",
        slug: "gc",
        title: "Gift Card",
        productType: "GIFT_CARD" as ProductType,
      }),
      makeItem({
        id: "d1",
        slug: "d1",
        title: "Draft",
        status: "DRAFT" as ProductStatus,
      }),
      makeItem({
        id: "a1",
        slug: "a1",
        title: "Archived",
        archivedAt: new Date(),
      }),
    ];
    const result = productCollectionSeoAdapter.toStructuredData(
      makeCollection({ items }),
      makeTenant(),
      "sv",
    );
    const list = result.find((o) => o["@type"] === "ItemList");
    const names = (list?.itemListElement as Array<{ name: string }>).map(
      (el) => el.name,
    );
    expect(names).toEqual(["Standard Active"]);
  });

  it("BreadcrumbList has three levels with locale-prefixed URLs (non-default locale)", () => {
    const result = productCollectionSeoAdapter.toStructuredData(
      makeCollection(),
      makeTenant(),
      "en",
    );
    const breadcrumb = result.find((o) => o["@type"] === "BreadcrumbList");
    expect(breadcrumb?.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Hem",
        item: "https://apelviken.rutgr.com/en/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Butik",
        item: "https://apelviken.rutgr.com/en/shop",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Mat & Dryck",
        item: "https://apelviken.rutgr.com/en/shop/collections/mat-och-dryck",
      },
    ]);
  });
});

// ── getSitemapEntries ────────────────────────────────────────

describe("productCollectionSeoAdapter.getSitemapEntries", () => {
  it("(M8 defer) restricts output to defaultLocale even when multiple locales are passed", () => {
    // Until the hreflang pipeline + locale-prefix route segments ship
    // (M8), the adapter only emits the default-locale entry to avoid
    // advertising /{locale}/... URLs that 404.
    const entries = productCollectionSeoAdapter.getSitemapEntries(
      makeCollection(),
      makeTenant(),
      ["sv", "en", "de"],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe(
      "https://apelviken.rutgr.com/shop/collections/mat-och-dryck",
    );
    expect(entries[0].alternates).toEqual([
      {
        hreflang: "sv",
        url: "https://apelviken.rutgr.com/shop/collections/mat-och-dryck",
      },
    ]);
  });
});
