import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../logger", () => ({ log: vi.fn() }));

import type {
  Product,
  ProductMedia,
  ProductStatus,
  ProductType,
  ProductVariant,
} from "@prisma/client";

import { log } from "../../logger";
import { productSeoAdapter, type ProductWithMedia } from "./product";
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

function makeMedia(overrides: Partial<ProductMedia> = {}): ProductMedia {
  return {
    id: "pmed_1",
    productId: "prod_1",
    url: "https://cdn.example/product.jpg",
    type: "image",
    alt: "Product photo",
    sortOrder: 0,
    filename: "product.jpg",
    width: 1600,
    height: 900,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    ...overrides,
  };
}

function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
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
    tenantId: "tenant_test",
    title: "Frukost-buffé",
    description: "En rejäl frukost med lokala råvaror.",
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
    media: [],
    variants: [],
    ...overrides,
  };
}

// ── toSeoable ────────────────────────────────────────────────

describe("productSeoAdapter.toSeoable", () => {
  it("maps the basic product fields into Seoable shape", () => {
    const seoable = productSeoAdapter.toSeoable(
      makeProduct(),
      makeTenant(),
    );
    expect(seoable).toMatchObject({
      resourceType: "product",
      id: "prod_1",
      tenantId: "tenant_test",
      path: "/shop/products/frukost-buffe",
      title: "Frukost-buffé",
      description: "En rejäl frukost med lokala råvaror.",
      featuredImageId: null,
      seoOverrides: null,
      locale: "sv",
    });
  });

  it("strips HTML from description", () => {
    const seoable = productSeoAdapter.toSeoable(
      makeProduct({
        description: "<p>Rejäl <strong>frukost</strong></p>",
      }),
      makeTenant(),
    );
    expect(seoable.description).toBe("Rejäl frukost");
  });

  it("returns null description when stripped result is empty", () => {
    const seoable = productSeoAdapter.toSeoable(
      makeProduct({ description: "" }),
      makeTenant(),
    );
    expect(seoable.description).toBeNull();
  });

  it("also returns null when description contains only HTML with no text", () => {
    const seoable = productSeoAdapter.toSeoable(
      makeProduct({ description: "<p></p><script>alert(1)</script>" }),
      makeTenant(),
    );
    expect(seoable.description).toBeNull();
  });

  it("synthesizes publishedAt from ACTIVE + not-archived", () => {
    const a = productSeoAdapter.toSeoable(
      makeProduct({ status: "ACTIVE", archivedAt: null }),
      makeTenant(),
    );
    expect(a.publishedAt).toEqual(new Date("2026-04-01T00:00:00Z"));

    const b = productSeoAdapter.toSeoable(
      makeProduct({ status: "DRAFT" }),
      makeTenant(),
    );
    expect(b.publishedAt).toBeNull();

    const c = productSeoAdapter.toSeoable(
      makeProduct({
        status: "ACTIVE",
        archivedAt: new Date("2026-04-02"),
      }),
      makeTenant(),
    );
    expect(c.publishedAt).toBeNull();
  });

  it("parses the seo JSONB into seoOverrides when valid", () => {
    const seoable = productSeoAdapter.toSeoable(
      makeProduct({
        seo: { title: "Custom SEO", noindex: true },
      }),
      makeTenant(),
    );
    expect(seoable.seoOverrides).toEqual({
      title: "Custom SEO",
      noindex: true,
      nofollow: false,
    });
  });

  it("returns null seoOverrides when seo JSONB is malformed", () => {
    const seoable = productSeoAdapter.toSeoable(
      makeProduct({ seo: { totallyUnknownKey: true } }),
      makeTenant(),
    );
    expect(seoable.seoOverrides).toBeNull();
  });

  it("uses tenant.defaultLocale as the entity locale (M5 — no per-entity i18n yet)", () => {
    const seoable = productSeoAdapter.toSeoable(
      makeProduct(),
      makeTenant({ defaultLocale: "en" }),
    );
    expect(seoable.locale).toBe("en");
  });
});

// ── Zod output validation (M5 prep hardening) ────────────────

