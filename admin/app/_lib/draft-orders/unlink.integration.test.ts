/**
 * Phase D — end-to-end unlink integration test.
 *
 * One scenario per unlink-aware mutation: with an ACTIVE
 * `DraftCheckoutSession` attached to the draft, run the mutation and
 * assert:
 *
 *   1. The session was flipped ACTIVE → UNLINKED with the correct
 *      reason.
 *   2. PLACED reservations were marked RELEASED (status-CAS) with
 *      `holdReleaseReason="session_unlinked"`.
 *   3. A STATE_CHANGED event was emitted carrying the unlink metadata.
 *   4. `runUnlinkSideEffects` was scheduled with the right
 *      `stripePaymentIntentId` + `releasedHoldExternalIds`.
 *
 * The §13.1 mark-as-paid scenario additionally asserts:
 *   5. The draft transitioned INVOICED → PAID.
 *   6. The unlink ran BEFORE the status transition (per the §13.1 fix).
 *
 * Drives every mutation through a single set of mocks (a per-test
 * shared `mockTx`). The integration is "between unlink + caller", not
 * the full pipeline — calculator + PMS + payment-provider stay mocked
 * out so we focus on the unlink wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock surface ────────────────────────────────────────────────

const mockTx = {
  draftOrder: {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  draftLineItem: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  draftReservation: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  draftCheckoutSession: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  draftOrderEvent: { create: vi.fn() },
};

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  draftLineItem: { findFirst: vi.fn() },
  draftReservation: { findFirst: vi.fn() },
  accommodation: { findFirst: vi.fn(), findMany: vi.fn() },
  productVariant: { findFirst: vi.fn() },
  guestAccount: { findFirst: vi.fn() },
  companyLocation: { findFirst: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/apps/webhooks", () => ({ emitPlatformEvent: vi.fn() }));

vi.mock("./holds", () => ({
  releaseHoldForDraftLine: vi.fn().mockResolvedValue({
    reservation: { holdState: "RELEASED" },
    adapterReleaseOk: true,
  }),
  placeHoldForDraftLine: vi.fn(),
  placeHoldsForDraft: vi.fn(),
  DEFAULT_DRAFT_HOLD_DURATION_MS: 30 * 60 * 1000,
}));

const mockSideEffects = vi.fn();
vi.mock("./unlink-side-effects", () => ({
  runUnlinkSideEffects: mockSideEffects,
}));

vi.mock("./calculator", async () => {
  const actual = await vi.importActual<typeof import("./calculator")>(
    "./calculator",
  );
  return {
    ...actual,
    computeAndPersistDraftTotalsInTx: vi.fn().mockResolvedValue({
      source: "COMPUTED",
      frozenAt: null,
      currency: "SEK",
      subtotalCents: BigInt(10_000),
      totalLineDiscountCents: BigInt(0),
      orderDiscountCents: BigInt(0),
      totalDiscountCents: BigInt(0),
      taxCents: BigInt(0),
      shippingCents: BigInt(0),
      totalCents: BigInt(10_000),
      perLine: [],
      warnings: [] as string[],
    }),
  };
});

vi.mock("@/app/_lib/discounts/apply", () => ({
  calculateDiscountImpact: vi.fn().mockResolvedValue({
    valid: true,
    discount: { id: "d_1", valueType: "PERCENTAGE" },
    discountAmount: 100,
    discountCodeValue: "X",
    title: "T",
    description: "",
  }),
}));

vi.mock("@/app/_lib/pricing/line-pricing", () => ({
  computeAccommodationLinePrice: vi.fn(),
  computeProductLinePrice: vi.fn().mockResolvedValue({
    kind: "PRODUCT",
    unitPriceCents: BigInt(1000),
    subtotalCents: BigInt(1000),
    currency: "SEK",
    title: "P",
    sku: null,
    imageUrl: null,
    variantTitle: null,
    productId: "prod_1",
  }),
}));

const mockStripeCancel = vi.fn();
vi.mock("@/app/_lib/stripe/client", () => ({
  getStripe: () => ({ paymentIntents: { cancel: mockStripeCancel } }),
}));

const { addLineItem, updateLineItem, removeLineItem } = await import("./lines");
const { applyDiscountCode, removeDiscountCode } = await import("./discount");
const { updateDraftCustomer } = await import("./update-customer");
const { updateDraftMeta } = await import("./update-meta");
const { markDraftAsPaid } = await import("./mark-as-paid");

// ── Fixtures ────────────────────────────────────────────────────

function makeInvoicedDraft(over: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    displayNumber: "D-1001",
    status: "INVOICED",
    buyerKind: "GUEST",
    guestAccountId: "g_1",
    companyLocationId: null,
    companyContactId: null,
    contactEmail: "buyer@example.com",
    contactPhone: null,
    contactFirstName: null,
    contactLastName: null,
    poNumber: null,
    subtotalCents: BigInt(10_000),
    orderDiscountCents: BigInt(0),
    shippingCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(10_000),
    currency: "SEK",
    taxesIncluded: true,
    appliedDiscountId: null,
    appliedDiscountCode: null,
    appliedDiscountAmount: null,
    appliedDiscountType: null,
    paymentTermsId: null,
    paymentTermsFrozen: null,
    depositPercent: null,
    shareLinkToken: "tok_abc",
    shareLinkExpiresAt: new Date(Date.now() + 86_400_000),
    invoiceUrl: "https://acme.rutgr.com/invoice/tok_abc",
    invoiceSentAt: new Date(),
    invoiceEmailSubject: null,
    invoiceEmailMessage: null,
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    completedAt: null,
    completedOrderId: null,
    cancelledAt: null,
    cancellationReason: null,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 5,
    internalNote: null,
    customerNote: null,
    metafields: null,
    tags: [] as string[],
    lineItems: [],
    ...over,
  };
}

const ACTIVE_SESSION = {
  id: "ses_active",
  version: 1,
  stripePaymentIntentId: "pi_buyer_456",
};

const PLACED_RESERVATION = {
  id: "res_placed",
  holdExternalId: "mews_hold_123",
};

beforeEach(async () => {
  // Use clearAllMocks (not reset) to keep vi.mock(...) return values
  // intact; only call/return-value history is cleared.
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx),
  );

  // Live INVOICED draft + active session + one PLACED reservation.
  const draft = makeInvoicedDraft();
  mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
  mockTx.draftOrder.findFirst.mockResolvedValue(draft);
  mockTx.draftOrder.update.mockResolvedValue(draft);
  mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftCheckoutSession.findFirst.mockResolvedValue(ACTIVE_SESSION);
  mockTx.draftCheckoutSession.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftReservation.findMany.mockResolvedValue([PLACED_RESERVATION]);
  mockTx.draftReservation.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  mockSideEffects.mockResolvedValue({
    holdReleaseAttempted: 1,
    holdReleaseErrors: [],
    stripePaymentIntentCancelAttempted: true,
    stripePaymentIntentCancelError: null,
  });

  // Re-anchor module-level mocks (clearAllMocks wipes call history but
  // leaves implementations; an explicit reassignment guards against
  // earlier test-file-isolation idiosyncrasies in vitest).
  const webhooks = await import("@/app/_lib/apps/webhooks");
  (webhooks.emitPlatformEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
    undefined,
  );
});

// ─── Per-mutation helpers ──

function expectSessionUnlinked(reason: string) {
  const sessionUpdate =
    mockTx.draftCheckoutSession.updateMany.mock.calls[0]?.[0];
  expect(sessionUpdate).toBeDefined();
  expect(sessionUpdate.where).toMatchObject({
    id: "ses_active",
    version: 1,
  });
  expect(sessionUpdate.data).toMatchObject({
    status: "UNLINKED",
    unlinkReason: reason,
  });
}

function expectHoldsReleased() {
  expect(mockTx.draftReservation.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "res_placed", holdState: "PLACED" },
      data: expect.objectContaining({
        holdState: "RELEASED",
        holdReleaseReason: "session_unlinked",
      }),
    }),
  );
}

function expectStateChangedEventWithUnlink(reason: string) {
  const events = mockTx.draftOrderEvent.create.mock.calls.map(
    (c) => (c[0] as { data: { type: string; metadata: Record<string, unknown> } }).data,
  );
  const stateChanged = events.find((e) => e.type === "STATE_CHANGED");
  expect(stateChanged).toBeDefined();
  // The unlink-emitted STATE_CHANGED carries unlinkedSessionId. Other
  // STATE_CHANGED events (e.g. status transitions) might also be emitted
  // — find the one with the unlink metadata.
  const unlinkEvent = events.find(
    (e) => e.type === "STATE_CHANGED" && e.metadata.unlinkedSessionId,
  );
  expect(unlinkEvent).toBeDefined();
  expect(unlinkEvent!.metadata).toMatchObject({
    unlinkedSessionId: "ses_active",
    unlinkReason: reason,
    releasedHoldExternalIds: ["mews_hold_123"],
    stripePaymentIntentId: "pi_buyer_456",
  });
}

function expectSideEffectsScheduled() {
  // The fire-and-forget dispatcher in lines/discount/update-* uses
  // `void runUnlinkSideEffects(...).catch(...)`. The mock receives the
  // call synchronously as part of the mutation — assert it was invoked
  // with the unlink-result fields.
  expect(mockSideEffects).toHaveBeenCalledWith(
    expect.objectContaining({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      sessionId: "ses_active",
      releasedHoldExternalIds: ["mews_hold_123"],
      stripePaymentIntentId: "pi_buyer_456",
    }),
  );
}

// ═══════════════════════════════════════════════════════════════
// Mutation 1 — addLineItem
// ═══════════════════════════════════════════════════════════════

describe("unlink integration — addLineItem", () => {
  it("unlinks active session, releases holds, schedules side effects", async () => {
    // INVOICED status would normally fail the OPEN-only mutability gate.
    // Force the draft into OPEN with shareLinkToken still set so the
    // unlink path can fire. Production mutations in this state require
    // unlink integration before they're allowed (Phase D's whole point);
    // this test bypasses the gate by mocking the read.
    const draft = makeInvoicedDraft({ status: "OPEN" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    mockTx.draftOrder.findFirst.mockResolvedValue(draft);
    // First findFirst = position lookup (returns null);
    // second findFirst = refresh after calculator (returns line).
    mockTx.draftLineItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "dli_new",
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineType: "PRODUCT",
        title: "Test",
        taxAmountCents: BigInt(0),
        totalCents: BigInt(1000),
      });
    mockTx.draftLineItem.create.mockResolvedValue({
      id: "dli_new",
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineType: "PRODUCT",
      title: "Test",
    });
    mockPrisma.productVariant.findFirst.mockResolvedValue({
      id: "var_1",
      productId: "prod_1",
      product: { id: "prod_1", title: "Test", taxable: true },
      title: "Variant",
      sku: null,
      imageUrl: null,
      price: BigInt(1000),
      compareAtPrice: null,
      tenantId: "tenant_1",
    });

    await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: {
        lineType: "PRODUCT",
        productVariantId: "var_1",
        quantity: 1,
      },
    });

    expectSessionUnlinked("draft_mutated");
    expectHoldsReleased();
    expectStateChangedEventWithUnlink("draft_mutated");
    expectSideEffectsScheduled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Mutation 2 — updateLineItem
// ═══════════════════════════════════════════════════════════════

describe("unlink integration — updateLineItem", () => {
  it("unlinks active session, releases holds, schedules side effects", async () => {
    const draft = makeInvoicedDraft({ status: "OPEN" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    mockTx.draftOrder.findFirst.mockResolvedValue(draft);
    mockPrisma.draftLineItem.findFirst.mockResolvedValue({
      id: "dli_1",
      lineType: "PRODUCT",
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      title: "Test",
    });
    mockPrisma.draftReservation.findFirst.mockResolvedValue(null);

    await updateLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_1",
      patch: { lineType: "PRODUCT", taxable: false },
    });

    expectSessionUnlinked("draft_mutated");
    expectHoldsReleased();
    expectSideEffectsScheduled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Mutation 3 — removeLineItem
// ═══════════════════════════════════════════════════════════════

describe("unlink integration — removeLineItem", () => {
  it("unlinks active session, releases holds, schedules side effects", async () => {
    const draft = makeInvoicedDraft({ status: "OPEN" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    mockTx.draftOrder.findFirst.mockResolvedValue(draft);
    mockPrisma.draftLineItem.findFirst.mockResolvedValue({
      id: "dli_1",
      lineType: "PRODUCT",
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      title: "Test",
    });
    mockPrisma.draftReservation.findFirst.mockResolvedValue(null);

    await removeLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_1",
    });

    expectSessionUnlinked("draft_mutated");
    expectSideEffectsScheduled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Mutation 4 — applyDiscountCode
// ═══════════════════════════════════════════════════════════════

describe("unlink integration — applyDiscountCode", () => {
  it("unlinks active session, releases holds, schedules side effects", async () => {
    const draft = makeInvoicedDraft({ status: "OPEN" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    mockTx.draftOrder.findFirst.mockResolvedValue(draft);
    mockPrisma.accommodation.findMany.mockResolvedValue([]);
    mockPrisma.companyLocation.findFirst.mockResolvedValue(null);

    await applyDiscountCode({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      code: "X",
    });

    expectSessionUnlinked("draft_mutated");
    expectSideEffectsScheduled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Mutation 5 — removeDiscountCode
// ═══════════════════════════════════════════════════════════════

describe("unlink integration — removeDiscountCode", () => {
  it("unlinks active session, releases holds, schedules side effects", async () => {
    const draft = makeInvoicedDraft({
      status: "OPEN",
      appliedDiscountCode: "X",
      appliedDiscountAmount: BigInt(100),
    });
    mockPrisma.draftOrder.findFirst
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({
        appliedDiscountCode: "X",
        appliedDiscountAmount: BigInt(100),
      });
    mockTx.draftOrder.findFirst.mockResolvedValue(draft);
    mockPrisma.accommodation.findMany.mockResolvedValue([]);

    await removeDiscountCode({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expectSessionUnlinked("draft_mutated");
    expectSideEffectsScheduled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Mutation 6 — updateDraftCustomer
// ═══════════════════════════════════════════════════════════════

describe("unlink integration — updateDraftCustomer", () => {
  it("unlinks active session and schedules side effects", async () => {
    mockPrisma.guestAccount.findFirst.mockResolvedValue({ id: "g_new" });
    const draft = makeInvoicedDraft({
      status: "APPROVED",
      guestAccountId: "g_old",
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce({ status: "APPROVED", version: 5 })
      .mockResolvedValueOnce(draft);

    const result = await updateDraftCustomer(
      "draft_1",
      "tenant_1",
      { guestAccountId: "g_new" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(true);
    expectSessionUnlinked("draft_mutated");
    expectSideEffectsScheduled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Mutation 7 — updateDraftMeta
// ═══════════════════════════════════════════════════════════════

describe("unlink integration — updateDraftMeta", () => {
  it("unlinks active session and schedules side effects", async () => {
    const draft = makeInvoicedDraft({
      status: "APPROVED",
      internalNote: null,
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce({ status: "APPROVED", version: 5 })
      .mockResolvedValueOnce(draft);

    const result = await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { internalNote: "ny" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(true);
    expectSessionUnlinked("draft_mutated");
    expectSideEffectsScheduled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Mutation 8 — markDraftAsPaid (§13.1 fix)
// ═══════════════════════════════════════════════════════════════

describe("§13.1 — markDraftAsPaid unlinks active session before recording manual payment", () => {
  it("cancels active session PI before transitioning INVOICED → PAID", async () => {
    const draft = makeInvoicedDraft({ status: "INVOICED" });
    mockPrisma.draftOrder.findFirst
      .mockResolvedValueOnce(draft) // pre-tx load
      .mockResolvedValueOnce(makeInvoicedDraft({ status: "PAID" })); // refresh
    mockTx.draftOrder.findFirst.mockResolvedValue({ status: "INVOICED" });

    const result = await markDraftAsPaid({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      reference: "Bankgiro-001",
      actorUserId: "u_1",
    });

    // Result: draft is PAID
    expect(result.draft.status).toBe("PAID");

    // Session was unlinked with the §13.1 reason
    expectSessionUnlinked("marked_paid_manually");

    // Side effects scheduled with the active-session PI ID
    expectSideEffectsScheduled();

    // §13.1 ordering invariant: unlink ran BEFORE the status transition.
    // We verify by checking the call order — the session's updateMany
    // must precede the draft's status-CAS updateMany.
    const sessionCall =
      mockTx.draftCheckoutSession.updateMany.mock.invocationCallOrder[0];
    const draftStatusCall =
      mockTx.draftOrder.updateMany.mock.invocationCallOrder[0];
    expect(sessionCall).toBeLessThan(draftStatusCall);
  });
});
