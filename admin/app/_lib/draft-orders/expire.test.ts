import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConflictError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";

// ── Mocks ────────────────────────────────────────────────────────

const mockPrisma = {
  draftOrder: { findMany: vi.fn() },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockCancelDraft = vi.fn();
vi.mock("./lifecycle", () => ({
  cancelDraft: (...args: unknown[]) => mockCancelDraft(...args),
}));

const { sweepExpiredDrafts } = await import("./expire");
const logger = await import("@/app/_lib/logger");
const mockLog = logger.log as unknown as ReturnType<typeof vi.fn>;

// ── Fixtures ────────────────────────────────────────────────────

type Row = {
  id: string;
  tenantId: string;
  status: string;
  expiresAt: Date | null;
};

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "OPEN",
    expiresAt: new Date(Date.now() - 60_000),
    ...overrides,
  };
}

function happyCancelResult(overrides: Record<string, unknown> = {}) {
  return {
    draft: { id: "draft_1", status: "CANCELLED" },
    releasedHolds: 0,
    holdReleaseErrors: [],
    stripePaymentIntentCancelAttempted: false,
    stripePaymentIntentCancelError: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.draftOrder.findMany.mockResolvedValue([]);
  mockCancelDraft.mockResolvedValue(happyCancelResult());
});

// ═══════════════════════════════════════════════════════════════
// T1 — empty batch
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T1 empty batch", () => {
  it("returns zeroed counters when no drafts are due", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([]);

    const result = await sweepExpiredDrafts();

    expect(result.examined).toBe(0);
    expect(result.cancelled).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.partial).toBe(false);
    expect(mockCancelDraft).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// T2 — happy path 3 drafts
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T2 happy path", () => {
  it("cancels all rows with actorSource:'cron' + reason:'Automatic expiry'", async () => {
    const rows = [
      makeRow({ id: "d_a", tenantId: "t_a" }),
      makeRow({ id: "d_b", tenantId: "t_b" }),
      makeRow({ id: "d_c", tenantId: "t_c" }),
    ];
    mockPrisma.draftOrder.findMany.mockResolvedValue(rows);

    const result = await sweepExpiredDrafts();

    expect(result.examined).toBe(3);
    expect(result.cancelled).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockCancelDraft).toHaveBeenCalledTimes(3);

    for (const call of mockCancelDraft.mock.calls) {
      const args = call[0] as Record<string, unknown>;
      expect(args.actorSource).toBe("cron");
      expect(args.reason).toBe("Automatic expiry");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// T3 — mixed: 2 cancel ok, 1 race-on-terminal (C2)
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T3 mixed", () => {
  it("buckets terminal-race as skipped, not failed", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([
      makeRow({ id: "d_a" }),
      makeRow({ id: "d_b" }),
      makeRow({ id: "d_c" }),
    ]);
    mockCancelDraft
      .mockResolvedValueOnce(happyCancelResult({ draft: { id: "d_a" } }))
      .mockResolvedValueOnce(happyCancelResult({ draft: { id: "d_b" } }))
      .mockRejectedValueOnce(
        new ValidationError("Draft is already in a terminal status", {
          status: "COMPLETED",
        }),
      );

    const result = await sweepExpiredDrafts();

    expect(result.cancelled).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errorBreakdown.raceOnTerminal).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// T4 — INVOICED race (E2): C4 throw (reason missing for INVOICED)
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T4 INVOICED race", () => {
  it("counts MISSING_REASON race as skipped + raceOnTerminal", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([makeRow()]);
    mockCancelDraft.mockRejectedValue(
      new ValidationError(
        "Cancellation reason required for INVOICED / OVERDUE drafts",
        { status: "INVOICED" },
      ),
    );

    const result = await sweepExpiredDrafts();

    expect(result.skipped).toBe(1);
    expect(result.errorBreakdown.raceOnTerminal).toBe(1);
    expect(result.failed).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// T5 — COMPLETED race (E3): C2 throw mid-tx via ConflictError
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T5 COMPLETED race", () => {
  it("buckets in-tx terminal race as skipped (ConflictError path)", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([makeRow()]);
    mockCancelDraft.mockRejectedValue(
      new ConflictError("Draft reached terminal status during cancel", {
        status: "COMPLETED",
      }),
    );

    const result = await sweepExpiredDrafts();

    expect(result.skipped).toBe(1);
    expect(result.errorBreakdown.raceOnTerminal).toBe(1);
    expect(result.failed).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// T6 — PAID race (E4): C3 throw, log phase=PAID_RACE
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T6 PAID race", () => {
  it("logs phase=PAID_RACE and skips (does not fail)", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([
      makeRow({ id: "d_paid", tenantId: "t_paid", status: "OPEN" }),
    ]);
    mockCancelDraft.mockRejectedValue(
      new ValidationError(
        "Cannot cancel a PAID draft — refund via Stripe, then retry",
        { draftOrderId: "d_paid" },
      ),
    );

    const result = await sweepExpiredDrafts();

    expect(result.skipped).toBe(1);
    expect(result.errorBreakdown.raceOnTerminal).toBe(1);
    expect(result.failed).toBe(0);

    const raceLog = mockLog.mock.calls.find(
      (c) => c[1] === "draft.expire.race",
    );
    expect(raceLog).toBeDefined();
    const ctx = raceLog?.[2] as Record<string, unknown>;
    expect(ctx.phase).toBe("PAID_RACE");
    expect(ctx.tenantId).toBe("t_paid");
    expect(ctx.draftOrderId).toBe("d_paid");
  });
});

// ═══════════════════════════════════════════════════════════════
// T7 — hold-release errors collected (E1)
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T7 hold-release errors", () => {
  it("counts hold-release errors from successful cancel as non-fatal", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([makeRow()]);
    mockCancelDraft.mockResolvedValue(
      happyCancelResult({
        holdReleaseErrors: [
          { draftLineItemId: "dli_1", error: "Mews 503" },
          { draftLineItemId: "dli_2", error: "PMS unreachable" },
        ],
      }),
    );

    const result = await sweepExpiredDrafts();

    expect(result.cancelled).toBe(1);
    expect(result.holdReleaseErrors).toBe(2);
    expect(result.errorBreakdown.holdReleaseErrors).toBe(2);
    expect(result.failed).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// T8 — genuine transition error (unknown class)
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T8 genuine transition error", () => {
  it("buckets unknown errors as failed + transitionErrors", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([makeRow()]);
    mockCancelDraft.mockRejectedValue(
      new Error("ECONNRESET — database unreachable"),
    );

    const result = await sweepExpiredDrafts();

    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errorBreakdown.transitionErrors).toBe(1);
    expect(result.errorBreakdown.raceOnTerminal).toBe(0);

    const errLog = mockLog.mock.calls.find(
      (c) => c[1] === "draft.expire.error",
    );
    expect(errLog).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// T9 — wall-budget exhaustion → partial:true
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T9 wall-budget", () => {
  it("sets partial:true when deadline elapses mid-pool", async () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      makeRow({ id: `d_${i}` }),
    );
    mockPrisma.draftOrder.findMany.mockResolvedValue(rows);

    // Deadline already in the past — pool skips every item.
    const deadline = Date.now() - 1;
    const result = await sweepExpiredDrafts({ deadline });

    expect(result.examined).toBe(100);
    expect(result.partial).toBe(true);
    expect(result.cancelled).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// T10 — WHERE clause assertion
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T10 WHERE clause", () => {
  it("filters status IN [OPEN, PENDING_APPROVAL, APPROVED] and expiresAt < cutoff", async () => {
    const fixedNow = new Date("2026-04-25T12:00:00.000Z");
    mockPrisma.draftOrder.findMany.mockResolvedValue([]);

    await sweepExpiredDrafts({ now: fixedNow });

    expect(mockPrisma.draftOrder.findMany).toHaveBeenCalledTimes(1);
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      where: { status: { in: string[] }; expiresAt: { lt: Date } };
    };
    expect(args.where.status.in).toEqual([
      "OPEN",
      "PENDING_APPROVAL",
      "APPROVED",
    ]);
    expect(args.where.expiresAt.lt).toBe(fixedNow);
  });
});

