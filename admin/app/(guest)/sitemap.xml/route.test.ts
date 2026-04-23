/**
 * Tests for GET /sitemap.xml.
 *
 * Mocks:
 *   • resolveSeoContextForSitemapRoute (route-helpers)
 *   • buildSitemapIndexForTenant (aggregator)
 *   • log (logger)
 *
 * The real xmlSitemapResponse + handleSitemapError from route-helpers
 * are used (partial mock of the module).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// env is validated at module-import time by `@/app/_lib/env`. The
// route-helpers module pulls it in transitively via
// resolveTenantFromHost. Stubbing env here lets vitest import the
// real route-helpers for partial mocking without env validation
// tripping on missing test-env vars.
vi.mock("@/app/_lib/env", () => ({
  env: { DEV_ORG_ID: null },
}));

vi.mock("@/app/(guest)/_lib/sitemap/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/(guest)/_lib/sitemap/route-helpers")
  >("@/app/(guest)/_lib/sitemap/route-helpers");
  return {
    ...actual,
    resolveSeoContextForSitemapRoute: vi.fn(),
  };
});

vi.mock("@/app/_lib/seo/sitemap/aggregator", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/_lib/seo/sitemap/aggregator")
  >("@/app/_lib/seo/sitemap/aggregator");
  return {
    ...actual, // keep SitemapAggregationError class real for instanceof
    buildSitemapIndexForTenant: vi.fn(),
  };
});

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

// Prisma is imported transitively by production-registry; mock to a
// bare stub since the aggregator is mocked (fetchers never run).
vi.mock("@/app/_lib/db/prisma", () => ({ prisma: {} }));

import { resolveSeoContextForSitemapRoute } from "@/app/(guest)/_lib/sitemap/route-helpers";
import { log } from "@/app/_lib/logger";
import {
  SitemapAggregationError,
  buildSitemapIndexForTenant,
} from "@/app/_lib/seo/sitemap/aggregator";
import { expectValidSitemapIndex } from "@/app/_lib/seo/sitemap/__tests__/sitemap-validation";
import type {
  BuiltSitemapIndex,
  BuiltSitemapIndexShardRef,
} from "@/app/_lib/seo/sitemap/types";
import type { SeoTenantContext } from "@/app/_lib/seo/types";

import * as routeModule from "./route";
import { GET } from "./route";

// ── Fixtures ────────────────────────────────────────────────

function makeTenantContext(
  overrides: Partial<SeoTenantContext> = {},
): SeoTenantContext {
  return {
    id: "tenant_test",
    siteName: "Apelviken",
    primaryDomain: "apelviken.rutgr.com",
    defaultLocale: "sv",
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}" },
    activeLocales: ["sv"],
    contentUpdatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

function shardRef(
  overrides: Partial<BuiltSitemapIndexShardRef> = {},
): BuiltSitemapIndexShardRef {
  return {
    resourceType: "pages",
    shardIndex: 1,
    url: "https://apelviken.rutgr.com/sitemap_pages_1.xml",
    lastmod: new Date("2026-04-10T00:00:00Z"),
    ...overrides,
  };
}

function mockIndex(index: BuiltSitemapIndex): void {
  vi.mocked(buildSitemapIndexForTenant).mockResolvedValue(index);
}

beforeEach(() => {
  vi.mocked(resolveSeoContextForSitemapRoute).mockReset();
  vi.mocked(buildSitemapIndexForTenant).mockReset();
  vi.mocked(log).mockReset();
});

// ──────────────────────────────────────────────────────────────

describe("GET /sitemap.xml — happy path", () => {
  it("returns 200 with a valid sitemapindex XML", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    mockIndex({ shards: [shardRef()] });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(body).toContain("<sitemapindex");
    expect(body).toContain("sitemap_pages_1.xml");
    // Structural validation (M7.5): body MUST parse and pass
    // sitemap.org 0.9 schema.
    expectValidSitemapIndex(body);
  });

  it("sets Content-Type: application/xml; charset=utf-8", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    mockIndex({ shards: [] });
    const res = await GET();
    expect(res.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
  });

  it("sets Cache-Control with s-maxage=3600 and SWR=86400", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    mockIndex({ shards: [] });
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    );
  });

  it("passes the resolved tenant context to buildSitemapIndexForTenant", async () => {
    const ctx = makeTenantContext({ id: "tenant_X" });
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(ctx);
    mockIndex({ shards: [] });
    await GET();
    const firstArg = vi.mocked(buildSitemapIndexForTenant).mock.calls[0][0];
    expect(firstArg).toBe(ctx);
  });
});

// ──────────────────────────────────────────────────────────────

describe("GET /sitemap.xml — unresolved tenant", () => {
  it("returns 404 when the tenant cannot be resolved from host", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("does NOT call buildSitemapIndexForTenant when tenant is null", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(null);
    await GET();
    expect(buildSitemapIndexForTenant).not.toHaveBeenCalled();
  });

  it("404 uses cache-control: no-store (don't cache failed tenant resolution)", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(null);
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

// ──────────────────────────────────────────────────────────────

describe("GET /sitemap.xml — aggregator errors", () => {
  it("SitemapAggregationError → 503 + Retry-After: 60 + structured log", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    const cause = new Error("db connection lost");
    const err = new SitemapAggregationError(
      "products",
      2,
      "tenant_test",
      cause,
    );
    vi.mocked(buildSitemapIndexForTenant).mockRejectedValue(err);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(log).toHaveBeenCalledWith(
      "error",
      "seo.sitemap.aggregation_failed",
      {
        tenantId: "tenant_test",
        resourceType: "products",
        shardIndex: 2,
        cause: String(cause),
      },
    );
  });

  it("generic Error → 503 + route_error structured log", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    const err = new Error("oh no");
    vi.mocked(buildSitemapIndexForTenant).mockRejectedValue(err);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(log).toHaveBeenCalledWith("error", "seo.sitemap.route_error", {
      tenantId: "tenant_test",
      resourceType: "index",
      shardIndex: null,
      error: String(err),
    });
  });

  it("503 uses cache-control: no-store (transient errors must not stick)", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    vi.mocked(buildSitemapIndexForTenant).mockRejectedValue(new Error("x"));
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

// ──────────────────────────────────────────────────────────────

describe("GET /sitemap.xml — route segment config", () => {
  it("exports dynamic = 'force-dynamic' (host-based routing requires it)", () => {
    expect(routeModule.dynamic).toBe("force-dynamic");
  });

  it("does NOT export a revalidate segment (would conflict with force-dynamic)", () => {
    expect(
      (routeModule as unknown as { revalidate?: unknown }).revalidate,
    ).toBeUndefined();
  });
});