describe("productSeoAdapter.toSeoable — Zod output contract", () => {
  it("produces a Seoable that passes SeoableSchema.safeParse", () => {
    const seoable = productSeoAdapter.toSeoable(
      makeProduct(),
      makeTenant(),
    );
    const parsed = SeoableSchema.safeParse(seoable);
    expect(parsed.success).toBe(true);
  });

  it("also passes SeoableSchema when seo overrides are present", () => {
    const seoable = productSeoAdapter.toSeoable(
      makeProduct({
        seo: { title: "Custom", description: "Custom desc", noindex: false },
      }),
      makeTenant(),
    );
    expect(SeoableSchema.safeParse(seoable).success).toBe(true);
  });

  it("also passes when the description strips to null", () => {
    const seoable = productSeoAdapter.toSeoable(
      makeProduct({ description: "" }),
      makeTenant(),
    );
    expect(SeoableSchema.safeParse(seoable).success).toBe(true);
  });
});

// ── Tenant isolation — non-authorization contract ────────────

describe("productSeoAdapter — tenant isolation contract", () => {
  /**
   * The adapter does NOT authorize. It trusts the caller to have
   * fetched the product with a tenant-scoped `where`. If a caller
   * mistakenly passes a product from tenant A to a resolution whose
   * context is tenant B, the adapter returns a Seoable using the
   * ENTITY'S tenantId. This test documents that invariant so a
   * future refactor doesn't quietly bolt tenant checks into the
   * wrong layer — authorization is the caller's responsibility.
   */
  it("returns a Seoable using entity.tenantId even when tenant context disagrees", () => {
    const productInA = makeProduct({ tenantId: "tenant_A" });
    const tenantB = makeTenant({ id: "tenant_B", primaryDomain: "b.rutgr.com" });
    const seoable = productSeoAdapter.toSeoable(productInA, tenantB);
    expect(seoable.tenantId).toBe("tenant_A");
  });
});

// ── getAdapterOgImage ─────────────────────────────────────────

describe("productSeoAdapter.getAdapterOgImage", () => {
  it("returns null when no media at all", () => {
    const img = productSeoAdapter.getAdapterOgImage?.(
      makeProduct({ media: [] }),
      makeTenant(),
    );
    expect(img).toBeNull();
  });

  it("returns the first image with its stored dimensions", () => {
    const img = productSeoAdapter.getAdapterOgImage?.(
      makeProduct({ media: [makeMedia()] }),
      makeTenant(),
    );
    expect(img).toEqual({
      url: "https://cdn.example/product.jpg",
      width: 1600,
      height: 900,
      alt: "Product photo",
    });
  });

  it("falls back to nominal 1200x630 when width/height are null", () => {
    const img = productSeoAdapter.getAdapterOgImage?.(
      makeProduct({
        media: [makeMedia({ width: null, height: null })],
      }),
      makeTenant(),
    );
    expect(img).toMatchObject({ width: 1200, height: 630 });
  });

  it("filters out video media and returns the first IMAGE", () => {
    const video = makeMedia({ id: "vid", type: "video", sortOrder: 0 });
    const image = makeMedia({ id: "img", type: "image", sortOrder: 1, url: "https://cdn/image.jpg" });
    const img = productSeoAdapter.getAdapterOgImage?.(
      makeProduct({ media: [video, image] }),
      makeTenant(),
    );
    expect(img?.url).toBe("https://cdn/image.jpg");
  });

  it("returns null when all media are videos", () => {
    const img = productSeoAdapter.getAdapterOgImage?.(
      makeProduct({
        media: [makeMedia({ type: "video" }), makeMedia({ type: "video", id: "v2" })],
      }),
      makeTenant(),
    );
    expect(img).toBeNull();
  });

  it("uses product title as alt when media alt is empty string", () => {
    const img = productSeoAdapter.getAdapterOgImage?.(
      makeProduct({ media: [makeMedia({ alt: "" })] }),
      makeTenant(),
    );
    expect(img?.alt).toBe("Frukost-buffé");
  });
});

// ── isIndexable ──────────────────────────────────────────────

