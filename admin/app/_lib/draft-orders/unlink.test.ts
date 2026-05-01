import { describe, it, expect, vi, beforeEach } from "vitest";
import { VersionConflictError } from "@/app/_lib/errors/service-errors";

// ── Mocks ────────────────────────────────────────────────────────

const mockTx = {
  draftCheckoutSession: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  draftReservation: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  draftOrder: {
    findFirst: vi.fn(),
  },
  draftOrderEvent: {
    create: vi.fn(),
  },
};

const mockEventInTx = vi.fn();
vi.mock("./events", async () => {
  const actual = await vi.importActual<typeof import("./events")>("./events");
  return {
    ...actual,
    createDraftOrderEventInTx: mockEventInTx,
  };
});

const { unlinkActiveCheckoutSession } = await import("./unlink");

// ── Fixtures ────────────────────────────────────────────────────

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "ses_1",
    version: 1,
    stripePaymentIntentId: "pi_abc123",
    ...overrides,
  };
}

function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "res_1",
    holdExternalId: "mews_hold_1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockTx.draftOrder.findFirst.mockResolvedValue({ status: "INVOICED" });
  mockTx.draftCheckoutSession.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftReservation.findMany.mockResolvedValue([]);
  mockTx.draftReservation.updateMany.mockResolvedValue({ count: 1 });
});

// ═══════════════════════════════════════════════════════════════
// No active session
// ═══════════════════════════════════════════════════════════════

