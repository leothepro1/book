/**
 * Tests for route-helpers.ts — shared sitemap route concerns.
 *
 * Three export surfaces: resolveSeoContextForSitemapRoute,
 * xmlSitemapResponse, handleSitemapError. Each has its own
 * describe block.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Tenant, TenantLocale } from "@prisma/client";

vi.mock("@/app/(guest)/_lib/tenant/resolveTenantFromHost", () => ({
  resolveTenantFromHost: vi.fn(),
}));

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenantLocale: { findMany: vi.fn() },
  },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { SitemapAggregationError } from "@/app/_lib/seo/sitemap/aggregator";

import {
  handleSitemapError,
  resolveSeoContextForSitemapRoute,
  xmlSitemapResponse,
} from "./route-helpers";

// ── Prisma method aliases ───────────────────────────────────

type FindManyTenantLocale = typeof prisma.tenantLocale.findMany;

// ── Fixtures ────────────────────────────────────────────────

function tenantRow(overrides: Partial<Tenant> = {}): Tenant {
  const base: Tenant = {
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
  return { ...base, ...overrides };
}

function localeRow(overrides: Partial<TenantLocale> = {}): TenantLocale {
  return {
    id: "loc_1",
    tenantId: "tenant_t",
    locale: "sv",
    published: true,
    primary: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(resolveTenantFromHost).mockReset();
  vi.mocked(prisma.tenantLocale.findMany as FindManyTenantLocale).mockReset();
  vi.mocked(log).mockReset();
});

// ──────────────────────────────────────────────────────────────
// resolveSeoContextForSitemapRoute
// ──────────────────────────────────────────────────────────────

describe("resolveSeoContextForSitemapRoute", () => {
  it("returns a SeoTenantContext when tenant + locales resolve", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(tenantRow());
    vi.mocked(
      prisma.tenantLocale.findMany as FindManyTenantLocale,
    ).mockResolvedValue([localeRow()]);
    const ctx = await resolveSeoContextForSitemapRoute();
    expect(ctx).not.toBeNull();
    expect(ctx?.id).toBe("tenant_t");
    expect(ctx?.primaryDomain).toBe("apelviken-x.rutgr.com");
    expect(ctx?.activeLocales).toEqual(["sv"]);
    expect(ctx?.contentUpdatedAt.getTime()).toBe(
      new Date("2026-04-01T00:00:00Z").getTime(),
    );
  });

  it("returns null when resolveTenantFromHost returns null", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(null);
    const ctx = await resolveSeoContextForSitemapRoute();
    expect(ctx).toBeNull();
  });

  it("short-circuits Prisma lookup when tenant is unresolved", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(null);
    await resolveSeoContextForSitemapRoute();
    expect(prisma.tenantLocale.findMany).not.toHaveBeenCalled();
  });

  it("logs 'seo.sitemap.no_active_locales' warn when locales array is empty", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(tenantRow());
    vi.mocked(
      prisma.tenantLocale.findMany as FindManyTenantLocale,
    ).mockResolvedValue([]);
    await resolveSeoContextForSitemapRoute();
    expect(log).toHaveBeenCalledWith(
      "warn",
      "seo.sitemap.no_active_locales",
      { tenantId: "tenant_t" },
    );
  });

  it("still returns a usable context when zero locales (tenantToSeoContext fallback)", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(tenantRow());
    vi.mocked(
      prisma.tenantLocale.findMany as FindManyTenantLocale,
    ).mockResolvedValue([]);
    const ctx = await resolveSeoContextForSitemapRoute();
    expect(ctx).not.toBeNull();
    // defaultLocale falls back to PRIMARY_LOCALE ("sv"); activeLocales
    // contains just that one entry so hreflang still emits something.
    expect(ctx?.defaultLocale).toBe("sv");
    expect(ctx?.activeLocales).toEqual(["sv"]);
  });

  it("does NOT log no_active_locales when locales are populated", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(tenantRow());
    vi.mocked(
      prisma.tenantLocale.findMany as FindManyTenantLocale,
    ).mockResolvedValue([localeRow()]);
    await resolveSeoContextForSitemapRoute();
    expect(log).not.toHaveBeenCalledWith(
      "warn",
      "seo.sitemap.no_active_locales",
      expect.anything(),
    );
  });

  it("scopes the locale query to the resolved tenant id", async () => {
    vi.mocked(resolveTenantFromHost).mockResolvedValue(
      tenantRow({ id: "tenant_X" }),
    );
    vi.mocked(
      prisma.tenantLocale.findMany as FindManyTenantLocale,
    ).mockResolvedValue([]);
    await resolveSeoContextForSitemapRoute();
    const call = vi.mocked(
      prisma.tenantLocale.findMany as FindManyTenantLocale,
    ).mock.calls[0][0];
    expect((call?.where as { tenantId?: unknown })?.tenantId).toBe("tenant_X");
  });
});

// ──────────────────────────────────────────────────────────────
// xmlSitemapResponse
// ──────────────────────────────────────────────────────────────

describe("xmlSitemapResponse", () => {
  it("200: application/xml content-type and edge-cache Cache-Control", () => {
    const res = xmlSitemapResponse("<sitemapindex/>", 200);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    );
    expect(res.headers.get("retry-after")).toBeNull();
  });

  it("404: no-store cache-control and no retry-after", () => {
    const res = xmlSitemapResponse("", 404);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("retry-after")).toBeNull();
  });

  it("503: no-store cache-control + Retry-After: 60", () => {
    const res = xmlSitemapResponse("", 503);
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("includes body text verbatim", async () => {
    const body = `<?xml version="1.0"?>\n<x/>`;
    const res = xmlSitemapResponse(body, 200);
    expect(await res.text()).toBe(body);
  });
});

// ──────────────────────────────────────────────────────────────
// handleSitemapError
// ──────────────────────────────────────────────────────────────

describe("handleSitemapError", () => {
  it("SitemapAggregationError → logs 'seo.sitemap.aggregation_failed' with full context", () => {
    const cause = new Error("db connection lost");
    const err = new SitemapAggregationError(
      "products",
      3,
      "tenant_err",
      cause,
    );
    const res = handleSitemapError(err, "tenant_err", "products", 3);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(log).toHaveBeenCalledWith(
      "error",
      "seo.sitemap.aggregation_failed",
      {
        tenantId: "tenant_err",
        resourceType: "products",
        shardIndex: 3,
        cause: String(cause),
      },
    );
  });

  it("generic Error → logs 'seo.sitemap.route_error' with caller context", () => {
    const err = new Error("something else");
    const res = handleSitemapError(err, "tenant_g", "index");
    expect(res.status).toBe(503);
    expect(log).toHaveBeenCalledWith("error", "seo.sitemap.route_error", {
      tenantId: "tenant_g",
      resourceType: "index",
      shardIndex: null,
      error: String(err),
    });
  });

  it("includes shardIndex in route_error context when supplied", () => {
    const err = new Error("boom");
    handleSitemapError(err, "tenant_s", "accommodations", 2);
    expect(log).toHaveBeenCalledWith("error", "seo.sitemap.route_error", {
      tenantId: "tenant_s",
      resourceType: "accommodations",
      shardIndex: 2,
      error: String(err),
    });
  });

  it("non-Error thrown value serializes via String() without crashing", () => {
    const thrown: unknown = { weird: "shape" };
    const res = handleSitemapError(thrown, "tenant_x", "index");
    expect(res.status).toBe(503);
    // Object serialization via String() → "[object Object]".
    const call = vi.mocked(log).mock.calls.find(
      (c) => c[1] === "seo.sitemap.route_error",
    );
    expect(call?.[2]?.error).toBe("[object Object]");
  });

  it("always returns a 503 NextResponse (both error paths)", () => {
    expect(
      handleSitemapError(new Error("a"), "t", "index").status,
    ).toBe(503);
    expect(
      handleSitemapError(
        new SitemapAggregationError("pages", 1, "t", new Error("b")),
        "t",
        "pages",
        1,
      ).status,
    ).toBe(503);
  });
});

// ──────────────────────────────────────────────────────────────
// textRobotsResponse
// ──────────────────────────────────────────────────────────────

import {
  handleRobotsError,
  textRobotsResponse,
} from "./route-helpers";

describe("textRobotsResponse", () => {
  it("edge cacheMode: 200, text/plain, s-maxage=3600 SWR=86400", () => {
    const res = textRobotsResponse("User-agent: *\nAllow: /\n", "edge");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    );
  });

  it("no-store cacheMode: 200, text/plain, Cache-Control no-store", () => {
    const res = textRobotsResponse("User-agent: *\nDisallow: /\n", "no-store");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns body text verbatim", async () => {
    const body = "User-agent: *\nDisallow: /admin\n";
    const res = textRobotsResponse(body, "edge");
    expect(await res.text()).toBe(body);
  });

  it("never 404/503 — status is always 200", () => {
    expect(textRobotsResponse("", "edge").status).toBe(200);
    expect(textRobotsResponse("", "no-store").status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// handleRobotsError
// ──────────────────────────────────────────────────────────────

describe("handleRobotsError", () => {
  it("returns 200 (NEVER 503) so crawlers don't crawl-everything-for-24h", () => {
    const res = handleRobotsError(new Error("boom"), "tenant_err");
    expect(res.status).toBe(200);
  });

  it("body is exactly 'User-agent: *\\nDisallow: /\\n' (fail-safe)", async () => {
    const res = handleRobotsError(new Error("boom"), null);
    expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
  });

  it("Cache-Control: no-store (transient fail-safe must not stick in edge)", () => {
    const res = handleRobotsError(new Error("boom"), "tenant_err");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("logs seo.robots.route_error with tenantId + error string", () => {
    const err = new Error("db gone");
    handleRobotsError(err, "tenant_x");
    expect(log).toHaveBeenCalledWith("error", "seo.robots.route_error", {
      tenantId: "tenant_x",
      error: String(err),
    });
  });

  it("passes tenantId: null through to the log context", () => {
    handleRobotsError(new Error("pre-resolve fail"), null);
    expect(log).toHaveBeenCalledWith("error", "seo.robots.route_error", {
      tenantId: null,
      error: String(new Error("pre-resolve fail")),
    });
  });

  it("non-Error thrown value serializes via String() without crashing", () => {
    const thrown: unknown = { weird: "shape" };
    const res = handleRobotsError(thrown, "tenant_x");
    expect(res.status).toBe(200);
    const call = vi
      .mocked(log)
      .mock.calls.find((c) => c[1] === "seo.robots.route_error");
    expect(call?.[2]?.error).toBe("[object Object]");
  });
});
