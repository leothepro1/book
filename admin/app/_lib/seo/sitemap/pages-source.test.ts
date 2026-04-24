/**
 * Tests for pages-source.ts — the synthetic "pages" shard fetcher.
 *
 * Mocks `accommodations/queries.ts` at the module boundary. The
 * underlying Prisma queries are tested in `queries.test.ts`; here
 * we exercise the shard composition logic (always-homepage,
 * gated-accommodation-index, slicing, hasMore invariant).
 *
 * ── M5-followup defers affecting this shard ─────────────────
 * 1. Homepage adapter `getSitemapEntries` is filtered to
 *    `[tenant.defaultLocale]` until hreflang + locale-prefix
 *    routes land (M8). Multi-locale tenants emit exactly one
 *    homepage entry (bare "/") rather than one per activeLocale.
 * 2. Accommodation-index adapter `getSitemapEntries` returns []
 *    unconditionally until `/stays` is rebuilt as a real index
 *    page (currently a 301 redirect to `/search`). /stays entries
 *    never appear in the pages shard under the current defer.
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
  it("(M8 defer) emits a single homepage entry at the defaultLocale root, regardless of how many activeLocales a tenant publishes", async () => {
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(false);
    const tenant = makeTenant({ activeLocales: ["sv", "en", "de"] });
    const entries = await fetchPagesForSitemap({
      tenant,
      limit: 50_000,
      offset: 0,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe("https://apelviken.rutgr.com/");
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

// ── Accommodation-index is deferred ──────────────────────────

describe("fetchPagesForSitemap — accommodation-index (DEFERRED until /stays is real index)", () => {
  // Under the defer, the accommodation-index adapter returns []
  // unconditionally — /stays URLs never reach the pages shard.
  // The tenant-has-accommodations gate still runs (and still
  // invokes fetchFeaturedAccommodationsForSitemap), but the
  // resulting list is dropped at the adapter boundary.
  it("omits /stays entries even when tenantHasActiveAccommodations returns true", async () => {
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
    expect(entries.some((e) => e.url.includes("/stays"))).toBe(false);
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
});

// ── Size invariant (hasMore always false via aggregator) ──

describe("fetchPagesForSitemap — size invariant", () => {
  it("never produces >= SHARD_SIZE entries at any realistic locale count", async () => {
    // Under the M8 defer, only the defaultLocale homepage entry
    // is emitted; the aggregator's `length === SHARD_SIZE` hasMore
    // condition is structurally unreachable for pages.
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
    // Under the defer only the single homepage entry is synthesized;
    // limit 0 truncates to [].
    const entries = await fetchPagesForSitemap({
      tenant,
      limit: 0,
      offset: 0,
    });
    expect(entries).toHaveLength(0);
  });

  it("honors offset by skipping leading entries", async () => {
    vi.mocked(tenantHasActiveAccommodations).mockResolvedValue(true);
    vi.mocked(fetchFeaturedAccommodationsForSitemap).mockResolvedValue([
      accommodationRow(),
    ]);
    const tenant = makeTenant({ activeLocales: ["sv", "en"] });
    // Only 1 entry synthesized; offset=1 → empty slice.
    const entries = await fetchPagesForSitemap({
      tenant,
      limit: 10,
      offset: 1,
    });
    expect(entries).toHaveLength(0);
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
