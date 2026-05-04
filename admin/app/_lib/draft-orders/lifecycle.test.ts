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
  draftOrderEvent: { create: vi.fn() },
  // Tax-2 B.4: persistTaxLinesForDraft writes inside the freezePrices tx.
  taxLine: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
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

const mockStripePiCancel = vi.fn();
vi.mock("@/app/_lib/stripe/client", () => ({
  getStripe: () => ({
    paymentIntents: { cancel: mockStripePiCancel },
  }),
}));

const { freezePrices, sendInvoice, cancelDraft } = await import("./lifecycle");

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
    pricesFrozenAt: null,
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
    ...makeDraft({ pricesFrozenAt: new Date("2026-04-23T12:00:00Z") }),
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
});

// ═══════════════════════════════════════════════════════════════
// Happy path
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — happy path", () => {
  it("writes totals + pricesFrozenAt + version+1 in a single DraftOrder.update", async () => {
    const before = Date.now();
    const result = await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_1",
    });
    const after = Date.now();

    expect(mockTx.draftOrder.update).toHaveBeenCalledTimes(1);
    const data = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(data.subtotalCents).toBe(BigInt(10_000));
    expect(data.orderDiscountCents).toBe(BigInt(0));
    expect(data.totalTaxCents).toBe(BigInt(0));
    expect(data.totalCents).toBe(BigInt(10_000));
    expect(data.version).toEqual({ increment: 1 });
    expect(data.pricesFrozenAt).toBeInstanceOf(Date);
    const ts = (data.pricesFrozenAt as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);

    expect(result.frozenAt).toBeInstanceOf(Date);
    expect(result.totals.source).toBe("FROZEN_SNAPSHOT");
    expect(result.totals.frozenAt).toEqual(data.pricesFrozenAt);
  });

  it("writes per-line taxAmountCents + totalCents via draftLineItem.update", async () => {
    await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(mockTx.draftLineItem.update).toHaveBeenCalledTimes(1);
    const lineData = mockTx.draftLineItem.update.mock.calls[0][0].data;
    expect(lineData.taxAmountCents).toBe(BigInt(0));
    expect(lineData.totalCents).toBe(BigInt(10_000));
  });

  it("emits PRICES_FROZEN event inside tx with snapshot metadata", async () => {
    await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_42",
    });

    expect(mockTx.draftOrderEvent.create).toHaveBeenCalledTimes(1);
    const evData = mockTx.draftOrderEvent.create.mock.calls[0][0].data;
    expect(evData.type).toBe("PRICES_FROZEN");
    expect(evData.actorUserId).toBe("user_42");
    expect(evData.actorSource).toBe("admin_ui");
    expect(evData.metadata.frozenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(evData.metadata.snapshot).toEqual({
      subtotalCents: "10000",
      orderDiscountCents: "0",
      totalTaxCents: "0",
      totalCents: "10000",
    });
  });

  it("emits draft_order.updated platform webhook with changeType=prices_frozen", async () => {
    await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(mockEmit).toHaveBeenCalledTimes(1);
    const call = mockEmit.mock.calls[0][0];
    expect(call.type).toBe("draft_order.updated");
    expect(call.payload.changeType).toBe("prices_frozen");
    expect(call.payload.frozenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(call.payload.totalCents).toBe("10000");
  });

  it("uses the injected tx for calculator reads (not global prisma)", async () => {
    await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    // computeDraftTotals called with 4 args including tx
    expect(mockComputeDraftTotals).toHaveBeenCalledTimes(1);
    const args = mockComputeDraftTotals.mock.calls[0];
    expect(args[0]).toBe("tenant_1"); // tenantId
    expect(args[1]).toBe("draft_1"); // draftOrderId
    expect(args[3]).toBe(mockTx); // tx
  });
});

// ═══════════════════════════════════════════════════════════════
// Idempotency — operator decision: throw, not silent no-op
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — idempotency (ALREADY_FROZEN)", () => {
  it("throws ValidationError when draft is already frozen", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ pricesFrozenAt: new Date() }),
    );

    await expect(
      freezePrices({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
      }),
    ).rejects.toThrow(/already frozen/i);

    // Tx not opened on early rejection
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Empty draft
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — empty draft allowed", () => {
  it("freezes an empty draft (all totals 0n)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ lineItems: [] }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ lineItems: [] }),
    );
    mockComputeDraftTotals.mockResolvedValue(
      makeTotals({
        subtotalCents: BigInt(0),
        totalCents: BigInt(0),
        perLine: [],
      }),
    );

    const result = await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    const data = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(data.subtotalCents).toBe(BigInt(0));
    expect(data.totalCents).toBe(BigInt(0));
    expect(data.pricesFrozenAt).toBeInstanceOf(Date);

    // No per-line updates when there are no lines.
    expect(mockTx.draftLineItem.update).not.toHaveBeenCalled();

    expect(result.totals.totalCents).toBe(BigInt(0));
  });
});