describe("productSeoAdapter.isIndexable", () => {
  it("returns true for ACTIVE + STANDARD + not archived + no noindex", () => {
    expect(productSeoAdapter.isIndexable(makeProduct())).toBe(true);
  });

  it("returns false for productType=GIFT_CARD (safety net)", () => {
    expect(
      productSeoAdapter.isIndexable(
        makeProduct({ productType: "GIFT_CARD" as ProductType }),
      ),
    ).toBe(false);
  });

  it("returns false for DRAFT", () => {
    expect(
      productSeoAdapter.isIndexable(
        makeProduct({ status: "DRAFT" as ProductStatus }),
      ),
    ).toBe(false);
  });

  it("returns false for ARCHIVED status", () => {
    expect(
      productSeoAdapter.isIndexable(
        makeProduct({ status: "ARCHIVED" as ProductStatus }),
      ),
    ).toBe(false);
  });

  it("returns false when archivedAt is set", () => {
    expect(
      productSeoAdapter.isIndexable(
        makeProduct({ archivedAt: new Date() }),
      ),
    ).toBe(false);
  });

  it("returns false when seo.noindex is true", () => {
    expect(
      productSeoAdapter.isIndexable(
        makeProduct({ seo: { noindex: true } }),
      ),
    ).toBe(false);
  });

  it("returns true for out-of-stock products (they keep being indexed)", () => {
    // Track inventory with zero on hand, no overselling. Product
    // page stays indexable; the Offer switches to OutOfStock.
    expect(
      productSeoAdapter.isIndexable(
        makeProduct({
          trackInventory: true,
          inventoryQuantity: 0,
          continueSellingWhenOutOfStock: false,
        }),
      ),
    ).toBe(true);
  });

  it("returns true when seo JSON is malformed (noindex cannot be trusted, default to indexable)", () => {
    expect(
      productSeoAdapter.isIndexable(
        makeProduct({ seo: { unknownKey: true } }),
      ),
    ).toBe(true);
  });
});

// ── toStructuredData ─────────────────────────────────────────

