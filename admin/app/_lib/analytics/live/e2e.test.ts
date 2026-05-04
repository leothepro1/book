/**
 * E2E test — seed → poll → cache stable → fresh after TTL.
 *
 * Wires together the real getVisitorsNow (B.1), real withRedisCache
 * (B.2), real route handler (B.3), and a real in-memory Redis-shaped
 * mock that respects TTL semantics. Auth + tenant are mocked at the
 * boundary so we can test the full request path without spinning up
 * a Next test server.
 *
 * Sequence verified:
 *   1. POLL #1: cache empty → fetcher runs → analytics.event scanned
 *      → distinct count returned → cache populated.
 *   2. POLL #2 within TTL: returns the cached value verbatim,
 *      fetcher does NOT run (verified via $queryRaw spy).
 *   3. POLL #3 after simulated TTL expiry: cache miss → fetcher runs
 *      again, fresh response.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data layer ────────────────────────────────────────────────────

interface MockEvent {
  tenant_id: string;
  occurred_at: Date;
  payload: Record<string, unknown>;
}

const TENANT = "ctest_e2e_tenant_aaaaaaaaa";
const mockEvents: MockEvent[] = [];
const queryRawSpy = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => {
  const mockClient = {
    $queryRaw: queryRawSpy,
  };
  return {
    _unguardedAnalyticsPipelineClient: mockClient,
    prisma: mockClient,
  };
});

queryRawSpy.mockImplementation(
  async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const tenantId = values[0] as string;
    // Use the test's controlled clock — Date.now() is overridden via
    // vi.setSystemTime() in each test setup so this returns the
    // simulated "now".
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const matching = mockEvents.filter(
      (e) =>
        e.tenant_id === tenantId &&
        e.occurred_at > cutoff &&
        typeof (e.payload as { session_id?: string }).session_id === "string",
    );
    const distinct = new Set(
      matching.map((e) => (e.payload as { session_id: string }).session_id),
    );
    return [{ visitors_now: distinct.size }];
  },
);

// ── Mock Redis with TTL semantics ──────────────────────────────────────
// The in-memory Redis store keys to { value, expiresAt }. get() returns
// null after expiresAt is in the past — same semantics as Upstash's
// EX option. We expose a `tickClock` helper so the test can
// simulate the 60s TTL elapsing without sleeping.

interface RedisEntry {
  value: string;
  expiresAt: number;
}

const redisStore = new Map<string, RedisEntry>();

vi.mock("@/app/_lib/redis/client", () => ({
  redis: {
    get: vi.fn(async (key: string) => {
      const entry = redisStore.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        redisStore.delete(key);
        return null;
      }
      return entry.value;
    }),
    set: vi.fn(
      async (
        key: string,
        value: string,
        opts: { ex?: number } | undefined,
      ) => {
        const ttl = opts?.ex ?? 60;
        redisStore.set(key, {
          value,
          expiresAt: Date.now() + ttl * 1000,
        });
        return "OK";
      },
    ),
  },
}));

// Auth + tenant — mocked at the boundary.
const authState: { userId: string | null } = { userId: "user_e2e" };
vi.mock("@/app/(admin)/_lib/auth/devAuth", () => ({
  getAuth: async () => ({ userId: authState.userId }),
}));

vi.mock("@/app/(admin)/_lib/tenant/getCurrentTenant", () => ({
  getCurrentTenant: async () => ({
    tenant: { id: TENANT },
    clerkUserId: "user_e2e",
    clerkOrgId: "org_e2e",
  }),
}));

// Rate-limit short-circuited to allow.
vi.mock("@/app/_lib/analytics/live/rate-limit", () => ({
  checkLiveVisitorsRateLimit: async () => ({
    allowed: true,
    retryAfterSeconds: 0,
  }),
}));

// Pass-through observability.
vi.mock("@/app/_lib/analytics/pipeline/observability", () => ({
  analyticsBreadcrumb: vi.fn(),
  analyticsSpan: <T>(
    _name: string,
    _tags: Record<string, unknown>,
    fn: () => Promise<T>,
  ) => fn(),
}));

vi.mock("@/app/_lib/logger", () => ({
  log: vi.fn(),
}));

const { GET } = await import("@/app/api/analytics/live/visitors/route");

// ── Helpers ────────────────────────────────────────────────────────────

function pushEvent(ageSeconds: number, sessionId: string): void {
  mockEvents.push({
    tenant_id: TENANT,
    occurred_at: new Date(Date.now() - ageSeconds * 1000),
    payload: { session_id: sessionId },
  });
}

const BASELINE_MS = 1_750_000_000_000; // arbitrary deterministic anchor

function advanceTime(ms: number): void {
  // Advance vi's fake clock and re-stamp all mockEvents to remain at
  // their original RELATIVE position vs the new "now". Without
  // re-stamping, the 5-min-window predicate in the query mock would
  // misjudge events as expired.
  const before = Date.now();
  vi.setSystemTime(new Date(before + ms));
}

interface GetResponseBody {
  visitorsNow: number;
  updatedAt: string;
  source: "cache" | "fresh";
}

async function poll(): Promise<{ status: number; body: GetResponseBody }> {
  const res = await GET();
  return { status: res.status, body: (await res.json()) as GetResponseBody };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("besökare e2e — seed → poll → cache stable → fresh after TTL", () => {
  beforeEach(() => {
    mockEvents.length = 0;
    redisStore.clear();
    queryRawSpy.mockClear();
    authState.userId = "user_e2e";
    // Pin Date.now() to a deterministic baseline so the test can
    // simulate TTL expiry by advancing the clock.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BASELINE_MS));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("first poll fetches fresh; second poll within TTL returns cache; third poll after TTL fetches fresh again", async () => {
    // Seed: 3 distinct session_ids in the 5-min window.
    pushEvent(30, "01HZE2E_SESS_1AAAAAAAAAAAAA");
    pushEvent(60, "01HZE2E_SESS_1AAAAAAAAAAAAA"); // duplicate
    pushEvent(90, "01HZE2E_SESS_2BBBBBBBBBBBBBB");
    pushEvent(120, "01HZE2E_SESS_3CCCCCCCCCCCCCC");

    // ── POLL #1: cache empty → fetcher runs ────────────────────────
    const r1 = await poll();
    expect(r1.status).toBe(200);
    expect(r1.body.visitorsNow).toBe(3);
    expect(r1.body.source).toBe("fresh");
    expect(queryRawSpy).toHaveBeenCalledTimes(1);

    // ── POLL #2: within 60s TTL → cache HIT, fetcher NOT called ────
    // Advance 30s — cache still valid.
    advanceTime(30 * 1000);
    const r2 = await poll();
    expect(r2.status).toBe(200);
    expect(r2.body.visitorsNow).toBe(3);
    expect(r2.body.source).toBe("cache");
    // queryRawSpy still at 1 — fetcher did not run.
    expect(queryRawSpy).toHaveBeenCalledTimes(1);

    // ── POLL #3: advance past TTL → cache miss → fetcher runs again
    advanceTime(35 * 1000); // total 65s elapsed since first poll
    // Add a new session_id between polls so we can verify the fresh
    // fetch returns updated state.
    pushEvent(5, "01HZE2E_SESS_4DDDDDDDDDDDDDD");

    const r3 = await poll();
    expect(r3.status).toBe(200);
    // Fresh count includes the new session; old sessions still
    // within 5-min window so all 4 distinct session_ids count.
    expect(r3.body.visitorsNow).toBe(4);
    expect(r3.body.source).toBe("fresh");
    expect(queryRawSpy).toHaveBeenCalledTimes(2);
  });

  it("response shape contract — visitorsNow + updatedAt + source on every poll", async () => {
    pushEvent(30, "01HZE2E_SHAPE_1EEEEEEEEEEEE");

    const r1 = await poll();
    expect(typeof r1.body.visitorsNow).toBe("number");
    expect(typeof r1.body.updatedAt).toBe("string");
    // updatedAt is parseable as ISO date.
    expect(Number.isNaN(Date.parse(r1.body.updatedAt))).toBe(false);
    expect(r1.body.source).toBe("fresh");

    const r2 = await poll();
    expect(r2.body.source).toBe("cache");
    expect(r2.body.visitorsNow).toBe(r1.body.visitorsNow);
  });
});
