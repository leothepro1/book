import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../logger", () => ({ log: vi.fn() }));

import type {
  AccommodationMedia,
  AccommodationType,
} from "@prisma/client";

import { log } from "../../logger";
import type { AccommodationWithMedia } from "./accommodation";
import {
  accommodationIndexSeoAdapter,
  type AccommodationIndexSeoInput,
  MAX_ITEMLIST_MEMBERS,
} from "./accommodation-index";
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

function makeMedia(
  overrides: Partial<AccommodationMedia> = {},
): AccommodationMedia {
  return {
    id: "media_1",
    accommodationId: "acc_1",
    url: "https://cdn.example/image.jpg",
    altText: "Image",
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

function makeInput(
  overrides: Partial<AccommodationIndexSeoInput> = {},
): AccommodationIndexSeoInput {
  return {
    tenantId: "tenant_test",
    activeLocales: ["sv", "en"],
    featuredAccommodations: [],
    ...overrides,
  };
}

// ── toSeoable ────────────────────────────────────────────────

describe("accommodationIndexSeoAdapter.toSeoable", () => {
  it("synthesizes the canonical index Seoable", () => {
    const seoable = accommodationIndexSeoAdapter.toSeoable(
      makeInput(),
      makeTenant(),
    );
    expect(seoable).toMatchObject({
      resourceType: "accommodation_index",
      id: "accommodation-index:tenant_test",
      tenantId: "tenant_test",
      path: "/stays",
      title: "Boenden",
      description: null,
      featuredImageId: null,
      seoOverrides: null,
      locale: "sv",
    });
  });

  it("uses tenant.defaultLocale even when English is the request locale", () => {
    // The Seoable.locale is the ENTITY locale, not the request locale.
    // Request-locale routing is the resolver's job.
    const seoable = accommodationIndexSeoAdapter.toSeoable(
      makeInput(),
      makeTenant({ defaultLocale: "de" }),
    );
    expect(seoable.locale).toBe("de");
  });

  it("synthesizes publishedAt and updatedAt as Date instances", () => {
    const seoable = accommodationIndexSeoAdapter.toSeoable(
      makeInput(),
      makeTenant(),
    );
    expect(seoable.updatedAt).toBeInstanceOf(Date);
    expect(seoable.publishedAt).toBeInstanceOf(Date);
  });
});

// ── Synthetic id stability (React cache() dedup contract) ────

describe("accommodationIndexSeoAdapter — synthetic id stability", () => {
  it("produces identical ids across two calls with the same input (cache() dedup contract)", () => {
    const a = accommodationIndexSeoAdapter.toSeoable(
      makeInput(),
      makeTenant(),
    );
    const b = accommodationIndexSeoAdapter.toSeoable(
      makeInput(),
      makeTenant(),
    );
    expect(a.id).toBe(b.id);
    expect(a.id).toBe("accommodation-index:tenant_test");
  });

  it("id does NOT include locale (locale-specific ids would break cache() for the same entity rendered in multiple locales)", () => {
    const a = accommodationIndexSeoAdapter.toSeoable(
      makeInput(),
      makeTenant({ defaultLocale: "sv" }),
    );
    const b = accommodationIndexSeoAdapter.toSeoable(
      makeInput(),
      makeTenant({ defaultLocale: "en" }),
    );
    // Both resolve for the same tenant — same id.
    expect(a.id).toBe(b.id);
  });

  it("id includes tenantId so different tenants have different ids", () => {
    const a = accommodationIndexSeoAdapter.toSeoable(
      makeInput({ tenantId: "tenant_A" }),
      makeTenant({ id: "tenant_A" }),
    );
    const b = accommodationIndexSeoAdapter.toSeoable(
      makeInput({ tenantId: "tenant_B" }),
      makeTenant({ id: "tenant_B" }),
    );
    expect(a.id).not.toBe(b.id);
  });
});

// ── Zod output validation ────────────────────────────────────

describe("accommodationIndexSeoAdapter.toSeoable — Zod output contract", () => {
  it("passes SeoableSchema.safeParse on default input", () => {
    const seoable = accommodationIndexSeoAdapter.toSeoable(
      makeInput(),
      makeTenant(),
    );
    expect(SeoableSchema.safeParse(seoable).success).toBe(true);
  });

  it("passes SeoableSchema when featured list is populated", () => {
    const seoable = accommodationIndexSeoAdapter.toSeoable(
      makeInput({
        featuredAccommodations: [makeAccommodation(), makeAccommodation()],
      }),
      makeTenant(),
    );
    expect(SeoableSchema.safeParse(seoable).success).toBe(true);
  });
});

// ── Tenant isolation contract ────────────────────────────────

describe("accommodationIndexSeoAdapter — tenant isolation contract", () => {
  it("returns a Seoable using input.tenantId even when tenant context disagrees", () => {
    const input = makeInput({ tenantId: "tenant_A" });
    const tenantB = makeTenant({
      id: "tenant_B",
      primaryDomain: "b.rutgr.com",
    });
    const seoable = accommodationIndexSeoAdapter.toSeoable(input, tenantB);
    expect(seoable.tenantId).toBe("tenant_A");
    expect(seoable.id).toBe("accommodation-index:tenant_A");
  });
});

// ── getAdapterOgImage ─────────────────────────────────────────

describe("accommodationIndexSeoAdapter.getAdapterOgImage", () => {
  it("always returns null (tenant default → dynamic fallback)", () => {
    expect(
      accommodationIndexSeoAdapter.getAdapterOgImage?.(
        makeInput(),
        makeTenant(),
      ),
    ).toBeNull();
  });
});

// ── isIndexable ──────────────────────────────────────────────

describe("accommodationIndexSeoAdapter.isIndexable", () => {
  it("always returns true (no entity state to gate on)", () => {
    expect(
      accommodationIndexSeoAdapter.isIndexable(makeInput()),
    ).toBe(true);
    expect(
      accommodationIndexSeoAdapter.isIndexable(
        makeInput({ featuredAccommodations: [] }),
      ),
    ).toBe(true);
    expect(
      accommodationIndexSeoAdapter.isIndexable(
        makeInput({
          featuredAccommodations: [makeAccommodation()],
        }),
      ),
    ).toBe(true);
  });
});

// ── toStructuredData ─────────────────────────────────────────

describe("accommodationIndexSeoAdapter.toStructuredData", () => {
  beforeEach(() => vi.mocked(log).mockClear());

  it("emits CollectionPage + BreadcrumbList when featured list is empty (no ItemList)", () => {
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeInput({ featuredAccommodations: [] }),
      makeTenant(),
      "sv",
    );
    expect(out.map((o) => o["@type"])).toEqual([
      "CollectionPage",
      "BreadcrumbList",
    ]);
    expect(out.find((o) => o["@type"] === "ItemList")).toBeUndefined();
  });

  it("CollectionPage carries name + url + about accommodation", () => {
    const [page] = accommodationIndexSeoAdapter.toStructuredData(
      makeInput(),
      makeTenant(),
      "sv",
    );
    expect(page).toMatchObject({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Boenden",
      url: "https://apelviken.rutgr.com/stays",
      about: { "@type": "Accommodation" },
    });
  });

  it("emits CollectionPage + ItemList + BreadcrumbList with 1 member", () => {
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeInput({
        featuredAccommodations: [
          makeAccommodation({ media: [makeMedia()] }),
        ],
      }),
      makeTenant(),
      "sv",
    );
    expect(out.map((o) => o["@type"])).toEqual([
      "CollectionPage",
      "ItemList",
      "BreadcrumbList",
    ]);
  });

  it("ItemList entries are 1-indexed with name, url, optional image", () => {
    const withImage = makeAccommodation({
      id: "a1",
      slug: "a1",
      name: "A1",
      media: [makeMedia({ url: "https://cdn/a1.jpg" })],
    });
    const withoutImage = makeAccommodation({
      id: "a2",
      slug: "a2",
      name: "A2",
      media: [],
    });
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeInput({ featuredAccommodations: [withImage, withoutImage] }),
      makeTenant(),
      "sv",
    );
    const list = out.find((o) => o["@type"] === "ItemList");
    const entries = list?.itemListElement as Array<Record<string, unknown>>;
    expect(entries[0]).toMatchObject({
      "@type": "ListItem",
      position: 1,
      name: "A1",
      url: "https://apelviken.rutgr.com/stays/a1",
      image: "https://cdn/a1.jpg",
    });
    expect(entries[1]).toMatchObject({
      "@type": "ListItem",
      position: 2,
      name: "A2",
      url: "https://apelviken.rutgr.com/stays/a2",
    });
    expect(entries[1].image).toBeUndefined();
  });

  it("prefers nameOverride over name in ItemList entries", () => {
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeInput({
        featuredAccommodations: [
          makeAccommodation({ name: "Default", nameOverride: "Preferred" }),
        ],
      }),
      makeTenant(),
      "sv",
    );
    const list = out.find((o) => o["@type"] === "ItemList");
    const entries = list?.itemListElement as Array<{ name: string }>;
    expect(entries[0].name).toBe("Preferred");
  });

  it("handles exactly 20 accommodations without any warning", () => {
    const featured = Array.from({ length: MAX_ITEMLIST_MEMBERS }, (_, i) =>
      makeAccommodation({
        id: `a${i}`,
        slug: `a-${i}`,
        name: `A${i}`,
      }),
    );
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeInput({ featuredAccommodations: featured }),
      makeTenant(),
      "sv",
    );
    const list = out.find((o) => o["@type"] === "ItemList");
    expect((list?.itemListElement as unknown[]).length).toBe(20);
    // No oversize warning.
    const warns = vi
      .mocked(log)
      .mock.calls.filter(
        (c) => c[1] === "seo.structured_data.itemlist_oversized",
      );
    expect(warns).toHaveLength(0);
  });

  it("with 21 accommodations: logs itemlist_oversized AND defensively slices to 20", () => {
    const featured = Array.from({ length: 21 }, (_, i) =>
      makeAccommodation({
        id: `a${i}`,
        slug: `a-${i}`,
        name: `A${i}`,
      }),
    );
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeInput({ featuredAccommodations: featured }),
      makeTenant(),
      "sv",
      { requestId: "req_oversized" },
    );
    const list = out.find((o) => o["@type"] === "ItemList");
    expect((list?.itemListElement as unknown[]).length).toBe(20);

    const warns = vi
      .mocked(log)
      .mock.calls.filter(
        (c) => c[1] === "seo.structured_data.itemlist_oversized",
      );
    expect(warns).toHaveLength(1);
    expect(warns[0][2]).toMatchObject({
      tenantId: "tenant_test",
      resourceId: "accommodation-index:tenant_test",
      resourceType: "accommodation_index",
      received: 21,
      cap: 20,
      requestId: "req_oversized",
    });
  });

  it("BreadcrumbList has 2 levels with correct URLs (Home → Boenden)", () => {
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeInput(),
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
    ]);
  });

  it("BreadcrumbList URLs prefix the request locale on non-default locales", () => {
    const out = accommodationIndexSeoAdapter.toStructuredData(
      makeInput(),
      makeTenant(),
      "en",
    );
    const crumb = out.find((o) => o["@type"] === "BreadcrumbList");
    const items = crumb?.itemListElement as Array<{ item: string }>;
    expect(items[0].item).toBe("https://apelviken.rutgr.com/en/");
    expect(items[1].item).toBe("https://apelviken.rutgr.com/en/stays");
  });
});

