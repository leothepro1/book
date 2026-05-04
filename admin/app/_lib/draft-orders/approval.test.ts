import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConflictError,
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
  $transaction: vi.fn(async (cb: (tx: TxMock) => Promise<unknown>) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));

const logMock = vi.fn();
vi.mock("@/app/_lib/logger", () => ({ log: (...args: unknown[]) => logMock(...args) }));

vi.mock("@/app/_lib/apps/webhooks", () => ({
  emitPlatformEvent: vi.fn(() => Promise.resolve()),
}));

const { submitForApproval, approveDraft, rejectDraft } = await import(
  "./approval"
);

// ── Fixtures ────────────────────────────────────────────────────

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "OPEN",
    createdByUserId: "user_creator",
    displayNumber: "D-2026-0042",
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
  logMock.mockReset();
});

// ═══════════════════════════════════════════════════════════════
// submitForApproval
// ═══════════════════════════════════════════════════════════════

describe("submitForApproval — happy path", () => {
  it("OPEN → PENDING_APPROVAL with requestNote in event metadata", async () => {
    const draft = makeDraft({ status: "OPEN" });
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(draft);
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "OPEN" });
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "PENDING_APPROVAL" }),
    );
    // Final tx-internal findFirst for the refreshed draft.
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "PENDING_APPROVAL" }),
    );

    const result = await submitForApproval({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_actor",
      requestNote: "Please review by Friday",
    });

    expect(result.draft.status).toBe("PENDING_APPROVAL");

    // Two events created in tx: STATE_CHANGED (via helper) +
    // APPROVAL_REQUESTED (dedicated).
    expect(mockTx.draftOrderEvent.create).toHaveBeenCalledTimes(2);
    const dedicatedCall = mockTx.draftOrderEvent.create.mock.calls.find(
      (c) =>
        (c[0] as { data: { type: string } }).data.type === "APPROVAL_REQUESTED",
    );
    expect(dedicatedCall).toBeTruthy();
    const dedicatedData = (dedicatedCall![0] as { data: {
      type: string;
      metadata: { requestNote?: string };
      actorUserId: string | null;
      actorSource: string;
    } }).data;
    expect(dedicatedData.metadata.requestNote).toBe("Please review by Friday");
    expect(dedicatedData.actorUserId).toBe("user_actor");
    expect(dedicatedData.actorSource).toBe("admin_ui");
  });

  it("happy path with no requestNote omits the field from metadata", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(makeDraft());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "OPEN" });
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "PENDING_APPROVAL" }),
    );

    await submitForApproval({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_actor",
    });

    const dedicatedCall = mockTx.draftOrderEvent.create.mock.calls.find(
      (c) =>
        (c[0] as { data: { type: string } }).data.type === "APPROVAL_REQUESTED",
    );
    const meta = (dedicatedCall![0] as { data: { metadata: Record<string, unknown> } })
      .data.metadata;
    expect(meta).toEqual({});
    expect("requestNote" in meta).toBe(false);
  });
});

