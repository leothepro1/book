import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/prisma", () => ({
  prisma: {
    accommodation: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    tenantLocale: { findMany: vi.fn() },
    pageTypeSeoDefault: { findUnique: vi.fn() },
    mediaAsset: { findFirst: vi.fn() },
  },
}));

vi.mock("../logger", () => ({ log: vi.fn() }));

import type { Accommodation, Tenant, TenantLocale } from "@prisma/client";

import { prisma } from "../db/prisma";

import {
  _clearSeoAdaptersForTests,
} from "./adapters/base";
import { _resetSeoBootstrapForTests } from "./bootstrap";
import {
  getAccommodationForSeo,
  resolveSeoForRequest,
} from "./request-cache";

// ── Fixtures ──────────────────────────────────────────────────

type FindFirstAccommodation = typeof prisma.accommodation.findFirst;
type FindUniqueTenant = typeof prisma.tenant.findUnique;
type FindManyLocale = typeof prisma.tenantLocale.findMany;
type FindUniquePtd = typeof prisma.pageTypeSeoDefault.findUnique;

function accommodationRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "acc_1",
    tenantId: "tenant_t",
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

function tenantRow(): Tenant {
  return {
    id: "tenant_t",
    clerkOrgId: "org_1",
    name: "Apelviken",
    slug: "apelviken",
    portalSlug: "apelviken-x",
    ownerClerkUserId: null,
    settings: null,
    seoDefaults: null,
    draftSettings: null,
    draftUpdatedAt: null,
    draftUpdatedBy: null,
    settingsVersion: 0,
    previousSettings: null,
    legalName: null,
    businessType: null,
    nickname: null,
    phone: null,
    addressStreet: null,
    addressPostalCode: null,
    addressCity: null,
    addressCountry: null,
    organizationNumber: null,
    vatNumber: null,
    emailFrom: null,
    emailFromName: null,
    pendingEmailFrom: null,
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    emailVerificationSentTo: null,
    emailLogoUrl: null,
    emailLogoWidth: null,
    emailAccentColor: null,
    orderNumberPrefix: "",
    orderNumberSuffix: "",
    checkinEnabled: false,
    checkoutEnabled: false,
    earlyCheckinEnabled: false,
    earlyCheckinDays: 0,
    screenshotDesktopUrl: null,
    screenshotMobileUrl: null,
    screenshotHash: null,
    screenshotUpdatedAt: null,
    screenshotPending: false,
    stripeAccountId: null,
    stripeOnboardingComplete: false,
    stripeLivemode: false,
    stripeConnectedAt: null,
    paymentMethodConfig: null,
    subscriptionPlan: "BASIC",
    platformFeeBps: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    discountsEnabled: true,
    showLoginLinks: true,
  };
}

function localeRow(
  locale: string,
  overrides: Partial<TenantLocale> = {},
): TenantLocale {
  return {
    id: `loc_${locale}`,
    tenantId: "tenant_t",
    locale,
    published: true,
    primary: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Common setup ─────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation).mockReset();
  vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockReset();
  vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockReset();
  vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd).mockReset();
  _clearSeoAdaptersForTests();
  _resetSeoBootstrapForTests();
});

// ── getAccommodationForSeo ────────────────────────────────────

