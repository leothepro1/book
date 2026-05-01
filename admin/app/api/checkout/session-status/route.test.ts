/**
 * Phase G — `/api/checkout/session-status` route tests.
 *
 * Helper-level tests with prisma + redis + rate-limit mocked at the
 * module boundary. No real network or DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  draftCheckoutSession: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
};
const mockCheckRateLimit = vi.fn();
const mockGetClientIp = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/redis/client", () => ({ redis: mockRedis }));
vi.mock("@/app/_lib/rate-limit/checkout", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: () => mockGetClientIp(),
}));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const { GET } = await import("./route");

const VALID_CUID = "cm5a7yz3e0000abc123de456f"; // 25 chars, starts with c

function makeReq(id: string | null): Request {
  const url = id !== null
    ? `http://test/api/checkout/session-status?id=${id}`
    : "http://test/api/checkout/session-status";
  return new Request(url, { method: "GET" });
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    status: "ACTIVE" as const,
    lastBuyerActivityAt: new Date("2026-05-01T12:00:00.000Z"),
    draftOrder: {
      completedOrderId: null as string | null,
      shareLinkToken: "tok_abc",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(true);
  mockGetClientIp.mockResolvedValue("203.0.113.1");
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue("OK");
  mockPrisma.draftCheckoutSession.update.mockResolvedValue({});
});

// ═══════════════════════════════════════════════════════════════
// Happy path
// ═══════════════════════════════════════════════════════════════

describe("session-status — happy path", () => {
  it("returns 200 with the full payload for an ACTIVE session, no cache", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(makeRow());

    const res = await GET(makeReq(VALID_CUID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "ACTIVE",
      lastBuyerActivityAt: "2026-05-01T12:00:00.000Z",
      completedOrderId: null,
      shareLinkToken: "tok_abc",
    });
    expect(mockPrisma.draftCheckoutSession.findUnique).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `bedfront:dcs:status:${VALID_CUID}`,
      expect.objectContaining({ status: "ACTIVE" }),
      { ex: 5 },
    );
  });

  it("returns the cached payload on a cache hit, with no DB read", async () => {
    mockRedis.get.mockResolvedValue({
      status: "ACTIVE",
      lastBuyerActivityAt: "2026-05-01T12:00:00.000Z",
      completedOrderId: null,
      shareLinkToken: "tok_abc",
    });

    const res = await GET(makeReq(VALID_CUID));

    expect(res.status).toBe(200);
    expect(mockPrisma.draftCheckoutSession.findUnique).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════

describe("session-status — id validation", () => {
  it("returns 400 when id is missing", async () => {
    const res = await GET(makeReq(null));
    expect(res.status).toBe(400);
    expect(mockPrisma.draftCheckoutSession.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when id is not a cuid", async () => {
    const res = await GET(makeReq("not-a-cuid"));
    expect(res.status).toBe(400);
    expect(mockPrisma.draftCheckoutSession.findUnique).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Not found
// ═══════════════════════════════════════════════════════════════

describe("session-status — not found", () => {
  it("returns 404 when no row matches", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(null);

    const res = await GET(makeReq(VALID_CUID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the parent draft has no shareLinkToken", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeRow({
        draftOrder: { completedOrderId: null, shareLinkToken: null },
      }),
    );

    const res = await GET(makeReq(VALID_CUID));
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// Activity debounce
// ═══════════════════════════════════════════════════════════════

describe("session-status — lastBuyerActivityAt debounce", () => {
  it("does NOT write when last activity is < 30s old", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeRow({ lastBuyerActivityAt: new Date(Date.now() - 5_000) }),
    );

    const res = await GET(makeReq(VALID_CUID));
    expect(res.status).toBe(200);
    expect(mockPrisma.draftCheckoutSession.update).not.toHaveBeenCalled();
  });

  it("writes when last activity is > 30s old", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeRow({ lastBuyerActivityAt: new Date(Date.now() - 60_000) }),
    );

    const res = await GET(makeReq(VALID_CUID));
    expect(res.status).toBe(200);
    // Update is fire-and-forget but invoked synchronously before return
    expect(mockPrisma.draftCheckoutSession.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.draftCheckoutSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_CUID },
        data: expect.objectContaining({
          lastBuyerActivityAt: expect.any(Date),
        }),
      }),
    );
  });

  it("writes when lastBuyerActivityAt is null", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeRow({ lastBuyerActivityAt: null }),
    );

    const res = await GET(makeReq(VALID_CUID));
    expect(res.status).toBe(200);
    expect(mockPrisma.draftCheckoutSession.update).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Rate limiting
// ═══════════════════════════════════════════════════════════════

describe("session-status — rate limit", () => {
  it("returns 429 with Retry-After when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue(false);

    const res = await GET(makeReq(VALID_CUID));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(mockPrisma.draftCheckoutSession.findUnique).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Status transitions reflected after TTL
// ═══════════════════════════════════════════════════════════════

describe("session-status — status transitions", () => {
  it("reflects ACTIVE → UNLINKED transition after cache expiry", async () => {
    // First call: cache miss, status ACTIVE
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValueOnce(
      makeRow({ status: "ACTIVE" }),
    );
    const res1 = await GET(makeReq(VALID_CUID));
    expect((await res1.json()).status).toBe("ACTIVE");

    // Second call: cache miss again (simulating TTL expiry), status UNLINKED
    mockRedis.get.mockResolvedValueOnce(null);
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValueOnce(
      makeRow({ status: "UNLINKED" }),
    );
    const res2 = await GET(makeReq(VALID_CUID));
    expect((await res2.json()).status).toBe("UNLINKED");
  });

  it("reflects PAID + completedOrderId once webhook lands", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeRow({
        status: "PAID",
        draftOrder: { completedOrderId: "ord_xyz", shareLinkToken: "tok_abc" },
      }),
    );

    const res = await GET(makeReq(VALID_CUID));
    const body = await res.json();
    expect(body.status).toBe("PAID");
    expect(body.completedOrderId).toBe("ord_xyz");
  });
});
