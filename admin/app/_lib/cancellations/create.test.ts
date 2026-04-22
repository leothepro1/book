import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ── Prisma mocks ─────────────────────────────────────────────────
const bookingFindFirst = vi.fn();
const orderFindFirst = vi.fn();
const integrationFindUnique = vi.fn();
const cancellationRequestCreate = vi.fn();
const cancellationRequestFindFirst = vi.fn();
const cancellationRequestFindUnique = vi.fn();
const cancellationRequestUpdateMany = vi.fn();
const cancellationRequestUpdate = vi.fn();
const cancellationEventCreate = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    booking: { findFirst: (...a: unknown[]) => bookingFindFirst(...a) },
    order: { findFirst: (...a: unknown[]) => orderFindFirst(...a) },
    tenantIntegration: {
      findUnique: (...a: unknown[]) => integrationFindUnique(...a),
    },
    cancellationRequest: {
      create: (...a: unknown[]) => cancellationRequestCreate(...a),
      findFirst: (...a: unknown[]) => cancellationRequestFindFirst(...a),
      findUnique: (...a: unknown[]) => cancellationRequestFindUnique(...a),
      updateMany: (...a: unknown[]) => cancellationRequestUpdateMany(...a),
      update: (...a: unknown[]) => cancellationRequestUpdate(...a),
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

// Auto-approve path calls approve → engine → needs stubs for everything
// below. approve's internal runCancellationSaga is stubbed to a no-op
// because the engine's own full paths are covered in engine.test.ts.
vi.mock("./engine", () => ({
  runCancellationSaga: vi.fn(async () => undefined),
}));

const { createCancellationRequest } = await import("./create");
const { CancellationError } = await import("./errors");

// ── Fixtures ──────────────────────────────────────────────────────
function validSnapshot() {
  return {
    policyId: "cup_test",
    policyName: "Flexible",
    tiers: [
      { hoursBeforeCheckIn: 720, feePercent: 0 },
      { hoursBeforeCheckIn: 0, feePercent: 100 },
    ],
    requireApproval: true,
    autoExpireHours: 48,
    snapshottedAt: new Date("2026-04-01T00:00:00Z").toISOString(),
  };
}

function baseBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking_1",
    tenantId: "tenant_1",
    status: "PRE_CHECKIN",
    checkIn: new Date("2026-06-01T15:00:00Z"),
    arrival: new Date("2026-06-01T15:00:00Z"),
    orderId: "order_1",
    cancellationPolicySnapshot: validSnapshot(),
    ...overrides,
  };
}

function baseOrder() {
  return {
    id: "order_1",
    status: "PAID",
    totalAmount: 100_000,
    currency: "SEK",
    stripePaymentIntentId: "pi_test_123",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cancellationRequestCreate.mockResolvedValue({ id: "cr_new" });
  cancellationRequestFindUnique.mockResolvedValue({
    id: "cr_new",
    status: "REQUESTED",
  });
  integrationFindUnique.mockResolvedValue({ provider: "fake", status: "active" });
});

