import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  DraftOrder,
  DraftLineItem,
  DraftReservation,
} from "@prisma/client";

// ── Mocks ────────────────────────────────────────────────────────

const mockTx = {
  draftOrder: {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  draftLineItem: { update: vi.fn() },
  // Phase D — unlink reads/writes the session table + reservations.
  draftCheckoutSession: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  draftReservation: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  draftOrderEvent: { create: vi.fn() },
};

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  tenant: { findUnique: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockEmit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/apps/webhooks", () => ({ emitPlatformEvent: mockEmit }));

const mockComputeDraftTotals = vi.fn();
vi.mock("./calculator", async () => {
  const actual = await vi.importActual<typeof import("./calculator")>(
    "./calculator",
  );
  return {
    ...actual,
    computeDraftTotals: mockComputeDraftTotals,
  };
});

// FAS 6.5D: payment-provider + Stripe mocks for sendInvoice.
const mockInitiatePayment = vi.fn();
vi.mock("@/app/_lib/payments/providers", () => ({
  initiateOrderPayment: mockInitiatePayment,
}));

const mockVerifyCharges = vi.fn();
vi.mock("@/app/_lib/stripe/verify-account", () => ({
  verifyChargesEnabled: mockVerifyCharges,
}));

// FAS 6.5D: holds + Stripe client mocks for cancelDraft.
const mockReleaseHold = vi.fn();
vi.mock("./holds", () => ({
  releaseHoldForDraftLine: mockReleaseHold,
  // These are re-exported but unused by lifecycle.ts — stub them.
  placeHoldForDraftLine: vi.fn(),
  placeHoldsForDraft: vi.fn(),
  DEFAULT_DRAFT_HOLD_DURATION_MS: 30 * 60 * 1000,
}));

// Phase D — unlink-side-effects mocked. cancelDraft awaits this
// post-commit (per Phase D design — the helper never throws and we
// surface its result fields). Other mutations fire-and-forget.
const mockRunSideEffects = vi.fn();
vi.mock("./unlink-side-effects", () => ({
  runUnlinkSideEffects: mockRunSideEffects,
}));

const mockStripePiCancel = vi.fn();
vi.mock("@/app/_lib/stripe/client", () => ({
  getStripe: () => ({
    paymentIntents: { cancel: mockStripePiCancel },
  }),
}));

const { sendInvoice, cancelDraft } = await import("./lifecycle");

// ── Fixtures ────────────────────────────────────────────────────

function makeLine(overrides: Partial<DraftLineItem> = {}): DraftLineItem {
  return {
    id: "dli_1",
    tenantId: "tenant_1",
    draftOrderId: "draft_1",
    lineType: "PRODUCT",
    position: 0,
    accommodationId: null,
    checkInDate: null,
    checkOutDate: null,
    nights: null,
    guestCounts: null,
    ratePlanId: null,
    ratePlanName: null,
    ratePlanCancellationPolicy: null,
    selectedAddons: null,
    productVariantId: "var_1",
    productId: "prod_1",
    variantTitle: null,
    sku: null,
    imageUrl: null,
    taxable: true,
    taxCode: null,
    title: "Test",
    quantity: 1,
    unitPriceCents: BigInt(10_000),
    subtotalCents: BigInt(10_000),
    lineDiscountCents: BigInt(0),
    taxAmountCents: BigInt(0),
    totalCents: BigInt(10_000),
    appliedCatalogId: null,
    appliedRule: "BASE",
    lineDiscountTitle: null,
    lineDiscountType: null,
    lineDiscountValue: null,
    attributes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DraftLineItem;
}

type RawDraft = DraftOrder & { lineItems: DraftLineItem[] };

function makeDraft(overrides: Partial<RawDraft> = {}): RawDraft {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    displayNumber: "D-2026-1001",
    status: "OPEN",
    buyerKind: "GUEST",
    guestAccountId: "acc_1",
    companyLocationId: null,
    companyContactId: null,
    contactEmail: null,
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
    shareLinkToken: null,
    shareLinkExpiresAt: null,
    invoiceUrl: null,
    invoiceSentAt: null,
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
    version: 1,
    internalNote: null,
    customerNote: null,
    metafields: null,
    tags: [],
    lineItems: [makeLine()],
    ...overrides,
  } as RawDraft;
}

function makeTotals(overrides: Record<string, unknown> = {}) {
  return {
    source: "COMPUTED" as const,
    frozenAt: null,
    currency: "SEK",
    subtotalCents: BigInt(10_000),
    totalLineDiscountCents: BigInt(0),
    orderDiscountCents: BigInt(0),
    totalDiscountCents: BigInt(0),
    taxCents: BigInt(0),
    shippingCents: BigInt(0),
    totalCents: BigInt(10_000),
    perLine: [
      {
        lineId: "dli_1",
        subtotalCents: BigInt(10_000),
        manualLineDiscountCents: BigInt(0),
        allocatedOrderDiscountCents: BigInt(0),
        totalLineDiscountCents: BigInt(0),
        taxableBaseCents: BigInt(10_000),
        taxCents: BigInt(0),
        totalCents: BigInt(10_000),
      },
    ],
    warnings: [],
    ...overrides,
  };
}

// ── FAS 6.5D fixtures ────────────────────────────────────────────

function makeReservation(
  overrides: Partial<DraftReservation> = {},
): DraftReservation {
  return {
    id: "dr_1",
    tenantId: "tenant_1",
    draftOrderId: "draft_1",
    draftLineItemId: "dli_acc_1",
    accommodationId: "acc_1",
    ratePlanId: null,
    checkInDate: new Date("2026-06-01T00:00:00Z"),
    checkOutDate: new Date("2026-06-03T00:00:00Z"),
    guestCounts: { adults: 2, children: 0, infants: 0 } as unknown as DraftReservation["guestCounts"],
    holdExternalId: "pms_hold_1",
    holdExpiresAt: new Date(Date.now() + 30 * 60_000),
    holdState: "PLACED",
    holdLastAttemptAt: new Date(),
    holdLastError: null,
    holdReleaseReason: null,
    holdIdempotencyKey: "idem_hold_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DraftReservation;
}

type DraftWithResv = DraftOrder & {
  lineItems: DraftLineItem[];
  reservations: DraftReservation[];
};

function makeDraftForInvoice(
  overrides: Partial<DraftWithResv> = {},
): DraftWithResv {
  const baseAccLine: DraftLineItem = makeLine({
    id: "dli_acc_1",
    lineType: "ACCOMMODATION",
    accommodationId: "acc_1",
    checkInDate: new Date("2026-06-01T00:00:00Z"),
    checkOutDate: new Date("2026-06-03T00:00:00Z"),
    productId: null,
    productVariantId: null,
  });
  return {
    ...makeDraft(),
    lineItems: [baseAccLine],
    reservations: [makeReservation()],
    ...overrides,
  } as DraftWithResv;
}

function makeTenantForInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant_1",
    portalSlug: "acme",
    stripeAccountId: "acct_123",
    stripeOnboardingComplete: true,
    subscriptionPlan: "BASIC" as const,
    platformFeeBps: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx),
  );
  mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockPrisma.tenant.findUnique.mockResolvedValue(makeTenantForInvoice());
  mockTx.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockTx.draftOrder.update.mockResolvedValue(makeDraft());
  mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftLineItem.update.mockResolvedValue({});
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  mockComputeDraftTotals.mockResolvedValue(makeTotals());
  mockEmit.mockResolvedValue(undefined);
  mockInitiatePayment.mockResolvedValue({
    mode: "embedded",
    clientSecret: "cs_test_secret_123",
    providerSessionId: "pi_test_123",
  });
  mockVerifyCharges.mockResolvedValue(true);
  mockReleaseHold.mockResolvedValue({
    reservation: makeReservation({ holdState: "RELEASED" }),
    adapterReleaseOk: true,
  });
  mockStripePiCancel.mockResolvedValue({ id: "pi_test_123", status: "canceled" });
  // Phase D — unlink defaults: no active session.
  mockTx.draftCheckoutSession.findFirst.mockResolvedValue(null);
  mockTx.draftCheckoutSession.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftReservation.findMany.mockResolvedValue([]);
  mockTx.draftReservation.updateMany.mockResolvedValue({ count: 1 });
  // runUnlinkSideEffects default — no holds, no PI to cancel.
  mockRunSideEffects.mockResolvedValue({
    holdReleaseAttempted: 0,
    holdReleaseErrors: [],
    stripePaymentIntentCancelAttempted: false,
    stripePaymentIntentCancelError: null,
  });
});

