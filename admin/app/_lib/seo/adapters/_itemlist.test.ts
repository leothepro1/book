import { describe, expect, it } from "vitest";

import type {
  AccommodationMedia,
  AccommodationType,
} from "@prisma/client";

import type { AccommodationWithMedia } from "./accommodation";
import {
  accommodationDetailUrl,
  buildAccommodationItemList,
  resolvedAccommodationTitle,
} from "./_itemlist";
import type { SeoTenantContext } from "../types";

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
    id: "m1",
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
    name: "Stuga",
    slug: "stuga",
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

// ── resolvedAccommodationTitle ───────────────────────────────

describe("resolvedAccommodationTitle", () => {
  it("returns name when nameOverride is null", () => {
    expect(
      resolvedAccommodationTitle(
        makeAccommodation({ name: "Default", nameOverride: null }),
      ),
    ).toBe("Default");
  });

  it("prefers nameOverride when set", () => {
    expect(
      resolvedAccommodationTitle(
        makeAccommodation({ name: "Default", nameOverride: "Preferred" }),
      ),
    ).toBe("Preferred");
  });
});

// ── accommodationDetailUrl ───────────────────────────────────

describe("accommodationDetailUrl", () => {
  it("default-locale URL has no locale prefix", () => {
    expect(
      accommodationDetailUrl(
        makeAccommodation({ slug: "stuga-bjork" }),
        makeTenant(),
        "sv",
      ),
    ).toBe("https://apelviken.rutgr.com/stays/stuga-bjork");
  });

  it("non-default locale prefixes the path", () => {
    expect(
      accommodationDetailUrl(
        makeAccommodation({ slug: "stuga-bjork" }),
        makeTenant(),
        "en",
      ),
    ).toBe("https://apelviken.rutgr.com/en/stays/stuga-bjork");
  });
});

// ── buildAccommodationItemList ───────────────────────────────

describe("buildAccommodationItemList", () => {
  it("empty list still produces structurally valid ItemList (but callers decide whether to emit it)", () => {
    const list = buildAccommodationItemList([], makeTenant(), "sv");
    expect(list).toMatchObject({
      "@context": "https://schema.org",
      "@type": "ItemList",
    });
    expect(list.itemListElement).toEqual([]);
  });

  it("single-accommodation list with media has position 1, name, url, image", () => {
    const acc = makeAccommodation({
      id: "a1",
      slug: "one",
      name: "One",
      media: [makeMedia()],
    });
    const list = buildAccommodationItemList([acc], makeTenant(), "sv");
    const entries = list.itemListElement as Array<Record<string, unknown>>;
    expect(entries[0]).toMatchObject({
      "@type": "ListItem",
      position: 1,
      name: "One",
      url: "https://apelviken.rutgr.com/stays/one",
      image: "https://cdn.example/acc.jpg",
    });
  });

  it("entry without media omits the `image` key (rather than emitting null)", () => {
    const acc = makeAccommodation({
      id: "a1",
      slug: "one",
      name: "One",
      media: [],
    });
    const list = buildAccommodationItemList([acc], makeTenant(), "sv");
    const entries = list.itemListElement as Array<Record<string, unknown>>;
    expect(entries[0].image).toBeUndefined();
  });

  it("20 accommodations produce 20 1-indexed ListItem entries in order", () => {
    const accommodations = Array.from({ length: 20 }, (_, i) =>
      makeAccommodation({
        id: `a${i}`,
        slug: `a-${i}`,
        name: `A${i}`,
      }),
    );
    const list = buildAccommodationItemList(
      accommodations,
      makeTenant(),
      "sv",
    );
    const entries = list.itemListElement as Array<Record<string, unknown>>;
    expect(entries.length).toBe(20);
    expect(entries[0].position).toBe(1);
    expect(entries[19].position).toBe(20);
    expect(entries[0].name).toBe("A0");
    expect(entries[19].name).toBe("A19");
  });

  it("locale propagates to every entry url (EN locale variant)", () => {
    const accommodations = [
      makeAccommodation({ slug: "a" }),
      makeAccommodation({ slug: "b" }),
    ];
    const list = buildAccommodationItemList(
      accommodations,
      makeTenant(),
      "en",
    );
    const entries = list.itemListElement as Array<Record<string, unknown>>;
    expect(entries[0].url).toBe("https://apelviken.rutgr.com/en/stays/a");
    expect(entries[1].url).toBe("https://apelviken.rutgr.com/en/stays/b");
  });
});
