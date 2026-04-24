import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// ── Mocks ────────────────────────────────────────────────────────

const mockTx = {
  draftOrder: { updateMany: vi.fn() },
  draftOrderEvent: { create: vi.fn() },
};

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockEmitPlatformEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/apps/webhooks", () => ({
  emitPlatformEvent: mockEmitPlatformEvent,
}));

const mockCreateDraftOrderEventInTx = vi.fn().mockResolvedValue(undefined);
const mockConvertDraftToOrder = vi.fn();
vi.mock("@/app/_lib/draft-orders", () => ({
  createDraftOrderEventInTx: mockCreateDraftOrderEventInTx,
  convertDraftToOrder: mockConvertDraftToOrder,
}));

const mockProcessOrderPaidSideEffects = vi.fn();
vi.mock("@/app/_lib/orders/process-paid-side-effects", () => ({
  processOrderPaidSideEffects: mockProcessOrderPaidSideEffects,
}));

const { handleDraftOrderPaymentIntentSucceeded } = await import(
  "./handle-draft-order-pi"
);

// ── Fixtures ────────────────────────────────────────────────────

function makePi(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return {
    id: "pi_test_123",
    amount: 10_000,
    currency: "sek",
    metadata: {
      draftOrderId: "draft_1",
      tenantId: "tenant_1",
      kind: "draft_order_invoice",
      draftDisplayNumber: "D-2026-1001",
    },
    ...overrides,
  } as Stripe.PaymentIntent;
}

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    status: "INVOICED",
    completedOrderId: null,
    displayNumber: "D-2026-1001",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx),
  );
  mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  mockEmitPlatformEvent.mockResolvedValue(undefined);
  mockConvertDraftToOrder.mockResolvedValue({
    draft: makeDraft({ status: "COMPLETED", completedOrderId: "order_new_1" }),
    order: { id: "order_new_1", totalAmount: 10_000, currency: "SEK" },
    orderLineItems: [],
    bookings: [],
    alreadyConverted: false,
  });
  mockProcessOrderPaidSideEffects.mockResolvedValue(undefined);
  mockCreateDraftOrderEventInTx.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════
// Happy path
// ═══════════════════════════════════════════════════════════════

describe("handleDraftOrderPaymentIntentSucceeded — happy path", () => {
  it("runs tx1 (INVOICED → PAID) + tx2 (convertDraftToOrder) + side-effects", async () => {
    await handleDraftOrderPaymentIntentSucceeded(makePi());

    // Tx 1: INVOICED → PAID
    expect(mockTx.draftOrder.updateMany).toHaveBeenCalledTimes(1);
    const tx1Call = mockTx.draftOrder.updateMany.mock.calls[0][0];
    expect(tx1Call.where.status).toEqual({ in: ["INVOICED", "OVERDUE"] });
    expect(tx1Call.data.status).toBe("PAID");
    expect(tx1Call.data.version).toEqual({ increment: 1 });

    // STATE_CHANGED event written in tx1
    expect(mockCreateDraftOrderEventInTx).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        type: "STATE_CHANGED",
        metadata: expect.objectContaining({
          from: "INVOICED",
          to: "PAID",
          stripePaymentIntentId: "pi_test_123",
        }),
        actorSource: "webhook",
      }),
    );

    // draft_order.paid platform webhook emitted
    expect(mockEmitPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "draft_order.paid",
        tenantId: "tenant_1",
        payload: expect.objectContaining({
          draftOrderId: "draft_1",
          stripePaymentIntentId: "pi_test_123",
          currency: "SEK",
        }),
      }),
    );

    // Tx 2: convertDraftToOrder
    expect(mockConvertDraftToOrder).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
      actorSource: "webhook",
    });

    // Phase C: side-effects
    expect(mockProcessOrderPaidSideEffects).toHaveBeenCalledWith(
      "order_new_1",
      "pi_test_123",
    );
  });

  it("handles OVERDUE status (same edge as INVOICED)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "OVERDUE" }),
    );
    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockTx.draftOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(mockCreateDraftOrderEventInTx).toHaveBeenCalled();
    expect(mockConvertDraftToOrder).toHaveBeenCalled();
  });

  it("skips tx1 when draft is already PAID (retry after Stripe delivers twice)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "PAID" }),
    );
    await handleDraftOrderPaymentIntentSucceeded(makePi());

    // Tx1 not opened
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockCreateDraftOrderEventInTx).not.toHaveBeenCalled();
    // Tx2 still runs (completes convert)
    expect(mockConvertDraftToOrder).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Metadata + dispatch guards
