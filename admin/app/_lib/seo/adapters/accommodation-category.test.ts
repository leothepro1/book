import { describe, expect, it, vi } from "vitest";

vi.mock("../../logger", () => ({ log: vi.fn() }));

import type {
  AccommodationCategory,
  AccommodationCategoryItem,
  AccommodationMedia,
  AccommodationStatus,
  AccommodationType,
} from "@prisma/client";

import type { AccommodationWithMedia } from "./accommodation";
import {
  accommodationCategorySeoAdapter,
  categorySeoInclude,
  MAX_ITEMLIST_MEMBERS,
  type AccommodationCategoryItemWithAccommodation,
  type AccommodationCategoryWithItems,
} from "./accommodation-category";
import { SeoableSchema, type SeoTenantContext } from "../types";

// ── Fixtures ──────────────────────────────────────────────────

function makeTenant(
  overrides: Partial<SeoTenantContext> = {},
): SeoTenantContext {
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

function makeAccommodationMedia(
  overrides: Partial<AccommodationMedia> = {},
): AccommodationMedia {
  return {
    id: "amed_1",
    accommodationId: "acc_1",
    url: "https://cdn.example/acc.jpg",
    altText: "Cover",
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
    tenantId: "tenant_test",
    name: "Stuga Björk",
    slug: "stuga-bjork",
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

function makeItem(
  accOverrides: Partial<AccommodationWithMedia> = {},
  joinOverrides: Partial<AccommodationCategoryItem> = {},
  media: AccommodationMedia[] = [],
): AccommodationCategoryItemWithAccommodation {
  const accommodation = makeAccommodation({ ...accOverrides, media });
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
    tenantId: "tenant_test",
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
  return {
    ...base,
    // Empty items by default — override in tests that need content.
    items: [],
    ...overrides,
  };
}

// ── categorySeoInclude ────────────────────────────────────────

describe("categorySeoInclude", () => {
  it("applies LIMIT at the database layer", () => {
    const include = categorySeoInclude("tenant_test");
    expect(include.items.take).toBe(MAX_ITEMLIST_MEMBERS);
    expect(include.items.take).toBe(20);
  });

  it("filters member accommodations to ACTIVE + non-archived + matching tenant", () => {
    const include = categorySeoInclude("tenant_abc");
    expect(include.items.where.accommodation).toEqual({
      tenantId: "tenant_abc",
      status: "ACTIVE",
      archivedAt: null,
    });
  });

  it("orders items by AccommodationCategoryItem.sortOrder ascending", () => {
    const include = categorySeoInclude("tenant_test");
    expect(include.items.orderBy).toEqual({ sortOrder: "asc" });
  });

  it("includes accommodation media ordered by sortOrder ascending (cover-first)", () => {
    const include = categorySeoInclude("tenant_test");
    expect(include.items.include.accommodation.include.media).toEqual({
      orderBy: { sortOrder: "asc" },
    });
  });
});

// ── toSeoable ────────────────────────────────────────────────

describe("accommodationCategorySeoAdapter.toSeoable", () => {
  it("maps the category fields into Seoable shape", () => {
    const seoable = accommodationCategorySeoAdapter.toSeoable(
      makeCategory(),
      makeTenant(),
    );
    expect(seoable).toMatchObject({
      resourceType: "accommodation_category",
      id: "accommodation-category:cat_1",
      tenantId: "tenant_test",
      path: "/stays/categories/stugor",
      title: "Stugor",
      description: "Våra hemtrevliga stugor",
      featuredImageId: null,
      seoOverrides: null,
      locale: "sv",
    });
  });

  it("strips HTML from description", () => {
    const seoable = accommodationCategorySeoAdapter.toSeoable(
      makeCategory({
        description: "<p>Våra <em>hemtrevliga</em> stugor</p>",
      }),
      makeTenant(),
    );
    expect(seoable.description).toBe("Våra hemtrevliga stugor");
  });

  it("returns null description when description strips to empty", () => {
    const seoable = accommodationCategorySeoAdapter.toSeoable(
      makeCategory({ description: "" }),
      makeTenant(),
    );
    expect(seoable.description).toBeNull();
  });

  it("synthesizes publishedAt from ACTIVE status", () => {
    const a = accommodationCategorySeoAdapter.toSeoable(
      makeCategory({ status: "ACTIVE" as AccommodationStatus }),
      makeTenant(),
    );
    expect(a.publishedAt).toEqual(new Date("2026-04-01T00:00:00Z"));

    const b = accommodationCategorySeoAdapter.toSeoable(
      makeCategory({ status: "INACTIVE" as AccommodationStatus }),
      makeTenant(),
    );
    expect(b.publishedAt).toBeNull();
  });

  it("parses the seo JSONB into seoOverrides when valid", () => {
    const seoable = accommodationCategorySeoAdapter.toSeoable(
      makeCategory({ seo: { title: "Custom", noindex: false } }),
      makeTenant(),
    );
    expect(seoable.seoOverrides).toMatchObject({
      title: "Custom",
      noindex: false,
    });
  });

  it("returns null seoOverrides when seo JSONB is malformed", () => {
    const seoable = accommodationCategorySeoAdapter.toSeoable(
      makeCategory({ seo: { totallyUnknownKey: 42 } }),
      makeTenant(),
    );
    expect(seoable.seoOverrides).toBeNull();
  });
});

// ── Synthetic id stability ───────────────────────────────────

describe("accommodationCategorySeoAdapter — synthetic id stability", () => {
  it("produces identical ids across two calls with the same entity", () => {
    const a = accommodationCategorySeoAdapter.toSeoable(
      makeCategory(),
      makeTenant(),
    );
    const b = accommodationCategorySeoAdapter.toSeoable(
      makeCategory(),
      makeTenant(),
    );
    expect(a.id).toBe(b.id);
    expect(a.id).toBe("accommodation-category:cat_1");
  });

  it("id includes category.id (not slug — slug changes create 301s, id never changes)", () => {
    const a = accommodationCategorySeoAdapter.toSeoable(
      makeCategory({ slug: "old-slug" }),
      makeTenant(),
    );
    const b = accommodationCategorySeoAdapter.toSeoable(
      makeCategory({ slug: "new-slug" }),
      makeTenant(),
    );
    expect(a.id).toBe(b.id); // same category.id → same Seoable.id
  });
});

// ── Zod output validation ────────────────────────────────────

describe("accommodationCategorySeoAdapter.toSeoable — Zod output contract", () => {
  it("passes SeoableSchema.safeParse on default fixture", () => {
    const seoable = accommodationCategorySeoAdapter.toSeoable(
      makeCategory(),
      makeTenant(),
    );
    expect(SeoableSchema.safeParse(seoable).success).toBe(true);
  });

  it("passes SeoableSchema with populated items and overrides set", () => {
    const seoable = accommodationCategorySeoAdapter.toSeoable(
      makeCategory({
        items: [makeItem()],
        seo: { title: "Custom", description: "D", noindex: false },
      }),
      makeTenant(),
    );
    expect(SeoableSchema.safeParse(seoable).success).toBe(true);
  });

  it("passes SeoableSchema when description strips to null", () => {
    const seoable = accommodationCategorySeoAdapter.toSeoable(
      makeCategory({ description: "" }),
      makeTenant(),
    );
    expect(SeoableSchema.safeParse(seoable).success).toBe(true);
  });
});

// ── Tenant isolation contract ────────────────────────────────

describe("accommodationCategorySeoAdapter — tenant isolation contract", () => {
  it("returns a Seoable using entity.tenantId even when tenant context disagrees", () => {
    const entity = makeCategory({ tenantId: "tenant_A" });
    const tenantB = makeTenant({
      id: "tenant_B",
      primaryDomain: "b.rutgr.com",
    });
    const seoable = accommodationCategorySeoAdapter.toSeoable(entity, tenantB);
    expect(seoable.tenantId).toBe("tenant_A");
  });
});

// ── getAdapterOgImage ─────────────────────────────────────────

describe("accommodationCategorySeoAdapter.getAdapterOgImage", () => {
  it("returns a ResolvedImage from imageUrl at nominal dimensions", () => {
    const img = accommodationCategorySeoAdapter.getAdapterOgImage?.(
      makeCategory(),
      makeTenant(),
    );
    expect(img).toEqual({
      url: "https://cdn.example/stugor.jpg",
      width: 1200,
      height: 630,
      alt: "Stugor",
    });
  });

  it("returns null when imageUrl is null", () => {
    const img = accommodationCategorySeoAdapter.getAdapterOgImage?.(
      makeCategory({ imageUrl: null }),
      makeTenant(),
    );
    expect(img).toBeNull();
  });

  it("returns null when imageUrl is empty string", () => {
    const img = accommodationCategorySeoAdapter.getAdapterOgImage?.(
      makeCategory({ imageUrl: "" }),
      makeTenant(),
    );
    expect(img).toBeNull();
  });
});

// ── isIndexable ──────────────────────────────────────────────

describe("accommodationCategorySeoAdapter.isIndexable", () => {
  it("true for ACTIVE category with ≥1 item and no noindex override", () => {
    expect(
      accommodationCategorySeoAdapter.isIndexable(
        makeCategory({ items: [makeItem()] }),
      ),
    ).toBe(true);
  });

  it("false for INACTIVE category", () => {
    expect(
      accommodationCategorySeoAdapter.isIndexable(
        makeCategory({
          status: "INACTIVE" as AccommodationStatus,
          items: [makeItem()],
        }),
      ),
    ).toBe(false);
  });

  it("false for ARCHIVED category", () => {
    expect(
      accommodationCategorySeoAdapter.isIndexable(
        makeCategory({
          status: "ARCHIVED" as AccommodationStatus,
          items: [makeItem()],
        }),
      ),
    ).toBe(false);
  });

  it("false when seo.noindex is true", () => {
    expect(
      accommodationCategorySeoAdapter.isIndexable(
        makeCategory({
          seo: { noindex: true },
          items: [makeItem()],
        }),
      ),
    ).toBe(false);
  });

  it("false when items array is empty (empty category = thin content)", () => {
    expect(
      accommodationCategorySeoAdapter.isIndexable(
        makeCategory({ items: [] }),
      ),
    ).toBe(false);
  });

  it("true when seo JSON is malformed (noindex cannot be trusted, default indexable with items)", () => {
    expect(
      accommodationCategorySeoAdapter.isIndexable(
        makeCategory({
          seo: { unknownKey: true },
          items: [makeItem()],
        }),
      ),
    ).toBe(true);
  });

  it("visibleInSearch=false does NOT affect SEO indexability (visibleInSearch is a UX filter, not an SEO signal)", () => {
    expect(
      accommodationCategorySeoAdapter.isIndexable(
        makeCategory({
          visibleInSearch: false,
          items: [makeItem()],
        }),
      ),
    ).toBe(true);
  });
});

// ── toStructuredData ─────────────────────────────────────────

describe("accommodationCategorySeoAdapter.toStructuredData", () => {
  it("returns [] when category is not indexable (empty items)", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeCategory({ items: [] }),
      makeTenant(),
      "sv",
    );
    expect(out).toEqual([]);
  });

  it("returns [] when category is DRAFT/INACTIVE", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeCategory({
        status: "INACTIVE" as AccommodationStatus,
        items: [makeItem()],
      }),
      makeTenant(),
      "sv",
    );
    expect(out).toEqual([]);
  });

  it("returns [] when merchant set seo.noindex", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeCategory({
        seo: { noindex: true },
        items: [makeItem()],
      }),
      makeTenant(),
      "sv",
    );
    expect(out).toEqual([]);
  });

  it("emits CollectionPage + ItemList + BreadcrumbList for an indexable category", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeCategory({ items: [makeItem()] }),
      makeTenant(),
      "sv",
    );
    expect(out.map((o) => o["@type"])).toEqual([
      "CollectionPage",
      "ItemList",
      "BreadcrumbList",
    ]);
  });

  it("CollectionPage has name, url, description, and about accommodation", () => {
    const [page] = accommodationCategorySeoAdapter.toStructuredData(
      makeCategory({ items: [makeItem()] }),
      makeTenant(),
      "sv",
    );
    expect(page).toMatchObject({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Stugor",
      url: "https://apelviken.rutgr.com/stays/categories/stugor",
      description: "Våra hemtrevliga stugor",
      about: { "@type": "Accommodation" },
    });
  });

  it("omits description from CollectionPage when source description is empty", () => {
    const [page] = accommodationCategorySeoAdapter.toStructuredData(
      makeCategory({ description: "", items: [makeItem()] }),
      makeTenant(),
      "sv",
    );
    expect(page.description).toBeUndefined();
  });

  it("ItemList entries are 1-indexed with accommodation name, url, optional image", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeCategory({
        items: [
          makeItem(
            { id: "acc1", slug: "acc1", name: "Acc1" },
            { sortOrder: 0 },
            [makeAccommodationMedia({ url: "https://cdn/acc1.jpg" })],
          ),
          makeItem(
            { id: "acc2", slug: "acc2", name: "Acc2" },
            { sortOrder: 1 },
            // no media → no image key
            [],
          ),
        ],
      }),
      makeTenant(),
      "sv",
    );
    const list = out.find((o) => o["@type"] === "ItemList");
    const entries = list?.itemListElement as Array<Record<string, unknown>>;
    expect(entries[0]).toMatchObject({
      "@type": "ListItem",
      position: 1,
      name: "Acc1",
      url: "https://apelviken.rutgr.com/stays/acc1",
      image: "https://cdn/acc1.jpg",
    });
    expect(entries[1]).toMatchObject({
      "@type": "ListItem",
      position: 2,
      name: "Acc2",
      url: "https://apelviken.rutgr.com/stays/acc2",
    });
    expect(entries[1].image).toBeUndefined();
  });

  it("prefers accommodation nameOverride over name", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeCategory({
        items: [
          makeItem({
            name: "Default",
            nameOverride: "Preferred",
          }),
        ],
      }),
      makeTenant(),
      "sv",
    );
    const list = out.find((o) => o["@type"] === "ItemList");
    const entries = list?.itemListElement as Array<{ name: string }>;
    expect(entries[0].name).toBe("Preferred");
  });

  it("BreadcrumbList is 3-level: Hem → Boenden → {category.title}", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeCategory({ items: [makeItem()] }),
      makeTenant(),
      "sv",
    );
    const crumb = out.find((o) => o["@type"] === "BreadcrumbList");
    expect(crumb?.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Hem",
        item: "https://apelviken.rutgr.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Boenden",
        item: "https://apelviken.rutgr.com/stays",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Stugor",
        item: "https://apelviken.rutgr.com/stays/categories/stugor",
      },
    ]);
  });

  it("BreadcrumbList URLs are locale-prefixed for non-default locales", () => {
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeCategory({ items: [makeItem()] }),
      makeTenant(),
      "en",
    );
    const crumb = out.find((o) => o["@type"] === "BreadcrumbList");
    const items = crumb?.itemListElement as Array<{ item: string }>;
    expect(items[0].item).toBe("https://apelviken.rutgr.com/en/");
    expect(items[1].item).toBe("https://apelviken.rutgr.com/en/stays");
    expect(items[2].item).toBe(
      "https://apelviken.rutgr.com/en/stays/categories/stugor",
    );
  });

  it("respects whatever the upstream query returns (adapter does NOT re-cap)", () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      makeItem({ id: `a${i}`, slug: `a-${i}`, name: `A${i}` }, {
        sortOrder: i,
      }),
    );
    const out = accommodationCategorySeoAdapter.toStructuredData(
      makeCategory({ items }),
      makeTenant(),
      "sv",
    );
    const list = out.find((o) => o["@type"] === "ItemList");
    expect((list?.itemListElement as unknown[]).length).toBe(30);
  });
});

