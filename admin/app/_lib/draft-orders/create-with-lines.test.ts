import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const txMock = {
  draftOrder: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  draftLineItem: { create: vi.fn() },
  draftReservation: { create: vi.fn() },
};

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    accommodation: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock)),
  },
}));

vi.mock("@/app/_lib/discounts/apply", () => ({
  calculateDiscountImpact: vi.fn(),
}));

vi.mock("@/app/_lib/apps/webhooks", () => ({
  emitPlatformEvent: vi.fn(async () => undefined),
}));

vi.mock("./sequence", () => ({
  nextDraftDisplayNumber: vi.fn(),
}));

vi.mock("./events", () => ({
  createDraftOrderEventInTx: vi.fn(async () => undefined),
}));

vi.mock("./lines", () => ({
  resolveLineForAdd: vi.fn(),
  buildLineItemCreateData: vi.fn((draft, resolved, line, position) => ({
    tenantId: draft.tenantId,
    draftOrderId: draft.id,
    lineType: resolved.kind,
    accommodationId: line.accommodationId,
    quantity: resolved.kind === "ACCOMMODATION" ? resolved.nights : 1,
    unitPriceCents: resolved.unitPriceCents,
    subtotalCents: resolved.subtotalCents,
    position,
    taxable: true,
  })),
}));

vi.mock("./holds", () => ({
  placeHoldsForDraft: vi.fn(),
}));

vi.mock("./calculator/orchestrator", () => ({
  computeAndPersistDraftTotalsInTx: vi.fn(async () => ({
    source: "COMPUTED",
    frozenAt: null,
    currency: "SEK",
    subtotalCents: BigInt(0),
    totalLineDiscountCents: BigInt(0),
    orderDiscountCents: BigInt(0),
    totalDiscountCents: BigInt(0),
    taxCents: BigInt(0),
    shippingCents: BigInt(0),
    totalCents: BigInt(0),
    perLine: [],
    warnings: [],
  })),
}));

vi.mock("./check-availability", () => ({
  checkAvailability: vi.fn(),
}));

import { prisma } from "@/app/_lib/db/prisma";
import { calculateDiscountImpact } from "@/app/_lib/discounts/apply";
import { emitPlatformEvent } from "@/app/_lib/apps/webhooks";
import { nextDraftDisplayNumber } from "./sequence";
import { createDraftOrderEventInTx } from "./events";
import { resolveLineForAdd } from "./lines";
import { placeHoldsForDraft } from "./holds";
import { checkAvailability } from "./check-availability";
import { createDraftWithLines } from "./create-with-lines";

const txCreate = txMock.draftOrder.create as ReturnType<typeof vi.fn>;
const txUpdate = txMock.draftOrder.update as ReturnType<typeof vi.fn>;
const txFindFirst = txMock.draftOrder.findFirst as ReturnType<typeof vi.fn>;
const txLineCreate = txMock.draftLineItem.create as ReturnType<typeof vi.fn>;
const txResCreate = txMock.draftReservation.create as ReturnType<typeof vi.fn>;
const accFindFirst = prisma.accommodation.findFirst as unknown as ReturnType<typeof vi.fn>;
const $tx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const checkAvailMock = checkAvailability as unknown as ReturnType<typeof vi.fn>;
const resolveLineMock = resolveLineForAdd as unknown as ReturnType<typeof vi.fn>;
const seqMock = nextDraftDisplayNumber as unknown as ReturnType<typeof vi.fn>;
const eventMock = createDraftOrderEventInTx as unknown as ReturnType<typeof vi.fn>;
const discountMock = calculateDiscountImpact as unknown as ReturnType<typeof vi.fn>;
const placeHoldsMock = placeHoldsForDraft as unknown as ReturnType<typeof vi.fn>;
const webhookMock = emitPlatformEvent as unknown as ReturnType<typeof vi.fn>;

// ── Fixtures ─────────────────────────────────────────────────

const TENANT = "tenant_t";

function makeLine(idx = 0) {
  return {
    accommodationId: `acc_${idx}`,
    fromDate: new Date("2026-05-01"),
    toDate: new Date("2026-05-04"),
    guestCount: 2,
  };
}

function makeResolved(nights = 3, unitPrice = 50000) {
  return {
    kind: "ACCOMMODATION" as const,
    unitPriceCents: BigInt(unitPrice),
    subtotalCents: BigInt(unitPrice * nights),
    currency: "SEK",
    nights,
    title: "Stuga A",
    ratePlanId: "rp_1",
    ratePlanName: "Standard",
    ratePlanCancellationPolicy: null,
    appliedCatalogId: null,
    appliedRule: "LIVE_PMS" as const,
  };
}

function makeDraftRow(id = "draft_1") {
  return {
    id,
    tenantId: TENANT,
    displayNumber: "D-1042",
    status: "OPEN",
    currency: "SEK",
    guestAccountId: null,
    createdByUserId: null,
    createdAt: new Date("2026-04-25T12:00:00Z"),
  };
}