// ═══════════════════════════════════════════════════════════════
// Mutability guards
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — mutability guards", () => {
  it("rejects when draft not found in tenant", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
    await expect(
      freezePrices({
        tenantId: "tenant_1",
        draftOrderId: "ghost",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects non-OPEN statuses (6.5B scope — 6.5D will add APPROVED)", async () => {
    for (const status of [
      "INVOICED",
      "PAID",
      "OVERDUE",
      "COMPLETED",
      "CANCELLED",
      "PENDING_APPROVAL",
      "APPROVED",
      "REJECTED",
    ] as const) {
      mockPrisma.draftOrder.findFirst.mockResolvedValue(
        makeDraft({ status }),
      );
      await expect(
        freezePrices({
          tenantId: "tenant_1",
          draftOrderId: "draft_1",
        }),
      ).rejects.toThrow(/freezable status/i);
    }
  });

  it("rejects Zod-invalid input (missing tenantId)", async () => {
    await expect(
      freezePrices({
        tenantId: "",
        draftOrderId: "draft_1",
      } as never),
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Platform webhook resilience
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — webhook fire-and-forget", () => {
  it("swallows webhook failures (does not throw)", async () => {
    mockEmit.mockRejectedValueOnce(new Error("app down"));
    await expect(
      freezePrices({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
      }),
    ).resolves.toMatchObject({ frozenAt: expect.any(Date) });
  });
});

// ═══════════════════════════════════════════════════════════════
// Race safety — second freeze attempt inside tx
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — tx-internal re-validation", () => {
  it("rejects when draft was frozen by a concurrent request between pre-tx and tx", async () => {
    // Pre-tx read: not frozen
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ pricesFrozenAt: null }),
    );
    // Tx-internal re-read: frozen (race)
    mockTx.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ pricesFrozenAt: new Date() }),
    );

    await expect(
      freezePrices({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
      }),
    ).rejects.toThrow(/already frozen/i);

    // Calculator NOT called (rejected in pre-write check)
    expect(mockComputeDraftTotals).not.toHaveBeenCalled();
    // No webhook
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// FAS 6.5D — sendInvoice
// ═══════════════════════════════════════════════════════════════

