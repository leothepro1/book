/**
 * /api/analytics/live/visitors — route tests.
 *
 * 6 cases per recon §4 B.3 (extended with cross-tenant
 * cache-key isolation and rate-limit handling):
 *   1. 401 — no auth
 *   2. 404 — auth but no tenant
 *   3. 200 cache miss — getVisitorsNow runs, source: "fresh"
 *   4. 200 cache hit  — getVisitorsNow NOT called, source: "cache"
 *   5. 429 — rate limit fires, Retry-After header present
 *   6. Cross-tenant cache-key isolation — tenant A's cache key
 *      never collides with tenant B's
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module-level mocks (must register before route import) ─────────────

const authState: { userId: string | null } = { userId: null };
vi.mock("@/app/(admin)/_lib/auth/devAuth", () => ({
  getAuth: async () => ({ userId: authState.userId }),
}));

interface FakeTenant {
  tenant: { id: string };
  clerkUserId: string;
  clerkOrgId: string;
}
const tenantState: { value: FakeTenant | null } = { value: null };
vi.mock("@/app/(admin)/_lib/tenant/getCurrentTenant", () => ({
  getCurrentTenant: async () => tenantState.value,
}));

const rateLimitState: { allowed: boolean; retryAfterSeconds: number } = {
  allowed: true,
  retryAfterSeconds: 0,
};
vi.mock("@/app/_lib/analytics/live/rate-limit", () => ({
  checkLiveVisitorsRateLimit: async () => ({
    allowed: rateLimitState.allowed,
    retryAfterSeconds: rateLimitState.retryAfterSeconds,
  }),
}));

const cacheCalls: { key: string; fetcherCalled: boolean }[] = [];
const cacheReturn: { value: number; source: "cache" | "fresh" } = {
  value: 0,
  source: "fresh",
};
vi.mock("@/app/_lib/analytics/live/cache", () => ({
  withRedisCache: vi.fn(
    async <T>(
      key: string,
      _ttl: number,
      fetcher: () => Promise<T>,
    ): Promise<{ value: T; source: "cache" | "fresh" }> => {
      const willRunFetcher = cacheReturn.source === "fresh";
      cacheCalls.push({ key, fetcherCalled: willRunFetcher });
      if (willRunFetcher) {
        await fetcher();
      }
      return { value: cacheReturn.value as T, source: cacheReturn.source };
    },
  ),
}));

const visitorsNowFn = vi.fn(async (_tenantId: string) => 0);
vi.mock("@/app/_lib/analytics/live/visitors", () => ({
  getVisitorsNow: (tenantId: string) => visitorsNowFn(tenantId),
}));

// Observability helpers — pass-through stubs.
vi.mock("@/app/_lib/analytics/pipeline/observability", () => ({
  analyticsBreadcrumb: vi.fn(),
  analyticsSpan: <T>(
    _name: string,
    _tags: Record<string, unknown>,
    fn: () => Promise<T>,
  ) => fn(),
}));

const logSpy = vi.fn();
vi.mock("@/app/_lib/logger", () => ({
  log: (level: string, event: string, ctx: Record<string, unknown>) =>
    logSpy(level, event, ctx),
}));

const { GET } = await import("./route");

// ── Test cases ─────────────────────────────────────────────────────────

describe("GET /api/analytics/live/visitors", () => {
  beforeEach(() => {
    authState.userId = null;
    tenantState.value = null;
    rateLimitState.allowed = true;
    rateLimitState.retryAfterSeconds = 0;
    cacheCalls.length = 0;
    cacheReturn.value = 0;
    cacheReturn.source = "fresh";
    visitorsNowFn.mockReset();
    visitorsNowFn.mockResolvedValue(0);
    logSpy.mockReset();
  });

  it("Case 1 — 401 when unauthenticated", async () => {
    // auth state already null
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("Case 2 — 404 when no tenant", async () => {
    authState.userId = "user_x";
    tenantState.value = null;

    const res = await GET();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Tenant not found" });
  });

  it("Case 3 — 200 cache miss returns source: fresh and visitorsNow", async () => {
    authState.userId = "user_y";
    tenantState.value = {
      tenant: { id: "ctest_tenant_AAAAAA000000" },
      clerkUserId: "user_y",
      clerkOrgId: "org_y",
    };
    cacheReturn.value = 7;
    cacheReturn.source = "fresh";

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");

    const body = await res.json();
    expect(body.visitorsNow).toBe(7);
    expect(body.source).toBe("fresh");
    expect(typeof body.updatedAt).toBe("string");

    // Cache key uses the tenant id.
    expect(cacheCalls).toHaveLength(1);
    expect(cacheCalls[0].key).toBe(
      "bedfront:cache:analytics:live:visitors:ctest_tenant_AAAAAA000000",
    );
    expect(cacheCalls[0].fetcherCalled).toBe(true);

    // Cache miss always logs (high-signal).
    expect(logSpy).toHaveBeenCalledWith(
      "info",
      "analytics.live_visitors.served",
      expect.objectContaining({
        tenantId: "ctest_tenant_AAAAAA000000",
        source: "fresh",
        visitorsNow: 7,
      }),
    );
  });

  it("Case 4 — 200 cache hit returns source: cache, fetcher NOT called", async () => {
    authState.userId = "user_z";
    tenantState.value = {
      tenant: { id: "ctest_tenant_BBBBBB000000" },
      clerkUserId: "user_z",
      clerkOrgId: "org_z",
    };
    cacheReturn.value = 12;
    cacheReturn.source = "cache";

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.visitorsNow).toBe(12);
    expect(body.source).toBe("cache");
    expect(cacheCalls[0].fetcherCalled).toBe(false);
  });

  it("Case 5 — 429 with Retry-After when rate limit fires", async () => {
    authState.userId = "user_w";
    tenantState.value = {
      tenant: { id: "ctest_tenant_CCCCCC000000" },
      clerkUserId: "user_w",
      clerkOrgId: "org_w",
    };
    rateLimitState.allowed = false;
    rateLimitState.retryAfterSeconds = 23;

    const res = await GET();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("23");

    expect(logSpy).toHaveBeenCalledWith(
      "warn",
      "analytics.live_visitors.rate_limited",
      expect.objectContaining({
        tenantId: "ctest_tenant_CCCCCC000000",
        retryAfterSeconds: 23,
      }),
    );
  });

  it("Case 6 — cross-tenant cache-key isolation", async () => {
    // Tenant A
    authState.userId = "user_a";
    tenantState.value = {
      tenant: { id: "ctest_tenant_TENANT_A000000" },
      clerkUserId: "user_a",
      clerkOrgId: "org_a",
    };
    cacheReturn.value = 5;
    cacheReturn.source = "fresh";
    await GET();

    // Tenant B
    authState.userId = "user_b";
    tenantState.value = {
      tenant: { id: "ctest_tenant_TENANT_B000000" },
      clerkUserId: "user_b",
      clerkOrgId: "org_b",
    };
    cacheReturn.value = 99;
    cacheReturn.source = "fresh";
    await GET();

    expect(cacheCalls).toHaveLength(2);
    expect(cacheCalls[0].key).toBe(
      "bedfront:cache:analytics:live:visitors:ctest_tenant_TENANT_A000000",
    );
    expect(cacheCalls[1].key).toBe(
      "bedfront:cache:analytics:live:visitors:ctest_tenant_TENANT_B000000",
    );
    // Two distinct keys — no collision.
    expect(cacheCalls[0].key).not.toBe(cacheCalls[1].key);
  });

  it("Case 7 — 500 + structured log when cache wrapper throws", async () => {
    authState.userId = "user_err";
    tenantState.value = {
      tenant: { id: "ctest_tenant_DDDDDD000000" },
      clerkUserId: "user_err",
      clerkOrgId: "org_err",
    };
    visitorsNowFn.mockRejectedValueOnce(new Error("DB down"));
    // The mock cache calls the fetcher when source === "fresh", so
    // a rejected fetcher here propagates out.
    cacheReturn.source = "fresh";

    const res = await GET();
    expect(res.status).toBe(500);

    expect(logSpy).toHaveBeenCalledWith(
      "error",
      "analytics.live_visitors.failed",
      expect.objectContaining({
        tenantId: "ctest_tenant_DDDDDD000000",
        error: "DB down",
      }),
    );
  });
});