describe("productSeoAdapter.toStructuredData", () => {
  beforeEach(() => vi.mocked(log).mockClear());

  it("emits Product + BreadcrumbList in that order", () => {
    const result = productSeoAdapter.toStructuredData(
      makeProduct({ media: [makeMedia()] }),
      makeTenant(),
      "sv",
    );
    expect(result).toHaveLength(2);
    expect(result[0]["@type"]).toBe("Product");
    expect(result[1]["@type"]).toBe("BreadcrumbList");
  });

  it("Product includes name, description, url, and image array", () => {
    const [product] = productSeoAdapter.toStructuredData(
      makeProduct({ media: [makeMedia()] }),
      makeTenant(),
      "sv",
    );
    expect(product.name).toBe("Frukost-buffé");
    expect(product.description).toBe("En rejäl frukost med lokala råvaror.");
    expect(product.url).toBe(
      "https://apelviken.rutgr.com/shop/products/frukost-buffe",
    );
    expect(product.image).toEqual(["https://cdn.example/product.jpg"]);
  });

  it("omits description field when stripped description is empty", () => {
    const [product] = productSeoAdapter.toStructuredData(
      makeProduct({ description: "" }),
      makeTenant(),
      "sv",
    );
    expect(product.description).toBeUndefined();
  });

  it("omits image field when product has no images", () => {
    const [product] = productSeoAdapter.toStructuredData(
      makeProduct({ media: [] }),
      makeTenant(),
      "sv",
    );
    expect(product.image).toBeUndefined();
  });

  it("does NOT emit brand field (per M5 blocking answer — no fabricated brand)", () => {
    const [product] = productSeoAdapter.toStructuredData(
      makeProduct(),
      makeTenant(),
      "sv",
    );
    expect(product.brand).toBeUndefined();
  });

  it("caps image array at 10 URLs", () => {
    const media: ProductMedia[] = [];
    for (let i = 0; i < 15; i++) {
      media.push(
        makeMedia({
          id: `m_${i}`,
          url: `https://cdn/img-${i}.jpg`,
          sortOrder: i,
        }),
      );
    }
    const [product] = productSeoAdapter.toStructuredData(
      makeProduct({ media }),
      makeTenant(),
      "sv",
    );
    expect(Array.isArray(product.image)).toBe(true);
    expect((product.image as string[]).length).toBe(10);
    // First 10 by sortOrder.
    expect((product.image as string[])[0]).toBe("https://cdn/img-0.jpg");
    expect((product.image as string[])[9]).toBe("https://cdn/img-9.jpg");
  });

  it("single-offer InStock when product is available and has no variants", () => {
    const [product] = productSeoAdapter.toStructuredData(
      makeProduct({
        trackInventory: true,
        inventoryQuantity: 5,
      }),
      makeTenant(),
      "sv",
    );
    expect(product.offers).toEqual({
      "@type": "Offer",
      price: "129.00",
      priceCurrency: "SEK",
      availability: "https://schema.org/InStock",
      url: "https://apelviken.rutgr.com/shop/products/frukost-buffe",
    });
  });

  it("single-offer OutOfStock when product tracks inventory and is 0", () => {
    const [product] = productSeoAdapter.toStructuredData(
      makeProduct({
        trackInventory: true,
        inventoryQuantity: 0,
        continueSellingWhenOutOfStock: false,
      }),
      makeTenant(),
      "sv",
    );
    expect(product.offers).toMatchObject({
      "@type": "Offer",
      availability: "https://schema.org/OutOfStock",
    });
  });

  it("single-offer InStock when continueSellingWhenOutOfStock is true despite zero inventory", () => {
    const [product] = productSeoAdapter.toStructuredData(
      makeProduct({
        trackInventory: true,
        inventoryQuantity: 0,
        continueSellingWhenOutOfStock: true,
      }),
      makeTenant(),
      "sv",
    );
    expect((product.offers as { availability: string }).availability).toBe(
      "https://schema.org/InStock",
    );
  });

  it("single-offer InStock when trackInventory is false (unlimited stock)", () => {
    const [product] = productSeoAdapter.toStructuredData(
      makeProduct({ trackInventory: false }),
      makeTenant(),
      "sv",
    );
    expect((product.offers as { availability: string }).availability).toBe(
      "https://schema.org/InStock",
    );
  });

  it("AggregateOffer across all variants when all are available", () => {
    const entity = makeProduct({
      variants: [
        makeVariant({ id: "v1", price: 10000 }), // 100.00
        makeVariant({ id: "v2", price: 15000 }), // 150.00
        makeVariant({ id: "v3", price: 20000 }), // 200.00
      ],
    });
    const [product] = productSeoAdapter.toStructuredData(
      entity,
      makeTenant(),
      "sv",
    );
    expect(product.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "100.00",
      highPrice: "200.00",
      offerCount: 3,
      priceCurrency: "SEK",
    });
  });

  it("AggregateOffer computes over AVAILABLE variants only (partial availability)", () => {
    const entity = makeProduct({
      variants: [
        // Cheap variant SOLD OUT — excluded from range.
        makeVariant({
          id: "v1",
          price: 5000,
          trackInventory: true,
          inventoryQuantity: 0,
        }),
        // Middle price available.
        makeVariant({ id: "v2", price: 15000 }),
        // Top price available.
        makeVariant({ id: "v3", price: 20000 }),
      ],
    });
    const [product] = productSeoAdapter.toStructuredData(
      entity,
      makeTenant(),
      "sv",
    );
    expect(product.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "150.00",
      highPrice: "200.00",
      offerCount: 2,
    });
  });

  it("falls back to single OutOfStock Offer when all variants are unavailable", () => {
    const entity = makeProduct({
      variants: [
        makeVariant({
          id: "v1",
          price: 10000,
          trackInventory: true,
          inventoryQuantity: 0,
        }),
        makeVariant({
          id: "v2",
          price: 15000,
          trackInventory: true,
          inventoryQuantity: 0,
        }),
      ],
    });
    const [product] = productSeoAdapter.toStructuredData(
      entity,
      makeTenant(),
      "sv",
    );
    expect(product.offers).toMatchObject({
      "@type": "Offer",
      availability: "https://schema.org/OutOfStock",
      // Lowest price across all variants (not AggregateOffer).
      price: "100.00",
    });
  });

  it("variant with price=0 inherits product base via effectivePrice", () => {
    const entity = makeProduct({
      price: 5000, // 50.00 base
      variants: [
        // price=0 → inherits base (50.00).
        makeVariant({ id: "v1", price: 0 }),
        makeVariant({ id: "v2", price: 15000 }), // 150.00
      ],
    });
    const [product] = productSeoAdapter.toStructuredData(
      entity,
      makeTenant(),
      "sv",
    );
    expect(product.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "50.00",
      highPrice: "150.00",
      offerCount: 2,
    });
  });

  it("skips Product schema entirely when price=0 and no variant has price (emits BreadcrumbList only) + logs", () => {
    const entity = makeProduct({
      price: 0,
      variants: [makeVariant({ price: 0 })],
    });
    const result = productSeoAdapter.toStructuredData(
      entity,
      makeTenant(),
      "sv",
      { requestId: "req_test_zero" },
    );
    expect(result).toHaveLength(1);
    expect(result[0]["@type"]).toBe("BreadcrumbList");
    expect(log).toHaveBeenCalledWith(
      "warn",
      "seo.structured_data.zero_price_skipped",
      expect.objectContaining({
        tenantId: "tenant_test",
        resourceId: "prod_1",
        resourceType: "product",
        requestId: "req_test_zero",
      }),
    );
  });

  it("does NOT skip Product schema when product.price=0 but a variant has a positive price", () => {
    const entity = makeProduct({
      price: 0,
      variants: [
        makeVariant({ id: "v1", price: 15000 }),
      ],
    });
    const result = productSeoAdapter.toStructuredData(
      entity,
      makeTenant(),
      "sv",
    );
    expect(result).toHaveLength(2);
    expect(result[0]["@type"]).toBe("Product");
  });

  it("BreadcrumbList has three levels with correct URLs", () => {
    const result = productSeoAdapter.toStructuredData(
      makeProduct(),
      makeTenant(),
      "sv",
    );
    const breadcrumb = result.find((o) => o["@type"] === "BreadcrumbList");
    expect(breadcrumb?.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Hem",
        item: "https://apelviken.rutgr.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Butik",
        item: "https://apelviken.rutgr.com/shop",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Frukost-buffé",
        item: "https://apelviken.rutgr.com/shop/products/frukost-buffe",
      },
    ]);
  });

  it("BreadcrumbList URLs are locale-prefixed for non-default locales", () => {
    const result = productSeoAdapter.toStructuredData(
      makeProduct(),
      makeTenant(),
      "en",
    );
    const breadcrumb = result.find((o) => o["@type"] === "BreadcrumbList");
    const items = breadcrumb?.itemListElement as Array<{ item: string }>;
    expect(items[0].item).toBe("https://apelviken.rutgr.com/en/");
    expect(items[1].item).toBe("https://apelviken.rutgr.com/en/shop");
    expect(items[2].item).toBe(
      "https://apelviken.rutgr.com/en/shop/products/frukost-buffe",
    );
  });
});

// ── getSitemapEntries ────────────────────────────────────────

describe("productSeoAdapter.getSitemapEntries", () => {
  it("(M8 defer) restricts output to defaultLocale even when multiple locales are passed", () => {
    // Until the hreflang pipeline + locale-prefix route segments ship
    // (M8), the adapter only emits the default-locale entry to avoid
    // advertising /{locale}/... URLs that 404.
    const entries = productSeoAdapter.getSitemapEntries(
      makeProduct(),
      makeTenant(),
      ["sv", "en", "de"],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe(
      "https://apelviken.rutgr.com/shop/products/frukost-buffe",
    );
    expect(entries[0].alternates).toEqual([
      {
        hreflang: "sv",
        url: "https://apelviken.rutgr.com/shop/products/frukost-buffe",
      },
    ]);
  });
});
