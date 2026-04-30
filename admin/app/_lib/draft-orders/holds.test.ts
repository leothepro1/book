import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DraftReservation } from "@prisma/client";

// ── Mocks ────────────────────────────────────────────────────────

const mockTx = {
  draftReservation: { updateMany: vi.fn(), findFirst: vi.fn() },
  draftOrder: { update: vi.fn() },
  draftOrderEvent: { create: vi.fn() },
};

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  draftLineItem: { findFirst: vi.fn() },
  draftReservation: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  accommodation: { findFirst: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockEmit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/apps/webhooks", () => ({ emitPlatformEvent: mockEmit }));

const mockHoldAvailability = vi.fn();
const mockReleaseHold = vi.fn();
const mockResolveAdapter = vi.fn();
vi.mock("@/app/_lib/integrations/resolve", () => ({
  resolveAdapter: (...args: unknown[]) => mockResolveAdapter(...args),
}));

const mockWithIdempotency = vi.fn();
vi.mock("@/app/_lib/integrations/reliability/idempotency", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/_lib/integrations/reliability/idempotency")
  >("@/app/_lib/integrations/reliability/idempotency");
  return {
    ...actual,
    withIdempotency: (...args: unknown[]) => mockWithIdempotency(...args),
  };
});

const {
  placeHoldForDraftLine,
  releaseHoldForDraftLine,
  placeHoldsForDraft,
} = await import("./holds");

// ── Fixtures ────────────────────────────────────────────────────

function makeReservation(
  overrides: Partial<DraftReservation> = {},
): DraftReservation {
  return {
    id: "dr_1",
    tenantId: "tenant_1",
    draftOrderId: "draft_1",
    draftLineItemId: "dli_1",
    accommodationId: "acc_1",
    ratePlanId: "rp_1",
    checkInDate: new Date("2026-06-01"),
    checkOutDate: new Date("2026-06-04"),
    guestCounts: { adults: 2, children: 0, infants: 0 },
    holdExternalId: null,
    holdExpiresAt: null,
    holdState: "NOT_PLACED",
    holdLastAttemptAt: null,
    holdLastError: null,
    holdIdempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DraftReservation;
}

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "OPEN",
    cancelledAt: null,
    completedAt: null,
    currency: "SEK",
    ...overrides,
  };
}

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "dli_1",
    draftOrderId: "draft_1",
    lineType: "ACCOMMODATION",
    accommodationId: "acc_1",
    checkInDate: new Date("2026-06-01"),
    checkOutDate: new Date("2026-06-04"),
    guestCounts: { adults: 2 },
    ratePlanId: "rp_1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockResolveAdapter.mockResolvedValue({
    provider: "mews",
    holdAvailability: (...args: unknown[]) => mockHoldAvailability(...args),
    releaseHold: (...args: unknown[]) => mockReleaseHold(...args),
  });
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx),
  );
  mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockPrisma.draftLineItem.findFirst.mockResolvedValue(makeLine());
  mockPrisma.draftReservation.findFirst.mockResolvedValue(makeReservation());
  mockPrisma.draftReservation.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.accommodation.findFirst.mockResolvedValue({
    externalId: "ext_acc",
    name: "Deluxe",
  });
  mockTx.draftReservation.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftReservation.findFirst.mockResolvedValue(
    makeReservation({ holdState: "PLACED", holdExternalId: "ext_hold" }),
  );
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  mockTx.draftOrder.update.mockResolvedValue({});
  mockEmit.mockResolvedValue(undefined);

  // Default: withIdempotency delegates to the wrapped fn
  mockWithIdempotency.mockImplementation(
    async (_key: string, _opts: unknown, fn: () => Promise<unknown>) => fn(),
  );
});

// ═══════════════════════════════════════════════════════════════
// placeHoldForDraftLine — happy path
// ═══════════════════════════════════════════════════════════════