// ── getSitemapEntries ────────────────────────────────────────

describe("accommodationIndexSeoAdapter.getSitemapEntries", () => {
  it("emits one bare /stays entry per locale with alternates", () => {
    const entries = accommodationIndexSeoAdapter.getSitemapEntries(
      makeInput(),
      makeTenant(),
      ["sv", "en"],
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].url).toBe("https://apelviken.rutgr.com/stays");
    expect(entries[1].url).toBe("https://apelviken.rutgr.com/en/stays");
    for (const e of entries) {
      expect(e.alternates).toHaveLength(2);
    }
  });

  it("never embeds pagination or query strings in sitemap URLs", () => {
    const entries = accommodationIndexSeoAdapter.getSitemapEntries(
      makeInput(),
      makeTenant(),
      ["sv"],
    );
    for (const entry of entries) {
      expect(entry.url).not.toContain("?");
      expect(entry.url).not.toMatch(/page/i);
    }
  });
});

// ── Lastmod stability (M7 prep) ───────────────────────────────
//
// Pre-M7 the adapter emitted `new Date()` for every Seoable
// updatedAt/publishedAt and every sitemap lastmod. That churned
// per render, broke deterministic caching, and gave crawlers a
// fresh-on-every-crawl signal regardless of actual change.
//
// The fixed semantics:
//   - toSeoable.updatedAt/publishedAt = MAX(featured.updatedAt)
//     ?? tenant.contentUpdatedAt
//   - getSitemapEntries.lastmod = MAX(featured.updatedAt)
//     ?? tenant.contentUpdatedAt
// Both are always a real Date (tenant.contentUpdatedAt is Date,
// not nullable), so the adapter never emits null lastmod.

