import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ── Prisma mock ─────────────────────────────────────────────

const mockJobCreate = vi.fn();
const mockJobFindUnique = vi.fn();
const mockJobUpdateMany = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    pmsOutboundJob: {
      create: (...a: unknown[]) => mockJobCreate(...a),
      findUnique: (...a: unknown[]) => mockJobFindUnique(...a),
      updateMany: (...a: unknown[]) => mockJobUpdateMany(...a),
    },
  },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/observability/sentry", () => ({
  setSentryTenantContext: vi.fn(),
}));

const mockCreatePmsBooking = vi.fn();
vi.mock("@/app/_lib/accommodations/create-pms-booking", () => ({
  createPmsBookingAfterPayment: (...a: unknown[]) => mockCreatePmsBooking(...a),
}));

const mockRefundOrder = vi.fn();
vi.mock("./outbound-compensation", () => ({
  refundOrderForFailedFulfillment: (...a: unknown[]) => mockRefundOrder(...a),
}));

// Imports after mocks
const {
  enqueueOutboundJob,
  processOutboundJob,
  compensateOutboundJob,
  MAX_PRIMARY_ATTEMPTS,
  MAX_COMPENSATION_ATTEMPTS,
} = await import("./outbound");

beforeEach(() => {
  vi.clearAllMocks();
  mockJobUpdateMany.mockResolvedValue({ count: 1 });
});

// ── Enqueue ─────────────────────────────────────────────────

describe("enqueueOutboundJob", () => {
  it("creates a new job and reports created=true", async () => {
    mockJobCreate.mockResolvedValueOnce({ id: "job_1" });

    const r = await enqueueOutboundJob({ orderId: "o1", tenantId: "t1" });
    expect(r.jobId).toBe("job_1");
    expect(r.created).toBe(true);
  });

  it("is idempotent: a P2002 collision returns existing job with created=false", async () => {
    mockJobCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "6.0.0",
      }),
    );
    mockJobFindUnique.mockResolvedValueOnce({ id: "job_existing" });

    const r = await enqueueOutboundJob({ orderId: "o1", tenantId: "t1" });
    expect(r.jobId).toBe("job_existing");
    expect(r.created).toBe(false);
  });

  it("rethrows non-P2002 errors (infrastructure failure)", async () => {
    mockJobCreate.mockRejectedValueOnce(new Error("DB down"));
    await expect(
      enqueueOutboundJob({ orderId: "o1", tenantId: "t1" }),
    ).rejects.toThrow("DB down");
  });
});

// ── Primary phase: processOutboundJob ──────────────────────

describe("processOutboundJob — primary phase", () => {
  it("marks COMPLETED when createPmsBookingAfterPayment succeeds", async () => {
    mockJobFindUnique.mockResolvedValueOnce({
      id: "job_ok",
      tenantId: "t1",
      orderId: "o1",
      status: "PENDING",
      attempts: 0,
    });
    mockCreatePmsBooking.mockResolvedValueOnce({
      ok: true,
      pmsBookingRef: "mews-123",
      bookingId: "bk_1",
    });

    const outcome = await processOutboundJob("job_ok");

    expect(outcome).toBe("COMPLETED");
    // Claim (0) + terminal CAS (1)
    expect(mockJobUpdateMany).toHaveBeenCalledTimes(2);
    const terminal = mockJobUpdateMany.mock.calls[1][0];
    expect(terminal.data.status).toBe("COMPLETED");
    expect(terminal.data.completedAt).toBeInstanceOf(Date);
  });

  it("schedules 5-min retry on first retryable failure", async () => {
    mockJobFindUnique.mockResolvedValueOnce({
      id: "job_retry",
      tenantId: "t1",
      orderId: "o1",
      status: "PENDING",
      attempts: 0,
    });
    mockCreatePmsBooking.mockResolvedValueOnce({
      ok: false,
      error: "Mews 503",
      retryable: true,
    });

    const outcome = await processOutboundJob("job_retry");
    expect(outcome).toBe("FAILED");

    const terminal = mockJobUpdateMany.mock.calls[1][0];
    expect(terminal.data.status).toBe("FAILED");
    expect(terminal.data.lastError).toContain("Mews 503");
    const retryAt: Date = terminal.data.nextRetryAt;
    const delta = retryAt.getTime() - Date.now();
    expect(delta).toBeGreaterThan(4 * 60_000);
    expect(delta).toBeLessThan(6 * 60_000);
  });

  it("jumps straight to DEAD for non-retryable failure", async () => {
    mockJobFindUnique.mockResolvedValueOnce({
      id: "job_permerr",
      tenantId: "t1",
      orderId: "o1",
      status: "PENDING",
      attempts: 0,
    });
    mockCreatePmsBooking.mockResolvedValueOnce({
      ok: false,
      error: "Booking has no accommodationId",
      retryable: false,
    });

    const outcome = await processOutboundJob("job_permerr");
    expect(outcome).toBe("DEAD");

    const terminal = mockJobUpdateMany.mock.calls[1][0];
    expect(terminal.data.status).toBe("DEAD");
    expect(terminal.data.deadAt).toBeInstanceOf(Date);
    // Compensation should be scheduled immediately
    expect(terminal.data.compensationNextRetryAt).toBeInstanceOf(Date);
  });

  it("marks DEAD after exhausting the retry ladder", async () => {
    mockJobFindUnique.mockResolvedValueOnce({
      id: "job_dead",
      tenantId: "t1",
      orderId: "o1",
      status: "FAILED",
      attempts: MAX_PRIMARY_ATTEMPTS, // one more failure → DEAD
    });
    mockCreatePmsBooking.mockResolvedValueOnce({
      ok: false,
      error: "persistent failure",
      retryable: true,
    });

    const outcome = await processOutboundJob("job_dead");
    expect(outcome).toBe("DEAD");
  });

  it("reclaims a stranded PROCESSING row and continues", async () => {
    mockJobFindUnique.mockResolvedValueOnce({
      id: "job_stranded",
      tenantId: "t1",
      orderId: "o1",
      status: "PROCESSING",
      attempts: 1,
      lastAttemptAt: new Date(Date.now() - 10 * 60_000), // 10 min ago
    });
    mockCreatePmsBooking.mockResolvedValueOnce({
      ok: true,
      pmsBookingRef: "mews-456",
      bookingId: "bk_2",
    });

    const outcome = await processOutboundJob("job_stranded");
    expect(outcome).toBe("COMPLETED");
  });

  it("is a no-op on terminal states", async () => {
    for (const terminal of [
      "COMPLETED",
      "COMPENSATED",
      "COMPENSATION_FAILED",
    ]) {
      mockJobFindUnique.mockResolvedValueOnce({
        id: "job_term",
        tenantId: "t1",
        orderId: "o1",
        status: terminal,
        attempts: 0,
      });
      const outcome = await processOutboundJob("job_term");
      expect(outcome).toBe(terminal);
      expect(mockCreatePmsBooking).not.toHaveBeenCalled();
      vi.clearAllMocks();
      mockJobUpdateMany.mockResolvedValue({ count: 1 });
    }
  });
});