describe("placeHoldForDraftLine — happy path", () => {
  it("executes 2-phase commit: Phase 1 sets PLACING, Phase 2 calls adapter, Phase 3 sets PLACED", async () => {
    mockHoldAvailability.mockResolvedValue({
      externalId: "ext_hold_123",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const result = await placeHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
      actorUserId: "user_1",
    });

    // Phase 1: the single pre-tx updateMany transitions NOT_PLACED→PLACING
    expect(mockPrisma.draftReservation.updateMany).toHaveBeenCalledTimes(1);
    const phase1Call = mockPrisma.draftReservation.updateMany.mock.calls[0][0];
    expect(phase1Call.where.holdState).toEqual({
      in: ["NOT_PLACED", "FAILED"],
    });
    expect(phase1Call.data.holdState).toBe("PLACING");
    expect(phase1Call.data.holdIdempotencyKey).toMatch(/^[a-f0-9]{64}$/);

    // Phase 2: adapter called via withIdempotency
    expect(mockWithIdempotency).toHaveBeenCalledTimes(1);
    expect(mockHoldAvailability).toHaveBeenCalledTimes(1);

    // Phase 3: tx update PLACING → PLACED
    expect(mockTx.draftReservation.updateMany).toHaveBeenCalledTimes(1);
    const phase3Data = mockTx.draftReservation.updateMany.mock.calls[0][0].data;
    expect(phase3Data.holdState).toBe("PLACED");
    expect(phase3Data.holdExternalId).toBe("ext_hold_123");
    expect(phase3Data.holdExpiresAt).toBeInstanceOf(Date);

    // DraftOrder.version bumped
    expect(mockTx.draftOrder.update).toHaveBeenCalledTimes(1);
    expect(mockTx.draftOrder.update.mock.calls[0][0].data.version).toEqual({
      increment: 1,
    });

    // Event emitted
    const ev = mockTx.draftOrderEvent.create.mock.calls[0][0].data;
    expect(ev.type).toBe("HOLD_PLACED");
    expect(ev.metadata.externalId).toBe("ext_hold_123");
    expect(ev.metadata.source).toBe("admin");

    // Platform webhook
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0].payload.changeType).toBe("hold_placed");

    // Return shape
    expect(result.holdExternalId).toBe("ext_hold_123");
  });

  it("phase 2 runs AFTER phase 1 (PLACING must be set before adapter is called)", async () => {
    mockHoldAvailability.mockResolvedValue({
      externalId: "ext",
      expiresAt: new Date(),
    });

    await placeHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
    });

    const phase1Order =
      mockPrisma.draftReservation.updateMany.mock.invocationCallOrder[0];
    const adapterOrder = mockHoldAvailability.mock.invocationCallOrder[0];
    expect(phase1Order).toBeLessThan(adapterOrder);
  });

  it("generates a fresh idempotency key per call (nonce-based)", async () => {
    mockHoldAvailability.mockResolvedValue({
      externalId: "ext_1",
      expiresAt: new Date(),
    });

    await placeHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
    });
    const key1 =
      mockPrisma.draftReservation.updateMany.mock.calls[0][0].data
        .holdIdempotencyKey;

    // Second call — mocks stay bound; just re-trigger.
    mockPrisma.draftReservation.updateMany.mockClear();
    await placeHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
    });
    const key2 =
      mockPrisma.draftReservation.updateMany.mock.calls[0][0].data
        .holdIdempotencyKey;

    expect(key1).not.toBe(key2); // different nonces → different keys
  });
});

// ═══════════════════════════════════════════════════════════════
// placeHoldForDraftLine — concurrent placement (race safety)
// ═══════════════════════════════════════════════════════════════

