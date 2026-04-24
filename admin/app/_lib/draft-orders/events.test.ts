import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  draftOrderEvent: { create: vi.fn() },
};
const mockLog = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: mockLog }));

const { createDraftOrderEvent, createDraftOrderEventInTx } = await import(
  "./events"
);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Non-tx variant ───────────────────────────────────────────

describe("createDraftOrderEvent (non-tx)", () => {
  it("writes an event with full payload", async () => {
    mockPrisma.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });

    await createDraftOrderEvent({
      tenantId: "t",
      draftOrderId: "d",
      type: "LINE_ADDED",
      metadata: { lineItemId: "dli_1" },
      actorUserId: "user_1",
      actorSource: "admin_ui",
    });

    expect(mockPrisma.draftOrderEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId: "t",
        draftOrderId: "d",
        type: "LINE_ADDED",
        metadata: { lineItemId: "dli_1" },
        actorUserId: "user_1",
        actorSource: "admin_ui",
      },
    });
  });

  it("defaults metadata to {} when omitted", async () => {
    mockPrisma.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });

    await createDraftOrderEvent({
      tenantId: "t",
      draftOrderId: "d",
      type: "CREATED",
    });

    const call = mockPrisma.draftOrderEvent.create.mock.calls[0][0];
    expect(call.data.metadata).toEqual({});
    expect(call.data.actorUserId).toBeNull();
    expect(call.data.actorSource).toBeNull();
  });

  it("swallows DB errors and logs (audit must not block business ops)", async () => {
    mockPrisma.draftOrderEvent.create.mockRejectedValue(new Error("db down"));

    await expect(
      createDraftOrderEvent({
        tenantId: "t",
        draftOrderId: "d",
        type: "CREATED",
      }),
    ).resolves.toBeUndefined();

    expect(mockLog).toHaveBeenCalledWith(
      "error",
      "draft_order_event.create_failed",
      expect.objectContaining({ tenantId: "t", draftOrderId: "d" }),
    );
  });
});

// ── Tx variant ───────────────────────────────────────────────

describe("createDraftOrderEventInTx", () => {
  it("uses the passed tx client, not the global prisma", async () => {
    const mockTx = {
      draftOrderEvent: { create: vi.fn().mockResolvedValue({}) },
    };

    await createDraftOrderEventInTx(mockTx as never, {
      tenantId: "t",
      draftOrderId: "d",
      type: "LINE_ADDED",
    });

    expect(mockTx.draftOrderEvent.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.draftOrderEvent.create).not.toHaveBeenCalled();
  });

  it("propagates DB errors (caller's tx should rollback)", async () => {
    const mockTx = {
      draftOrderEvent: {
        create: vi.fn().mockRejectedValue(new Error("constraint")),
      },
    };

    await expect(
      createDraftOrderEventInTx(mockTx as never, {
        tenantId: "t",
        draftOrderId: "d",
        type: "CREATED",
      }),
    ).rejects.toThrow("constraint");

    // No swallow-log in the tx variant.
    expect(mockLog).not.toHaveBeenCalled();
  });
});