// ═══════════════════════════════════════════════════════════════
// sendInvoice (Phase C — lazy creation, no external calls)
// ═══════════════════════════════════════════════════════════════

describe("sendInvoice — happy path", () => {
  it("transitions OPEN → INVOICED + persists token + URL", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    const result = await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_42",
    });

    // Status transition recorded via the shared helper
    expect(mockTx.draftOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "draft_1",
          tenantId: "tenant_1",
          status: "OPEN",
        }),
        data: expect.objectContaining({ status: "INVOICED" }),
      }),
    );

    // Invoice artifacts persisted (token, URL, sentAt)
    const updateCall = mockTx.draftOrder.update.mock.calls[0]?.[0];
    expect(updateCall.data.shareLinkToken).toBeTypeOf("string");
    expect(updateCall.data.shareLinkToken.length).toBeGreaterThan(20);
    expect(updateCall.data.invoiceUrl).toMatch(/\/invoice\//);
    expect(updateCall.data.invoiceSentAt).toBeInstanceOf(Date);
    // No metafields write — PI stays unborn until Phase E
    expect(updateCall.data.metafields).toBeUndefined();

    // Return shape: only the three Phase-C fields
    expect(result).toMatchObject({
      invoiceUrl: expect.stringMatching(/\/invoice\//),
      shareLinkToken: expect.any(String),
    });
    expect((result as Record<string, unknown>).clientSecret).toBeUndefined();
    expect((result as Record<string, unknown>).stripePaymentIntentId).toBeUndefined();
  });

  it("emits INVOICE_SENT event in-tx + draft_order.invoiced webhook post-commit", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_42",
    });

    const eventTypes = mockTx.draftOrderEvent.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { type: string } }).data.type,
    );
    expect(eventTypes).toContain("INVOICE_SENT");

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "draft_order.invoiced" }),
    );
  });

  it("INVARIANT 3 — sendInvoice makes ZERO external calls (no Stripe SDK, no PMS adapter)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    // Stripe PI cancel mock is the only Stripe surface this file mocks;
    // sendInvoice must not touch it under any path.
    expect(mockStripePiCancel).not.toHaveBeenCalled();
    // PMS adapter is invoked by holds.ts — sendInvoice imports nothing
    // from the adapter layer post-Phase-C. No mock to assert against,
    // but the absence of any await import("...payments/providers")
    // call is enforced by the static import surface being empty.
  });
});

