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

const { withdrawCancellationRequest } = await import("./withdraw");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withdrawCancellationRequest", () => {
  it("transitions REQUESTED → CANCELED", async () => {
    cancellationRequestFindFirst.mockResolvedValue({
      id: "cr_1",
      status: "REQUESTED",
      version: 1,
    });
    cancellationRequestUpdateMany.mockResolvedValue({ count: 1 });

    await withdrawCancellationRequest({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
      actor: "GUEST",
    });

    const update = cancellationRequestUpdateMany.mock.calls[0][0] as {
      data: { status: string };
    };
    expect(update.data.status).toBe("CANCELED");
  });

  it("rejects from OPEN (cannot withdraw mid-saga)", async () => {
    cancellationRequestFindFirst.mockResolvedValue({
      id: "cr_1",
      status: "OPEN",
      version: 2,
    });

    await expect(
      withdrawCancellationRequest({
        tenantId: "tenant_1",
        cancellationRequestId: "cr_1",
        actor: "GUEST",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("rejects from terminal statuses", async () => {
    for (const status of ["CLOSED", "DECLINED", "CANCELED", "EXPIRED"] as const) {
      cancellationRequestFindFirst.mockResolvedValue({
        id: "cr_1",
        status,
        version: 1,
      });
      await expect(
        withdrawCancellationRequest({
          tenantId: "tenant_1",
          cancellationRequestId: "cr_1",
          actor: "GUEST",
        }),
      ).rejects.toMatchObject({ code: "INVALID_STATE" });
    }
  });

  it("rejects when not found", async () => {
    cancellationRequestFindFirst.mockResolvedValue(null);
    await expect(
      withdrawCancellationRequest({
        tenantId: "tenant_1",
        cancellationRequestId: "missing",
        actor: "GUEST",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