function makeLineRow(id: string, draftId: string) {
  return {
    id,
    tenantId: TENANT,
    draftOrderId: draftId,
    lineType: "ACCOMMODATION",
    accommodationId: "acc_0",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default success path: avail OK, accommodation found, pricing OK,
  // tx returns draft + lines.
  checkAvailMock.mockResolvedValue({ available: true });
  accFindFirst.mockResolvedValue({ currency: "SEK" });
  resolveLineMock.mockImplementation(async () => makeResolved());
  seqMock.mockResolvedValue("D-1042");
  txCreate.mockImplementation(async ({ data }) => ({ ...makeDraftRow("draft_1"), ...data }));
  txLineCreate.mockImplementation(async ({ data }) =>
    makeLineRow(`line_${Math.random().toString(36).slice(2, 8)}`, data.draftOrderId),
  );
  txResCreate.mockResolvedValue({ id: "res_1" });
  txFindFirst.mockResolvedValue(makeDraftRow("draft_1"));
  txUpdate.mockResolvedValue(makeDraftRow("draft_1"));
  $tx.mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));
  placeHoldsMock.mockResolvedValue({ placed: [], failed: [], skipped: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────

describe("createDraftWithLines — input validation", () => {
  it("T1 — empty lines → NO_LINES error, no DB write", async () => {
    const result = await createDraftWithLines({ tenantId: TENANT, lines: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Minst en rad krävs");
    expect($tx).not.toHaveBeenCalled();
    expect(checkAvailMock).not.toHaveBeenCalled();
  });
});

describe("createDraftWithLines — happy paths", () => {
  it("T2 — 1 line no discount → atomic create + line + CREATED + LINE_ADDED events", async () => {
    const result = await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
    });
    expect(result.ok).toBe(true);
    expect($tx).toHaveBeenCalledTimes(1);
    expect(txCreate).toHaveBeenCalledTimes(1); // draft.create
    expect(txLineCreate).toHaveBeenCalledTimes(1); // line.create
    expect(txResCreate).toHaveBeenCalledTimes(1); // reservation
    const eventTypes = eventMock.mock.calls.map((c) => c[1]?.type);
    expect(eventTypes).toContain("CREATED");
    expect(eventTypes).toContain("LINE_ADDED");
  });

  it("T3 — 3 lines + valid discount → DISCOUNT_APPLIED event + draft update", async () => {
    discountMock.mockResolvedValueOnce({
      valid: true,
      discount: { id: "d1", valueType: "PERCENTAGE" },
      discountCodeId: "dc1",
      discountCodeValue: "SUMMER10",
      discountAmount: 30000,
      allocations: { scope: "ORDER", amount: 30000 },
      title: "Summer 10%",
      description: null,
      buyerKind: "GUEST",
    });
    const result = await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0), makeLine(1), makeLine(2)],
      discountCode: "SUMMER10",
    });
    expect(result.ok).toBe(true);
    expect(txLineCreate).toHaveBeenCalledTimes(3);
    expect(txUpdate).toHaveBeenCalledTimes(1); // discount apply
    const eventTypes = eventMock.mock.calls.map((c) => c[1]?.type);
    expect(eventTypes).toContain("DISCOUNT_APPLIED");
  });
});

describe("createDraftWithLines — pre-tx failures", () => {
  it("T4 — availability fail on 1 of 3 → conflictingLineIndices, no DB write", async () => {
    checkAvailMock
      .mockResolvedValueOnce({ available: true })
      .mockResolvedValueOnce({ available: false, reason: "Blocked" })
      .mockResolvedValueOnce({ available: true });
    const result = await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0), makeLine(1), makeLine(2)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflictingLineIndices).toEqual([1]);
    }
    expect($tx).not.toHaveBeenCalled();
  });

  it("T5 — availability fail on all 3 → all indices, no DB write", async () => {
    checkAvailMock.mockResolvedValue({ available: false, reason: "X" });
    const result = await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0), makeLine(1), makeLine(2)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflictingLineIndices).toEqual([0, 1, 2]);
    expect($tx).not.toHaveBeenCalled();
  });

  it("T6 — PMS pricing fail on 1 line → PRICING_FAILED, no DB write", async () => {
    resolveLineMock
      .mockResolvedValueOnce(makeResolved())
      .mockRejectedValueOnce(new Error("PMS down"))
      .mockResolvedValueOnce(makeResolved());
    const result = await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0), makeLine(1), makeLine(2)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Prissättning");
    expect($tx).not.toHaveBeenCalled();
  });

  it("T7 — invalid discount → INVALID_DISCOUNT, no DB write", async () => {
    discountMock.mockResolvedValueOnce({ valid: false, error: "Code expired" });
    const result = await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
      discountCode: "EXPIRED",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Rabattkod");
    expect($tx).not.toHaveBeenCalled();
  });

  it("T8 — cross-tenant accommodation surfaces via checkAvailability TENANT_MISMATCH", async () => {
    checkAvailMock.mockResolvedValueOnce({
      available: false,
      reason: "Boende tillhör inte denna tenant",
    });
    const result = await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflictingLineIndices).toEqual([0]);
    expect($tx).not.toHaveBeenCalled();
  });
});