describe("unlinkActiveCheckoutSession — no active session", () => {
  it("returns { unlinked: false } and performs no writes", async () => {
    mockTx.draftCheckoutSession.findFirst.mockResolvedValue(null);

    const result = await unlinkActiveCheckoutSession(
      // @ts-expect-error — mockTx is structurally compatible enough for the
      // narrow surface this helper uses.
      mockTx,
      "draft_1",
      "tenant_1",
      "draft_mutated",
    );

    expect(result).toEqual({
      unlinked: false,
      sessionId: null,
      releasedHoldExternalIds: [],
      stripePaymentIntentId: null,
    });
    expect(mockTx.draftCheckoutSession.updateMany).not.toHaveBeenCalled();
    expect(mockTx.draftReservation.updateMany).not.toHaveBeenCalled();
    expect(mockEventInTx).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Active session, no holds
// ═══════════════════════════════════════════════════════════════

describe("unlinkActiveCheckoutSession — active session, no holds", () => {
  it("marks session UNLINKED + emits STATE_CHANGED", async () => {
    mockTx.draftCheckoutSession.findFirst.mockResolvedValue(
      makeSession({ stripePaymentIntentId: null }),
    );
    mockTx.draftReservation.findMany.mockResolvedValue([]);

    const result = await unlinkActiveCheckoutSession(
      // @ts-expect-error — see above
      mockTx,
      "draft_1",
      "tenant_1",
      "draft_mutated",
      { source: "admin_ui", userId: "user_42" },
    );

    expect(result.unlinked).toBe(true);
    expect(result.sessionId).toBe("ses_1");
    expect(result.releasedHoldExternalIds).toEqual([]);
    expect(result.stripePaymentIntentId).toBeNull();

    // Session-version-CAS
    const sessionUpdateCall = mockTx.draftCheckoutSession.updateMany.mock.calls[0][0];
    expect(sessionUpdateCall.where).toMatchObject({
      id: "ses_1",
      version: 1,
    });
    expect(sessionUpdateCall.data.status).toBe("UNLINKED");
    expect(sessionUpdateCall.data.unlinkReason).toBe("draft_mutated");
    expect(sessionUpdateCall.data.version).toEqual({ increment: 1 });

    // Event payload
    expect(mockEventInTx).toHaveBeenCalledTimes(1);
    const eventArgs = mockEventInTx.mock.calls[0][1];
    expect(eventArgs.type).toBe("STATE_CHANGED");
    expect(eventArgs.metadata.unlinkedSessionId).toBe("ses_1");
    expect(eventArgs.metadata.unlinkReason).toBe("draft_mutated");
    expect(eventArgs.metadata.releasedHoldExternalIds).toEqual([]);
    expect(eventArgs.actorUserId).toBe("user_42");
    expect(eventArgs.actorSource).toBe("admin_ui");
  });
});

// ═══════════════════════════════════════════════════════════════
// Active session with PLACED holds
// ═══════════════════════════════════════════════════════════════

describe("unlinkActiveCheckoutSession — active session with holds", () => {
  it("releases all PLACED holds and returns their externalIds", async () => {
    mockTx.draftCheckoutSession.findFirst.mockResolvedValue(makeSession());
    mockTx.draftReservation.findMany.mockResolvedValue([
      makeReservation({ id: "res_1", holdExternalId: "mews_a" }),
      makeReservation({ id: "res_2", holdExternalId: "mews_b" }),
    ]);

    const result = await unlinkActiveCheckoutSession(
      // @ts-expect-error
      mockTx,
      "draft_1",
      "tenant_1",
      "draft_mutated",
    );

    expect(result.releasedHoldExternalIds).toEqual(["mews_a", "mews_b"]);
    expect(mockTx.draftReservation.updateMany).toHaveBeenCalledTimes(2);

    // Each updateMany filters on holdState=PLACED (status-CAS) so a
    // concurrently-released row is skipped, not double-released.
    const calls = mockTx.draftReservation.updateMany.mock.calls;
    for (const [args] of calls) {
      expect(args.where.holdState).toBe("PLACED");
      expect(args.data.holdState).toBe("RELEASED");
      expect(args.data.holdReleaseReason).toBe("session_unlinked");
    }
  });

  it("findMany already filters PLACED — mixed-state rows aren't returned to begin with", async () => {
    // Sanity: simulate the DB query already filtering — only PLACED
    // rows come back. This documents the contract; the SQL filter at
    // line 5 in unlink.ts ensures NOT_PLACED/RELEASED/CONFIRMED never
    // reach the release loop.
    mockTx.draftCheckoutSession.findFirst.mockResolvedValue(makeSession());
    mockTx.draftReservation.findMany.mockResolvedValue([
      makeReservation({ id: "res_only_placed", holdExternalId: "mews_p" }),
    ]);

    const result = await unlinkActiveCheckoutSession(
      // @ts-expect-error
      mockTx,
      "draft_1",
      "tenant_1",
      "draft_mutated",
    );

    expect(result.releasedHoldExternalIds).toEqual(["mews_p"]);

    // findMany was called with the PLACED filter
    const findArgs = mockTx.draftReservation.findMany.mock.calls[0][0];
    expect(findArgs.where.holdState).toBe("PLACED");
  });

  it("skips releasedHoldExternalIds entries when count=0 (concurrent release race)", async () => {
    mockTx.draftCheckoutSession.findFirst.mockResolvedValue(makeSession());
    mockTx.draftReservation.findMany.mockResolvedValue([
      makeReservation({ id: "res_won", holdExternalId: "mews_won" }),
      makeReservation({ id: "res_lost", holdExternalId: "mews_lost" }),
    ]);
    // First update wins; second update returns count=0 (status-CAS
    // saw the row already moved out of PLACED — concurrent cron release).
    mockTx.draftReservation.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await unlinkActiveCheckoutSession(
      // @ts-expect-error
      mockTx,
      "draft_1",
      "tenant_1",
      "draft_mutated",
    );

    expect(result.releasedHoldExternalIds).toEqual(["mews_won"]);
  });

  it("skips holds with null holdExternalId (NOT_PLACED transitioned via FAILED never set ID)", async () => {
    mockTx.draftCheckoutSession.findFirst.mockResolvedValue(makeSession());
    mockTx.draftReservation.findMany.mockResolvedValue([
      makeReservation({ id: "res_no_id", holdExternalId: null }),
      makeReservation({ id: "res_with_id", holdExternalId: "mews_x" }),
    ]);

    const result = await unlinkActiveCheckoutSession(
      // @ts-expect-error
      mockTx,
      "draft_1",
      "tenant_1",
      "draft_mutated",
    );

    expect(result.releasedHoldExternalIds).toEqual(["mews_x"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Concurrent unlink — version mismatch
// ═══════════════════════════════════════════════════════════════

describe("unlinkActiveCheckoutSession — concurrent unlink", () => {
  it("throws VersionConflictError when session.version no longer matches", async () => {
    mockTx.draftCheckoutSession.findFirst.mockResolvedValue(makeSession());
    mockTx.draftCheckoutSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      unlinkActiveCheckoutSession(
        // @ts-expect-error
        mockTx,
        "draft_1",
        "tenant_1",
        "draft_mutated",
      ),
    ).rejects.toBeInstanceOf(VersionConflictError);

    // Holds NOT released — the throw aborts before the loop.
    expect(mockTx.draftReservation.updateMany).not.toHaveBeenCalled();
    // Event NOT emitted — same reason.
    expect(mockEventInTx).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Reason variants
// ═══════════════════════════════════════════════════════════════

describe("unlinkActiveCheckoutSession — reason values", () => {
  it.each([
    "draft_mutated",
    "marked_paid_manually",
    "draft_cancelled",
    "manual_admin",
    "hold_refresh_failed",
  ] as const)("accepts reason=%s and stores it on the session", async (reason) => {
    mockTx.draftCheckoutSession.findFirst.mockResolvedValue(makeSession());
    mockTx.draftReservation.findMany.mockResolvedValue([]);

    await unlinkActiveCheckoutSession(
      // @ts-expect-error
      mockTx,
      "draft_1",
      "tenant_1",
      reason,
    );

    const data = mockTx.draftCheckoutSession.updateMany.mock.calls[0][0].data;
    expect(data.unlinkReason).toBe(reason);

    const eventMeta = mockEventInTx.mock.calls[0][1].metadata;
    expect(eventMeta.unlinkReason).toBe(reason);
  });
});

// ═══════════════════════════════════════════════════════════════
// Default actor
// ═══════════════════════════════════════════════════════════════

describe("unlinkActiveCheckoutSession — actor default", () => {
  it("uses { source: 'api' } when actor omitted", async () => {
    mockTx.draftCheckoutSession.findFirst.mockResolvedValue(makeSession());
    mockTx.draftReservation.findMany.mockResolvedValue([]);

    await unlinkActiveCheckoutSession(
      // @ts-expect-error
      mockTx,
      "draft_1",
      "tenant_1",
      "draft_mutated",
    );

    expect(mockEventInTx.mock.calls[0][1].actorSource).toBe("api");
    expect(mockEventInTx.mock.calls[0][1].actorUserId).toBeNull();
  });
});