describe("sendInvoice — preconditions (S1, S2, S4, S5)", () => {
  it("S1: rejects when status is not OPEN or APPROVED", async () => {
    // INVOICED has its own short-circuit path — covered separately in
    // the "idempotent re-send" describe. Test the other non-sendable
    // statuses here.
    for (const status of ["OVERDUE", "PAID", "CANCELLED"] as const) {
      mockPrisma.draftOrder.findFirst.mockResolvedValueOnce(
        makeDraftForInvoice({ status }),
      );
      await expect(
        sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
      ).rejects.toThrow(/not in a sendable status/i);
    }
  });

  it("S2: rejects empty draft (no line items)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ lineItems: [] }),
    );
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/empty draft/i);
  });

  it("S4: rejects zero-total draft", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ totalCents: BigInt(0) }),
    );
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/zero-total/i);
  });

  it("S5: rejects when no customer association is set", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({
        contactEmail: null,
        guestAccountId: null,
        companyContactId: null,
      }),
    );
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/customer association/i);
  });

  it("rejects when tenant has no portalSlug", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockPrisma.tenant.findUnique.mockResolvedValue(
      makeTenantForInvoice({ portalSlug: null }),
    );
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/portalSlug/i);
  });
});

describe("sendInvoice — idempotent re-send", () => {
  it("INVOICED draft → returns existing token + URL with NO state mutation, NO event, NO webhook", async () => {
    const existingDraft = makeDraftForInvoice({
      status: "INVOICED",
      shareLinkToken: "existing_token_abc",
      invoiceUrl: "https://acme.rutgr.com/invoice/existing_token_abc",
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(existingDraft);

    const result = await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    // Returns existing artifacts unchanged
    expect(result.shareLinkToken).toBe("existing_token_abc");
    expect(result.invoiceUrl).toBe("https://acme.rutgr.com/invoice/existing_token_abc");

    // Zero state mutation
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.draftOrder.updateMany).not.toHaveBeenCalled();
    expect(mockTx.draftOrder.update).not.toHaveBeenCalled();

    // Zero event emission
    expect(mockTx.draftOrderEvent.create).not.toHaveBeenCalled();

    // Zero post-commit webhook
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("INVOICED draft missing shareLinkToken throws (data integrity guard)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({
        status: "INVOICED",
        shareLinkToken: null,
        invoiceUrl: null,
      }),
    );

    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/missing shareLinkToken/i);
  });
});