describe("placeHoldForDraftLine — race safety", () => {
  it("Phase 1 updateMany count=0 → ConflictError (another request won)", async () => {
    mockPrisma.draftReservation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      placeHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
      }),
    ).rejects.toThrow(/race/i);

    expect(mockHoldAvailability).not.toHaveBeenCalled();
  });

  it("reservation already PLACING → ConflictError before Phase 1 attempts", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue(
      makeReservation({ holdState: "PLACING" }),
    );

    await expect(
      placeHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
      }),
    ).rejects.toThrow(/in flight/i);

    expect(mockPrisma.draftReservation.updateMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// placeHoldForDraftLine — state machine enforcement
// ═══════════════════════════════════════════════════════════════

describe("placeHoldForDraftLine — state guard", () => {
  const invalidStates: Array<DraftReservation["holdState"]> = [
    "PLACED",
    "RELEASED",
    "CONFIRMED",
  ];

  for (const state of invalidStates) {
    it(`rejects in state ${state}`, async () => {
      mockPrisma.draftReservation.findFirst.mockResolvedValue(
        makeReservation({ holdState: state }),
      );
      await expect(
        placeHoldForDraftLine({
          tenantId: "tenant_1",
          draftLineItemId: "dli_1",
        }),
      ).rejects.toThrow();
    });
  }

  it("FAILED → PLACING retry is allowed (admin-driven recovery)", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue(
      makeReservation({
        holdState: "FAILED",
        holdLastError: "prev attempt failed",
      }),
    );
    mockHoldAvailability.mockResolvedValue({
      externalId: "ext_retry",
      expiresAt: new Date(),
    });

    const result = await placeHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
    });

    expect(result.holdExternalId).toBe("ext_retry");
    // Phase 1 where-clause allows FAILED
    const phase1Where =
      mockPrisma.draftReservation.updateMany.mock.calls[0][0].where;
    expect(phase1Where.holdState).toEqual({ in: ["NOT_PLACED", "FAILED"] });
  });
});

// ═══════════════════════════════════════════════════════════════
// placeHoldForDraftLine — adapter failure paths
// ═══════════════════════════════════════════════════════════════

describe("placeHoldForDraftLine — adapter not supported", () => {
  it("adapter returns null → PLACING → FAILED with ADAPTER_NOT_SUPPORTED", async () => {
    mockHoldAvailability.mockResolvedValue(null);

    await expect(
      placeHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
      }),
    ).rejects.toThrow(/does not support holds/i);

    // Phase 3 tx ran with FAILED outcome
    const phase3 = mockTx.draftReservation.updateMany.mock.calls[0][0];
    expect(phase3.data.holdState).toBe("FAILED");
    expect(phase3.data.holdLastError).toBe("ADAPTER_NOT_SUPPORTED");
    // HOLD_FAILED event emitted
    const ev = mockTx.draftOrderEvent.create.mock.calls[0][0].data;
    expect(ev.type).toBe("HOLD_FAILED");
    expect(ev.metadata.errorCode).toBe("ADAPTER_NOT_SUPPORTED");
  });
});

describe("placeHoldForDraftLine — adapter throws", () => {
  it("adapter throw → PLACING → FAILED with truncated error", async () => {
    const longError = "x".repeat(1200);
    mockHoldAvailability.mockRejectedValue(new Error(longError));

    await expect(
      placeHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
      }),
    ).rejects.toThrow(/placement failed/i);

    const phase3 = mockTx.draftReservation.updateMany.mock.calls[0][0];
    expect(phase3.data.holdState).toBe("FAILED");
    expect(phase3.data.holdLastError.length).toBe(500);
  });

  it("no platform webhook for successful placement emitted on adapter throw", async () => {
    mockHoldAvailability.mockRejectedValue(new Error("boom"));

    await expect(
      placeHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
      }),
    ).rejects.toThrow();

    // hold_failed webhook IS emitted; hold_placed is not.
    const changeTypes = mockEmit.mock.calls.map(
      (c) => c[0].payload.changeType,
    );
    expect(changeTypes).toContain("hold_failed");
    expect(changeTypes).not.toContain("hold_placed");
  });
});

// ═══════════════════════════════════════════════════════════════
// placeHoldForDraftLine — preconditions
// ═══════════════════════════════════════════════════════════════

