import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../logger", () => ({ log: vi.fn() }));

import type { AccommodationMedia, AccommodationType } from "@prisma/client";

import {
  type AccommodationWithMedia,
  accommodationSeoAdapter,
} from "./accommodation";
import type { SeoTenantContext } from "../types";
import { log } from "../../logger";

// ── Fixtures ──────────────────────────────────────────────────

function makeTenant(overrides: Partial<SeoTenantContext> = {}): SeoTenantContext {
  return {
    id: "tenant_test",
    siteName: "Apelviken",
    primaryDomain: "apelviken.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}" },
    activeLocales: ["sv", "en"],
    ...overrides,
  };
}

function makeMedia(overrides: Partial<AccommodationMedia> = {}): AccommodationMedia {
  return {
    id: "media_1",
    accommodationId: "acc_1",
    url: "https://cdn.example/image.jpg",
    altText: "A cosy cabin",
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
    description: "A cosy cabin by the sea",
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
    basePricePerNight: 120000, // 1200.00 SEK
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

// ── toSeoable ────────────────────────────────────────────────

describe("accommodationSeoAdapter.toSeoable", () => {
  it("maps the basic accommodation fields into Seoable shape", () => {
    const seoable = accommodationSeoAdapter.toSeoable(
      makeAccommodation(),
      makeTenant(),
    );
    expect(seoable).toMatchObject({
      resourceType: "accommodation",
      id: "acc_1",
      tenantId: "tenant_test",
      path: "/accommodations/stuga-bjork",
      title: "Stuga Björk",
      description: "A cosy cabin by the sea",
      featuredImageId: null,
      seoOverrides: null,
      locale: "sv",
    });
  });

  it("prefers nameOverride over name", () => {
    const seoable = accommodationSeoAdapter.toSeoable(
      makeAccommodation({ nameOverride: "Custom Label" }),
      makeTenant(),
    );
    expect(seoable.title).toBe("Custom Label");
  });

  it("prefers descriptionOverride over description", () => {
    const seoable = accommodationSeoAdapter.toSeoable(
      makeAccommodation({ descriptionOverride: "Override desc" }),
      makeTenant(),
    );
    expect(seoable.description).toBe("Override desc");
  });

  it("strips HTML from description", () => {
    const seoable = accommodationSeoAdapter.toSeoable(
      makeAccommodation({
        description: "<p>Cosy <strong>cabin</strong></p>",
      }),
      makeTenant(),
    );
    expect(seoable.description).toBe("Cosy cabin");
  });

  it("returns null description when stripped result is empty", () => {
    const seoable = accommodationSeoAdapter.toSeoable(
      makeAccommodation({ description: "" }),
      makeTenant(),
    );
    expect(seoable.description).toBeNull();
  });

  it("synthesizes publishedAt from ACTIVE + not-archived", () => {
    const a = accommodationSeoAdapter.toSeoable(
      makeAccommodation({ status: "ACTIVE", archivedAt: null }),
      makeTenant(),
    );
    expect(a.publishedAt).toEqual(new Date("2026-04-01T00:00:00Z"));

    const b = accommodationSeoAdapter.toSeoable(
      makeAccommodation({ status: "INACTIVE" }),
      makeTenant(),
    );
    expect(b.publishedAt).toBeNull();

    const c = accommodationSeoAdapter.toSeoable(
      makeAccommodation({
        status: "ACTIVE",
        archivedAt: new Date("2026-04-02"),
      }),
      makeTenant(),
    );
    expect(c.publishedAt).toBeNull();
  });

  it("parses the seo JSONB into seoOverrides", () => {
    const seoable = accommodationSeoAdapter.toSeoable(
      makeAccommodation({
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
    const seoable = accommodationSeoAdapter.toSeoable(
      makeAccommodation({ seo: { garbage: true } }),
      makeTenant(),
    );
    expect(seoable.seoOverrides).toBeNull();
  });
});

// ── getAdapterOgImage ─────────────────────────────────────────

describe("accommodationSeoAdapter.getAdapterOgImage", () => {
  it("returns null when no media", () => {
    const img = accommodationSeoAdapter.getAdapterOgImage?.(
      makeAccommodation({ media: [] }),
      makeTenant(),
    );
    expect(img).toBeNull();
  });

  it("returns the first media entry as a ResolvedImage", () => {
    const img = accommodationSeoAdapter.getAdapterOgImage?.(
      makeAccommodation({ media: [makeMedia()] }),
      makeTenant(),
    );
    expect(img).toEqual({
      url: "https://cdn.example/image.jpg",
      width: 1200,
      height: 630,
      alt: "A cosy cabin",
    });
  });

  it("falls back to accommodation name when media altText is null", () => {
    const img = accommodationSeoAdapter.getAdapterOgImage?.(
      makeAccommodation({ media: [makeMedia({ altText: null })] }),
      makeTenant(),
    );
    expect(img?.alt).toBe("Stuga Björk");
  });
});

// ── isIndexable ──────────────────────────────────────────────

describe("accommodationSeoAdapter.isIndexable", () => {
  it("returns true for ACTIVE + not archived + no noindex", () => {
    expect(
      accommodationSeoAdapter.isIndexable(makeAccommodation()),
    ).toBe(true);
  });

  it("returns false for INACTIVE", () => {
    expect(
      accommodationSeoAdapter.isIndexable(
        makeAccommodation({ status: "INACTIVE" }),
      ),
    ).toBe(false);
  });

  it("returns false for ARCHIVED", () => {
    expect(
      accommodationSeoAdapter.isIndexable(
        makeAccommodation({ status: "ARCHIVED" }),
      ),
    ).toBe(false);
  });

  it("returns false when archivedAt is set", () => {
    expect(
      accommodationSeoAdapter.isIndexable(
        makeAccommodation({ archivedAt: new Date() }),
      ),
    ).toBe(false);
  });

  it("returns false when seoOverrides.noindex is true", () => {
    expect(
      accommodationSeoAdapter.isIndexable(
        makeAccommodation({ seo: { noindex: true } }),
      ),
    ).toBe(false);
  });
});

// ── toStructuredData ─────────────────────────────────────────

describe("accommodationSeoAdapter.toStructuredData", () => {
  beforeEach(() => vi.mocked(log).mockClear());

  it("emits Hotel schema for HOTEL type", () => {
    const [base] = accommodationSeoAdapter.toStructuredData(
      makeAccommodation({ accommodationType: "HOTEL" as AccommodationType }),
      makeTenant(),
      "sv",
    );
    expect(base["@type"]).toBe("Hotel");
    expect(base["@context"]).toBe("https://schema.org");
  });

  it("emits Apartment schema for APARTMENT type", () => {
    const [base] = accommodationSeoAdapter.toStructuredData(
      makeAccommodation({ accommodationType: "APARTMENT" as AccommodationType }),
      makeTenant(),
      "sv",
    );
    expect(base["@type"]).toBe("Apartment");
  });

  it("emits Campground schema for CAMPING and PITCH types", () => {
    const [a] = accommodationSeoAdapter.toStructuredData(
      makeAccommodation({ accommodationType: "CAMPING" as AccommodationType }),
      makeTenant(),
      "sv",
    );
    expect(a["@type"]).toBe("Campground");

    const [b] = accommodationSeoAdapter.toStructuredData(
      makeAccommodation({ accommodationType: "PITCH" as AccommodationType }),
      makeTenant(),
      "sv",
    );
    expect(b["@type"]).toBe("Campground");
  });

  it("emits generic Accommodation for CABIN (schema.org has no Cabin type)", () => {
    const [base] = accommodationSeoAdapter.toStructuredData(
      makeAccommodation({ accommodationType: "CABIN" as AccommodationType }),
      makeTenant(),
      "sv",
    );
    expect(base["@type"]).toBe("Accommodation");
  });

  it("includes occupancy, numberOfRooms, and floorSize", () => {
    const [base] = accommodationSeoAdapter.toStructuredData(
      makeAccommodation(),
      makeTenant(),
      "sv",
    );
    expect(base.occupancy).toEqual({
      "@type": "QuantitativeValue",
      maxValue: 4,
    });
    expect(base.numberOfRooms).toBe(2);
    expect(base.floorSize).toEqual({
      "@type": "QuantitativeValue",
      value: 30,
      unitCode: "MTK",
    });
  });

  it("emits a Product/Offer schema alongside the base for priced entities", () => {
    const result = accommodationSeoAdapter.toStructuredData(
      makeAccommodation(),
      makeTenant(),
      "sv",
    );
    expect(result).toHaveLength(2);
    const product = result[1];
    expect(product["@type"]).toBe("Product");
    expect(product.offers).toMatchObject({
      "@type": "Offer",
      price: "1200.00", // 120000 ören → 1200.00 SEK
      priceCurrency: "SEK",
      availability: "https://schema.org/InStock",
    });
  });

  it("skips Product/Offer when price is 0 and logs warn", () => {
    const result = accommodationSeoAdapter.toStructuredData(
      makeAccommodation({ basePricePerNight: 0 }),
      makeTenant(),
      "sv",
    );
    expect(result).toHaveLength(1); // base only, no Product
    expect(log).toHaveBeenCalledWith(
      "warn",
      "seo.structured_data.zero_price_skipped",
      expect.objectContaining({
        tenantId: "tenant_test",
        resourceId: "acc_1",
      }),
    );
  });
});

// ── getSitemapEntries ────────────────────────────────────────

describe("accommodationSeoAdapter.getSitemapEntries", () => {
  it("emits one entry per locale with alternates covering all locales", () => {
    const entries = accommodationSeoAdapter.getSitemapEntries(
      makeAccommodation(),
      makeTenant(),
      ["sv", "en"],
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].url).toBe(
      "https://apelviken.rutgr.com/accommodations/stuga-bjork",
    );
    expect(entries[1].url).toBe(
      "https://apelviken.rutgr.com/en/accommodations/stuga-bjork",
    );
    // Every entry's alternates list contains both locales.
    for (const entry of entries) {
      expect(entry.alternates).toHaveLength(2);
    }
  });
});
