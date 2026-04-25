/**
 * Tests for GET /robots.txt.
 *
 * Mocks mirror the sitemap route tests:
 *   • env (validated at module-import time)
 *   • route-helpers (partial — keep textRobotsResponse +
 *     handleRobotsError + buildRobotsTxt real; mock only
 *     resolveSeoContextForSitemapRoute)
 *   • logger spy
 *   • prisma stub (transitive, never invoked)
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

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/db/prisma", () => ({ prisma: {} }));

import { resolveSeoContextForSitemapRoute } from "@/app/(guest)/_lib/sitemap/route-helpers";
import { log } from "@/app/_lib/logger";
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
    seoDefaults: { titleTemplate: "{entityTitle} | {siteName}", noindex: false },
    activeLocales: ["sv"],
    contentUpdatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(resolveSeoContextForSitemapRoute).mockReset();
  vi.mocked(log).mockReset();
});

// ──────────────────────────────────────────────────────────────

describe("GET /robots.txt — happy path (resolved tenant)", () => {
  it("returns 200 with Content-Type: text/plain; charset=utf-8", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
  });

  it("body contains Disallow: /admin (spot-check from the static list)", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    const res = await GET();
    expect(await res.text()).toContain("Disallow: /admin");
  });

  it("body contains Sitemap: line pointing at the tenant's primaryDomain", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext({ primaryDomain: "foo.rutgr.com" }),
    );
    const res = await GET();
    expect(await res.text()).toContain(
      "Sitemap: https://foo.rutgr.com/sitemap.xml",
    );
  });

  it("body starts with the # Bedfront robots.txt header comment", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    const res = await GET();
    const body = await res.text();
    expect(body.startsWith("# Bedfront robots.txt\n")).toBe(true);
  });

  it("Cache-Control is the edge-cache variant (s-maxage=3600, SWR=86400)", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    );
  });

  it("does NOT log on the happy path (high-volume endpoint)", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(
      makeTenantContext(),
    );
    await GET();
    expect(log).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────

describe("GET /robots.txt — unresolved tenant (null)", () => {
  it("returns 200 with exactly 'User-agent: *\\nDisallow: /\\n'", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
  });

  it("content-type text/plain; charset=utf-8", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(null);
    const res = await GET();
    expect(res.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
  });

  it("Cache-Control is the edge-cache variant (null-tenant is an intentional stable response)", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(null);
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    );
  });

  it("body does NOT contain a Sitemap: line", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(null);
    const res = await GET();
    expect(await res.text()).not.toContain("Sitemap:");
  });

  it("does NOT log on the null-tenant path (high-volume; IP probes fire it)", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockResolvedValue(null);
    await GET();
    expect(log).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────

describe("GET /robots.txt — error path (resolver throws)", () => {
  it("returns 200 (NEVER 503 — Google treats 5xx robots as 'crawl everything')", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockRejectedValue(
      new Error("db down"),
    );
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("body is the fail-safe User-agent: *\\nDisallow: /\\n", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockRejectedValue(
      new Error("db down"),
    );
    const res = await GET();
    expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
  });

  it("Cache-Control is no-store (transient error must not stick in edge for 1h)", async () => {
    vi.mocked(resolveSeoContextForSitemapRoute).mockRejectedValue(
      new Error("db down"),
    );
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("logs seo.robots.route_error with tenantId: null + error string", async () => {
    const err = new Error("db down");
    vi.mocked(resolveSeoContextForSitemapRoute).mockRejectedValue(err);
    await GET();
    expect(log).toHaveBeenCalledWith("error", "seo.robots.route_error", {
      tenantId: null,
      error: String(err),
    });
  });
});

// ──────────────────────────────────────────────────────────────

describe("GET /robots.txt — route segment config", () => {
  it("exports dynamic = 'force-dynamic' (host-based routing requires it)", () => {
    expect(routeModule.dynamic).toBe("force-dynamic");
  });

  it("does NOT export a revalidate segment (would conflict with force-dynamic)", () => {
    expect(
      (routeModule as unknown as { revalidate?: unknown }).revalidate,
    ).toBeUndefined();
  });
});