describe("sendInvoice — happy path", () => {
  it("creates PI + transitions OPEN → INVOICED + persists invoice artifacts", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    const result = await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_42",
    });

    expect(mockInitiatePayment).toHaveBeenCalledTimes(1);
    expect(mockInitiatePayment.mock.calls[0][0].metadata).toMatchObject({
      draftOrderId: "draft_1",
      kind: "draft_order_invoice",
      draftDisplayNumber: "D-2026-1001",
    });
    expect(result.stripePaymentIntentId).toBe("pi_test_123");
    expect(result.clientSecret).toBe("cs_test_secret_123");
    expect(result.invoiceUrl).toMatch(/^https:\/\/acme\.rutgr\.com\/invoice\//);
    expect(result.shareLinkToken).toHaveLength(32);
    expect(result.shareLinkExpiresAt).toBeInstanceOf(Date);

    // Tx work: updateMany for status transition + update for invoice fields
    expect(mockTx.draftOrder.updateMany).toHaveBeenCalled();
    const transitionCall = mockTx.draftOrder.updateMany.mock.calls[0][0];
    expect(transitionCall.where.status).toBe("OPEN");
    expect(transitionCall.data.status).toBe("INVOICED");

    expect(mockTx.draftOrder.update).toHaveBeenCalledTimes(1);
    const updateData = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(updateData.invoiceUrl).toBe(result.invoiceUrl);
    expect(updateData.shareLinkToken).toBe(result.shareLinkToken);
    expect(updateData.invoiceSentAt).toBeInstanceOf(Date);
    expect(updateData.metafields).toMatchObject({
      stripePaymentIntentId: "pi_test_123",
    });
  });

  it("threads actorSource: 'admin_ui_bulk' into STATE_CHANGED + INVOICE_SENT events", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorSource: "admin_ui_bulk",
    });

    const events = mockTx.draftOrderEvent.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { type: string; actorSource: string } }).data,
    );
    const stateChanged = events.find((e) => e.type === "STATE_CHANGED");
    const invoiceSent = events.find((e) => e.type === "INVOICE_SENT");
    expect(stateChanged?.actorSource).toBe("admin_ui_bulk");
    expect(invoiceSent?.actorSource).toBe("admin_ui_bulk");
  });

  it("defaults actorSource to 'admin_ui' when not provided", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    await sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" });

    const events = mockTx.draftOrderEvent.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { type: string; actorSource: string } }).data,
    );
    const invoiceSent = events.find((e) => e.type === "INVOICE_SENT");
    expect(invoiceSent?.actorSource).toBe("admin_ui");
  });

  it("emits INVOICE_SENT event + draft_order.invoiced platform webhook", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    // STATE_CHANGED + INVOICE_SENT events inside tx
    const eventTypes = mockTx.draftOrderEvent.create.mock.calls.map(
      (call) => (call[0] as { data: { type: string } }).data.type,
    );
    expect(eventTypes).toContain("STATE_CHANGED");
    expect(eventTypes).toContain("INVOICE_SENT");

    // Platform webhook
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const ev = mockEmit.mock.calls[0][0];
    expect(ev.type).toBe("draft_order.invoiced");
    expect(ev.payload.draftOrderId).toBe("draft_1");
    expect(ev.payload.stripePaymentIntentId).toBe("pi_test_123");
    expect(ev.payload.invoiceUrl).toMatch(/^https:\/\/acme\.rutgr\.com\/invoice\//);
  });

  it("accepts APPROVED status (future-compatible with approval workflow)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ status: "APPROVED" }),
    );
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "APPROVED" }))
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).resolves.toMatchObject({ stripePaymentIntentId: "pi_test_123" });

    const transitionCall = mockTx.draftOrder.updateMany.mock.calls[0][0];
    expect(transitionCall.where.status).toBe("APPROVED");
    expect(transitionCall.data.status).toBe("INVOICED");
  });

  it("clamps share-link TTL to [1d, 90d]", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    const tooShort = await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      shareLinkTtlMs: 1_000, // 1 second
    });
    // Clamped up to 1 day
    const delta1 =
      tooShort.shareLinkExpiresAt.getTime() - Date.now();
    expect(delta1).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 5_000);
    expect(delta1).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5_000);

    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    const tooLong = await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      shareLinkTtlMs: 365 * 24 * 60 * 60 * 1000, // 1 year
    });
    const delta2 =
      tooLong.shareLinkExpiresAt.getTime() - Date.now();
    // Clamped down to 90 days
    expect(delta2).toBeLessThanOrEqual(90 * 24 * 60 * 60 * 1000 + 5_000);
    expect(delta2).toBeGreaterThanOrEqual(90 * 24 * 60 * 60 * 1000 - 5_000);
  });

  it("stores invoiceEmailSubject + invoiceEmailMessage when provided", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      invoiceEmailSubject: "Faktura för din bokning",
      invoiceEmailMessage: "Hej! Här kommer din faktura.",
    });
    const data = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(data.invoiceEmailSubject).toBe("Faktura för din bokning");
    expect(data.invoiceEmailMessage).toBe("Hej! Här kommer din faktura.");
  });

  it("preserves existing metafields when writing PaymentIntent ID", async () => {
    const draftWithExistingMeta = makeDraftForInvoice({
      metafields: { customField: "existing_value" } as DraftOrder["metafields"],
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draftWithExistingMeta);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(draftWithExistingMeta)
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    await sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" });

    const merged = mockTx.draftOrder.update.mock.calls[0][0].data.metafields;
    expect(merged).toMatchObject({
      customField: "existing_value",
      stripePaymentIntentId: "pi_test_123",
    });
  });
});

