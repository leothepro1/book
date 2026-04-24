import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Env stub ─────────────────────────────────────────────────────

vi.mock("@/app/_lib/env", () => ({
  env: { CRON_SECRET: "test-secret" },
}));

// ── Mocks ────────────────────────────────────────────────────────

const mockPrisma = {
  draftReservation: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  draftOrderEvent: { create: vi.fn() },
  pmsIdempotencyKey: { findUnique: vi.fn() },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockEmit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/apps/webhooks", () => ({ emitPlatformEvent: mockEmit }));

const mockReleaseHold = vi.fn();
const mockResolveAdapter = vi.fn();
vi.mock("@/app/_lib/integrations/resolve", () => ({
  resolveAdapter: (...args: unknown[]) => mockResolveAdapter(...args),
}));

// We want the real createDraftOrderEvent helper — but stub prisma underneath.
// The barrel from draft-orders re-exports it; the helper uses prisma directly
// which is already mocked above.

const { GET } = await import("./route");

// ── Fixtures ────────────────────────────────────────────────────

function makeExpired(overrides: Record<string, unknown> = {}) {
  return {
    id: "dr_1",
    tenantId: "tenant_1",
    draftOrderId: "draft_1",
    draftLineItemId: "dli_1",
    holdExternalId: "ext_hold",
    ...overrides,
  };
}

function makeStuck(overrides: Record<string, unknown> = {}) {
  return {
    id: "dr_2",
    tenantId: "tenant_1",
    draftOrderId: "draft_1",
    draftLineItemId: "dli_2",
    holdIdempotencyKey: "0".repeat(64),
    holdLastAttemptAt: new Date(Date.now() - 5 * 60_000),
    ...overrides,
  };
}

function makeReq(auth?: string): Request {
  return new Request("http://test/api/cron/release-expired-draft-holds", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockResolveAdapter.mockResolvedValue({
    provider: "mews",
    releaseHold: (...args: unknown[]) => mockReleaseHold(...args),
  });
  // Default both sweeps to empty
  mockPrisma.draftReservation.findMany.mockResolvedValue([]);
  mockPrisma.draftReservation.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  mockReleaseHold.mockResolvedValue(undefined);
  mockEmit.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════════════════════

describe("cron auth", () => {
  it("401 on missing Authorization header", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockPrisma.draftReservation.findMany).not.toHaveBeenCalled();
  });

  it("401 on wrong bearer", async () => {
    const res = await GET(makeReq("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("200 on correct bearer (empty sweeps)", async () => {
    const res = await GET(makeReq("Bearer test-secret"));
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// Sweep A — expired PLACED
// ═══════════════════════════════════════════════════════════════

describe("cron Sweep A — expired PLACED", () => {
  it("calls adapter.releaseHold, transitions PLACED → RELEASED, emits event + webhook", async () => {
    const row = makeExpired();
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce([row]) // sweep A
      .mockResolvedValueOnce([]);   // sweep B

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockReleaseHold).toHaveBeenCalledWith("tenant_1", "ext_hold");
    expect(mockPrisma.draftReservation.updateMany).toHaveBeenCalledTimes(1);
    const updateArgs = mockPrisma.draftReservation.updateMany.mock.calls[0][0];
    expect(updateArgs.data.holdState).toBe("RELEASED");
    expect(updateArgs.where.holdState).toBe("PLACED");

    // HOLD_RELEASED event via createDraftOrderEvent
    expect(mockPrisma.draftOrderEvent.create).toHaveBeenCalledTimes(1);
    const evData = mockPrisma.draftOrderEvent.create.mock.calls[0][0].data;
    expect(evData.type).toBe("HOLD_RELEASED");
    expect(evData.metadata.source).toBe("cron");
    expect(evData.actorSource).toBe("cron");

    // Platform webhook
    const webhookCalls = mockEmit.mock.calls.filter(
      (c) => c[0].payload.changeType === "hold_released",
    );
    expect(webhookCalls.length).toBe(1);

    expect(body.sweepA.released).toBe(1);
    expect(body.sweepA.adapterErrors).toBe(0);
  });

  it("continues + counts adapterErrors when adapter throws (DB still RELEASED)", async () => {
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce([makeExpired()])
      .mockResolvedValueOnce([]);
    mockReleaseHold.mockRejectedValue(new Error("mews 503"));

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    // Note: the pool treats handler-thrown errors as ok=false, but our
    // handler never throws — it catches internally and proceeds. So the
    // row counts as "released" (DB update went through) with
    // adapterReleaseOk=false in the event metadata.
    expect(mockPrisma.draftReservation.updateMany).toHaveBeenCalledTimes(1);
    const evData = mockPrisma.draftOrderEvent.create.mock.calls[0][0].data;
    expect(evData.metadata.adapterReleaseOk).toBe(false);
    expect(body.sweepA.released).toBe(1);
  });

  it("processes batch of multiple expired holds", async () => {
    const rows = [
      makeExpired({ id: "dr_a", draftLineItemId: "l_a", holdExternalId: "ea" }),
      makeExpired({ id: "dr_b", draftLineItemId: "l_b", holdExternalId: "eb" }),
      makeExpired({ id: "dr_c", draftLineItemId: "l_c", holdExternalId: "ec" }),
    ];
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([]);

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.sweepA.released).toBe(3);
    expect(mockReleaseHold).toHaveBeenCalledTimes(3);
    expect(mockPrisma.draftReservation.updateMany).toHaveBeenCalledTimes(3);
  });

  it("updateMany filter prevents race with concurrent transitions", async () => {
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce([makeExpired()])
      .mockResolvedValueOnce([]);

    await GET(makeReq("Bearer test-secret"));

    const whereClause =
      mockPrisma.draftReservation.updateMany.mock.calls[0][0].where;
    // If another process transitioned to RELEASED/CONFIRMED between
    // findMany and updateMany, the filter prevents double-write.
    expect(whereClause.holdState).toBe("PLACED");
    expect(whereClause.id).toBe("dr_1");
  });
});

// ═══════════════════════════════════════════════════════════════
// Sweep B — stuck PLACING recovery
// ═══════════════════════════════════════════════════════════════

describe("cron Sweep B — stuck PLACING", () => {
  it("COMPLETED cache with valid HoldResult → PLACING recovers to PLACED", async () => {
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce([]) // sweep A
      .mockResolvedValueOnce([makeStuck()]); // sweep B

    mockPrisma.pmsIdempotencyKey.findUnique.mockResolvedValue({
      status: "COMPLETED",
      resultJson: {
        externalId: "ext_recovered",
        expiresAt: { __date: new Date(Date.now() + 30 * 60_000).toISOString() },
      },
      firstSeenAt: new Date(Date.now() - 60_000),
    });

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.sweepB.recoveredPlaced).toBe(1);
    expect(body.sweepB.recoveredFailed).toBe(0);

    const updateArgs = mockPrisma.draftReservation.updateMany.mock.calls[0][0];
    expect(updateArgs.data.holdState).toBe("PLACED");
    expect(updateArgs.data.holdExternalId).toBe("ext_recovered");

    const evData = mockPrisma.draftOrderEvent.create.mock.calls[0][0].data;
    expect(evData.type).toBe("HOLD_PLACED");
    expect(evData.metadata.source).toBe("cron_recovery");
  });

  it("FAILED cache → PLACING transitions to FAILED with cached error", async () => {
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeStuck()]);
    mockPrisma.pmsIdempotencyKey.findUnique.mockResolvedValue({
      status: "FAILED",
      resultJson: { error: "Mews 400: invalid dates" },
      firstSeenAt: new Date(),
    });

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.sweepB.recoveredFailed).toBe(1);
    const updateArgs = mockPrisma.draftReservation.updateMany.mock.calls[0][0];
    expect(updateArgs.data.holdState).toBe("FAILED");
    expect(updateArgs.data.holdLastError).toContain("invalid dates");

    const evData = mockPrisma.draftOrderEvent.create.mock.calls[0][0].data;
    expect(evData.type).toBe("HOLD_FAILED");
    expect(evData.metadata.source).toBe("cron_recovery");
  });

  it("no cache row (orphan) → FAILED with STUCK_PLACING_NO_CACHE", async () => {
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeStuck()]);
    mockPrisma.pmsIdempotencyKey.findUnique.mockResolvedValue(null);

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.sweepB.recoveredOrphan).toBe(1);
    expect(body.sweepB.recoveredFailed).toBe(1);
    const evData = mockPrisma.draftOrderEvent.create.mock.calls[0][0].data;
    expect(evData.metadata.errorCode).toBe("STUCK_PLACING_NO_CACHE");
  });

  it("null holdIdempotencyKey (pre-6.5C row) → FAILED with STUCK_PLACING_NO_KEY", async () => {
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeStuck({ holdIdempotencyKey: null })]);

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.sweepB.recoveredOrphan).toBe(1);
    // No cache lookup when key is null
    expect(mockPrisma.pmsIdempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it("IN_FLIGHT fresh (< 48h) → leaves PLACING alone for next cycle", async () => {
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeStuck()]);
    mockPrisma.pmsIdempotencyKey.findUnique.mockResolvedValue({
      status: "IN_FLIGHT",
      resultJson: null,
      firstSeenAt: new Date(Date.now() - 5 * 60_000), // 5 min old
    });

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    // No DB transition
    expect(mockPrisma.draftReservation.updateMany).not.toHaveBeenCalled();
    expect(body.sweepB.recoveredPlaced).toBe(0);
    expect(body.sweepB.recoveredFailed).toBe(0);
  });

  it("IN_FLIGHT aged (> 48h) → FAILED with STUCK_IN_FLIGHT_AGED_OUT", async () => {
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeStuck()]);
    mockPrisma.pmsIdempotencyKey.findUnique.mockResolvedValue({
      status: "IN_FLIGHT",
      resultJson: null,
      firstSeenAt: new Date(Date.now() - 49 * 60 * 60_000), // 49 h old
    });

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.sweepB.recoveredFailed).toBe(1);
    const updateArgs = mockPrisma.draftReservation.updateMany.mock.calls[0][0];
    expect(updateArgs.data.holdLastError).toBe("STUCK_IN_FLIGHT_AGED_OUT");
  });

  it("COMPLETED cache with null result (adapter returned null) → FAILED with ADAPTER_NOT_SUPPORTED", async () => {
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeStuck()]);
    mockPrisma.pmsIdempotencyKey.findUnique.mockResolvedValue({
      status: "COMPLETED",
      resultJson: null,
      firstSeenAt: new Date(),
    });

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.sweepB.recoveredFailed).toBe(1);
    const updateArgs = mockPrisma.draftReservation.updateMany.mock.calls[0][0];
    expect(updateArgs.data.holdLastError).toBe("ADAPTER_NOT_SUPPORTED");
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration: both sweeps in one call
// ═══════════════════════════════════════════════════════════════

describe("cron integration — both sweeps", () => {
  it("runs Sweep A then Sweep B in one invocation", async () => {
    mockPrisma.draftReservation.findMany
      .mockResolvedValueOnce([makeExpired()]) // A
      .mockResolvedValueOnce([makeStuck()]);  // B
    mockPrisma.pmsIdempotencyKey.findUnique.mockResolvedValue({
      status: "COMPLETED",
      resultJson: {
        externalId: "ext_r",
        expiresAt: { __date: new Date(Date.now() + 60_000).toISOString() },
      },
      firstSeenAt: new Date(),
    });

    const res = await GET(makeReq("Bearer test-secret"));
    const body = await res.json();

    expect(body.sweepA.released).toBe(1);
    expect(body.sweepB.recoveredPlaced).toBe(1);
    expect(mockPrisma.draftReservation.findMany).toHaveBeenCalledTimes(2);
  });
});