describe("accommodationIndexSeoAdapter — lastmod stability", () => {
  it("toSeoable uses MAX(updatedAt) across featured accommodations", () => {
    const older = makeAccommodation({
      id: "a_old",
      slug: "a-old",
      updatedAt: new Date("2026-03-01T00:00:00Z"),
    });
    const newer = makeAccommodation({
      id: "a_new",
      slug: "a-new",
      updatedAt: new Date("2026-04-15T00:00:00Z"),
    });
    const seoable = accommodationIndexSeoAdapter.toSeoable(
      makeInput({ featuredAccommodations: [older, newer] }),
      makeTenant(),
    );
    expect(seoable.updatedAt.getTime()).toBe(
      new Date("2026-04-15T00:00:00Z").getTime(),
    );
    expect(seoable.publishedAt?.getTime()).toBe(
      new Date("2026-04-15T00:00:00Z").getTime(),
    );
  });

  it("toSeoable falls back to tenant.contentUpdatedAt when featured list is empty", () => {
    // Empty tenant. contentUpdatedAt is a real Date (Prisma
    // @updatedAt) — never null. No epoch-0 or `new Date()` path.
    const tenantTs = new Date("2026-02-20T12:34:56Z");
    const seoable = accommodationIndexSeoAdapter.toSeoable(
      makeInput({ featuredAccommodations: [] }),
      makeTenant({ contentUpdatedAt: tenantTs }),
    );
    expect(seoable.updatedAt.getTime()).toBe(tenantTs.getTime());
    expect(seoable.publishedAt?.getTime()).toBe(tenantTs.getTime());
  });

  it("toSeoable is deterministic across two calls with identical input", () => {
    const input = makeInput({
      featuredAccommodations: [makeAccommodation()],
    });
    const tenant = makeTenant();
    const a = accommodationIndexSeoAdapter.toSeoable(input, tenant);
    const b = accommodationIndexSeoAdapter.toSeoable(input, tenant);
    expect(a.updatedAt.getTime()).toBe(b.updatedAt.getTime());
    expect(a.publishedAt?.getTime()).toBe(b.publishedAt?.getTime());
  });

  it("getSitemapEntries lastmod uses MAX(updatedAt) across featured", () => {
    const older = makeAccommodation({
      id: "a_old",
      slug: "a-old",
      updatedAt: new Date("2026-03-01T00:00:00Z"),
    });
    const newer = makeAccommodation({
      id: "a_new",
      slug: "a-new",
      updatedAt: new Date("2026-04-15T00:00:00Z"),
    });
    const entries = accommodationIndexSeoAdapter.getSitemapEntries(
      makeInput({ featuredAccommodations: [older, newer] }),
      makeTenant(),
      ["sv", "en"],
    );
    for (const e of entries) {
      expect(e.lastmod?.getTime()).toBe(
        new Date("2026-04-15T00:00:00Z").getTime(),
      );
    }
  });

  it("getSitemapEntries lastmod falls back to tenant.contentUpdatedAt when featured list is empty", () => {
    const tenantTs = new Date("2026-02-20T12:34:56Z");
    const entries = accommodationIndexSeoAdapter.getSitemapEntries(
      makeInput({ featuredAccommodations: [] }),
      makeTenant({ contentUpdatedAt: tenantTs }),
      ["sv"],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].lastmod?.getTime()).toBe(tenantTs.getTime());
  });

  it("getSitemapEntries is deterministic across two calls with identical input", () => {
    const input = makeInput({
      featuredAccommodations: [makeAccommodation()],
    });
    const tenant = makeTenant();
    const a = accommodationIndexSeoAdapter.getSitemapEntries(
      input,
      tenant,
      ["sv"],
    );
    const b = accommodationIndexSeoAdapter.getSitemapEntries(
      input,
      tenant,
      ["sv"],
    );
    expect(a[0].lastmod?.getTime()).toBe(b[0].lastmod?.getTime());
  });
});
