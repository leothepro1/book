import { describe, it, expect, vi, beforeEach } from "vitest";
import { DRAFT_ERRORS } from "./errors";

// ── Mocks ────────────────────────────────────────────────────────

type TxMock = {
  draftOrder: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  draftCheckoutSession: {
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  draftReservation: {
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  draftOrderEvent: {
    create: ReturnType<typeof vi.fn>;
  };
};

const mockTx: TxMock = {
  draftOrder: {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  draftCheckoutSession: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  draftReservation: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  draftOrderEvent: {
    create: vi.fn(),
  },
};

const mockPrisma = {
  draftOrder: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(async (cb: (tx: TxMock) => Promise<unknown>) => {
    return cb(mockTx);
  }),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("./unlink-side-effects", () => ({
  runUnlinkSideEffects: vi.fn().mockResolvedValue({
    holdReleaseAttempted: 0,
    holdReleaseErrors: [],
    stripePaymentIntentCancelAttempted: false,
    stripePaymentIntentCancelError: null,
  }),
}));

const { updateDraftMeta } = await import("./update-meta");

// ── Fixtures ────────────────────────────────────────────────────

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "OPEN",
    expiresAt: new Date("2026-05-01T00:00:00Z"),
    internalNote: null,
    tags: [] as string[],
    version: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
  mockTx.draftOrder.findFirst.mockResolvedValue(null);
  // Phase D — version CAS via updateMany. Default count=1 (write succeeded).
  mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  // Phase D — unlink: default to "no active session", which makes the
  // helper a no-op and existing tests continue to work.
  mockTx.draftCheckoutSession.findFirst.mockResolvedValue(null);
  mockTx.draftCheckoutSession.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftReservation.findMany.mockResolvedValue([]);
  mockTx.draftReservation.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: TxMock) => Promise<unknown>) => cb(mockTx),
  );
});

// ═══════════════════════════════════════════════════════════════
// T-result-shape-success
// ═══════════════════════════════════════════════════════════════