// ═══════════════════════════════════════════════════════════════

describe("handleDraftOrderPaymentIntentSucceeded — metadata guards", () => {
  it("no-ops when draftOrderId missing (logs error)", async () => {
    await handleDraftOrderPaymentIntentSucceeded(
      makePi({
        metadata: {
          tenantId: "tenant_1",
          kind: "draft_order_invoice",
        } as Stripe.Metadata,
      }),
    );

    expect(mockPrisma.draftOrder.findFirst).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
  });

  it("no-ops when tenantId missing", async () => {
    await handleDraftOrderPaymentIntentSucceeded(
      makePi({
        metadata: {
          draftOrderId: "draft_1",
          kind: "draft_order_invoice",
        } as Stripe.Metadata,
      }),
    );

    expect(mockPrisma.draftOrder.findFirst).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
  });

  it("no-ops when draft not found in tenant", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
    await handleDraftOrderPaymentIntentSucceeded(makePi());
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Idempotency
// ═══════════════════════════════════════════════════════════════

describe("handleDraftOrderPaymentIntentSucceeded — idempotency", () => {
  it("L3 shortcut: skips all work when completedOrderId already set", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        status: "COMPLETED",
        completedOrderId: "order_previous_1",
      }),
    );
    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
    expect(mockProcessOrderPaidSideEffects).not.toHaveBeenCalled();
    expect(mockEmitPlatformEvent).not.toHaveBeenCalled();
  });

  it("tx1 count=0 (race lost) still proceeds to tx2 (idempotent retry)", async () => {
    mockTx.draftOrder.updateMany.mockResolvedValue({ count: 0 });
    await handleDraftOrderPaymentIntentSucceeded(makePi());

    // Event NOT written (count=0 short-circuits inside tx)
    expect(mockCreateDraftOrderEventInTx).not.toHaveBeenCalled();
    // Tx1 ran but had no effect — tx2 proceeds because convert handles
    // its own race detection (L3 in-tx, L4 P2002).
    //
    // draft_order.paid webhook DOES fire because the outer function doesn't
    // know the updateMany short-circuited. Operator intention: both
    // workers "winning" the status transition emit one paid event each;
    // the inner commits only happen once (L3 in convert), so this is
    // acceptable eventual-consistency.
    expect(mockConvertDraftToOrder).toHaveBeenCalled();
  });

  it("convertDraftToOrder returning alreadyConverted=true still fires side-effects", async () => {
    mockConvertDraftToOrder.mockResolvedValue({
      draft: makeDraft({
        status: "COMPLETED",
        completedOrderId: "order_parallel_1",
      }),
      order: { id: "order_parallel_1", totalAmount: 10_000, currency: "SEK" },
      orderLineItems: [],
      bookings: [],
      alreadyConverted: true,
    });
    await handleDraftOrderPaymentIntentSucceeded(makePi());

    // Side-effects called with the existing order id.
    expect(mockProcessOrderPaidSideEffects).toHaveBeenCalledWith(
      "order_parallel_1",
      "pi_test_123",
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Status guards (F11 concern: no 5xx on irrecoverable states)
// ═══════════════════════════════════════════════════════════════

describe("handleDraftOrderPaymentIntentSucceeded — status guards", () => {
  it("silently skips when draft status is unexpected (e.g. OPEN)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "OPEN" }),
    );
    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
  });

  it("silently skips when draft is CANCELLED", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "CANCELLED" }),
    );
    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Failure propagation (Stripe retry triggers)
// ═══════════════════════════════════════════════════════════════

describe("handleDraftOrderPaymentIntentSucceeded — failure handling", () => {
  it("convertDraftToOrder failure re-throws (triggers Stripe retry)", async () => {
    mockConvertDraftToOrder.mockRejectedValue(new Error("convert failed"));
    await expect(
      handleDraftOrderPaymentIntentSucceeded(makePi()),
    ).rejects.toThrow(/convert failed/);
  });

  it("side-effects failure does NOT throw back (would cause wasted Stripe retry)", async () => {
    mockProcessOrderPaidSideEffects.mockRejectedValue(new Error("email down"));
    await expect(
      handleDraftOrderPaymentIntentSucceeded(makePi()),
    ).resolves.toBeUndefined();
  });

  it("platform webhook emission failure is swallowed (fire-and-forget)", async () => {
    mockEmitPlatformEvent.mockRejectedValue(new Error("app down"));
    await expect(
      handleDraftOrderPaymentIntentSucceeded(makePi()),
    ).resolves.toBeUndefined();
  });
});