describe("sendInvoice — preconditions", () => {
  it("S1: throws NotFoundError when draft missing in tenant", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "ghost" }),
    ).rejects.toThrow(/not found/i);
    expect(mockInitiatePayment).not.toHaveBeenCalled();
  });

  it("S2: rejects non-sendable statuses", async () => {
    for (const status of [
      "PENDING_APPROVAL",
      "REJECTED",
      "PAID",
      "OVERDUE",
      "COMPLETING",
      "COMPLETED",
      "CANCELLED",
    ] as const) {
      mockPrisma.draftOrder.findFirst.mockResolvedValue(
        makeDraftForInvoice({ status }),
      );
      await expect(
        sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
      ).rejects.toThrow(/sendable status/i);
    }
    expect(mockInitiatePayment).not.toHaveBeenCalled();
  });

  it("S3: rejects unfrozen draft", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ pricesFrozenAt: null }),
    );
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/prices must be frozen/i);
  });

  it("S4: rejects empty draft", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ lineItems: [], reservations: [] }),
    );
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/empty draft/i);
  });

  it("S5: rejects when any ACCOMMODATION hold is not PLACED", async () => {
    for (const holdState of [
      "NOT_PLACED",
      "PLACING",
      "FAILED",
      "RELEASED",
      "CONFIRMED",
    ] as const) {
      mockPrisma.draftOrder.findFirst.mockResolvedValue(
        makeDraftForInvoice({
          reservations: [makeReservation({ holdState })],
        }),
      );
      await expect(
        sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
      ).rejects.toThrow(/holds must be PLACED/i);
    }
  });

  it("S5: rejects when ACCOMMODATION line has no DraftReservation", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ reservations: [] }),
    );
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/missing its DraftReservation/i);
  });

  it("S5: allows draft with only PRODUCT / CUSTOM lines (no reservations required)", async () => {
    const productOnlyDraft = makeDraftForInvoice({
      lineItems: [makeLine({ lineType: "PRODUCT" })],
      reservations: [],
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(productOnlyDraft);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(productOnlyDraft)
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).resolves.toMatchObject({ stripePaymentIntentId: "pi_test_123" });
  });

  it("S6: rejects draft with totalCents === 0n", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraftForInvoice({ totalCents: BigInt(0) }),
    );
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/zero-total draft/i);
  });

  it("S7: rejects tenant without Stripe Connect account", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(
      makeTenantForInvoice({ stripeAccountId: null }),
    );
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/Stripe Connect account/i);
  });

  it("S7: rejects tenant with incomplete Stripe onboarding", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(
      makeTenantForInvoice({ stripeOnboardingComplete: false }),
    );
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/onboarding is not complete/i);
  });

  it("S7: rejects tenant without portalSlug", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(
      makeTenantForInvoice({ portalSlug: null }),
    );
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/portalSlug/);
  });

  it("S7: rejects when Stripe charges disabled", async () => {
    mockVerifyCharges.mockResolvedValue(false);
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/cannot accept charges/i);
  });
});

describe("sendInvoice — adapter contract", () => {
  it("throws when adapter returns non-embedded mode", async () => {
    mockInitiatePayment.mockResolvedValue({
      mode: "redirect",
      redirectUrl: "https://pay.example",
      providerSessionId: "pi_test_123",
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/non-embedded mode/i);
  });

  it("throws when adapter omits providerSessionId (Q4 contract)", async () => {
    mockInitiatePayment.mockResolvedValue({
      mode: "embedded",
      clientSecret: "cs_test_secret_123",
      // providerSessionId: undefined — simulate legacy adapter
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/did not return providerSessionId/i);
  });
});

describe("sendInvoice — tx race safety", () => {
  it("rejects if status changes between pre-tx and in-tx re-read", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    // In-tx re-read sees status was flipped by another request
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraftForInvoice({ status: "CANCELLED" }),
    );
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/status changed/i);
  });

  it("rejects if pricesFrozenAt cleared between pre-tx and in-tx re-read", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraftForInvoice({ pricesFrozenAt: null }),
    );
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/no longer frozen/i);
  });

  it("rejects when transitionDraftStatusInTx returns transitioned=false (count=0 race)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(makeDraftForInvoice());
    // updateMany sees status already changed by a concurrent mutation
    mockTx.draftOrder.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/mutated during send/i);
  });
});

