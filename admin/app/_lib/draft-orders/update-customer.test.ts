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
  guestAccount: {
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

const { updateDraftCustomer } = await import("./update-customer");

// ── Fixtures ────────────────────────────────────────────────────

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "OPEN",
    guestAccountId: null as string | null,
    version: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
  mockPrisma.guestAccount.findFirst.mockResolvedValue({ id: "guest_new" });
  mockTx.draftOrder.findFirst.mockResolvedValue(null);
  mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  // Phase D — unlink defaults: no active session.
  mockTx.draftCheckoutSession.findFirst.mockResolvedValue(null);
  mockTx.draftCheckoutSession.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftReservation.findMany.mockResolvedValue([]);
  mockTx.draftReservation.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: TxMock) => Promise<unknown>) => cb(mockTx),
  );
});

// ═══════════════════════════════════════════════════════════════
// Happy path
// ═══════════════════════════════════════════════════════════════

describe("updateDraftCustomer — happy path", () => {
  it("changes customer on OPEN draft → ok, version++, event with diff", async () => {
    const draft = makeDraft({ guestAccountId: "guest_old" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    const updated = makeDraft({ version: 2, guestAccountId: "guest_new" });
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce({ status: "OPEN", version: 1 })
      .mockResolvedValueOnce(updated);

    const result = await updateDraftCustomer(
      "draft_1",
      "tenant_1",
      { guestAccountId: "guest_new" },
      { source: "admin_ui", userId: "user_1" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.version).toBe(2);
      expect(result.draft.guestAccountId).toBe("guest_new");
    }
    expect(mockTx.draftOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guestAccountId: "guest_new",
          version: { increment: 1 },
        }),
      }),
    );
    expect(mockTx.draftOrderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "CUSTOMER_UPDATED",
        metadata: {
          diff: {
            guestAccountId: { from: "guest_old", to: "guest_new" },
          },
        },
        actorUserId: "user_1",
        actorSource: "admin_ui",
      }),
    });
  });

  it("clears customer (guestAccountId: null) → ok, draft.guestAccountId === null", async () => {
    const draft = makeDraft({ guestAccountId: "guest_old" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    const updated = makeDraft({ version: 2, guestAccountId: null });
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce({ status: "OPEN", version: 1 })
      .mockResolvedValueOnce(updated);

    const result = await updateDraftCustomer(
      "draft_1",
      "tenant_1",
      { guestAccountId: null },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.guestAccountId).toBeNull();
    }
    // Clear path skips guestAccount existence check.
    expect(mockPrisma.guestAccount.findFirst).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// No-op detection
// ═══════════════════════════════════════════════════════════════

describe("updateDraftCustomer — no-op", () => {
  it("same guestAccountId → ok, no event, no tx", async () => {
    const draft = makeDraft({ guestAccountId: "guest_same" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);

    const result = await updateDraftCustomer(
      "draft_1",
      "tenant_1",
      { guestAccountId: "guest_same" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft).toEqual(draft);
    }
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.draftOrderEvent.create).not.toHaveBeenCalled();
    expect(mockPrisma.guestAccount.findFirst).not.toHaveBeenCalled();
  });

  it("both null (still no customer) → no-op", async () => {
    const draft = makeDraft({ guestAccountId: null });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);

    const result = await updateDraftCustomer(
      "draft_1",
      "tenant_1",
      { guestAccountId: null },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(true);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Cross-tenant guard
// ═══════════════════════════════════════════════════════════════

describe("updateDraftCustomer — cross-tenant", () => {
  it("returns NOT_FOUND when draft belongs to a different tenant", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);

    const result = await updateDraftCustomer(
      "draft_in_alpha",
      "tenant_beta",
      { guestAccountId: "guest_x" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(DRAFT_ERRORS.NOT_FOUND);
    }
  });

  it("returns INVALID_CUSTOMER when guestAccount is in another tenant", async () => {
    const draft = makeDraft({ guestAccountId: null });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    // GuestAccount lookup scoped by tenantId returns null on cross-tenant.
    mockPrisma.guestAccount.findFirst.mockResolvedValue(null);

    const result = await updateDraftCustomer(
      "draft_1",
      "tenant_1",
      { guestAccountId: "guest_in_other_tenant" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(DRAFT_ERRORS.INVALID_CUSTOMER);
    }
    // Tx should not have been opened.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Status gate
// ═══════════════════════════════════════════════════════════════

describe("updateDraftCustomer — status gate", () => {
  const TERMINAL_STATUSES = [
    "REJECTED",
    "INVOICED",
    "PAID",
    "OVERDUE",
    "COMPLETING",
    "COMPLETED",
    "CANCELLED",
  ];

  for (const status of TERMINAL_STATUSES) {
    it(`rejects status ${status} with TERMINAL_STATUS copy`, async () => {
      const draft = makeDraft({ status });
      mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);

      const result = await updateDraftCustomer(
        "draft_1",
        "tenant_1",
        { guestAccountId: "guest_new" },
        { source: "admin_ui" },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(DRAFT_ERRORS.TERMINAL_STATUS(status));
      }
    });
  }

  it("allows OPEN, PENDING_APPROVAL, APPROVED", async () => {
    for (const status of ["OPEN", "PENDING_APPROVAL", "APPROVED"] as const) {
      vi.resetAllMocks();
      mockPrisma.guestAccount.findFirst.mockResolvedValue({ id: "g" });
      const draft = makeDraft({ status, guestAccountId: null });
      mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
      mockTx.draftOrder.findFirst
        .mockResolvedValueOnce({ status, version: 1 })
        .mockResolvedValueOnce(
          makeDraft({ status, version: 2, guestAccountId: "guest_new" }),
        );
      mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });
      // Phase D defaults — no active session.
      mockTx.draftCheckoutSession.findFirst.mockResolvedValue(null);
      mockTx.draftReservation.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: TxMock) => Promise<unknown>) => cb(mockTx),
      );

      const result = await updateDraftCustomer(
        "draft_1",
        "tenant_1",
        { guestAccountId: "guest_new" },
        { source: "admin_ui" },
      );

      expect(result.ok).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// In-tx race
// ═══════════════════════════════════════════════════════════════

describe("updateDraftCustomer — in-tx race", () => {
  it("returns TERMINAL_STATUS if status flips inside tx", async () => {
    const draft = makeDraft({ guestAccountId: null });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    // Inside tx: status flipped to INVOICED
    mockTx.draftOrder.findFirst.mockResolvedValue({ status: "INVOICED" });

    const result = await updateDraftCustomer(
      "draft_1",
      "tenant_1",
      { guestAccountId: "guest_new" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(DRAFT_ERRORS.TERMINAL_STATUS("INVOICED"));
    }
    expect(mockTx.draftOrder.updateMany).not.toHaveBeenCalled();
    expect(mockTx.draftOrderEvent.create).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND if draft vanishes inside tx", async () => {
    const draft = makeDraft({ guestAccountId: null });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    mockTx.draftOrder.findFirst.mockResolvedValue(null);

    const result = await updateDraftCustomer(
      "draft_1",
      "tenant_1",
      { guestAccountId: "guest_new" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(DRAFT_ERRORS.NOT_FOUND);
    }
  });
});