describe("getAccommodationForSeo", () => {
  it("queries by slug with tenant scope, archivedAt null, status ACTIVE", async () => {
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValueOnce(accommodationRow() as unknown as Accommodation);

    await getAccommodationForSeo("tenant_t", "stuga-bjork-unique-1");

    expect(prisma.accommodation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant_t",
          slug: "stuga-bjork-unique-1",
          archivedAt: null,
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("falls back to externalId lookup when slug lookup misses", async () => {
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(accommodationRow() as unknown as Accommodation);

    const result = await getAccommodationForSeo("tenant_t", "ext-1234");

    expect(prisma.accommodation.findFirst).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
    const secondCall = vi.mocked(prisma.accommodation.findFirst).mock.calls[1][0];
    expect(secondCall).toMatchObject({
      where: { tenantId: "tenant_t", externalId: "ext-1234" },
    });
  });

  it("returns null when neither slug nor externalId matches", async () => {
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const r = await getAccommodationForSeo("tenant_t", "nobody-unique-2");
    expect(r).toBeNull();
  });

  it("repeat calls for the same (tenantId, slug) return structurally identical results", async () => {
    // Note on dedup: React's `cache()` only memoizes within an active
    // server render context (AsyncLocalStorage-backed). Outside of that
    // — e.g., in plain vitest calls — each call re-invokes the wrapped
    // function. We therefore test behavioural correctness here and rely
    // on the manual verification checklist ("one SQL query per request
    // in the server logs") to confirm real-render dedup.
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(accommodationRow() as unknown as Accommodation);

    const a = await getAccommodationForSeo("tenant_t", "dedup-corr-1");
    const b = await getAccommodationForSeo("tenant_t", "dedup-corr-1");
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });
});

// ── resolveSeoForRequest ─────────────────────────────────────

describe("resolveSeoForRequest", () => {
  it("returns null when tenant does not exist", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      null,
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [],
    );
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValueOnce(accommodationRow() as unknown as Accommodation);

    const r = await resolveSeoForRequest(
      "ghost-tenant",
      "anything",
      "sv",
      "accommodation",
    );
    expect(r).toBeNull();
  });

  it("returns null when accommodation does not exist", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(null);
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "no-such-slug",
      "sv",
      "accommodation",
    );
    expect(r).toBeNull();
  });

  it("resolves accommodation SEO end-to-end with full tenant + locale data", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true }), localeRow("en")],
    );
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(accommodationRow() as unknown as Accommodation);
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "stuga-bjork-e2e",
      "sv",
      "accommodation",
    );
    expect(r).not.toBeNull();
    expect(r?.title).toContain("Stuga Björk");
    expect(r?.canonicalUrl).toBe(
      "https://apelviken-x.rutgr.com/stays/stuga-bjork",
    );
    // Two locales + x-default
    expect(r?.hreflang).toHaveLength(3);
  });

  it("repeat end-to-end calls return structurally identical ResolvedSeo", async () => {
    // See dedup note on `getAccommodationForSeo` above. The React
    // cache() guarantee applies only inside a real render; here we
    // assert that the pipeline is deterministic for the same inputs.
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.accommodation.findFirst as FindFirstAccommodation)
      .mockResolvedValue(accommodationRow() as unknown as Accommodation);
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const a = await resolveSeoForRequest(
      "tenant_t",
      "dedup-rfr",
      "sv",
      "accommodation",
    );
    const b = await resolveSeoForRequest(
      "tenant_t",
      "dedup-rfr",
      "sv",
      "accommodation",
    );
    expect(a).toEqual(b);
  });

  it("throws for resource types not yet wired (future-milestone stub)", async () => {
    await expect(
      resolveSeoForRequest("tenant_t", "x", "sv", "product"),
    ).rejects.toThrow(/not wired in request-cache/);
  });

  // ── M5: homepage resourceType ──────────────────────────────

  it("resolves homepage SEO without a slug", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      tenantRow(),
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [localeRow("sv", { primary: true })],
    );
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUniquePtd)
      .mockResolvedValue(null);

    const r = await resolveSeoForRequest(
      "tenant_t",
      "",
      "sv",
      "homepage",
    );

    expect(r).not.toBeNull();
    // Title === siteName (no duplication via titleTemplate).
    expect(r?.title).toBe("Apelviken");
    expect(r?.canonicalUrl).toBe("https://apelviken-x.rutgr.com/");
    // Accommodation.findFirst must NOT have been called — homepage
    // path has no per-entity fetch.
    expect(prisma.accommodation.findFirst).not.toHaveBeenCalled();
  });

  it("homepage resolution returns null when tenant doesn't exist", async () => {
    vi.mocked(prisma.tenant.findUnique as FindUniqueTenant).mockResolvedValue(
      null,
    );
    vi.mocked(prisma.tenantLocale.findMany as FindManyLocale).mockResolvedValue(
      [],
    );

    const r = await resolveSeoForRequest(
      "ghost-tenant",
      "",
      "sv",
      "homepage",
    );
    expect(r).toBeNull();
  });
});