describe("updateDraftMeta — T-result-shape-success", () => {
  it("returns { ok: true, draft } on happy path", async () => {
    const draft = makeDraft();
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    const updated = makeDraft({
      version: 2,
      internalNote: "ny anteckning",
    });
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce({ status: "OPEN", version: 1 })
      .mockResolvedValueOnce(updated);

    const result = await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { internalNote: "ny anteckning" },
      { source: "admin_ui", userId: "user_1" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.version).toBe(2);
      expect(result.draft.internalNote).toBe("ny anteckning");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// T-result-shape-failure
// ═══════════════════════════════════════════════════════════════

describe("updateDraftMeta — T-result-shape-failure", () => {
  it("returns { ok: false, error } when not found", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);

    const result = await updateDraftMeta(
      "missing",
      "tenant_1",
      { internalNote: "x" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(DRAFT_ERRORS.NOT_FOUND);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// T-cross-tenant — exact NOT_FOUND copy, no leak
// ═══════════════════════════════════════════════════════════════

describe("updateDraftMeta — T-cross-tenant", () => {
  it("returns NOT_FOUND when draft belongs to a different tenant", async () => {
    // Simulating: prisma.findFirst with where { id, tenantId } returns
    // null because the tenantId doesn't match.
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);

    const result = await updateDraftMeta(
      "real_draft_in_alpha",
      "tenant_beta",
      { internalNote: "x" },
      { source: "admin_ui" },
    );

    expect(result).toEqual({ ok: false, error: DRAFT_ERRORS.NOT_FOUND });
    // Make sure the error string is exactly the constant — no tenant
    // leak, no "you don't have access", no path divergence.
    if (!result.ok) {
      expect(result.error).not.toMatch(/tenant/i);
      expect(result.error).not.toMatch(/access/i);
    }
  });

  it("CROSS_TENANT alias === NOT_FOUND (intentional)", () => {
    expect(DRAFT_ERRORS.CROSS_TENANT).toBe(DRAFT_ERRORS.NOT_FOUND);
  });
});

// ═══════════════════════════════════════════════════════════════
// T-terminal-status-rejection — each forbidden status, exact copy
// ═══════════════════════════════════════════════════════════════

describe("updateDraftMeta — T-terminal-status-rejection", () => {
  const forbidden = ["INVOICED", "PAID", "COMPLETED", "CANCELLED"] as const;
  for (const status of forbidden) {
    it(`rejects status ${status} with TERMINAL_STATUS copy`, async () => {
      mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft({ status }));

      const result = await updateDraftMeta(
        "draft_1",
        "tenant_1",
        { internalNote: "should be blocked" },
        { source: "admin_ui" },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(DRAFT_ERRORS.TERMINAL_STATUS(status));
        expect(result.error).toBe(`Utkast med status ${status} kan inte ändras`);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// T-event-emitted — META_UPDATED with diff metadata
// ═══════════════════════════════════════════════════════════════

describe("updateDraftMeta — T-event-emitted", () => {
  it("createDraftOrderEventInTx called with type META_UPDATED + diff", async () => {
    const before = makeDraft({
      internalNote: "old",
      tags: ["a"],
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(before);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce({ status: "OPEN", version: 1 })
      .mockResolvedValueOnce({
      ...before,
      internalNote: "new",
      tags: ["a", "b"],
      version: 2,
    });

    await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { internalNote: "new", tags: ["a", "b"] },
      { source: "admin_ui", userId: "user_1" },
    );

    expect(mockTx.draftOrderEvent.create).toHaveBeenCalledTimes(1);
    const args = mockTx.draftOrderEvent.create.mock.calls[0][0] as {
      data: {
        type: string;
        metadata: { diff: Record<string, unknown> };
        actorSource: string;
        actorUserId: string | null;
      };
    };
    expect(args.data.type).toBe("META_UPDATED");
    expect(args.data.actorSource).toBe("admin_ui");
    expect(args.data.actorUserId).toBe("user_1");
    expect(args.data.metadata.diff).toEqual({
      internalNote: { from: "old", to: "new" },
      tags: { from: ["a"], to: ["a", "b"] },
    });
  });

  it("no event emitted when patch is a no-op (no diff)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ internalNote: "same" }),
    );

    await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { internalNote: "same" },
      { source: "admin_ui" },
    );

    expect(mockTx.draftOrderEvent.create).not.toHaveBeenCalled();
    expect(mockTx.draftOrder.updateMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// T-version-increment
// ═══════════════════════════════════════════════════════════════

describe("updateDraftMeta — T-version-increment", () => {
  it("update payload includes { version: { increment: 1 } }", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce({ status: "OPEN", version: 1 })
      .mockResolvedValueOnce(makeDraft({ version: 2 }));

    await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { internalNote: "changed" },
      { source: "admin_ui" },
    );

    const args = mockTx.draftOrder.updateMany.mock.calls[0][0] as {
      data: { version: { increment: number } };
    };
    expect(args.data.version).toEqual({ increment: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════
// expiresAt diff handling
// ═══════════════════════════════════════════════════════════════

describe("updateDraftMeta — expiresAt diff", () => {
  it("ISO string from/to recorded in diff", async () => {
    const oldDate = new Date("2026-05-01T00:00:00Z");
    const newDate = new Date("2026-05-15T00:00:00Z");
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ expiresAt: oldDate }),
    );
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce({ status: "OPEN", version: 1 })
      .mockResolvedValueOnce(
      makeDraft({ expiresAt: newDate, version: 2 }),
    );

    await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { expiresAt: newDate },
      { source: "admin_ui" },
    );

    const args = mockTx.draftOrderEvent.create.mock.calls[0][0] as {
      data: { metadata: { diff: { expiresAt?: { from: string; to: string } } } };
    };
    expect(args.data.metadata.diff.expiresAt).toEqual({
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-15T00:00:00.000Z",
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// customerNote — added FAS 7.2b.4b.1
// ═══════════════════════════════════════════════════════════════

describe("updateDraftMeta — customerNote", () => {
  it("set: persists customerNote and records diff", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ customerNote: null }),
    );
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce({ status: "OPEN", version: 1 })
      .mockResolvedValueOnce(
      makeDraft({ customerNote: "Hej kund", version: 2 }),
    );

    const result = await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { customerNote: "Hej kund" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(true);
    const updateArgs = mockTx.draftOrder.updateMany.mock.calls[0][0] as {
      data: { customerNote: string | null };
    };
    expect(updateArgs.data.customerNote).toBe("Hej kund");

    const eventArgs = mockTx.draftOrderEvent.create.mock.calls[0][0] as {
      data: {
        metadata: {
          diff: { customerNote?: { from: string | null; to: string | null } };
        };
      };
    };
    expect(eventArgs.data.metadata.diff.customerNote).toEqual({
      from: null,
      to: "Hej kund",
    });
  });

  it("clear: customerNote → null persists and records diff", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ customerNote: "tidigare" }),
    );
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce({ status: "OPEN", version: 1 })
      .mockResolvedValueOnce(
      makeDraft({ customerNote: null, version: 2 }),
    );

    const result = await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { customerNote: null },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(true);
    const updateArgs = mockTx.draftOrder.updateMany.mock.calls[0][0] as {
      data: { customerNote: string | null };
    };
    expect(updateArgs.data.customerNote).toBeNull();
    const eventArgs = mockTx.draftOrderEvent.create.mock.calls[0][0] as {
      data: {
        metadata: {
          diff: { customerNote?: { from: string | null; to: string | null } };
        };
      };
    };
    expect(eventArgs.data.metadata.diff.customerNote).toEqual({
      from: "tidigare",
      to: null,
    });
  });

  it("no-op: same customerNote → no event", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ customerNote: "samma" }),
    );

    const result = await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { customerNote: "samma" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(true);
    expect(mockTx.draftOrderEvent.create).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// In-tx race protection (terminal status flips during tx)
// ═══════════════════════════════════════════════════════════════

describe("updateDraftMeta — in-tx race", () => {
  it("returns TERMINAL_STATUS if status flips inside tx", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft({ status: "OPEN" }));
    mockTx.draftOrder.findFirst.mockResolvedValue({ status: "INVOICED" });

    const result = await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { internalNote: "x" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(DRAFT_ERRORS.TERMINAL_STATUS("INVOICED"));
    }
    expect(mockTx.draftOrder.updateMany).not.toHaveBeenCalled();
  });
});