describe("placeHoldForDraftLine — preconditions", () => {
  it("rejects non-ACCOMMODATION line", async () => {
    mockPrisma.draftLineItem.findFirst.mockResolvedValue(
      makeLine({ lineType: "PRODUCT" }),
    );
    await expect(
      placeHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
      }),
    ).rejects.toThrow(/only to ACCOMMODATION/i);
  });

  it("rejects when accommodation lacks externalId (not PMS-synced)", async () => {
    mockPrisma.accommodation.findFirst.mockResolvedValue({
      externalId: null,
      name: "Not synced",
    });
    await expect(
      placeHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
      }),
    ).rejects.toThrow(/not synced to the PMS/i);
  });

  it("rejects when line not found", async () => {
    mockPrisma.draftLineItem.findFirst.mockResolvedValue(null);
    await expect(
      placeHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "ghost",
      }),
    ).rejects.toThrow(/not found/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// placeHoldForDraftLine — duration clamping
// ═══════════════════════════════════════════════════════════════

describe("placeHoldForDraftLine — holdDurationMs clamping", () => {
  it("clamps below 10 min → 10 min", async () => {
    mockHoldAvailability.mockResolvedValue({
      externalId: "ext",
      expiresAt: new Date(),
    });
    await placeHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
      holdDurationMs: 60_000, // 1 min — below min
    });
    const holdParams = mockHoldAvailability.mock.calls[0][1];
    expect(holdParams.holdDurationMs).toBe(10 * 60_000);
  });

  it("clamps above 24 h → 24 h", async () => {
    mockHoldAvailability.mockResolvedValue({
      externalId: "ext",
      expiresAt: new Date(),
    });
    await placeHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
      holdDurationMs: 100 * 60 * 60 * 1000,
    });
    const holdParams = mockHoldAvailability.mock.calls[0][1];
    expect(holdParams.holdDurationMs).toBe(24 * 60 * 60 * 1000);
  });

  it("default (no override) → 30 min", async () => {
    mockHoldAvailability.mockResolvedValue({
      externalId: "ext",
      expiresAt: new Date(),
    });
    await placeHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
    });
    const holdParams = mockHoldAvailability.mock.calls[0][1];
    expect(holdParams.holdDurationMs).toBe(30 * 60_000);
  });
});

// ═══════════════════════════════════════════════════════════════
// releaseHoldForDraftLine — happy path + idempotency
// ═══════════════════════════════════════════════════════════════

describe("releaseHoldForDraftLine — PLACED happy path", () => {
  beforeEach(() => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue(
      makeReservation({
        holdState: "PLACED",
        holdExternalId: "ext_to_release",
      }),
    );
    mockTx.draftReservation.findFirst.mockResolvedValue(
      makeReservation({ holdState: "RELEASED" }),
    );
    mockReleaseHold.mockResolvedValue(undefined);
  });

  it("calls adapter.releaseHold, then transitions PLACED → RELEASED", async () => {
    const result = await releaseHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
      source: "admin",
    });

    expect(mockReleaseHold).toHaveBeenCalledWith("tenant_1", "ext_to_release");
    const txUpdate = mockTx.draftReservation.updateMany.mock.calls[0][0];
    expect(txUpdate.data.holdState).toBe("RELEASED");
    expect(result.adapterReleaseOk).toBe(true);
  });

  it("continues + sets adapterReleaseOk=false when adapter throws", async () => {
    mockReleaseHold.mockRejectedValue(new Error("mews 503"));

    const result = await releaseHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
      source: "admin",
    });

    // DB still transitions to RELEASED
    expect(mockTx.draftReservation.updateMany).toHaveBeenCalledTimes(1);
    expect(result.adapterReleaseOk).toBe(false);
  });

  it("emits HOLD_RELEASED event with source + adapterReleaseOk", async () => {
    await releaseHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
      source: "cron",
    });
    const ev = mockTx.draftOrderEvent.create.mock.calls[0][0].data;
    expect(ev.type).toBe("HOLD_RELEASED");
    expect(ev.metadata.source).toBe("cron");
    expect(ev.metadata.previousExternalId).toBe("ext_to_release");
    expect(ev.actorSource).toBe("cron");
  });
});