describe("sendInvoice — idempotent replay", () => {
  it("re-sending an already-INVOICED draft returns the existing invoice artifacts + fresh clientSecret", async () => {
    const sentDraft = makeDraftForInvoice({
      status: "INVOICED",
      shareLinkToken: "existing_token",
      shareLinkExpiresAt: new Date("2026-07-01T00:00:00Z"),
      invoiceUrl: "https://acme.rutgr.com/invoice/existing_token",
      invoiceSentAt: new Date("2026-04-20T10:00:00Z"),
      metafields: {
        stripePaymentIntentId: "pi_existing_123",
      } as DraftOrder["metafields"],
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(sentDraft);

    const result = await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    // Should not open a transaction (no state change)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    // Should not emit any webhook
    expect(mockEmit).not.toHaveBeenCalled();
    // Should not write any event
    expect(mockTx.draftOrderEvent.create).not.toHaveBeenCalled();

    // Adapter IS called (to get fresh clientSecret for the admin UI)
    expect(mockInitiatePayment).toHaveBeenCalledTimes(1);

    // Returns the existing invoice artifacts
    expect(result.shareLinkToken).toBe("existing_token");
    expect(result.invoiceUrl).toBe("https://acme.rutgr.com/invoice/existing_token");
    expect(result.stripePaymentIntentId).toBe("pi_existing_123");
    expect(result.clientSecret).toBe("cs_test_secret_123");
  });

  it("refuses idempotent replay if PaymentIntent stored but invoiceUrl missing (inconsistent state)", async () => {
    const sentDraft = makeDraftForInvoice({
      status: "INVOICED",
      shareLinkToken: null, // inconsistent
      shareLinkExpiresAt: null,
      invoiceUrl: null,
      metafields: {
        stripePaymentIntentId: "pi_existing_123",
      } as DraftOrder["metafields"],
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(sentDraft);

    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toThrow(/manual recovery/i);
  });

  it("does NOT treat an OPEN draft with stored metafields.stripePaymentIntentId as idempotent replay", async () => {
    // Edge case: someone manually wrote metafields, but status still OPEN.
    // We should flow the normal path, not the idempotent replay.
    const draftWithStaleMeta = makeDraftForInvoice({
      status: "OPEN",
      metafields: { stripePaymentIntentId: "pi_stale_999" } as DraftOrder["metafields"],
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draftWithStaleMeta);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(draftWithStaleMeta)
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));

    const result = await sendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    // Fresh PI created, fresh invoice URL
    expect(result.stripePaymentIntentId).toBe("pi_test_123");
    // Transaction was opened (normal flow)
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});

describe("sendInvoice — webhook resilience", () => {
  it("swallows platform webhook failures", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(makeDraftForInvoice({ status: "INVOICED" }));
    mockEmit.mockRejectedValue(new Error("downstream app error"));

    await expect(
      sendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).resolves.toMatchObject({ stripePaymentIntentId: "pi_test_123" });
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

  it("cancels INVOICED draft with reason + attempts Stripe PI cancel", async () => {
    const invoicedDraft = makeDraftForInvoice({
      status: "INVOICED",
      metafields: {
        stripePaymentIntentId: "pi_existing_123",
      } as DraftOrder["metafields"],
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
      reason: "Kund ångrade sig",
    });

    const transitionCall = mockTx.draftOrder.updateMany.mock.calls[0][0];
    expect(transitionCall.where.status).toBe("INVOICED");
    expect(transitionCall.data.status).toBe("CANCELLED");

    const updData = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(updData.cancellationReason).toBe("Kund ångrade sig");

    // Stripe PI cancel was attempted
    expect(mockStripePiCancel).toHaveBeenCalledTimes(1);
    expect(mockStripePiCancel.mock.calls[0][0]).toBe("pi_existing_123");
    expect(result.stripePaymentIntentCancelAttempted).toBe(true);
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

describe("cancelDraft — Stripe PI cancellation", () => {
  it("skips PI cancel when no stripePaymentIntentId stored", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraftForInvoice());
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraftForInvoice())
      .mockResolvedValueOnce(
        makeDraftForInvoice({ status: "CANCELLED", cancelledAt: new Date() }),
      );

    const result = await cancelDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(mockStripePiCancel).not.toHaveBeenCalled();
    expect(result.stripePaymentIntentCancelAttempted).toBe(false);
    expect(result.stripePaymentIntentCancelError).toBeNull();
  });

  it("captures PI cancel error without throwing", async () => {
    const invoicedDraft = makeDraftForInvoice({
      status: "INVOICED",
      metafields: {
        stripePaymentIntentId: "pi_abc",
      } as DraftOrder["metafields"],
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(invoicedDraft);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(invoicedDraft)
      .mockResolvedValueOnce(
        makeDraftForInvoice({ status: "CANCELLED", cancelledAt: new Date() }),
      );
    mockStripePiCancel.mockRejectedValue(new Error("pi already succeeded"));

    const result = await cancelDraft({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      reason: "Changed mind",
    });

    // Cancel succeeded despite Stripe failure
    expect(result.draft.status).toBe("CANCELLED");
    expect(result.stripePaymentIntentCancelAttempted).toBe(true);
    expect(result.stripePaymentIntentCancelError).toMatch(/pi already succeeded/);
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
