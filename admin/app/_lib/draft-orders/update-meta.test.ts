import { describe, it, expect, vi, beforeEach } from "vitest";
import { DRAFT_ERRORS } from "./errors";

// ── Mocks ────────────────────────────────────────────────────────

type TxMock = {
  draftOrder: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  draftOrderEvent: {
    create: ReturnType<typeof vi.fn>;
  };
};

const mockTx: TxMock = {
  draftOrder: {
    findFirst: vi.fn(),
    update: vi.fn(),
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
  mockTx.draftOrder.update.mockResolvedValue(makeDraft({ version: 2 }));
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
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
    mockTx.draftOrder.findFirst.mockResolvedValue({ status: "OPEN" });
    const updated = makeDraft({
      version: 2,
      internalNote: "ny anteckning",
    });
    mockTx.draftOrder.update.mockResolvedValue(updated);

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
    mockTx.draftOrder.findFirst.mockResolvedValue({ status: "OPEN" });
    mockTx.draftOrder.update.mockResolvedValue({
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
    expect(mockTx.draftOrder.update).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// T-version-increment
// ═══════════════════════════════════════════════════════════════

describe("updateDraftMeta — T-version-increment", () => {
  it("update payload includes { version: { increment: 1 } }", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
    mockTx.draftOrder.findFirst.mockResolvedValue({ status: "OPEN" });
    mockTx.draftOrder.update.mockResolvedValue(makeDraft({ version: 2 }));

    await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { internalNote: "changed" },
      { source: "admin_ui" },
    );

    const args = mockTx.draftOrder.update.mock.calls[0][0] as {
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
    mockTx.draftOrder.findFirst.mockResolvedValue({ status: "OPEN" });
    mockTx.draftOrder.update.mockResolvedValue(
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
    expect(mockTx.draftOrder.update).not.toHaveBeenCalled();
  });
});