// ── getSitemapEntries ────────────────────────────────────────

describe("accommodationCategorySeoAdapter.getSitemapEntries", () => {
  it("(M8 defer) restricts output to defaultLocale when category is indexable", () => {
    // Until the hreflang pipeline + locale-prefix route segments ship
    // (M8), the adapter only emits the default-locale entry to avoid
    // advertising /{locale}/... URLs that 404.
    const entries = accommodationCategorySeoAdapter.getSitemapEntries(
      makeCategory({ items: [makeItem()] }),
      makeTenant(),
      ["sv", "en", "de"],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe(
      "https://apelviken.rutgr.com/stays/categories/stugor",
    );
    expect(entries[0].alternates).toEqual([
      {
        hreflang: "sv",
        url: "https://apelviken.rutgr.com/stays/categories/stugor",
      },
    ]);
  });

  it("returns no entries when category is non-indexable (empty)", () => {
    const entries = accommodationCategorySeoAdapter.getSitemapEntries(
      makeCategory({ items: [] }),
      makeTenant(),
      ["sv", "en"],
    );
    expect(entries).toEqual([]);
  });

  it("returns no entries when category is DRAFT", () => {
    const entries = accommodationCategorySeoAdapter.getSitemapEntries(
      makeCategory({
        status: "INACTIVE" as AccommodationStatus,
        items: [makeItem()],
      }),
      makeTenant(),
      ["sv"],
    );
    expect(entries).toEqual([]);
  });
});
