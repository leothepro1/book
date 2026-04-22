import { describe, it, expect, vi, beforeEach } from "vitest";

const cancellationRequestFindFirst = vi.fn();
const cancellationRequestUpdateMany = vi.fn();
const cancellationEventCreate = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    cancellationRequest: {
      findFirst: (...a: unknown[]) => cancellationRequestFindFirst(...a),
      updateMany: (...a: unknown[]) => cancellationRequestUpdateMany(...a),
    },
    cancellationEvent: {
      create: (...a: unknown[]) => cancellationEventCreate(...a),
    },
  },
}));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/observability/sentry", () => ({
  setSentryTenantContext: vi.fn(),
}));

const { declineCancellationRequest } = await import("./decline");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("declineCancellationRequest", () => {
  it("transitions REQUESTED → DECLINED with reason + note", async () => {
    cancellationRequestFindFirst.mockResolvedValue({
      id: "cr_1",
      status: "REQUESTED",
      version: 1,
    });
    cancellationRequestUpdateMany.mockResolvedValue({ count: 1 });

    await declineCancellationRequest({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
      actor: "STAFF",
      actorUserId: "user_admin",
      declineReason: "OUTSIDE_WINDOW",
      declineNote: "Sorry, window closed.",
    });

    const update = cancellationRequestUpdateMany.mock.calls[0][0] as {
      data: { status: string; declineReason: string; declineNote: string };
    };
    expect(update.data.status).toBe("DECLINED");
    expect(update.data.declineReason).toBe("OUTSIDE_WINDOW");
    expect(update.data.declineNote).toBe("Sorry, window closed.");

    expect(cancellationEventCreate).toHaveBeenCalledOnce();
  });

  it("rejects with INVALID_STATE when not REQUESTED", async () => {
    cancellationRequestFindFirst.mockResolvedValue({
      id: "cr_1",
      status: "CLOSED",
      version: 3,
    });

    await expect(
      declineCancellationRequest({
        tenantId: "tenant_1",
        cancellationRequestId: "cr_1",
        actor: "STAFF",
        declineReason: "OTHER",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("rejects with NOT_FOUND when request does not exist in tenant", async () => {
    cancellationRequestFindFirst.mockResolvedValue(null);
    await expect(
      declineCancellationRequest({
        tenantId: "tenant_1",
        cancellationRequestId: "cr_missing",
        actor: "STAFF",
        declineReason: "OTHER",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects with INVALID_STATE when concurrent update stole the version", async () => {
    cancellationRequestFindFirst.mockResolvedValue({
      id: "cr_1",
      status: "REQUESTED",
      version: 1,
    });
    cancellationRequestUpdateMany.mockResolvedValue({ count: 0 }); // lost the race

    await expect(
      declineCancellationRequest({
        tenantId: "tenant_1",
        cancellationRequestId: "cr_1",
        actor: "STAFF",
        declineReason: "OTHER",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("rejects declineNote > 500 chars", async () => {
    await expect(
      declineCancellationRequest({
        tenantId: "tenant_1",
        cancellationRequestId: "cr_1",
        actor: "STAFF",
        declineReason: "OTHER",
        declineNote: "x".repeat(501),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