describe("submitForApproval — pre-condition rejection", () => {
  for (const status of [
    "PENDING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "INVOICED",
    "OVERDUE",
    "PAID",
    "COMPLETED",
    "CANCELLED",
  ]) {
    it(`rejects status ${status} with ValidationError`, async () => {
      mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
        makeDraft({ status }),
      );
      await expect(
        submitForApproval({
          tenantId: "tenant_1",
          draftOrderId: "draft_1",
          actorUserId: "user_actor",
        }),
      ).rejects.toThrow(ValidationError);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  }
});

describe("submitForApproval — race + cross-tenant", () => {
  it("returns NotFoundError when draft belongs to a different tenant", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(null);
    await expect(
      submitForApproval({
        tenantId: "tenant_other",
        draftOrderId: "draft_1",
        actorUserId: "user_actor",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("ConflictError if status changes inside tx (concurrent submit)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(makeDraft());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({
      status: "PENDING_APPROVAL",
    });
    await expect(
      submitForApproval({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_actor",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("ConflictError when updateMany count is 0 (status raced)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(makeDraft());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "OPEN" });
    mockTx.draftOrder.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      submitForApproval({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_actor",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("missing actorUserId throws via Zod", async () => {
    await expect(
      submitForApproval({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        // @ts-expect-error — testing missing required field
        actorUserId: undefined,
      }),
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// approveDraft
// ═══════════════════════════════════════════════════════════════

describe("approveDraft — happy path", () => {
  it("PENDING_APPROVAL → APPROVED, emits dedicated APPROVAL_GRANTED event", async () => {
    const draft = makeDraft({
      status: "PENDING_APPROVAL",
      createdByUserId: "user_creator",
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(draft);
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({
      status: "PENDING_APPROVAL",
      createdByUserId: "user_creator",
    });
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "APPROVED" }),
    );

    const result = await approveDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_approver", // different from createdByUserId
      approvalNote: "LGTM",
    });

    expect(result.draft.status).toBe("APPROVED");

    const dedicatedCall = mockTx.draftOrderEvent.create.mock.calls.find(
      (c) =>
        (c[0] as { data: { type: string } }).data.type === "APPROVAL_GRANTED",
    );
    expect(dedicatedCall).toBeTruthy();
    const meta = (
      dedicatedCall![0] as {
        data: { metadata: { approvalNote?: string } };
      }
    ).data.metadata;
    expect(meta.approvalNote).toBe("LGTM");
  });

  it("happy path with no approvalNote omits the field from metadata", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({
        status: "PENDING_APPROVAL",
        createdByUserId: "user_creator",
      }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({
      status: "PENDING_APPROVAL",
      createdByUserId: "user_creator",
    });
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "APPROVED" }),
    );

    await approveDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_approver",
    });

    const dedicatedCall = mockTx.draftOrderEvent.create.mock.calls.find(
      (c) =>
        (c[0] as { data: { type: string } }).data.type === "APPROVAL_GRANTED",
    );
    const meta = (
      dedicatedCall![0] as { data: { metadata: Record<string, unknown> } }
    ).data.metadata;
    expect(meta).toEqual({});
  });
});

describe("approveDraft — self-approval block (Q1)", () => {
  it("blocks approval when actorUserId === createdByUserId (pre-tx)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({
        status: "PENDING_APPROVAL",
        createdByUserId: "user_same",
      }),
    );

    await expect(
      approveDraft({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_same",
      }),
    ).rejects.toThrow(ValidationError);
    // Should not even open the transaction.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("approveDraft — Q3 legacy null createdByUserId", () => {
  it("permits approval when createdByUserId is null + emits warn log", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "PENDING_APPROVAL", createdByUserId: null }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({
      status: "PENDING_APPROVAL",
      createdByUserId: null,
    });
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "APPROVED", createdByUserId: null }),
    );

    const result = await approveDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_actor",
    });
    expect(result.draft.status).toBe("APPROVED");

    // Two warn logs expected: pre-tx + in-tx.
    const warnCalls = logMock.mock.calls.filter(
      (c) =>
        c[0] === "warn" &&
        c[1] === "draft_order.approve.legacy_null_creator_skip_self_check",
    );
    expect(warnCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("approveDraft — pre-condition rejection", () => {
  for (const status of [
    "OPEN",
    "APPROVED",
    "REJECTED",
    "INVOICED",
    "PAID",
    "COMPLETED",
    "CANCELLED",
  ]) {
    it(`rejects status ${status} with ValidationError`, async () => {
      mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
        makeDraft({ status, createdByUserId: "user_creator" }),
      );
      await expect(
        approveDraft({
          tenantId: "tenant_1",
          draftOrderId: "draft_1",
          actorUserId: "user_approver",
        }),
      ).rejects.toThrow(ValidationError);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  }
});

describe("approveDraft — race", () => {
  it("ConflictError if status flips inside tx (e.g. concurrent reject)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({
        status: "PENDING_APPROVAL",
        createdByUserId: "user_creator",
      }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({
      status: "REJECTED",
      createdByUserId: "user_creator",
    });

    await expect(
      approveDraft({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_approver",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("ConflictError when updateMany count is 0", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({
        status: "PENDING_APPROVAL",
        createdByUserId: "user_creator",
      }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({
      status: "PENDING_APPROVAL",
      createdByUserId: "user_creator",
    });
    mockTx.draftOrder.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      approveDraft({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_approver",
      }),
    ).rejects.toThrow(ConflictError);
  });
});

// ═══════════════════════════════════════════════════════════════
// rejectDraft
// ═══════════════════════════════════════════════════════════════

describe("rejectDraft — happy path", () => {
  it("PENDING_APPROVAL → REJECTED with rejectionReason in event metadata", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({
        status: "PENDING_APPROVAL",
        createdByUserId: "user_creator",
      }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({
      status: "PENDING_APPROVAL",
    });
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "REJECTED" }),
    );

    const result = await rejectDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_approver",
      rejectionReason: "Pris för högt jämfört med konkurrenter",
    });

    expect(result.draft.status).toBe("REJECTED");

    const dedicatedCall = mockTx.draftOrderEvent.create.mock.calls.find(
      (c) =>
        (c[0] as { data: { type: string } }).data.type === "APPROVAL_REJECTED",
    );
    expect(dedicatedCall).toBeTruthy();
    const meta = (
      dedicatedCall![0] as {
        data: { metadata: { rejectionReason: string } };
      }
    ).data.metadata;
    expect(meta.rejectionReason).toBe("Pris för högt jämfört med konkurrenter");
  });

  it("self-rejection is allowed (Q1: only approval is self-blocked)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({
        status: "PENDING_APPROVAL",
        createdByUserId: "user_same",
      }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({
      status: "PENDING_APPROVAL",
    });
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "REJECTED" }),
    );

    const result = await rejectDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_same",
      rejectionReason: "Recall the request",
    });
    expect(result.draft.status).toBe("REJECTED");
  });
});