describe("releaseHoldForDraftLine — FAILED bookkeeping", () => {
  it("transitions FAILED → RELEASED WITHOUT calling adapter (nothing to release)", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue(
      makeReservation({ holdState: "FAILED", holdExternalId: null }),
    );
    mockTx.draftReservation.findFirst.mockResolvedValue(
      makeReservation({ holdState: "RELEASED" }),
    );

    await releaseHoldForDraftLine({
      tenantId: "tenant_1",
      draftLineItemId: "dli_1",
      source: "line_removed",
    });

    expect(mockReleaseHold).not.toHaveBeenCalled();
    expect(mockTx.draftReservation.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("releaseHoldForDraftLine — state guards", () => {
  it("rejects PLACING with HOLD_IN_FLIGHT (cannot release mid-placement)", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue(
      makeReservation({ holdState: "PLACING" }),
    );

    await expect(
      releaseHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
        source: "admin",
      }),
    ).rejects.toThrow(/in flight/i);
  });

  it("rejects already-RELEASED (terminal)", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue(
      makeReservation({ holdState: "RELEASED" }),
    );
    await expect(
      releaseHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
        source: "admin",
      }),
    ).rejects.toThrow();
  });

  it("rejects CONFIRMED (belongs to an Order now)", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue(
      makeReservation({ holdState: "CONFIRMED" }),
    );
    await expect(
      releaseHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
        source: "admin",
      }),
    ).rejects.toThrow();
  });

  it("admin release rejects on non-OPEN draft (mutability gate)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "INVOICED" }),
    );
    mockPrisma.draftReservation.findFirst.mockResolvedValue(
      makeReservation({ holdState: "PLACED", holdExternalId: "ext" }),
    );
    await expect(
      releaseHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
        source: "admin",
      }),
    ).rejects.toThrow(/not editable/i);
  });

  it("cron release bypasses mutability gate (non-OPEN drafts OK)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "CANCELLED", cancelledAt: new Date() }),
    );
    mockPrisma.draftReservation.findFirst.mockResolvedValue(
      makeReservation({ holdState: "PLACED", holdExternalId: "ext" }),
    );
    mockTx.draftReservation.findFirst.mockResolvedValue(
      makeReservation({ holdState: "RELEASED" }),
    );
    mockReleaseHold.mockResolvedValue(undefined);

    await expect(
      releaseHoldForDraftLine({
        tenantId: "tenant_1",
        draftLineItemId: "dli_1",
        source: "cron",
      }),
    ).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// placeHoldsForDraft — batch
// ═══════════════════════════════════════════════════════════════

describe("placeHoldsForDraft — partial failure tolerance", () => {
  it("continues after individual failures; returns {placed, failed, skipped}", async () => {
    mockPrisma.draftReservation.findMany.mockResolvedValue([
      { id: "r1", draftLineItemId: "dli_1", accommodationId: "acc_1" },
      { id: "r2", draftLineItemId: "dli_2", accommodationId: "acc_2" },
      { id: "r3", draftLineItemId: "dli_3", accommodationId: "acc_missing" },
    ]);
    mockPrisma.accommodation.findMany.mockResolvedValue([
      { id: "acc_1", externalId: "ext_1" },
      { id: "acc_2", externalId: "ext_2" },
      { id: "acc_missing", externalId: null },
    ]);

    // Make individual placeHoldForDraftLine calls: 1 succeeds, 1 fails
    let callIndex = 0;
    mockHoldAvailability.mockImplementation(async () => {
      callIndex += 1;
      if (callIndex === 1) {
        return { externalId: "ok_1", expiresAt: new Date() };
      }
      throw new Error("PMS 503");
    });
    // Each placeHoldForDraftLine does its own draftLineItem fetch; route
    // the second call to a different line id.
    mockPrisma.draftLineItem.findFirst.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        return makeLine({ id: where.id });
      },
    );
    mockPrisma.draftReservation.findFirst.mockImplementation(
      async ({ where }: { where: { draftLineItemId: string } }) =>
        makeReservation({ draftLineItemId: where.draftLineItemId }),
    );

    const result = await placeHoldsForDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(result.placed.length).toBe(1);
    expect(result.failed.length).toBe(1);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toBe("ACCOMMODATION_NOT_PMS_SYNCED");
  });
});

describe("placeHoldsForDraft — mutability guards", () => {
  it("returns all-empty result for draft with no placeable reservations", async () => {
    mockPrisma.draftReservation.findMany.mockResolvedValue([]);

    const result = await placeHoldsForDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(result).toEqual({ placed: [], failed: [], skipped: [] });
  });
});
