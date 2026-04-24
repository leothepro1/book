/**
 * Tests for accommodations/queries.ts — the SEO sitemap fetcher
 * module. Follows the Prisma mock pattern established in
 * `seo/request-cache.test.ts`: a module-level `vi.mock` stubs the
 * Prisma client, each test injects its own `mockResolvedValue`.
 *
 * ── "isIndexable alignment" describe blocks ────────────────────
 * Load-bearing name. Search for "isIndexable alignment" before
 * changing any adapter's `isIndexable` rules — every fetcher whose
 * adapter's rules evolve needs a matching WHERE update AND a
 * matching post-fetch test update. Silent drift is the biggest
 * risk in this module.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Accommodation,
  AccommodationCategory,
} from "@prisma/client";

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    accommodation: { findMany: vi.fn(), findFirst: vi.fn() },
    accommodationCategory: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/app/_lib/db/prisma";

import {
  fetchAccommodationCategoriesForSitemap,
  fetchAccommodationsForSitemap,
  fetchFeaturedAccommodationsForSitemap,
  tenantHasActiveAccommodations,
} from "./queries";
import type { SeoTenantContext } from "../seo/types";

// ── Prisma method type aliases ──────────────────────────────

type FindManyAccommodation = typeof prisma.accommodation.findMany;
type FindFirstAccommodation = typeof prisma.accommodation.findFirst;
type FindManyAccommodationCategory =
  typeof prisma.accommodationCategory.findMany;

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
): Record<string, unknown> {
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
    accommodationType: "CABIN",
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

function categoryRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "cat_1",
    tenantId: "tenant_test",
    title: "Stugor",
    description: "Våra stugor",
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
    // Category adapter's isIndexable requires items.length > 0.
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

// Re-useable mock helpers.

function mockFindManyAccommodation(rows: ReadonlyArray<Record<string, unknown>>): void {
  vi.mocked(prisma.accommodation.findMany as FindManyAccommodation)
    .mockResolvedValue(rows as unknown as Accommodation[]);
}

function mockFindFirstAccommodation(row: Record<string, unknown> | null): void {
  vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
    .mockResolvedValue(row as unknown as Accommodation | null);
}

function mockFindManyAccommodationCategory(
  rows: ReadonlyArray<Record<string, unknown>>,
): void {
  vi.mocked(
    prisma.accommodationCategory.findMany as FindManyAccommodationCategory,
  ).mockResolvedValue(rows as unknown as AccommodationCategory[]);
}

beforeEach(() => {
  vi.mocked(prisma.accommodation.findMany as FindManyAccommodation).mockReset();
  vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation).mockReset();
  vi.mocked(
    prisma.accommodationCategory.findMany as FindManyAccommodationCategory,
  ).mockReset();
});

// ──────────────────────────────────────────────────────────────
// fetchAccommodationsForSitemap
// ──────────────────────────────────────────────────────────────

describe("fetchAccommodationsForSitemap — happy path & contract", () => {
  it("(M8 defer) returns one BuiltShardEntry per row — defaultLocale only until hreflang ships", async () => {
    mockFindManyAccommodation([accommodationRow()]);
    // Tenant has 2 active locales, but sitemap emission is capped at
    // defaultLocale until M8 lands locale-prefix routes + hreflang.
    const tenant = makeTenant({ activeLocales: ["sv", "en"] });
    const entries = await fetchAccommodationsForSitemap({
      tenant,
      limit: 50_000,
      offset: 0,
    });
    expect(entries).toHaveLength(1);
  });

  it("returns absolute URLs (https://…)", async () => {
    mockFindManyAccommodation([accommodationRow()]);
    const entries = await fetchAccommodationsForSitemap({
      tenant: makeTenant(),
      limit: 50_000,
      offset: 0,
    });
    for (const e of entries) {
      expect(e.url.startsWith("https://")).toBe(true);
    }
  });

  it("returns empty array when no rows", async () => {
    mockFindManyAccommodation([]);
    const entries = await fetchAccommodationsForSitemap({
      tenant: makeTenant(),
      limit: 50_000,
      offset: 0,
    });
    expect(entries).toEqual([]);
  });

  it("always normalizes alternates to a non-undefined array", async () => {
    mockFindManyAccommodation([accommodationRow()]);
    const entries = await fetchAccommodationsForSitemap({
      tenant: makeTenant(),
      limit: 50_000,
      offset: 0,
    });
    for (const e of entries) {
      expect(Array.isArray(e.alternates)).toBe(true);
    }
  });

  it("passes limit + offset through to Prisma as take + skip", async () => {
    mockFindManyAccommodation([]);
    await fetchAccommodationsForSitemap({
      tenant: makeTenant(),
      limit: 50_000,
      offset: 100_000,
    });
    const call = vi.mocked(
      prisma.accommodation.findMany as FindManyAccommodation,
    ).mock.calls[0][0];
    expect(call?.take).toBe(50_000);
    expect(call?.skip).toBe(100_000);
  });

  it("uses orderBy: { id: 'asc' } for deterministic pagination", async () => {
    mockFindManyAccommodation([]);
    await fetchAccommodationsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const call = vi.mocked(
      prisma.accommodation.findMany as FindManyAccommodation,
    ).mock.calls[0][0];
    expect(call?.orderBy).toEqual({ id: "asc" });
  });

  it("includes media with orderBy sortOrder asc (adapter hydration contract)", async () => {
    mockFindManyAccommodation([]);
    await fetchAccommodationsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const call = vi.mocked(
      prisma.accommodation.findMany as FindManyAccommodation,
    ).mock.calls[0][0];
    expect(call?.include).toEqual({
      media: { orderBy: { sortOrder: "asc" } },
    });
  });
});

describe("fetchAccommodationsForSitemap — tenant isolation", () => {
  it("WHERE.tenantId is sourced from args.tenant.id (not undefined, not hardcoded)", async () => {
    mockFindManyAccommodation([]);
    await fetchAccommodationsForSitemap({
      tenant: makeTenant({ id: "tenant_A" }),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(
      prisma.accommodation.findMany as FindManyAccommodation,
    ).mock.calls[0][0]?.where;
    expect(whereArg).toBeDefined();
    expect((whereArg as { tenantId?: unknown })?.tenantId).toBe("tenant_A");
  });

  it("different tenant ids produce different WHERE values in sequential calls", async () => {
    mockFindManyAccommodation([]);
    await fetchAccommodationsForSitemap({
      tenant: makeTenant({ id: "tenant_A" }),
      limit: 1,
      offset: 0,
    });
    await fetchAccommodationsForSitemap({
      tenant: makeTenant({ id: "tenant_B" }),
      limit: 1,
      offset: 0,
    });
    const calls = vi.mocked(
      prisma.accommodation.findMany as FindManyAccommodation,
    ).mock.calls;
    expect((calls[0][0]?.where as { tenantId?: unknown })?.tenantId).toBe(
      "tenant_A",
    );
    expect((calls[1][0]?.where as { tenantId?: unknown })?.tenantId).toBe(
      "tenant_B",
    );
  });
});

describe("fetchAccommodationsForSitemap — isIndexable alignment", () => {
  // Load-bearing describe name. Before changing
  // `accommodationSeoAdapter.isIndexable`, grep for this block and
  // update every matching fetcher WHERE / post-filter assertion.

  it("WHERE includes status: 'ACTIVE' (matches isIndexable status check)", async () => {
    mockFindManyAccommodation([]);
    await fetchAccommodationsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(
      prisma.accommodation.findMany as FindManyAccommodation,
    ).mock.calls[0][0]?.where;
    expect((whereArg as { status?: unknown })?.status).toBe("ACTIVE");
  });

  it("WHERE includes archivedAt: null (matches isIndexable archivedAt check)", async () => {
    mockFindManyAccommodation([]);
    await fetchAccommodationsForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(
      prisma.accommodation.findMany as FindManyAccommodation,
    ).mock.calls[0][0]?.where;
    expect((whereArg as { archivedAt?: unknown })?.archivedAt).toBeNull();
  });

  it("post-fetch filters out rows with seo.noindex=true (JSON override not in WHERE)", async () => {
    // Two rows: one with seo.noindex=true (must be dropped), one normal.
    mockFindManyAccommodation([
      accommodationRow({
        id: "acc_noindex",
        slug: "noindex-slug",
        seo: { noindex: true },
      }),
      accommodationRow({ id: "acc_ok", slug: "ok-slug" }),
    ]);
    const tenant = makeTenant({ activeLocales: ["sv"] });
    const entries = await fetchAccommodationsForSitemap({
      tenant,
      limit: 50_000,
      offset: 0,
    });
    // Only the ok row's URL is present.
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toContain("ok-slug");
    expect(entries.some((e) => e.url.includes("noindex-slug"))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// fetchAccommodationCategoriesForSitemap
// ──────────────────────────────────────────────────────────────

describe("fetchAccommodationCategoriesForSitemap — happy path & contract", () => {
  it("(M8 defer) returns one BuiltShardEntry per indexable category — defaultLocale only until hreflang ships", async () => {
    mockFindManyAccommodationCategory([categoryRow()]);
    const tenant = makeTenant({ activeLocales: ["sv", "en"] });
    const entries = await fetchAccommodationCategoriesForSitemap({
      tenant,
      limit: 50_000,
      offset: 0,
    });
    expect(entries).toHaveLength(1);
    for (const e of entries) expect(e.url).toContain("/stays/categories/");
  });

  it("empty category (items.length === 0) is dropped by isIndexable", async () => {
    mockFindManyAccommodationCategory([categoryRow({ items: [] })]);
    const entries = await fetchAccommodationCategoriesForSitemap({
      tenant: makeTenant(),
      limit: 50_000,
      offset: 0,
    });
    expect(entries).toEqual([]);
  });

  it("uses orderBy id asc", async () => {
    mockFindManyAccommodationCategory([]);
    await fetchAccommodationCategoriesForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const call = vi.mocked(
      prisma.accommodationCategory.findMany as FindManyAccommodationCategory,
    ).mock.calls[0][0];
    expect(call?.orderBy).toEqual({ id: "asc" });
  });

  it("honors limit + offset via take + skip", async () => {
    mockFindManyAccommodationCategory([]);
    await fetchAccommodationCategoriesForSitemap({
      tenant: makeTenant(),
      limit: 100,
      offset: 50,
    });
    const call = vi.mocked(
      prisma.accommodationCategory.findMany as FindManyAccommodationCategory,
    ).mock.calls[0][0];
    expect(call?.take).toBe(100);
    expect(call?.skip).toBe(50);
  });

  it("include structure includes items (reuses categorySeoInclude fragment)", async () => {
    // The adapter's categorySeoInclude returns { items: { where, orderBy,
    // take, include } } — the fetcher passes it as the whole include.
    mockFindManyAccommodationCategory([]);
    await fetchAccommodationCategoriesForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const call = vi.mocked(
      prisma.accommodationCategory.findMany as FindManyAccommodationCategory,
    ).mock.calls[0][0];
    const include = call?.include as { items?: unknown } | undefined;
    expect(include?.items).toBeDefined();
  });
});

describe("fetchAccommodationCategoriesForSitemap — tenant isolation", () => {
  it("WHERE.tenantId === args.tenant.id", async () => {
    mockFindManyAccommodationCategory([]);
    await fetchAccommodationCategoriesForSitemap({
      tenant: makeTenant({ id: "tenant_X" }),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(
      prisma.accommodationCategory.findMany as FindManyAccommodationCategory,
    ).mock.calls[0][0]?.where;
    expect((whereArg as { tenantId?: unknown })?.tenantId).toBe("tenant_X");
  });
});

describe("fetchAccommodationCategoriesForSitemap — isIndexable alignment", () => {
  // Load-bearing describe name. Category adapter's isIndexable rules:
  //   status === 'ACTIVE'  — SQL-expressible
  //   !seoOverrides.noindex  — JSON, post-fetch filter
  //   items.length > 0  — hydrated items, post-fetch filter

  it("WHERE includes status: 'ACTIVE' (matches isIndexable status check)", async () => {
    mockFindManyAccommodationCategory([]);
    await fetchAccommodationCategoriesForSitemap({
      tenant: makeTenant(),
      limit: 1,
      offset: 0,
    });
    const whereArg = vi.mocked(
      prisma.accommodationCategory.findMany as FindManyAccommodationCategory,
    ).mock.calls[0][0]?.where;
    expect((whereArg as { status?: unknown })?.status).toBe("ACTIVE");
  });

  it("post-fetch drops rows with seo.noindex=true (JSON override)", async () => {
    mockFindManyAccommodationCategory([
      categoryRow({ seo: { noindex: true }, slug: "hidden-cat" }),
      categoryRow({ id: "cat_ok", slug: "visible-cat" }),
    ]);
    const entries = await fetchAccommodationCategoriesForSitemap({
      tenant: makeTenant({ activeLocales: ["sv"] }),
      limit: 50_000,
      offset: 0,
    });
    // Only the non-noindex category's URL is present.
    expect(entries.some((e) => e.url.includes("hidden-cat"))).toBe(false);
    expect(entries.some((e) => e.url.includes("visible-cat"))).toBe(true);
  });

  it("post-fetch drops empty categories (items.length === 0)", async () => {
    mockFindManyAccommodationCategory([
      categoryRow({ items: [] }), // empty — must drop
      categoryRow({ id: "cat_populated", slug: "populated-cat" }),
    ]);
    const entries = await fetchAccommodationCategoriesForSitemap({
      tenant: makeTenant({ activeLocales: ["sv"] }),
      limit: 50_000,
      offset: 0,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toContain("populated-cat");
  });
});

// ──────────────────────────────────────────────────────────────
// tenantHasActiveAccommodations
// ──────────────────────────────────────────────────────────────

describe("tenantHasActiveAccommodations", () => {
  it("returns true when findFirst returns a row", async () => {
    mockFindFirstAccommodation(accommodationRow());
    expect(await tenantHasActiveAccommodations("tenant_X")).toBe(true);
  });

  it("returns false when findFirst returns null", async () => {
    mockFindFirstAccommodation(null);
    expect(await tenantHasActiveAccommodations("tenant_X")).toBe(false);
  });

  it("WHERE scopes to tenantId + status=ACTIVE + archivedAt=null", async () => {
    mockFindFirstAccommodation(null);
    await tenantHasActiveAccommodations("tenant_Y");
    const call = vi.mocked(
      prisma.accommodation.findFirst as FindFirstAccommodation,
    ).mock.calls[0][0];
    const where = call?.where as {
      tenantId?: unknown;
      status?: unknown;
      archivedAt?: unknown;
    } | undefined;
    expect(where?.tenantId).toBe("tenant_Y");
    expect(where?.status).toBe("ACTIVE");
    expect(where?.archivedAt).toBeNull();
  });

  it("select narrows to id only (fast indexed lookup, no row hydration)", async () => {
    mockFindFirstAccommodation(null);
    await tenantHasActiveAccommodations("tenant_Z");
    const call = vi.mocked(
      prisma.accommodation.findFirst as FindFirstAccommodation,
    ).mock.calls[0][0];
    expect(call?.select).toEqual({ id: true });
  });
});

// ──────────────────────────────────────────────────────────────
// fetchFeaturedAccommodationsForSitemap
// ──────────────────────────────────────────────────────────────

describe("fetchFeaturedAccommodationsForSitemap", () => {
  it("returns a 1-element array when findFirst returns a row", async () => {
    mockFindFirstAccommodation(accommodationRow({ id: "acc_latest" }));
    const result = await fetchFeaturedAccommodationsForSitemap("tenant_X");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("acc_latest");
  });

  it("returns [] when findFirst returns null", async () => {
    mockFindFirstAccommodation(null);
    expect(await fetchFeaturedAccommodationsForSitemap("tenant_X")).toEqual([]);
  });

  it("orderBy updatedAt desc + WHERE matches active non-archived + tenant scope", async () => {
    mockFindFirstAccommodation(null);
    await fetchFeaturedAccommodationsForSitemap("tenant_Q");
    const call = vi.mocked(
      prisma.accommodation.findFirst as FindFirstAccommodation,
    ).mock.calls[0][0];
    expect(call?.orderBy).toEqual({ updatedAt: "desc" });
    const where = call?.where as {
      tenantId?: unknown;
      status?: unknown;
      archivedAt?: unknown;
    } | undefined;
    expect(where?.tenantId).toBe("tenant_Q");
    expect(where?.status).toBe("ACTIVE");
    expect(where?.archivedAt).toBeNull();
  });

  it("includes media (adapter input shape requires AccommodationWithMedia)", async () => {
    mockFindFirstAccommodation(null);
    await fetchFeaturedAccommodationsForSitemap("tenant_M");
    const call = vi.mocked(
      prisma.accommodation.findFirst as FindFirstAccommodation,
    ).mock.calls[0][0];
    expect(call?.include).toEqual({
      media: { orderBy: { sortOrder: "asc" } },
    });
  });
});
