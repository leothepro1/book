/**
 * Tests for pages-source.ts — the synthetic "pages" shard fetcher.
 *
 * Mocks `accommodations/queries.ts` at the module boundary. The
 * underlying Prisma queries are tested in `queries.test.ts`; here
 * we exercise the shard composition logic (always-homepage,
 * gated-accommodation-index, slicing, hasMore invariant).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccommodationMedia } from "@prisma/client";

vi.mock("../../accommodations/queries", () => ({
  tenantHasActiveAccommodations: vi.fn(),
  fetchFeaturedAccommodationsForSitemap: vi.fn(),
}));

import {
  fetchFeaturedAccommodationsForSitemap,
  tenantHasActiveAccommodations,
} from "../../accommodations/queries";
import type { AccommodationWithMedia } from "../adapters/accommodation";
import type { SeoTenantContext } from "../types";
import { fetchPagesForSitemap } from "./pages-source";
import { SHARD_SIZE } from "./types";

// ── Fixtures ────────────────────────────────────────────────

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

function accommodationRow(
  overrides: Record<string, unknown> = {},
): AccommodationWithMedia {
  const row: Record<string, unknown> = {
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
    accommodationType: "CABIN",
    status: "ACTIVE",
    nameOverride: null,
    descriptionOverride: null,
    description: "desc",
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
    updatedAt: new Date("2026-04-15T00:00:00Z"),
    media: [] as AccommodationMedia[],
    ...overrides,
  };
  return row as unknown as AccommodationWithMedia;
}

beforeEach(() => {
  vi.mocked(tenantHasActiveAccommodations).mockReset();
  vi.mocked(fetchFeaturedAccommodationsForSitemap).mockReset();
});

// ── Homepage always emitted ─────────────────────────────────

describe("fetchPagesForSitemap — homepage is always emitted", () => {
  it("emits one homepage entry per active locale when tenant has no accommodations", async () => {
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(false);
    const tenant = makeTenant({ activeLocales: ["sv", "en", "de"] });
    const entries = await fetchPagesForSitemap({
      tenant,
      limit: 50_000,
      offset: 0,
    });
    expect(entries).toHaveLength(3);
    // Every URL ends with "/" (homepage root).
    for (const e of entries) {
      expect(e.url).toMatch(/\/$/);
    }
  });

  it("does NOT call fetchFeaturedAccommodationsForSitemap when tenant has no accommodations", async () => {
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(false);
    await fetchPagesForSitemap({
      tenant: makeTenant(),
      limit: 50_000,
      offset: 0,
    });
    expect(fetchFeaturedAccommodationsForSitemap).not.toHaveBeenCalled();
  });
});

// ── Accommodation-index emission gate ──────────────────────

describe("fetchPagesForSitemap — accommodation-index is gated", () => {
  it("emits /stays entries ONLY when tenantHasActiveAccommodations returns true", async () => {
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(true);
    vi.mocked(fetchFeaturedAccommodationsForSitemap).mockResolvedValue([
      accommodationRow(),
    ]);
    const tenant = makeTenant({ activeLocales: ["sv", "en"] });
    const entries = await fetchPagesForSitemap({
      tenant,
      limit: 50_000,
      offset: 0,
    });
    // 2 homepage + 2 /stays = 4.
    expect(entries).toHaveLength(4);
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://apelviken.rutgr.com/stays");
    expect(urls).toContain("https://apelviken.rutgr.com/en/stays");
    expect(urls).toContain("https://apelviken.rutgr.com/");
    expect(urls).toContain("https://apelviken.rutgr.com/en/");
  });

  it("omits /stays entries when tenantHasActiveAccommodations returns false", async () => {
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(false);
    const tenant = makeTenant({ activeLocales: ["sv", "en"] });
    const entries = await fetchPagesForSitemap({
      tenant,
      limit: 50_000,
      offset: 0,
    });
    expect(entries.some((e) => e.url.includes("/stays"))).toBe(false);
  });

  it("passes the featured accommodation (MAX updatedAt source) to the adapter", async () => {
    const latestDate = new Date("2026-04-20T00:00:00Z");
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(true);
    vi.mocked(fetchFeaturedAccommodationsForSitemap).mockResolvedValue([
      accommodationRow({ updatedAt: latestDate }),
    ]);
    const entries = await fetchPagesForSitemap({
      tenant: makeTenant({ activeLocales: ["sv"] }),
      limit: 50_000,
      offset: 0,
    });
    const staysEntry = entries.find((e) => e.url.endsWith("/stays"));
    expect(staysEntry?.lastmod?.getTime()).toBe(latestDate.getTime());
  });

  it("falls back to tenant.contentUpdatedAt when featured list is empty", async () => {
    // Defensive race-condition path: tenantHasActive=true but fetch
    // returns [] (e.g. the one accommodation was deleted between the
    // two queries). Adapter's MAX fallback kicks in.
    const tenantTs = new Date("2026-02-20T00:00:00Z");
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(true);
    vi.mocked(fetchFeaturedAccommodationsForSitemap).mockResolvedValue([]);
    const entries = await fetchPagesForSitemap({
      tenant: makeTenant({ activeLocales: ["sv"], contentUpdatedAt: tenantTs }),
      limit: 50_000,
      offset: 0,
    });
    const staysEntry = entries.find((e) => e.url.endsWith("/stays"));
    expect(staysEntry?.lastmod?.getTime()).toBe(tenantTs.getTime());
  });
});

// ── Size invariant (hasMore always false via aggregator) ──

describe("fetchPagesForSitemap — size invariant", () => {
  it("never produces >= SHARD_SIZE entries at any realistic locale count", async () => {
    // Even 100 active locales × 2 emitters = 200 entries, far below
    // SHARD_SIZE (50,000). Aggregator uses
    // `entries.length === SHARD_SIZE` to set hasMore; guaranteed false
    // for pages.
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(true);
    vi.mocked(fetchFeaturedAccommodationsForSitemap).mockResolvedValue([
      accommodationRow(),
    ]);
    const locales = Array.from({ length: 100 }, (_, i) => `lc${i}`);
    const entries = await fetchPagesForSitemap({
      tenant: makeTenant({ activeLocales: locales }),
      limit: SHARD_SIZE,
      offset: 0,
    });
    expect(entries.length).toBeLessThan(SHARD_SIZE);
  });
});

// ── Slicing (offset + limit) ────────────────────────────────

describe("fetchPagesForSitemap — slicing", () => {
  it("honors limit by truncating the entry list", async () => {
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(true);
    vi.mocked(fetchFeaturedAccommodationsForSitemap).mockResolvedValue([
      accommodationRow(),
    ]);
    const tenant = makeTenant({ activeLocales: ["sv", "en", "de"] });
    // 3 homepage + 3 /stays = 6 synthesized; limit 2 → first 2.
    const entries = await fetchPagesForSitemap({
      tenant,
      limit: 2,
      offset: 0,
    });
    expect(entries).toHaveLength(2);
  });

  it("honors offset by skipping leading entries", async () => {
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(true);
    vi.mocked(fetchFeaturedAccommodationsForSitemap).mockResolvedValue([
      accommodationRow(),
    ]);
    const tenant = makeTenant({ activeLocales: ["sv", "en"] });
    // 2 homepage + 2 /stays = 4. offset=2, limit=2 → last two.
    const entries = await fetchPagesForSitemap({
      tenant,
      limit: 2,
      offset: 2,
    });
    expect(entries).toHaveLength(2);
    // The last two entries are both /stays variants.
    for (const e of entries) {
      expect(e.url).toContain("/stays");
    }
  });
});

// ── Determinism ──────────────────────────────────────────────

describe("fetchPagesForSitemap — determinism", () => {
  it("produces identical output across two calls with the same inputs", async () => {
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(true);
    vi.mocked(fetchFeaturedAccommodationsForSitemap).mockResolvedValue([
      accommodationRow(),
    ]);
    const tenant = makeTenant();
    const a = await fetchPagesForSitemap({ tenant, limit: 1000, offset: 0 });
    const b = await fetchPagesForSitemap({ tenant, limit: 1000, offset: 0 });
    expect(a).toEqual(b);
  });
});