describe("createCancellationRequest", () => {
  it("creates a REQUESTED row with computed fee + snapshot", async () => {
    bookingFindFirst.mockResolvedValue(baseBooking());
    orderFindFirst.mockResolvedValue(baseOrder());

    const now = new Date("2026-05-01T12:00:00Z"); // ~31 days before check-in
    const result = await createCancellationRequest({
      tenantId: "tenant_1",
      bookingId: "booking_1",
      initiator: "GUEST",
      now,
    });

    expect(result.id).toBe("cr_new");
    expect(result.status).toBe("REQUESTED");
    expect(result.autoApproved).toBe(false); // policy requires approval

    expect(cancellationRequestCreate).toHaveBeenCalledOnce();
    const createArgs = cancellationRequestCreate.mock.calls[0][0] as {
      data: { originalAmount: number; cancellationFeeAmount: number; refundAmount: number };
    };
    expect(createArgs.data.originalAmount).toBe(100_000);
    expect(createArgs.data.cancellationFeeAmount).toBe(0); // >30 days = 0% fee
    expect(createArgs.data.refundAmount).toBe(100_000);
  });

  it("auto-approves when policy.requireApproval is false", async () => {
    bookingFindFirst.mockResolvedValue(
      baseBooking({
        cancellationPolicySnapshot: {
          ...validSnapshot(),
          requireApproval: false,
        },
      }),
    );
    orderFindFirst.mockResolvedValue(baseOrder());
    cancellationRequestFindFirst.mockResolvedValue({
      id: "cr_new",
      status: "REQUESTED",
      version: 1,
    });
    cancellationRequestUpdateMany.mockResolvedValue({ count: 1 });
    cancellationRequestFindUnique.mockResolvedValue({
      id: "cr_new",
      status: "CLOSED",
    });

    const result = await createCancellationRequest({
      tenantId: "tenant_1",
      bookingId: "booking_1",
      initiator: "GUEST",
    });

    expect(result.autoApproved).toBe(true);
  });

  it("rejects when booking is not PRE_CHECKIN", async () => {
    bookingFindFirst.mockResolvedValue(baseBooking({ status: "ACTIVE" }));

    await expect(
      createCancellationRequest({
        tenantId: "tenant_1",
        bookingId: "booking_1",
        initiator: "GUEST",
      }),
    ).rejects.toMatchObject({
      code: "BOOKING_NOT_CANCELLABLE",
    });
  });

  it("rejects when booking not found in tenant", async () => {
    bookingFindFirst.mockResolvedValue(null);

    await expect(
      createCancellationRequest({
        tenantId: "tenant_1",
        bookingId: "nope",
        initiator: "GUEST",
      }),
    ).rejects.toBeInstanceOf(CancellationError);
  });

  it("rejects guestNote > 300 chars with PRECONDITION_FAILED", async () => {
    bookingFindFirst.mockResolvedValue(baseBooking());
    await expect(
      createCancellationRequest({
        tenantId: "tenant_1",
        bookingId: "booking_1",
        initiator: "GUEST",
        guestNote: "x".repeat(301),
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("translates partial-unique-index collision to INVALID_STATE", async () => {
    bookingFindFirst.mockResolvedValue(baseBooking());
    orderFindFirst.mockResolvedValue(baseOrder());
    cancellationRequestCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "x",
      }),
    );

    await expect(
      createCancellationRequest({
        tenantId: "tenant_1",
        bookingId: "booking_1",
        initiator: "GUEST",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("handles booking with no order (Manual tenant, refund=0)", async () => {
    bookingFindFirst.mockResolvedValue(baseBooking({ orderId: null }));
    orderFindFirst.mockResolvedValue(null);

    const result = await createCancellationRequest({
      tenantId: "tenant_1",
      bookingId: "booking_1",
      initiator: "STAFF",
      initiatorUserId: "user_admin",
    });

    expect(result.id).toBe("cr_new");
    const createArgs = cancellationRequestCreate.mock.calls[0][0] as {
      data: { originalAmount: number; refundAmount: number; orderId: string | null };
    };
    expect(createArgs.data.originalAmount).toBe(0);
    expect(createArgs.data.refundAmount).toBe(0);
    expect(createArgs.data.orderId).toBe(null);
  });

  it("falls back to non-refundable snapshot when booking has no policy", async () => {
    bookingFindFirst.mockResolvedValue(
      baseBooking({ cancellationPolicySnapshot: null }),
    );
    orderFindFirst.mockResolvedValue(baseOrder());

    await createCancellationRequest({
      tenantId: "tenant_1",
      bookingId: "booking_1",
      initiator: "GUEST",
    });

    const createArgs = cancellationRequestCreate.mock.calls[0][0] as {
      data: { cancellationFeeAmount: number; refundAmount: number };
    };
    // Default fallback = 100% fee, 0 refund.
    expect(createArgs.data.cancellationFeeAmount).toBe(100_000);
    expect(createArgs.data.refundAmount).toBe(0);
  });
});