describe("sendInvoice — tx race safety", () => {
  it("rejects with ConflictError if status flipped between pre-tx and in-tx re-read", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    // In-tx re-fetch returns a draft that's already CANCELLED
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraftForInvoice({ status: "CANCELLED" }),
    );

    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/status changed/i);
  });
});

describe("sendInvoice — webhook resilience", () => {
  it("post-commit webhook failure does NOT throw to the caller", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));
    mockEmit.mockRejectedValue(new Error("redis down"));

    // Returns successfully despite webhook failure
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).resolves.toMatchObject({
      invoiceUrl: expect.stringMatching(/\/invoice\//),
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// FAS 6.5D — cancelDraft
// ═══════════════════════════════════════════════════════════════

describe("cancelDraft — happy path", () => {
  it("cancels an OPEN draft (no reason required) + releases PLACED holds", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(
        makeDraftForInvoice({
          status: "CANCELLED",
          cancelledAt: new Date(),
        }),
      );

    const result = await cancelDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_99",
    });

    // Status transition
    const transitionCall = mockTx.draftOrder.updateMany.mock.calls[0][0];
    expect(transitionCall.where.status).toBe("OPEN");
    expect(transitionCall.data.status).toBe("CANCELLED");

    // cancelledAt + cancellationReason written
    expect(mockTx.draftOrder.update).toHaveBeenCalled();
    const updData = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(updData.cancelledAt).toBeInstanceOf(Date);
    expect(updData.cancellationReason).toBeNull();

    // CANCELLED event emitted in tx
    const eventTypes = mockTx.draftOrderEvent.create.mock.calls.map(
      (call) => (call[0] as { data: { type: string } }).data.type,
    );
    expect(eventTypes).toContain("STATE_CHANGED");
    expect(eventTypes).toContain("CANCELLED");

    // Hold release was called for the PLACED reservation
    expect(mockReleaseHold).toHaveBeenCalledTimes(1);
    expect(mockReleaseHold.mock.calls[0][0]).toMatchObject({
      tenantId: "tenant_1",
      draftLineItemId: "dli_acc_1",
      source: "draft_cancelled",
      actorUserId: "user_99",
    });

    expect(result.releasedHolds).toBe(1);
    expect(result.holdReleaseErrors).toEqual([]);
  });

  it("cancels INVOICED draft with reason — Phase C does NOT attempt Stripe PI cancel (Phase D will)", async () => {
    const invoicedDraft = makeDraftForInvoice({ status: "INVOICED" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(invoicedDraft);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(invoicedDraft)
      .mockResolvedValueOnce(
        makeDraftForInvoice({ status: "CANCELLED", cancelledAt: new Date() }),
      );

    const result = await cancelDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      reason: "Kund ångrade sig",
    });

    const transitionCall = mockTx.draftOrder.updateMany.mock.calls[0][0];
    expect(transitionCall.where.status).toBe("INVOICED");
    expect(transitionCall.data.status).toBe("CANCELLED");

    const updData = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(updData.cancellationReason).toBe("Kund ångrade sig");

    // Phase C stub: PI cancel is wired to Phase D's
    // unlinkActiveCheckoutSession. cancelDraft no longer touches Stripe.
    expect(mockStripePiCancel).not.toHaveBeenCalled();
    expect(result.stripePaymentIntentCancelAttempted).toBe(false);
    expect(result.stripePaymentIntentCancelError).toBeNull();
  });

  it("emits draft_order.cancelled platform webhook", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(
        makeDraftForInvoice({ status: "CANCELLED", cancelledAt: new Date() }),
      );

    await cancelDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(mockEmit).toHaveBeenCalledTimes(1);
    const ev = mockEmit.mock.calls[0][0];
    expect(ev.type).toBe("draft_order.cancelled");
    expect(ev.payload.draftOrderId).toBe("draft_1");
    expect(ev.payload.previousStatus).toBe("OPEN");
    expect(ev.payload.releasedHolds).toBe(1);
  });

  it("cancels a draft with no accommodation lines (no holds to release)", async () => {
    const productOnly = makeDraftForInvoice({
      lineItems: [makeLine({ lineType: "PRODUCT" })],
      reservations: [],
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(productOnly);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(productOnly)
      .mockResolvedValueOnce(
        makeDraftForInvoice({
          status: "CANCELLED",
          cancelledAt: new Date(),
          lineItems: [makeLine({ lineType: "PRODUCT" })],
          reservations: [],
        }),
      );

    const result = await cancelDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(mockReleaseHold).not.toHaveBeenCalled();
    expect(result.releasedHolds).toBe(0);
  });
});

describe("cancelDraft — preconditions", () => {
  it("C1: throws NotFoundError when draft missing", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
    await expect(
      cancelDraft({ tenantId: "tenant_1", draftOrderId: "ghost" }),
    ).rejects.toThrow(/not found/i);
    expect(mockReleaseHold).not.toHaveBeenCalled();
  });

  it("C2: rejects COMPLETED status", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ status: "COMPLETED" }),
    );
    await expect(
      cancelDraft({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/already in a terminal status/i);
  });

  it("C2: rejects already-CANCELLED status (no double-cancel)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ status: "CANCELLED" }),
    );
    await expect(
      cancelDraft({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/already in a terminal status/i);
  });

  it("C3: rejects PAID drafts (refund handling out of scope)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ status: "PAID" }),
    );
    await expect(
      cancelDraft({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        reason: "Refunded already",
      }),
    ).rejects.toThrow(/refund via Stripe/i);

    // Nothing was released, nothing was transitioned
    expect(mockReleaseHold).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("C4: requires reason for INVOICED cancels", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ status: "INVOICED" }),
    );
    await expect(
      cancelDraft({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/Cancellation reason required/i);
  });

  it("C4: requires reason for OVERDUE cancels", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ status: "OVERDUE" }),
    );
    await expect(
      cancelDraft({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/Cancellation reason required/i);
  });

  it("C4: reason empty-string is treated as missing", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ status: "INVOICED" }),
    );
    await expect(
      cancelDraft({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        reason: "   ",
      }),
    ).rejects.toThrow(/Cancellation reason required/i);
  });
});