describe("rejectDraft — required rejectionReason (Q2 LOCKED)", () => {
  it("throws when rejectionReason is empty string", async () => {
    await expect(
      rejectDraft({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_approver",
        rejectionReason: "",
      }),
    ).rejects.toThrow();
  });

  it("throws when rejectionReason is missing", async () => {
    await expect(
      rejectDraft({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_approver",
        // @ts-expect-error — testing missing required field
        rejectionReason: undefined,
      }),
    ).rejects.toThrow();
  });

  it("throws when rejectionReason exceeds 500 chars (Q5)", async () => {
    await expect(
      rejectDraft({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_approver",
        rejectionReason: "x".repeat(501),
      }),
    ).rejects.toThrow();
  });
});

describe("rejectDraft — pre-condition rejection", () => {
  for (const status of [
    "OPEN",
    "APPROVED",
    "REJECTED",
    "INVOICED",
    "PAID",
    "COMPLETED",
    "CANCELLED",
  ]) {
    it(`rejects status ${status} with ValidationError`, async () => {
      mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
        makeDraft({ status }),
      );
      await expect(
        rejectDraft({
          tenantId: "tenant_1",
          draftOrderId: "draft_1",
          actorUserId: "user_approver",
          rejectionReason: "x",
        }),
      ).rejects.toThrow(ValidationError);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  }
});

describe("rejectDraft — race", () => {
  it("ConflictError if status flips inside tx", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "PENDING_APPROVAL" }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({ status: "APPROVED" });

    await expect(
      rejectDraft({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_approver",
        rejectionReason: "Reason",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("ConflictError when updateMany count is 0", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "PENDING_APPROVAL" }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce({
      status: "PENDING_APPROVAL",
    });
    mockTx.draftOrder.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      rejectDraft({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        actorUserId: "user_approver",
        rejectionReason: "Reason",
      }),
    ).rejects.toThrow(ConflictError);
  });
});
