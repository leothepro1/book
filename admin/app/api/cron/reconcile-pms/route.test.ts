import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/_lib/env", () => ({ env: { CRON_SECRET: "test-secret" } }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockReconcileTenantTier = vi.fn();
vi.mock("@/app/_lib/integrations/reliability/reconcile", () => ({
  reconcileTenantTier: (...a: unknown[]) => mockReconcileTenantTier(...a),
}));

const mockSelectActiveTenants = vi.fn();
vi.mock("@/app/_lib/integrations/reliability/tiers", () => ({
  selectActiveTenants: (...a: unknown[]) => mockSelectActiveTenants(...a),
  TIER_CONFIG: {
    hot: {
      tier: "hot",
      lookbackMs: 30 * 60 * 1000,
      perTenantBudgetMs: 8_000,
      pageLimit: 200,
      maxTenantsPerRun: 500,
    },
    warm: { tier: "warm", lookbackMs: 0, perTenantBudgetMs: 0, pageLimit: 0, maxTenantsPerRun: 0 },
    cold: { tier: "cold", lookbackMs: 0, perTenantBudgetMs: 0, pageLimit: 0, maxTenantsPerRun: 0 },
  },
}));

const { GET } = await import("./route");

function makeReq(url: string, auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

function resultFor(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t1",
    provider: "fake",
    tier: "hot",
    skipped: null,
    durationMs: 100,
    pagesFetched: 1,
    bookingsScanned: 5,
    backfillCount: 2,
    updatedCount: 1,
    staleCount: 1,
    identicalCount: 1,
    errorCount: 0,
    windowCompleted: true,
    fatalError: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/cron/reconcile-pms", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await GET(
      makeReq("https://example.com/api/cron/reconcile-pms?tier=hot"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for a wrong cron secret", async () => {
    const res = await GET(
      makeReq(
        "https://example.com/api/cron/reconcile-pms?tier=hot",
        "Bearer wrong",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for a missing tier", async () => {
    const res = await GET(
      makeReq(
        "https://example.com/api/cron/reconcile-pms",
        "Bearer test-secret",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid tier", async () => {
    const res = await GET(
      makeReq(
        "https://example.com/api/cron/reconcile-pms?tier=bogus",
        "Bearer test-secret",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("aggregates counters across tenants", async () => {
    mockSelectActiveTenants.mockResolvedValueOnce([
      { tenantId: "t1", provider: "mews", lastSyncAt: null },
      { tenantId: "t2", provider: "fake", lastSyncAt: null },
      { tenantId: "t3", provider: "mews", lastSyncAt: null },
    ]);
    mockReconcileTenantTier
      .mockResolvedValueOnce(resultFor({ backfillCount: 3 }))
      .mockResolvedValueOnce(resultFor({ skipped: "circuit_open" }))
      .mockResolvedValueOnce(resultFor({ backfillCount: 1, errorCount: 1 }));

    const res = await GET(
      makeReq(
        "https://example.com/api/cron/reconcile-pms?tier=hot",
        "Bearer test-secret",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantsProcessed).toBe(2);
    expect(body.tenantsSkipped).toBe(1);
    expect(body.totalBackfill).toBe(4);
    expect(body.totalErrors).toBe(1);
    expect(body.skippedBreakdown).toEqual({ circuit_open: 1 });
  });

  it("counts tenantsWithFatalError when reconcileTenantTier returns a fatalError", async () => {
    mockSelectActiveTenants.mockResolvedValueOnce([
      { tenantId: "t1", provider: "mews", lastSyncAt: null },
    ]);
    mockReconcileTenantTier.mockResolvedValueOnce(
      resultFor({ fatalError: "Mews timeout" }),
    );

    const res = await GET(
      makeReq(
        "https://example.com/api/cron/reconcile-pms?tier=hot",
        "Bearer test-secret",
      ),
    );
    const body = await res.json();
    expect(body.tenantsWithFatalError).toBe(1);
  });
});
