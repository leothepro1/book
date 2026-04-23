/**
 * Tests for GET /sitemap_<type>_<n>.xml.
 *
 * The dynamic segment [shard] captures the full filename after
 * "sitemap_", e.g. "products_1.xml". The handler parses it with a
 * strict regex and rejects anything non-canonical with 404.
 *
 * Mocks mirror the index-route test: route-helpers (partial),
 * aggregator (partial), logger, prisma stub, env stub.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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
    ...actual, // keep SitemapAggregationError real
    buildShardForTenant: vi.fn(),
  };
});

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/db/prisma", () => ({ prisma: {} }));

import { resolveSeoContextForSitemapRoute } from "@/app/(guest)/_lib/sitemap/route-helpers";
import { log } from "@/app/_lib/logger";
import {
  SitemapAggregationError,
  buildShardForTenant,
} from "@/app/_lib/seo/sitemap/aggregator";
import type {
  BuiltShard,
  SitemapResourceType,
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

function makeShard(
  overrides: Partial<BuiltShard> = {},
): BuiltShard {
  return {
    resourceType: "products" as SitemapResourceType,
    shardIndex: 1,
    entries: [],
    hasMore: false,
    ...overrides,
  };
}

function makeReq(path: string): Request {
  return new Request(`https://apelviken.rutgr.com${path}`);
}

beforeEach(() => {
  vi.mocked(resolveSeoContextForSitemapRoute).mockReset();
  vi.mocked(buildShardForTenant).mockReset();
  vi.mocked(log).mockReset();
});

// ──────────────────────────────────────────────────────────────

describe("GET /sitemap_<type>_<n>.xml — happy path", () => {
  it("/sitemap_products_1.xml → 200 urlset", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    vi.mocked(buildShardForTenant).mockResolvedValue(
      makeShard({
        entries: [
          {
            url: "https://apelviken.rutgr.com/shop/products/x",
            lastmod: new Date("2026-04-01T00:00:00Z"),
            alternates: [],
          },
        ],
      }),
    );
    const res = await GET(makeReq("/sitemap_products_1.xml"), {
      params: Promise.resolve({ shard: "products_1.xml" }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<?xml");
    expect(body).toContain("<urlset");
    expect(body).toContain("/shop/products/x");
  });

  it("sets Content-Type + edge Cache-Control on 200", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    vi.mocked(buildShardForTenant).mockResolvedValue(makeShard());
    const res = await GET(makeReq("/sitemap_pages_1.xml"), {
      params: Promise.resolve({ shard: "pages_1.xml" }),
    });
    expect(res.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    );
  });

  it("empty shard 1 (zero entries) → 200 with valid empty urlset", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    vi.mocked(buildShardForTenant).mockResolvedValue(
      makeShard({ entries: [], hasMore: false }),
    );
    const res = await GET(makeReq("/sitemap_products_1.xml"), {
      params: Promise.resolve({ shard: "products_1.xml" }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("</urlset>");
    expect(body).not.toContain("<url>");
  });

  it("forwards resourceType + shardIndex to buildShardForTenant", async () => {
    const ctx = makeTenantContext();
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(ctx);
    vi.mocked(buildShardForTenant).mockResolvedValue(makeShard());
    await GET(makeReq("/sitemap_accommodations_2.xml"), {
      params: Promise.resolve({ shard: "accommodations_2.xml" }),
    });
    const call = vi.mocked(buildShardForTenant).mock.calls[0];
    expect(call[0]).toBe(ctx);
    expect(call[1]).toBe("accommodations");
    expect(call[2]).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────

describe("GET /sitemap_<type>_<n>.xml — malformed URLs return 404", () => {
  // Every variant below MUST 404 without reaching the aggregator.

  async function assert404(shard: string): Promise<void> {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    const res = await GET(makeReq(`/sitemap_${shard}`), {
      params: Promise.resolve({ shard }),
    });
    expect(res.status).toBe(404);
    expect(buildShardForTenant).not.toHaveBeenCalled();
  }

  it("unknown resource type → 404 (/sitemap_gibberish_1.xml)", async () => {
    await assert404("gibberish_1.xml");
  });

  it("shardIndex = 0 → 404 (zero is not 1-based valid)", async () => {
    await assert404("products_0.xml");
  });

  it("negative shardIndex → 404 (regex rejects '-')", async () => {
    await assert404("products_-1.xml");
  });

  it("non-numeric shardIndex → 404", async () => {
    await assert404("products_abc.xml");
  });

  it("missing .xml extension → 404", async () => {
    await assert404("products_1");
  });

  it("completely malformed shard name → 404 (no resourceType prefix)", async () => {
    await assert404("nonsense.xml");
  });

  it("leading zero (non-canonical) → 404 (/sitemap_products_01.xml)", async () => {
    // Canonical-URL contract: `01` is not the canonical form of `1`.
    // parseInt accepts "01" as 1 but the handler must reject it to
    // prevent duplicate crawlable URLs pointing to the same shard.
    await assert404("products_01.xml");
  });

  it("leading zeros (e.g. 0001) → 404", async () => {
    // Same rule, deeper nesting.
    await assert404("accommodations_0001.xml");
  });
});

// ──────────────────────────────────────────────────────────────

describe("GET /sitemap_<type>_<n>.xml — out-of-range shard", () => {
  it("buildShardForTenant returns null → 404", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    vi.mocked(buildShardForTenant).mockResolvedValue(null);
    const res = await GET(makeReq("/sitemap_products_99.xml"), {
      params: Promise.resolve({ shard: "products_99.xml" }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

// ──────────────────────────────────────────────────────────────

describe("GET /sitemap_<type>_<n>.xml — unresolved tenant", () => {
  it("resolveSeoContextForSitemapRoute returns null → 404", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(null);
    const res = await GET(makeReq("/sitemap_products_1.xml"), {
      params: Promise.resolve({ shard: "products_1.xml" }),
    });
    expect(res.status).toBe(404);
    expect(buildShardForTenant).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────

describe("GET /sitemap_<type>_<n>.xml — aggregator errors", () => {
  it("SitemapAggregationError → 503 + Retry-After: 60 + structured log", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    const cause = new Error("pool exhausted");
    vi.mocked(buildShardForTenant).mockRejectedValue(
      new SitemapAggregationError("products", 1, "tenant_test", cause),
    );
    const res = await GET(makeReq("/sitemap_products_1.xml"), {
      params: Promise.resolve({ shard: "products_1.xml" }),
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(log).toHaveBeenCalledWith(
      "error",
      "seo.sitemap.aggregation_failed",
      {
        tenantId: "tenant_test",
        resourceType: "products",
        shardIndex: 1,
        cause: String(cause),
      },
    );
  });

  it("generic Error → 503 + route_error log carrying the shard context", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    const err = new Error("unexpected");
    vi.mocked(buildShardForTenant).mockRejectedValue(err);
    const res = await GET(makeReq("/sitemap_accommodations_1.xml"), {
      params: Promise.resolve({ shard: "accommodations_1.xml" }),
    });
    expect(res.status).toBe(503);
    expect(log).toHaveBeenCalledWith("error", "seo.sitemap.route_error", {
      tenantId: "tenant_test",
      resourceType: "accommodations",
      shardIndex: 1,
      error: String(err),
    });
  });
});

// ──────────────────────────────────────────────────────────────

describe("GET /sitemap_<type>_<n>.xml — route segment config", () => {
  it("exports dynamic = 'force-dynamic'", () => {
    expect(routeModule.dynamic).toBe("force-dynamic");
  });

  it("does NOT export a revalidate segment", () => {
    expect(
      (routeModule as unknown as { revalidate?: unknown }).revalidate,
    ).toBeUndefined();
  });
});