// ═══════════════════════════════════════════════════════════════
// T11 — orderBy + take assertion
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T11 orderBy + take", () => {
  it("orders by expiresAt asc then id asc and respects batchSize", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([]);

    await sweepExpiredDrafts({ batchSize: 50 });

    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, "asc" | "desc">>;
      take: number;
    };
    expect(args.orderBy).toEqual([
      { expiresAt: "asc" },
      { id: "asc" },
    ]);
    expect(args.take).toBe(50);
  });

  it("defaults take to 200", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([]);
    await sweepExpiredDrafts();
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      take: number;
    };
    expect(args.take).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// T12 — tenantId pass-through per row
// ═══════════════════════════════════════════════════════════════

describe("sweepExpiredDrafts — T12 tenantId pass-through", () => {
  it("invokes cancelDraft with each row's own tenantId", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([
      makeRow({ id: "d_a", tenantId: "tenant_alpha" }),
      makeRow({ id: "d_b", tenantId: "tenant_beta" }),
      makeRow({ id: "d_c", tenantId: "tenant_gamma" }),
    ]);

    await sweepExpiredDrafts();

    expect(mockCancelDraft).toHaveBeenCalledTimes(3);
    const calls = mockCancelDraft.mock.calls.map(
      (c) => c[0] as { tenantId: string; draftOrderId: string },
    );
    const pairs = calls.map((c) => `${c.draftOrderId}:${c.tenantId}`).sort();
    expect(pairs).toEqual([
      "d_a:tenant_alpha",
      "d_b:tenant_beta",
      "d_c:tenant_gamma",
    ]);
  });
});