// ── Compensation phase ─────────────────────────────────────

describe("compensateOutboundJob — compensation phase", () => {
  it("marks COMPENSATED when refund succeeds", async () => {
    mockJobFindUnique.mockResolvedValueOnce({
      id: "job_comp",
      tenantId: "t1",
      orderId: "o1",
      status: "DEAD",
      compensationAttempts: 0,
    });
    mockRefundOrder.mockResolvedValueOnce(undefined);

    const outcome = await compensateOutboundJob("job_comp");
    expect(outcome).toBe("COMPENSATED");

    // Claim (0) + terminal CAS (1)
    const terminal = mockJobUpdateMany.mock.calls[1][0];
    expect(terminal.data.status).toBe("COMPENSATED");
  });

  it("schedules a retry when refund throws transiently", async () => {
    mockJobFindUnique.mockResolvedValueOnce({
      id: "job_comp_retry",
      tenantId: "t1",
      orderId: "o1",
      status: "DEAD",
      compensationAttempts: 0,
    });
    mockRefundOrder.mockRejectedValueOnce(new Error("Stripe 503"));

    const outcome = await compensateOutboundJob("job_comp_retry");
    expect(outcome).toBe("DEAD");

    const terminal = mockJobUpdateMany.mock.calls[1][0];
    expect(terminal.data.status).toBe("DEAD");
    expect(terminal.data.compensationLastError).toContain("Stripe 503");
    const retryAt: Date = terminal.data.compensationNextRetryAt;
    expect(retryAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("marks COMPENSATION_FAILED after exhausting the compensation ladder", async () => {
    mockJobFindUnique.mockResolvedValueOnce({
      id: "job_comp_dead",
      tenantId: "t1",
      orderId: "o1",
      status: "DEAD",
      compensationAttempts: MAX_COMPENSATION_ATTEMPTS,
    });
    mockRefundOrder.mockRejectedValueOnce(new Error("permanent Stripe fail"));

    const outcome = await compensateOutboundJob("job_comp_dead");
    expect(outcome).toBe("COMPENSATION_FAILED");
  });

  it("does not attempt compensation on primary-phase statuses", async () => {
    for (const primaryStatus of ["PENDING", "PROCESSING", "FAILED"]) {
      mockJobFindUnique.mockResolvedValueOnce({
        id: "job_wrong_phase",
        tenantId: "t1",
        orderId: "o1",
        status: primaryStatus,
        compensationAttempts: 0,
      });
      const outcome = await compensateOutboundJob("job_wrong_phase");
      expect(outcome).toBe(primaryStatus);
      expect(mockRefundOrder).not.toHaveBeenCalled();
      vi.clearAllMocks();
      mockJobUpdateMany.mockResolvedValue({ count: 1 });
    }
  });

  it("reclaims stranded COMPENSATING rows", async () => {
    mockJobFindUnique.mockResolvedValueOnce({
      id: "job_stranded_comp",
      tenantId: "t1",
      orderId: "o1",
      status: "COMPENSATING",
      compensationAttempts: 1,
      compensationLastAt: new Date(Date.now() - 10 * 60_000),
    });
    mockRefundOrder.mockResolvedValueOnce(undefined);

    const outcome = await compensateOutboundJob("job_stranded_comp");
    expect(outcome).toBe("COMPENSATED");
  });
});