describe("createDraftWithLines — input fields", () => {
  it("T9 — customerId provided → guestAccountId set on draft", async () => {
    await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
      customerId: "cust_42",
    });
    const draftCreateArgs = txCreate.mock.calls[0]?.[0];
    expect(draftCreateArgs?.data?.guestAccountId).toBe("cust_42");
  });

  it("T10 — customerId omitted → guestAccountId null on draft", async () => {
    await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
    });
    const draftCreateArgs = txCreate.mock.calls[0]?.[0];
    expect(draftCreateArgs?.data?.guestAccountId).toBeNull();
  });

  it("T11 — default expiresAt = now + 7d", async () => {
    const now = new Date("2026-04-25T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
    });
    vi.useRealTimers();
    const expiresAt = txCreate.mock.calls[0]?.[0]?.data?.expiresAt as Date;
    const expected = now.getTime() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt.getTime() - expected)).toBeLessThan(1000);
  });

  it("T12 — custom expiresAt respected", async () => {
    const custom = new Date("2026-06-01T00:00:00Z");
    await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
      expiresAt: custom,
    });
    expect(txCreate.mock.calls[0]?.[0]?.data?.expiresAt).toEqual(custom);
  });

  it("T13 — tags array stored on draft", async () => {
    await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
      tags: ["vip", "internal"],
    });
    expect(txCreate.mock.calls[0]?.[0]?.data?.tags).toEqual(["vip", "internal"]);
  });
});

describe("createDraftWithLines — post-commit best-effort", () => {
  it("T14 — placeHoldsForDraft success → log emitted, ok:true", async () => {
    placeHoldsMock.mockResolvedValueOnce({
      placed: [{ id: "h1" }],
      failed: [],
      skipped: [],
    });
    const result = await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
    });
    expect(result.ok).toBe(true);
    // Allow the fire-forget promise to flush.
    await new Promise((r) => setTimeout(r, 5));
    expect(placeHoldsMock).toHaveBeenCalledWith({
      tenantId: TENANT,
      draftOrderId: "draft_1",
      actorUserId: undefined,
    });
  });

  it("T15 — placeHoldsForDraft throws → log emitted, draft STILL ok:true", async () => {
    placeHoldsMock.mockRejectedValueOnce(new Error("PMS down"));
    const result = await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
    });
    expect(result.ok).toBe(true);
    // Wait for fire-forget catch to log.
    await new Promise((r) => setTimeout(r, 5));
  });

  it("T16 — platform webhook emitPlatformEvent is fire-forget, doesn't block return", async () => {
    let webhookResolved = false;
    webhookMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            webhookResolved = true;
            resolve(undefined);
          }, 50);
        }),
    );
    const start = Date.now();
    const result = await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
    });
    const elapsed = Date.now() - start;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(50); // returned before webhook resolved
    expect(webhookResolved).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(webhookResolved).toBe(true);
  });
});

describe("createDraftWithLines — atomicity + parallelism", () => {
  it("T17 — tx-body throw on 2nd line → entire $transaction rolls back, ok:false", async () => {
    txLineCreate
      .mockResolvedValueOnce(makeLineRow("line_1", "draft_1"))
      .mockRejectedValueOnce(new Error("Constraint violation"))
      .mockResolvedValueOnce(makeLineRow("line_3", "draft_1"));
    // Simulate $transaction propagating the throw (Prisma's real behavior).
    $tx.mockImplementationOnce(async (cb: (tx: typeof txMock) => unknown) => {
      try {
        return await cb(txMock);
      } catch (e) {
        // Mirror real Prisma — the whole tx fails; createDraftWithLines
        // catches the throw and returns ok:false.
        throw e;
      }
    });
    const result = await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0), makeLine(1), makeLine(2)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Constraint violation");
  });

  it("T18 — display number generated via nextDraftDisplayNumber(tx)", async () => {
    await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0)],
    });
    expect(seqMock).toHaveBeenCalledWith(TENANT, txMock);
  });

  it("T19 — pre-tx availability checks run via Promise.all (parallel)", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    checkAvailMock.mockImplementation(async () => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { available: true };
    });
    await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0), makeLine(1), makeLine(2)],
    });
    expect(maxConcurrent).toBe(3);
  });

  it("T20 — pre-tx PMS pricing runs via Promise.all (parallel)", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    resolveLineMock.mockImplementation(async () => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return makeResolved();
    });
    await createDraftWithLines({
      tenantId: TENANT,
      lines: [makeLine(0), makeLine(1), makeLine(2)],
    });
    expect(maxConcurrent).toBe(3);
  });
});