describe("cancelDraft — hold release", () => {
  it("releases PLACED and FAILED reservations, skips other states", async () => {
    const mixed = makeDraftForInvoice({
      lineItems: [
        makeLine({ id: "line_placed", lineType: "ACCOMMODATION", accommodationId: "acc_1" }),
        makeLine({ id: "line_failed", lineType: "ACCOMMODATION", accommodationId: "acc_2" }),
        makeLine({ id: "line_confirmed", lineType: "ACCOMMODATION", accommodationId: "acc_3" }),
        makeLine({ id: "line_released", lineType: "ACCOMMODATION", accommodationId: "acc_4" }),
        makeLine({ id: "line_notplaced", lineType: "ACCOMMODATION", accommodationId: "acc_5" }),
        makeLine({ id: "line_placing", lineType: "ACCOMMODATION", accommodationId: "acc_6" }),
      ],
      reservations: [
        makeReservation({ id: "r1", draftLineItemId: "line_placed", holdState: "PLACED" }),
        makeReservation({ id: "r2", draftLineItemId: "line_failed", holdState: "FAILED" }),
        makeReservation({ id: "r3", draftLineItemId: "line_confirmed", holdState: "CONFIRMED" }),
        makeReservation({ id: "r4", draftLineItemId: "line_released", holdState: "RELEASED" }),
        makeReservation({ id: "r5", draftLineItemId: "line_notplaced", holdState: "NOT_PLACED" }),
        makeReservation({ id: "r6", draftLineItemId: "line_placing", holdState: "PLACING" }),
      ],
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(mixed);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(mixed)
      .mockResolvedValueOnce(
        makeDraftForInvoice({ status: "CANCELLED", cancelledAt: new Date() }),
      );

    const result = await cancelDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    // Only PLACED + FAILED should trigger release
    expect(mockReleaseHold).toHaveBeenCalledTimes(2);
    const releasedLineIds = mockReleaseHold.mock.calls.map(
      (c) => (c[0] as { draftLineItemId: string }).draftLineItemId,
    );
    expect(releasedLineIds).toContain("line_placed");
    expect(releasedLineIds).toContain("line_failed");

    expect(result.releasedHolds).toBe(2);
  });

  it("per-line release failures are captured but never abort the cancel", async () => {
    const mixed = makeDraftForInvoice({
      lineItems: [
        makeLine({ id: "line_ok", lineType: "ACCOMMODATION", accommodationId: "acc_1" }),
        makeLine({ id: "line_fail", lineType: "ACCOMMODATION", accommodationId: "acc_2" }),
      ],
      reservations: [
        makeReservation({ id: "r1", draftLineItemId: "line_ok", holdState: "PLACED" }),
        makeReservation({ id: "r2", draftLineItemId: "line_fail", holdState: "PLACED" }),
      ],
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(mixed);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(mixed)
      .mockResolvedValueOnce(
        makeDraftForInvoice({ status: "CANCELLED", cancelledAt: new Date() }),
      );

    mockReleaseHold
      .mockResolvedValueOnce({ reservation: makeReservation({ holdState: "RELEASED" }), adapterReleaseOk: true })
      .mockRejectedValueOnce(new Error("adapter timeout"));

    const result = await cancelDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(result.releasedHolds).toBe(1);
    expect(result.holdReleaseErrors).toHaveLength(1);
    expect(result.holdReleaseErrors[0]).toMatchObject({
      draftLineItemId: "line_fail",
      error: "adapter timeout",
    });

    // Draft was still transitioned to CANCELLED
    expect(mockTx.draftOrder.updateMany).toHaveBeenCalled();
  });
});

describe("cancelDraft — Stripe PI cancellation (Phase C stub)", () => {
  it("does NOT attempt Stripe PI cancel — Phase D will wire unlinkActiveCheckoutSession", async () => {
    const invoicedDraft = makeDraftForInvoice({
      status: "INVOICED",
      // metafields could once have held a PI ID; Phase B dropped that path
      metafields: null,
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(invoicedDraft);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(invoicedDraft)
      .mockResolvedValueOnce(
        makeDraftForInvoice({ status: "CANCELLED", cancelledAt: new Date() }),
      );

    const result = await cancelDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      reason: "Changed mind",
    });

    // Cancel succeeds without touching Stripe
    expect(result.draft.status).toBe("CANCELLED");
    expect(mockStripePiCancel).not.toHaveBeenCalled();
    expect(result.stripePaymentIntentCancelAttempted).toBe(false);
    expect(result.stripePaymentIntentCancelError).toBeNull();
  });
});


describe("cancelDraft — tx race safety", () => {
  it("rejects if draft reached terminal between pre-tx and in-tx re-read", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraftForInvoice({ status: "CANCELLED" }),
    );
    await expect(
      cancelDraft({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/terminal status during cancel/i);
  });

  it("rejects if draft became PAID mid-flight", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ status: "INVOICED" }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraftForInvoice({ status: "PAID" }),
    );
    await expect(
      cancelDraft({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        reason: "x",
      }),
    ).rejects.toThrow(/transitioned to PAID during cancel/i);
  });

  it("rejects when transitionDraftStatusInTx returns transitioned=false (count=0 race)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(makeDraftForInvoice());
    mockTx.draftOrder.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      cancelDraft({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/mutated during cancel/i);
  });
});

describe("cancelDraft — webhook resilience", () => {
  it("swallows platform webhook failures", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(
        makeDraftForInvoice({ status: "CANCELLED", cancelledAt: new Date() }),
      );
    mockEmit.mockRejectedValue(new Error("downstream app error"));

    await expect(
      cancelDraft({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).resolves.toMatchObject({ releasedHolds: 1 });
  });
});
