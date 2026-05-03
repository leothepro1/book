import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

const mockPrisma = {
  draftOrder: { findMany: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockTransition = vi.fn();
const mockCreateEvent = vi.fn();

vi.mock("./lifecycle", () => ({
  transitionDraftStatusInTx: (...args: unknown[]) => mockTransition(...args),
}));

vi.mock("./events", () => ({
  createDraftOrderEventInTx: (...args: unknown[]) => mockCreateEvent(...args),
}));

const { markOverdueDrafts } = await import("./overdue");
const logger = await import("@/app/_lib/logger");
const mockLog = logger.log as unknown as ReturnType<typeof vi.fn>;

// ── Fixtures ─────────────────────────────────────────────────────

type Row = {
  id: string;
  tenantId: string;
  status: string;
  shareLinkExpiresAt: Date | null;
};

const FIXED_NOW = new Date("2026-05-03T12:00:00.000Z");

function makeRow(overrides: Partial<Row> = {}): Row {
  // Default: row "should" be overdue at FIXED_NOW with default 3-day grace.
  // shareLinkExpiresAt 10 days before now → well past the cutoff.
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "INVOICED",
    shareLinkExpiresAt: new Date(
      FIXED_NOW.getTime() - 10 * 24 * 60 * 60 * 1000,
    ),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.draftOrder.findMany.mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  );
  mockTransition.mockResolvedValue({ transitioned: true });
  mockCreateEvent.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════
// T1 — happy path: 3 INVOICED rows past cutoff are marked
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T1 happy path", () => {
  it("marks every row past cutoff with actorSource:'cron' + dual events", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([
      makeRow({ id: "d_a", tenantId: "t_a" }),
      makeRow({ id: "d_b", tenantId: "t_b" }),
      makeRow({ id: "d_c", tenantId: "t_c" }),
    ]);

    const result = await markOverdueDrafts({ now: FIXED_NOW });

    expect(result.examined).toBe(3);
    expect(result.marked).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.partial).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    expect(mockTransition).toHaveBeenCalledTimes(3);
    expect(mockCreateEvent).toHaveBeenCalledTimes(3);

    for (const call of mockTransition.mock.calls) {
      const args = call[1] as Record<string, unknown>;
      expect(args.from).toBe("INVOICED");
      expect(args.to).toBe("OVERDUE");
      expect(args.actorSource).toBe("cron");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// T2 — shareLinkExpiresAt = null is excluded by the WHERE
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T2 null shareLinkExpiresAt", () => {
  it("does not select rows with shareLinkExpiresAt IS NULL", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([]);
    await markOverdueDrafts({ now: FIXED_NOW });

    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      where: { shareLinkExpiresAt: { lt: Date } };
    };
    // Prisma `lt` excludes NULL by SQL semantics — assert filter shape.
    expect(args.where.shareLinkExpiresAt).toEqual({
      lt: expect.any(Date) as unknown as Date,
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// T3 — shareLinkExpiresAt within grace window: cutoff math
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T3 cutoff = now - graceDays", () => {
  it("computes cutoff = now - 3 days by default", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([]);
    await markOverdueDrafts({ now: FIXED_NOW });

    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      where: { shareLinkExpiresAt: { lt: Date } };
    };
    const expectedCutoff = new Date(
      FIXED_NOW.getTime() - 3 * 24 * 60 * 60 * 1000,
    );
    expect(args.where.shareLinkExpiresAt.lt.toISOString()).toBe(
      expectedCutoff.toISOString(),
    );
  });

  it("respects graceDays override (e.g. 7)", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([]);
    await markOverdueDrafts({ now: FIXED_NOW, graceDays: 7 });

    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      where: { shareLinkExpiresAt: { lt: Date } };
    };
    const expectedCutoff = new Date(
      FIXED_NOW.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    expect(args.where.shareLinkExpiresAt.lt.toISOString()).toBe(
      expectedCutoff.toISOString(),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// T4 — race-on-terminal: transitioned=false → skipped, no event
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T4 race", () => {
  it("counts transitioned=false as skipped + does NOT emit INVOICE_OVERDUE", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([makeRow()]);
    mockTransition.mockResolvedValue({ transitioned: false });

    const result = await markOverdueDrafts({ now: FIXED_NOW });

    expect(result.marked).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockCreateEvent).not.toHaveBeenCalled();

    const raceLog = mockLog.mock.calls.find(
      (c) => c[1] === "draft.overdue.race",
    );
    expect(raceLog).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// T5 — INVOICE_OVERDUE event metadata correctness
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T5 event metadata", () => {
  it("emits INVOICE_OVERDUE with graceDays + shareLinkExpiresAt + overdueAt", async () => {
    const row = makeRow({
      id: "d_x",
      tenantId: "t_x",
      shareLinkExpiresAt: new Date("2026-04-10T12:00:00.000Z"),
    });
    mockPrisma.draftOrder.findMany.mockResolvedValue([row]);

    await markOverdueDrafts({ now: FIXED_NOW, graceDays: 5 });

    expect(mockCreateEvent).toHaveBeenCalledTimes(1);
    const args = mockCreateEvent.mock.calls[0][1] as {
      tenantId: string;
      draftOrderId: string;
      type: string;
      metadata: Record<string, unknown>;
      actorSource: string;
    };

    expect(args.tenantId).toBe("t_x");
    expect(args.draftOrderId).toBe("d_x");
    expect(args.type).toBe("INVOICE_OVERDUE");
    expect(args.actorSource).toBe("cron");
    expect(args.metadata.graceDays).toBe(5);
    expect(args.metadata.shareLinkExpiresAt).toBe(
      "2026-04-10T12:00:00.000Z",
    );
    expect(args.metadata.overdueAt).toBe(FIXED_NOW.toISOString());
    // cutoff = now - graceDays * 24h; here 2026-05-03T12:00 - 5d = 2026-04-28T12:00
    expect(args.metadata.cutoff).toBe("2026-04-28T12:00:00.000Z");
  });
});

// ═══════════════════════════════════════════════════════════════
// T6 — per-row throw: bucketed as failed, sweep continues
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T6 per-row throw", () => {
  it("isolates per-row errors as failed and continues siblings", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([
      makeRow({ id: "d_a" }),
      makeRow({ id: "d_b" }),
      makeRow({ id: "d_c" }),
    ]);
    mockTransition
      .mockResolvedValueOnce({ transitioned: true })
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({ transitioned: true });

    const result = await markOverdueDrafts({ now: FIXED_NOW });

    expect(result.examined).toBe(3);
    expect(result.marked).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(1);

    const errLog = mockLog.mock.calls.find(
      (c) => c[1] === "draft.overdue.error",
    );
    expect(errLog).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// T7 — empty result set
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T7 empty result set", () => {
  it("returns zeroed counters with durationMs set", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([]);

    const result = await markOverdueDrafts({ now: FIXED_NOW });

    expect(result.examined).toBe(0);
    expect(result.marked).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.partial).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockTransition).not.toHaveBeenCalled();
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// T8 — batchSize default = 200, override respected
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T8 batchSize", () => {
  it("defaults take to 200", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([]);
    await markOverdueDrafts({ now: FIXED_NOW });
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      take: number;
    };
    expect(args.take).toBe(200);
  });

  it("respects batchSize override", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([]);
    await markOverdueDrafts({ now: FIXED_NOW, batchSize: 50 });
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      take: number;
    };
    expect(args.take).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// T9 — wall-budget exhausted → partial:true
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T9 wall-budget", () => {
  it("sets partial:true when deadline elapses pre-tick", async () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      makeRow({ id: `d_${i}` }),
    );
    mockPrisma.draftOrder.findMany.mockResolvedValue(rows);

    // Deadline already in the past — pool skips every item.
    const deadline = Date.now() - 1;
    const result = await markOverdueDrafts({ now: FIXED_NOW, deadline });

    expect(result.examined).toBe(100);
    expect(result.partial).toBe(true);
    expect(result.marked).toBe(0);
    expect(mockTransition).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// T10 — WHERE clause assertion (status + cutoff + ordering)
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T10 WHERE clause", () => {
  it("filters status='INVOICED' and orders by shareLinkExpiresAt asc, id asc", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([]);

    await markOverdueDrafts({ now: FIXED_NOW });

    expect(mockPrisma.draftOrder.findMany).toHaveBeenCalledTimes(1);
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      where: { status: string };
      orderBy: Array<Record<string, "asc" | "desc">>;
    };
    expect(args.where.status).toBe("INVOICED");
    expect(args.orderBy).toEqual([
      { shareLinkExpiresAt: "asc" },
      { id: "asc" },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════
// T11 — tenantId pass-through per row
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T11 tenantId pass-through", () => {
  it("passes each row's own tenantId to the transition helper", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([
      makeRow({ id: "d_a", tenantId: "tenant_alpha" }),
      makeRow({ id: "d_b", tenantId: "tenant_beta" }),
      makeRow({ id: "d_c", tenantId: "tenant_gamma" }),
    ]);

    await markOverdueDrafts({ now: FIXED_NOW });

    expect(mockTransition).toHaveBeenCalledTimes(3);
    const pairs = mockTransition.mock.calls
      .map((c) => c[1] as { tenantId: string; draftOrderId: string })
      .map((c) => `${c.draftOrderId}:${c.tenantId}`)
      .sort();
    expect(pairs).toEqual([
      "d_a:tenant_alpha",
      "d_b:tenant_beta",
      "d_c:tenant_gamma",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════
// T12 — never throws: findMany failure surfaces as a thrown promise,
//       documenting the contract (mirrors expire.ts behaviour).
// ═══════════════════════════════════════════════════════════════

describe("markOverdueDrafts — T12 contract", () => {
  it("returns a valid result on per-row failure (does not throw)", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([makeRow()]);
    mockTransition.mockRejectedValue(new Error("kaboom"));

    const result = await markOverdueDrafts({ now: FIXED_NOW });

    expect(result.failed).toBe(1);
    expect(result.marked).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("findMany failure: per the same contract as sweepExpiredDrafts, the initial query is allowed to throw", async () => {
    // Documents the boundary — the route handler's defense-in-depth
    // catches this branch.
    mockPrisma.draftOrder.findMany.mockRejectedValue(new Error("db down"));
    await expect(markOverdueDrafts({ now: FIXED_NOW })).rejects.toThrow(
      "db down",
    );
  });
});
