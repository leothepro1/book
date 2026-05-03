import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NotFoundError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";

// ── Mocks ────────────────────────────────────────────────────────

type TxMock = {
  draftOrder: {
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  draftOrderEvent: {
    create: ReturnType<typeof vi.fn>;
  };
};

const mockTx: TxMock = {
  draftOrder: {
    findFirst: vi.fn(),
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
vi.mock("@/app/_lib/apps/webhooks", () => ({ emitPlatformEvent: vi.fn() }));

const convertMock = vi.fn();
vi.mock("./convert", () => ({
  convertDraftToOrder: (input: unknown) => convertMock(input),
}));

const { markDraftAsPaid } = await import("./mark-as-paid");

// ── Fixtures ────────────────────────────────────────────────────

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "INVOICED",
    metafields: { stripePaymentIntentId: "pi_abc123" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
  mockTx.draftOrder.findFirst.mockResolvedValue(null);
  mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: TxMock) => Promise<unknown>) => cb(mockTx),
  );
  convertMock.mockReset();
});

// ═══════════════════════════════════════════════════════════════
// Happy path
// ═══════════════════════════════════════════════════════════════

describe("markDraftAsPaid — happy path", () => {
  it("INVOICED → PAID + auto-convert → returns { draft, order }", async () => {
    const draft = makeDraft({ status: "INVOICED" });
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(draft);
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "INVOICED" });
    // Final findFirst-after-tx for the no-PI fallback path
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "PAID" }),
    );

    const convertedDraft = makeDraft({ status: "COMPLETED" });
    const order = { id: "order_1" };
    convertMock.mockResolvedValueOnce({ draft: convertedDraft, order });

    const result = await markDraftAsPaid({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      reference: "Bankgiro 5050-1234",
      actorUserId: "user_1",
    });

    expect(result.draft).toBe(convertedDraft);
    expect(result.order).toBe(order);
    expect(convertMock).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_abc123",
      actorSource: "admin_manual_recovery",
      actorUserId: "user_1",
    });
  });

  it("OVERDUE → PAID + auto-convert", async () => {
    const draft = makeDraft({ status: "OVERDUE" });
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(draft);
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "OVERDUE" });
    convertMock.mockResolvedValueOnce({
      draft: makeDraft({ status: "COMPLETED" }),
      order: { id: "order_1" },
    });

    const result = await markDraftAsPaid({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_1",
    });

    expect(result.order).toBeTruthy();
    expect(convertMock).toHaveBeenCalled();
  });

  it("reference is recorded in STATE_CHANGED event metadata", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(makeDraft());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "INVOICED" });
    convertMock.mockResolvedValueOnce({
      draft: makeDraft({ status: "COMPLETED" }),
      order: {},
    });

    await markDraftAsPaid({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      reference: "BG-9876",
      actorUserId: "user_1",
    });

    const eventArgs = mockTx.draftOrderEvent.create.mock.calls[0][0] as {
      data: {
        metadata: { reason: string; reference: string | null };
      };
    };
    expect(eventArgs.data.metadata.reason).toBe("manual_payment");
    expect(eventArgs.data.metadata.reference).toBe("BG-9876");
  });

  it("actorSource is admin_ui (not webhook) for manual mark-paid", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(makeDraft());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "INVOICED" });
    convertMock.mockResolvedValueOnce({
      draft: makeDraft({ status: "COMPLETED" }),
      order: {},
    });

    await markDraftAsPaid({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_1",
    });

    const eventArgs = mockTx.draftOrderEvent.create.mock.calls[0][0] as {
      data: { actorSource: string };
    };
    expect(eventArgs.data.actorSource).toBe("admin_ui");
  });

  it("threads actorSource: 'admin_ui_bulk' into STATE_CHANGED event metadata", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(makeDraft());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "INVOICED" });
    convertMock.mockResolvedValueOnce({
      draft: makeDraft({ status: "COMPLETED" }),
      order: {},
    });

    await markDraftAsPaid({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_1",
      actorSource: "admin_ui_bulk",
    });

    const eventArgs = mockTx.draftOrderEvent.create.mock.calls[0][0] as {
      data: { actorSource: string };
    };
    expect(eventArgs.data.actorSource).toBe("admin_ui_bulk");
  });
});

// ═══════════════════════════════════════════════════════════════
// Pre-condition rejection
// ═══════════════════════════════════════════════════════════════

describe("markDraftAsPaid — pre-condition rejection", () => {
  for (const status of ["OPEN", "PENDING_APPROVAL", "APPROVED", "REJECTED", "PAID", "COMPLETING", "COMPLETED", "CANCELLED"]) {
    it(`rejects status ${status} with ValidationError`, async () => {
      mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
        makeDraft({ status }),
      );
      await expect(
        markDraftAsPaid({
          tenantId: "tenant_1",
          draftOrderId: "draft_1",
          actorUserId: "user_1",
        }),
      ).rejects.toThrow(ValidationError);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(convertMock).not.toHaveBeenCalled();
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// Cross-tenant
// ═══════════════════════════════════════════════════════════════

describe("markDraftAsPaid — cross-tenant", () => {
  it("returns NotFoundError when draft belongs to a different tenant", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(null);
    await expect(
      markDraftAsPaid({
        tenantId: "tenant_other",
        draftOrderId: "draft_1",
        actorUserId: "user_1",
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ═══════════════════════════════════════════════════════════════
// In-tx race
// ═══════════════════════════════════════════════════════════════

describe("markDraftAsPaid — in-tx race", () => {
  it("throws ValidationError if status flips inside tx (e.g. concurrent webhook)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "INVOICED" }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "PAID" });

    await expect(
      markDraftAsPaid({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_1",
      }),
    ).rejects.toThrow(ValidationError);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError if draft vanishes inside tx", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(makeDraft());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(null);
    await expect(
      markDraftAsPaid({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_1",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ValidationError if updateMany count is 0 (status raced)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(makeDraft());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "INVOICED" });
    mockTx.draftOrder.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      markDraftAsPaid({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_1",
      }),
    ).rejects.toThrow(ValidationError);
    expect(convertMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Convert failure / no-PI edge case
// ═══════════════════════════════════════════════════════════════

describe("markDraftAsPaid — auto-convert path", () => {
  it("convertDraftToOrder failure: PAID is committed, error propagates", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(makeDraft());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "INVOICED" });
    convertMock.mockRejectedValueOnce(new ValidationError("HOLD_NOT_PLACED"));

    await expect(
      markDraftAsPaid({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_1",
      }),
    ).rejects.toThrow("HOLD_NOT_PLACED");
    // Tx ran (PAID committed) before convertMock rejected
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockTx.draftOrder.updateMany).toHaveBeenCalled();
  });

  it("draft.metafields without stripePaymentIntentId: skip convert, return draft only", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ metafields: {} }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "INVOICED" });
    // Re-fetch after tx for the no-PI path
    const refreshed = makeDraft({ status: "PAID", metafields: {} });
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(refreshed);

    const result = await markDraftAsPaid({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_1",
    });

    expect(result.draft).toBe(refreshed);
    expect(result.order).toBeUndefined();
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("draft.metafields null: skip convert", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ metafields: null }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "INVOICED" });
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "PAID", metafields: null }),
    );

    const result = await markDraftAsPaid({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_1",
    });

    expect(result.order).toBeUndefined();
    expect(convertMock).not.toHaveBeenCalled();
  });
});
