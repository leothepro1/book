/**
 * Phase H — `handleDraftOrderPaymentIntentSucceeded` test suite.
 *
 * Covers all 16 branches enumerated in /tmp/phase-h-plan.md §"Test plan".
 * `runAutoRefundForPaidNonActiveSession` is mocked at module boundary;
 * its own unit-level coverage lives in `auto-refund-session.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// ── Mocks ────────────────────────────────────────────────────────

const mockTx = {
  draftOrder: { updateMany: vi.fn() },
  draftCheckoutSession: { updateMany: vi.fn() },
};

const mockPrisma = {
  draftCheckoutSession: { findUnique: vi.fn() },
  tenant: { findUnique: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) =>
    cb(mockTx),
  ),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockSendOperatorAlert = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/integrations/reliability/alert-operator", () => ({
  sendOperatorAlert: mockSendOperatorAlert,
}));

const mockRunAutoRefund = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/draft-orders/auto-refund-session", () => ({
  runAutoRefundForPaidNonActiveSession: mockRunAutoRefund,
}));

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

function makePi(
  overrides: Partial<Stripe.PaymentIntent> = {},
): Stripe.PaymentIntent {
  return {
    id: "pi_test_123",
    amount: 12_500,
    currency: "sek",
    metadata: {
      kind: "draft_order_invoice",
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      draftCheckoutSessionId: "sess_active_1",
      draftDisplayNumber: "D-2026-1001",
    },
    ...overrides,
  } as Stripe.PaymentIntent;
}

function makeSession(overrides: Record<string, unknown> = {}) {
  const draftOverrides =
    (overrides.draftOrder as Record<string, unknown> | undefined) ?? {};
  const merged: Record<string, unknown> = { ...overrides };
  delete merged.draftOrder;
  return {
    id: "sess_active_1",
    tenantId: "tenant_1",
    status: "ACTIVE",
    draftOrder: {
      id: "draft_1",
      status: "INVOICED",
      completedOrderId: null,
      displayNumber: "D-2026-1001",
      ...draftOverrides,
    },
    ...merged,
  };
}

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant_1",
    stripeAccountId: "acct_test_1",
    stripeOnboardingComplete: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx),
  );
  mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(makeSession());
  mockPrisma.tenant.findUnique.mockResolvedValue(makeTenant());
  mockTx.draftCheckoutSession.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });
  mockEmitPlatformEvent.mockResolvedValue(undefined);
  mockSendOperatorAlert.mockResolvedValue(undefined);
  mockRunAutoRefund.mockResolvedValue(undefined);
  mockConvertDraftToOrder.mockResolvedValue({
    draft: { id: "draft_1", status: "COMPLETED", completedOrderId: "ord_1" },
    order: { id: "ord_1", totalAmount: 12_500, currency: "SEK" },
    orderLineItems: [],
    bookings: [],
    alreadyConverted: false,
  });
  mockProcessOrderPaidSideEffects.mockResolvedValue(undefined);
  mockCreateDraftOrderEventInTx.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════
// 1–2: missing metadata
// ═══════════════════════════════════════════════════════════════

describe("handler — missing metadata", () => {
  it("Branch 1: missing tenantId → warn + return, no DB write", async () => {
    await handleDraftOrderPaymentIntentSucceeded(
      makePi({
        metadata: {
          kind: "draft_order_invoice",
          draftCheckoutSessionId: "sess_x",
        } as Stripe.Metadata,
      }),
    );

    expect(mockPrisma.draftCheckoutSession.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
    expect(mockRunAutoRefund).not.toHaveBeenCalled();
  });

  it("Branch 2: missing draftCheckoutSessionId → warn + return", async () => {
    await handleDraftOrderPaymentIntentSucceeded(
      makePi({
        metadata: {
          kind: "draft_order_invoice",
          tenantId: "tenant_1",
        } as Stripe.Metadata,
      }),
    );

    expect(mockPrisma.draftCheckoutSession.findUnique).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// 3–4: lookup failures + mismatch
// ═══════════════════════════════════════════════════════════════

describe("handler — lookup failures", () => {
  it("Branch 3: session not found → error log + operator alert + return", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(null);

    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockPrisma.draftCheckoutSession.findUnique).toHaveBeenCalledTimes(1);
    expect(mockSendOperatorAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "urgent",
        subject: expect.stringContaining("session not found"),
      }),
    );
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
    expect(mockRunAutoRefund).not.toHaveBeenCalled();
  });

  it("Branch 4: tenant mismatch (metadata vs session) → alert + return", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeSession({ tenantId: "tenant_OTHER" }),
    );

    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockSendOperatorAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "urgent",
        subject: expect.stringContaining("metadata mismatch"),
      }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// 5–6: ACTIVE + EXPIRED happy/late paths
// ═══════════════════════════════════════════════════════════════

describe("handler — happy + late paths", () => {
  it("Branch 5: ACTIVE happy path — tx1 transitions both rows, convert + side-effects + platform webhook", async () => {
    await handleDraftOrderPaymentIntentSucceeded(makePi());

    // Tx1: session ACTIVE → PAID
    expect(mockTx.draftCheckoutSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "sess_active_1",
          status: { in: ["ACTIVE", "EXPIRED"] },
        }),
        data: expect.objectContaining({
          status: "PAID",
          paidAt: expect.any(Date),
        }),
      }),
    );

    // Tx1: draft INVOICED → PAID
    expect(mockTx.draftOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "draft_1",
          tenantId: "tenant_1",
          status: { in: ["INVOICED", "OVERDUE"] },
        }),
        data: expect.objectContaining({ status: "PAID" }),
      }),
    );

    // STATE_CHANGED event
    expect(mockCreateDraftOrderEventInTx).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        type: "STATE_CHANGED",
        actorSource: "webhook",
      }),
    );

    // convertDraftToOrder called
    expect(mockConvertDraftToOrder).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
      actorSource: "webhook",
    });

    // Side-effects
    expect(mockProcessOrderPaidSideEffects).toHaveBeenCalledWith(
      "ord_1",
      "pi_test_123",
    );

    // Platform webhook
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

    // No refund on happy path
    expect(mockRunAutoRefund).not.toHaveBeenCalled();
  });

  it("Branch 6: EXPIRED late path — same flow as ACTIVE (money trumps expiry)", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeSession({ status: "EXPIRED" }),
    );

    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockTx.draftCheckoutSession.updateMany).toHaveBeenCalled();
    expect(mockTx.draftOrder.updateMany).toHaveBeenCalled();
    expect(mockConvertDraftToOrder).toHaveBeenCalled();
    expect(mockProcessOrderPaidSideEffects).toHaveBeenCalled();
    expect(mockEmitPlatformEvent).toHaveBeenCalled();
    expect(mockRunAutoRefund).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// 7: ACTIVE race-lost (session updateMany count=0)
// ═══════════════════════════════════════════════════════════════

describe("handler — race-lost on session tx1", () => {
  it("Branch 7: session updateMany count=0 → no convert, no platform webhook", async () => {
    mockTx.draftCheckoutSession.updateMany.mockResolvedValue({ count: 0 });

    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockTx.draftCheckoutSession.updateMany).toHaveBeenCalledTimes(1);
    expect(mockTx.draftOrder.updateMany).not.toHaveBeenCalled();
    expect(mockCreateDraftOrderEventInTx).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
    expect(mockProcessOrderPaidSideEffects).not.toHaveBeenCalled();
    expect(mockEmitPlatformEvent).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// 8–10: post-tx error handling
// ═══════════════════════════════════════════════════════════════

describe("handler — post-tx error propagation", () => {
  it("Branch 8: ACTIVE tx1 succeeds + convert throws → error propagates (route.ts catches and 200s)", async () => {
    mockConvertDraftToOrder.mockRejectedValue(new Error("convert exploded"));

    await expect(
      handleDraftOrderPaymentIntentSucceeded(makePi()),
    ).rejects.toThrow(/convert exploded/);

    expect(mockProcessOrderPaidSideEffects).not.toHaveBeenCalled();
    expect(mockEmitPlatformEvent).not.toHaveBeenCalled();
  });

  it("Branch 9: ACTIVE happy path + side-effects throws → swallowed, platform webhook still fires", async () => {
    mockProcessOrderPaidSideEffects.mockRejectedValue(new Error("email down"));

    await expect(
      handleDraftOrderPaymentIntentSucceeded(makePi()),
    ).resolves.toBeUndefined();

    expect(mockEmitPlatformEvent).toHaveBeenCalled();
  });

  it("Branch 10: ACTIVE happy path + platform webhook throws → swallowed", async () => {
    mockEmitPlatformEvent.mockRejectedValue(new Error("app down"));

    await expect(
      handleDraftOrderPaymentIntentSucceeded(makePi()),
    ).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 11–12: PAID idempotent + PAID-no-converted alert
// ═══════════════════════════════════════════════════════════════

describe("handler — PAID idempotent replay", () => {
  it("Branch 11: PAID with completedOrderId set → silent no-op", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeSession({
        status: "PAID",
        draftOrder: {
          id: "draft_1",
          status: "PAID",
          completedOrderId: "ord_existing",
          displayNumber: "D-2026-1001",
        },
      }),
    );

    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
    expect(mockRunAutoRefund).not.toHaveBeenCalled();
    expect(mockSendOperatorAlert).not.toHaveBeenCalled();
  });

  it("Branch 12: PAID with completedOrderId null → urgent alert + no further action", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeSession({
        status: "PAID",
        draftOrder: {
          id: "draft_1",
          status: "PAID",
          completedOrderId: null,
          displayNumber: "D-2026-1001",
        },
      }),
    );

    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockSendOperatorAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "urgent",
        subject: expect.stringContaining("paid without converted Order"),
      }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
    expect(mockRunAutoRefund).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// 13–15: UNLINKED + CANCELLED auto-refund + Stripe error
// ═══════════════════════════════════════════════════════════════

describe("handler — auto-refund (UNLINKED / CANCELLED)", () => {
  it("Branch 13: UNLINKED → runAutoRefund with reasonCode 'unlinked_session_paid', no convert, no draft transition", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeSession({ status: "UNLINKED" }),
    );

    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockRunAutoRefund).toHaveBeenCalledWith({
      tenant: makeTenant(),
      sessionId: "sess_active_1",
      paymentIntentId: "pi_test_123",
      amountCents: 12_500,
      reasonCode: "unlinked_session_paid",
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
    expect(mockEmitPlatformEvent).not.toHaveBeenCalled();
  });

  it("Branch 14: CANCELLED → runAutoRefund with reasonCode 'cancelled_session_paid'", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeSession({ status: "CANCELLED" }),
    );

    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockRunAutoRefund).toHaveBeenCalledWith({
      tenant: makeTenant(),
      sessionId: "sess_active_1",
      paymentIntentId: "pi_test_123",
      amountCents: 12_500,
      reasonCode: "cancelled_session_paid",
    });

    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
    expect(mockEmitPlatformEvent).not.toHaveBeenCalled();
  });

  it("Branch 15: UNLINKED + auto-refund Stripe error → re-thrown to route.ts", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeSession({ status: "UNLINKED" }),
    );
    mockRunAutoRefund.mockRejectedValue(new Error("stripe_unreachable"));

    await expect(
      handleDraftOrderPaymentIntentSucceeded(makePi()),
    ).rejects.toThrow(/stripe_unreachable/);
  });
});

// ═══════════════════════════════════════════════════════════════
// 16: L3 short-circuit
// ═══════════════════════════════════════════════════════════════

describe("handler — L3 short-circuit", () => {
  it("Branch 16: ACTIVE session but draft.completedOrderId already set → return without tx1", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeSession({
        status: "ACTIVE",
        draftOrder: {
          id: "draft_1",
          status: "INVOICED",
          completedOrderId: "ord_existing",
          displayNumber: "D-2026-1001",
        },
      }),
    );

    await handleDraftOrderPaymentIntentSucceeded(makePi());

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConvertDraftToOrder).not.toHaveBeenCalled();
    expect(mockProcessOrderPaidSideEffects).not.toHaveBeenCalled();
    expect(mockEmitPlatformEvent).not.toHaveBeenCalled();
    expect(mockRunAutoRefund).not.toHaveBeenCalled();
  });
});
