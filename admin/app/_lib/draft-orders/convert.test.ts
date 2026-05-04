import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import type {
  Booking,
  DraftLineItem,
  DraftOrder,
  DraftReservation,
  Order,
  OrderLineItem,
} from "@prisma/client";

// ── Mocks ────────────────────────────────────────────────────────

const mockTx = {
  draftOrder: {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  draftReservation: {
    updateMany: vi.fn(),
  },
  draftOrderEvent: { create: vi.fn() },
  order: { create: vi.fn() },
  orderLineItem: { create: vi.fn(), findMany: vi.fn() },
  booking: { create: vi.fn() },
  accommodation: { findFirst: vi.fn() },
  companyLocation: { findFirst: vi.fn() },
  discount: { findUnique: vi.fn() },
  discountCode: { findUnique: vi.fn() },
  discountAllocation: { create: vi.fn() },
  discountUsage: { upsert: vi.fn() },
  discountEvent: { create: vi.fn() },
  orderEvent: { create: vi.fn() },
  // Tax-2 B.5: reparentTaxLinesDraftToOrder runs inside the convert tx.
  taxLine: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
};

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  order: { findUnique: vi.fn() },
  tenant: { findUnique: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockEmit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/apps/webhooks", () => ({ emitPlatformEvent: mockEmit }));

// Payment fee module (synchronous import inside convert.ts via dynamic import)
vi.mock("@/app/_lib/payments/platform-fee", () => ({
  getPlatformFeeBps: vi.fn(() => 500),
}));

// Adapter + idempotency mocks
const mockConfirmHold = vi.fn();
const mockResolveAdapter = vi.fn();
vi.mock("@/app/_lib/integrations/resolve", () => ({
  resolveAdapter: mockResolveAdapter,
}));

const mockWithIdempotency = vi.fn();
const mockComputeIdempotencyKey = vi.fn(
  (...args: [{ inputs: Record<string, unknown> }]) => {
    void args;
    return "idem_key_mock";
  },
);
vi.mock("@/app/_lib/integrations/reliability/idempotency", () => ({
  withIdempotency: mockWithIdempotency,
  computeIdempotencyKey: mockComputeIdempotencyKey,
}));

// Order number + discount application mocks
const mockNextOrderNumber = vi.fn();
vi.mock("@/app/_lib/orders/sequence", () => ({
  nextOrderNumber: mockNextOrderNumber,
}));

const mockCalculateDiscountImpact = vi.fn();
const mockCommitDiscountApplication = vi.fn();
vi.mock("@/app/_lib/discounts/apply", () => ({
  calculateDiscountImpact: mockCalculateDiscountImpact,
  commitDiscountApplication: mockCommitDiscountApplication,
}));

const { convertDraftToOrder, computeConfirmHoldKey } = await import("./convert");

// ── Fixtures ────────────────────────────────────────────────────

function makeLine(overrides: Partial<DraftLineItem> = {}): DraftLineItem {
  return {
    id: "dli_acc_1",
    tenantId: "tenant_1",
    draftOrderId: "draft_1",
    lineType: "ACCOMMODATION",
    position: 0,
    accommodationId: "acc_1",
    checkInDate: new Date("2026-06-01T00:00:00Z"),
    checkOutDate: new Date("2026-06-03T00:00:00Z"),
    nights: 2,
    guestCounts: { adults: 2 },
    ratePlanId: null,
    ratePlanName: "Standard",
    ratePlanCancellationPolicy: null,
    selectedAddons: null,
    productVariantId: null,
    productId: null,
    variantTitle: null,
    sku: null,
    imageUrl: null,
    taxable: true,
    taxCode: null,
    title: "Test Accommodation",
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

type DraftForConvert = DraftOrder & {
  lineItems: DraftLineItem[];
  reservations: DraftReservation[];
};

function makeDraft(overrides: Partial<DraftForConvert> = {}): DraftForConvert {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    displayNumber: "D-2026-1001",
    status: "PAID",
    buyerKind: "GUEST",
    guestAccountId: null,
    companyLocationId: null,
    companyContactId: null,
    contactEmail: "buyer@example.com",
    contactPhone: null,
    contactFirstName: "Alice",
    contactLastName: "Example",
    poNumber: null,
    subtotalCents: BigInt(10_000),
    orderDiscountCents: BigInt(0),
    shippingCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(10_000),
    currency: "SEK",
    taxesIncluded: true,
    pricesFrozenAt: new Date("2026-04-23T12:00:00Z"),
    appliedDiscountId: null,
    appliedDiscountCode: null,
    appliedDiscountAmount: null,
    appliedDiscountType: null,
    paymentTermsId: null,
    paymentTermsFrozen: null,
    depositPercent: null,
    shareLinkToken: "token_xyz",
    shareLinkExpiresAt: new Date("2026-05-23T12:00:00Z"),
    invoiceUrl: "https://acme.rutgr.com/invoice/token_xyz",
    invoiceSentAt: new Date("2026-04-23T13:00:00Z"),
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
    version: 3,
    internalNote: null,
    customerNote: null,
    metafields: null,
    tags: [],
    lineItems: [makeLine()],
    reservations: [makeReservation()],
    ...overrides,
  } as DraftForConvert;
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order_new_1",
    tenantId: "tenant_1",
    orderNumber: 1042,
    status: "PAID",
    financialStatus: "PAID",
    fulfillmentStatus: "UNFULFILLED",
    orderType: "ACCOMMODATION",
    paymentMethod: "BEDFRONT_PAYMENTS_ELEMENTS",
    guestEmail: "buyer@example.com",
    guestName: "Alice Example",
    guestPhone: null,
    billingAddress: null,
    guestAccountId: null,
    subtotalAmount: 10_000,
    taxAmount: 0,
    taxRate: 0,
    totalAmount: 10_000,
    currency: "SEK",
    discountAmount: 0,
    discountCode: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: "pi_test_123",
    platformFeeBps: 500,
    statusToken: "tok_status",
    tags: "",
    customerNote: null,
    metadata: { draftOrderId: "draft_1" },
    sourceChannel: "admin_draft",
    sourceExternalId: null,
    sourceUrl: null,
    companyId: null,
    companyLocationId: null,
    poNumber: null,
    paymentTermsSnapshot: null,
    paymentDueAt: null,
    depositPercent: null,
    depositAmountCents: null,
    balanceAmountCents: null,
    sourceCheckoutMode: null,
    paidAt: new Date(),
    fulfilledAt: null,
    cancelledAt: null,
    refundedAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Order;
}

function makeOrderLineItem(overrides: Partial<OrderLineItem> = {}): OrderLineItem {
  return {
    id: "oli_new_1",
    orderId: "order_new_1",
    productId: "acc_1",
    variantId: null,
    title: "Test Accommodation",
    variantTitle: "Standard",
    sku: null,
    imageUrl: null,
    quantity: 1,
    unitAmount: 10_000,
    totalAmount: 10_000,
    currency: "SEK",
    discountAmount: 0,
    ...overrides,
  } as OrderLineItem;
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "bk_new_1",
    tenantId: "tenant_1",
    orderId: "order_new_1",
    accommodationId: "acc_1",
    externalId: "mews_ref_1",
    externalSource: "mews",
    providerUpdatedAt: null,
    lastSyncedAt: null,
    holdExternalId: null,
    holdExpiresAt: null,
    integrityFlag: null,
    integrityMismatchFields: null,
    integrityDetectedAt: null,
    firstName: "Alice",
    lastName: "Example",
    guestEmail: "buyer@example.com",
    phone: null,
    street: null,
    postalCode: null,
    city: null,
    country: null,
    arrival: new Date("2026-06-01T00:00:00Z"),
    departure: new Date("2026-06-03T00:00:00Z"),
    unit: "ext_acc_1",
    status: "PRE_CHECKIN",
    checkedInAt: null,
    checkedOutAt: null,
    signatureCapturedAt: null,
    signatureDataUrl: null,
    checkinData: null,
    portalToken: null,
    confirmedEmailSentAt: null,
    checkedInEmailSentAt: null,
    checkedOutEmailSentAt: null,
    guestAccountId: null,
    accommodation: null,
    ratePlanId: null,
    checkIn: new Date("2026-06-01T00:00:00Z"),
    checkOut: new Date("2026-06-03T00:00:00Z"),
    guestCount: 2,
    specialRequests: null,
    pmsBookingRef: "mews_ref_1",
    cancelledAt: null,
    cancellationPolicySnapshot: null,
    createdAt: new Date(),
    ...overrides,
  } as unknown as Booking;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx),
  );
  mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockPrisma.tenant.findUnique.mockResolvedValue({
    subscriptionPlan: "BASIC",
    platformFeeBps: null,
  });
  mockPrisma.order.findUnique.mockResolvedValue(null);
  mockTx.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockTx.draftOrder.update.mockResolvedValue(makeDraft());
  mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftReservation.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  mockTx.order.create.mockResolvedValue(makeOrder());
  mockTx.orderLineItem.create.mockResolvedValue(makeOrderLineItem());
  mockTx.booking.create.mockResolvedValue(makeBooking());
  mockTx.accommodation.findFirst.mockResolvedValue({ externalId: "ext_acc_1" });
  mockTx.companyLocation.findFirst.mockResolvedValue(null);
  // Tax-2 B.5: reparentTaxLinesDraftToOrder updateMany — re-set since
  // resetAllMocks() above wipes the in-place initializer.
  mockTx.taxLine.updateMany.mockResolvedValue({ count: 0 });
  mockEmit.mockResolvedValue(undefined);
  mockNextOrderNumber.mockResolvedValue(1042);
  mockResolveAdapter.mockResolvedValue({ provider: "mews" });
  mockWithIdempotency.mockImplementation(
    async (_key: string, _opts: unknown, fn: () => Promise<string>) => fn(),
  );
  mockConfirmHold.mockResolvedValue("mews_ref_1");
  mockResolveAdapter.mockResolvedValue({
    provider: "mews",
    confirmHold: mockConfirmHold,
  });
  mockCalculateDiscountImpact.mockResolvedValue({ valid: false, error: "DISCOUNT_NOT_FOUND" });
  mockCommitDiscountApplication.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════
// Happy path — full end-to-end convert
// ═══════════════════════════════════════════════════════════════

describe("convertDraftToOrder — happy path", () => {
  it("converts a PAID draft into a COMPLETED order with one Booking", async () => {
    // Final re-read returns the COMPLETED draft
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft()) // tx re-read
      .mockResolvedValueOnce(
        makeDraft({
          status: "COMPLETED",
          completedAt: new Date(),
          completedOrderId: "order_new_1",
        }),
      );

    const result = await convertDraftToOrder({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
    });

    // Pre-confirm: confirmHold called once via withIdempotency
    expect(mockWithIdempotency).toHaveBeenCalledTimes(1);
    expect(mockConfirmHold).toHaveBeenCalledWith("tenant_1", "pms_hold_1");

    // Order creation
    expect(mockTx.order.create).toHaveBeenCalledTimes(1);
    const orderData = mockTx.order.create.mock.calls[0][0].data;
    expect(orderData.status).toBe("PAID");
    expect(orderData.orderType).toBe("ACCOMMODATION");
    expect(orderData.stripePaymentIntentId).toBe("pi_test_123");
    expect(orderData.orderNumber).toBe(1042);
    expect(orderData.totalAmount).toBe(10_000);
    expect(orderData.metadata).toMatchObject({
      draftOrderId: "draft_1",
      draftDisplayNumber: "D-2026-1001",
    });
    expect(orderData.sourceChannel).toBe("admin_draft");

    // OrderLineItem creation (1 ACC line)
    expect(mockTx.orderLineItem.create).toHaveBeenCalledTimes(1);
    const oliData = mockTx.orderLineItem.create.mock.calls[0][0].data;
    expect(oliData.productId).toBe("acc_1"); // Q10: accommodationId as productId
    expect(oliData.quantity).toBe(1);
    expect(oliData.totalAmount).toBe(10_000);

    // DraftReservation PLACED → CONFIRMED
    expect(mockTx.draftReservation.updateMany).toHaveBeenCalledTimes(1);
    const resvCall = mockTx.draftReservation.updateMany.mock.calls[0][0];
    expect(resvCall.where.holdState).toBe("PLACED");
    expect(resvCall.data.holdState).toBe("CONFIRMED");
    expect(resvCall.data.holdExternalId).toBe("mews_ref_1");

    // Booking creation
    expect(mockTx.booking.create).toHaveBeenCalledTimes(1);
    const bookingData = mockTx.booking.create.mock.calls[0][0].data;
    expect(bookingData.externalId).toBe("mews_ref_1");
    expect(bookingData.pmsBookingRef).toBe("mews_ref_1");
    expect(bookingData.status).toBe("PRE_CHECKIN");
    expect(bookingData.holdExternalId).toBeNull();

    // State transitions PAID → COMPLETING → COMPLETED
    const transitionCalls = mockTx.draftOrder.updateMany.mock.calls;
    expect(transitionCalls.length).toBeGreaterThanOrEqual(2);
    expect(transitionCalls[0][0].where.status).toBe("PAID");
    expect(transitionCalls[0][0].data.status).toBe("COMPLETING");
    expect(transitionCalls[1][0].where.status).toBe("COMPLETING");
    expect(transitionCalls[1][0].data.status).toBe("COMPLETED");

    // completedAt + completedOrderId stamped
    const updateData = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(updateData.completedAt).toBeInstanceOf(Date);
    expect(updateData.completedOrderId).toBe("order_new_1");

    // Platform webhook emitted
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const ev = mockEmit.mock.calls[0][0];
    expect(ev.type).toBe("draft_order.completed");
    expect(ev.payload.orderId).toBe("order_new_1");
    expect(ev.payload.bookingIds).toEqual(["bk_new_1"]);

    // Result shape
    expect(result.alreadyConverted).toBe(false);
    expect(result.order.id).toBe("order_new_1");
    expect(result.bookings).toHaveLength(1);
  });

  it("handles a multi-line B2B draft (3 ACC + 2 PRODUCT) sequentially", async () => {
    const accLines = [
      makeLine({ id: "dli_acc_1", accommodationId: "acc_1" }),
      makeLine({ id: "dli_acc_2", accommodationId: "acc_2" }),
      makeLine({ id: "dli_acc_3", accommodationId: "acc_3" }),
    ];
    const productLines = [
      makeLine({
        id: "dli_prod_1",
        lineType: "PRODUCT",
        accommodationId: null,
        productId: "prod_1",
        productVariantId: "var_1",
        quantity: 2,
      }),
      makeLine({
        id: "dli_custom_1",
        lineType: "CUSTOM",
        accommodationId: null,
      }),
    ];
    const reservations = [
      makeReservation({ id: "dr_1", draftLineItemId: "dli_acc_1", holdExternalId: "hold_1" }),
      makeReservation({ id: "dr_2", draftLineItemId: "dli_acc_2", holdExternalId: "hold_2" }),
      makeReservation({ id: "dr_3", draftLineItemId: "dli_acc_3", holdExternalId: "hold_3" }),
    ];
    const b2bDraft = makeDraft({
      buyerKind: "COMPANY",
      companyLocationId: "loc_1",
      lineItems: [...accLines, ...productLines],
      reservations,
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(b2bDraft);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(b2bDraft)
      .mockResolvedValueOnce(
        makeDraft({
          status: "COMPLETED",
          completedAt: new Date(),
          completedOrderId: "order_new_1",
        }),
      );
    mockTx.companyLocation.findFirst.mockResolvedValue({ companyId: "comp_1" });

    // Make confirmHold return distinct external IDs per call
    mockConfirmHold
      .mockResolvedValueOnce("mews_ref_1")
      .mockResolvedValueOnce("mews_ref_2")
      .mockResolvedValueOnce("mews_ref_3");

    await convertDraftToOrder({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
    });

    // 3 confirmHold calls (one per ACC line)
    expect(mockConfirmHold).toHaveBeenCalledTimes(3);
    // 5 OrderLineItems (3 ACC + 1 PRODUCT + 1 CUSTOM)
    expect(mockTx.orderLineItem.create).toHaveBeenCalledTimes(5);
    // 3 Bookings
    expect(mockTx.booking.create).toHaveBeenCalledTimes(3);
    // 3 DraftReservation updates
    expect(mockTx.draftReservation.updateMany).toHaveBeenCalledTimes(3);
    // companyId resolved from location
    const orderData = mockTx.order.create.mock.calls[0][0].data;
    expect(orderData.companyId).toBe("comp_1");
    expect(orderData.companyLocationId).toBe("loc_1");
  });

  it("creates no Bookings for a PRODUCT-only draft", async () => {
    const productOnly = makeDraft({
      lineItems: [
        makeLine({ id: "dli_1", lineType: "PRODUCT", accommodationId: null, productId: "p1" }),
      ],
      reservations: [],
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(productOnly);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(productOnly)
      .mockResolvedValueOnce(
        makeDraft({
          status: "COMPLETED",
          completedAt: new Date(),
          completedOrderId: "order_new_1",
        }),
      );

    await convertDraftToOrder({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
    });

    expect(mockConfirmHold).not.toHaveBeenCalled();
    expect(mockTx.booking.create).not.toHaveBeenCalled();
    expect(mockTx.draftReservation.updateMany).not.toHaveBeenCalled();
    const orderData = mockTx.order.create.mock.calls[0][0].data;
    expect(orderData.orderType).toBe("PURCHASE");
  });
});

// ═══════════════════════════════════════════════════════════════
// Preconditions (P1-P7 + Q9)
// ═══════════════════════════════════════════════════════════════

describe("convertDraftToOrder — preconditions", () => {
  it("P1: throws NotFoundError when draft missing", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "ghost",
        stripePaymentIntentId: "pi_1",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("P2: rejects when status !== PAID", async () => {
    for (const status of ["OPEN", "INVOICED", "OVERDUE", "COMPLETED", "CANCELLED"] as const) {
      mockPrisma.draftOrder.findFirst.mockResolvedValue(
        makeDraft({
          status,
          completedOrderId: status === "COMPLETED" ? null : null,
        }),
      );
      await expect(
        convertDraftToOrder({
          tenantId: "tenant_1",
          draftOrderId: "draft_1",
          stripePaymentIntentId: "pi_1",
        }),
      ).rejects.toThrow(/PAID status/i);
    }
  });

  it("P3: rejects unfrozen draft", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ pricesFrozenAt: null }),
    );
    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_1",
      }),
    ).rejects.toThrow(/not frozen/i);
  });

  it("P4: rejects when any ACC reservation is not PLACED", async () => {
    for (const holdState of ["NOT_PLACED", "PLACING", "FAILED", "RELEASED", "CONFIRMED"] as const) {
      mockPrisma.draftOrder.findFirst.mockResolvedValue(
        makeDraft({ reservations: [makeReservation({ holdState })] }),
      );
      await expect(
        convertDraftToOrder({
          tenantId: "tenant_1",
          draftOrderId: "draft_1",
          stripePaymentIntentId: "pi_1",
        }),
      ).rejects.toThrow(/holds must be PLACED/i);
    }
  });

  it("P4: rejects when ACC line has no DraftReservation", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ reservations: [] }),
    );
    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_1",
      }),
    ).rejects.toThrow(/missing its DraftReservation/i);
  });

  it("P4: rejects PLACED reservation missing holdExternalId", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        reservations: [makeReservation({ holdExternalId: null })],
      }),
    );
    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_1",
      }),
    ).rejects.toThrow(/holdExternalId/);
  });

  it("P5: rejects expired hold (holdExpiresAt past + 60s buffer)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        reservations: [
          makeReservation({
            holdExpiresAt: new Date(Date.now() - 5 * 60_000),
          }),
        ],
      }),
    );
    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_1",
      }),
    ).rejects.toThrow(/HOLDS_EXPIRED/);
  });

  it("Q9: rejects draft.totalCents exceeding MAX_SAFE_INTEGER", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        totalCents: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
      }),
    );
    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_1",
      }),
    ).rejects.toThrow(/AMOUNT_EXCEEDS_ORDER_TABLE_CAPACITY/);
  });
});

// ═══════════════════════════════════════════════════════════════
// Idempotent replay (L1-L6 layers)
// ═══════════════════════════════════════════════════════════════

describe("convertDraftToOrder — idempotent replay", () => {
  it("short-circuits when draft.completedOrderId already set (L3)", async () => {
    const completedDraft = makeDraft({
      status: "COMPLETED",
      completedOrderId: "order_existing_1",
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(completedDraft);
    mockPrisma.order.findUnique.mockResolvedValue({
      ...makeOrder({ id: "order_existing_1" }),
      lineItems: [makeOrderLineItem({ orderId: "order_existing_1" })],
      bookings: [makeBooking({ orderId: "order_existing_1" })],
    });

    const result = await convertDraftToOrder({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
    });

    expect(result.alreadyConverted).toBe(true);
    expect(result.order.id).toBe("order_existing_1");
    // No tx opened, no adapter calls
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConfirmHold).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("rejects when completedOrderId is set but Order is missing", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        status: "COMPLETED",
        completedOrderId: "order_ghost",
      }),
    );
    mockPrisma.order.findUnique.mockResolvedValue(null);

    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_1",
      }),
    ).rejects.toThrow(/manual recovery required/);
  });

  it("L4 defensive catch: P2002 on stripePaymentIntentId returns alreadyConverted replay", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(makeDraft());

    mockTx.order.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "5.0.0",
      }),
    );
    mockPrisma.order.findUnique.mockImplementation(
      async (args: { where: { id?: string; stripePaymentIntentId?: string } }) => {
        if (args.where.stripePaymentIntentId === "pi_test_123") {
          return {
            ...makeOrder({ id: "order_parallel_1" }),
            lineItems: [makeOrderLineItem({ orderId: "order_parallel_1" })],
            bookings: [makeBooking({ orderId: "order_parallel_1" })],
          };
        }
        return null;
      },
    );

    const result = await convertDraftToOrder({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
    });

    expect(result.alreadyConverted).toBe(true);
    expect(result.order.id).toBe("order_parallel_1");
  });
});

// ═══════════════════════════════════════════════════════════════
// Failure modes (F1-F11 per audit §13)
// ═══════════════════════════════════════════════════════════════

describe("convertDraftToOrder — failure modes F1-F11", () => {
  it("F1: pre-confirm adapter throws → full rollback, no Order, no Booking", async () => {
    mockWithIdempotency.mockRejectedValue(new Error("mews timeout"));

    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_test_123",
      }),
    ).rejects.toThrow(/mews timeout/);

    // Tx never opened
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.order.create).not.toHaveBeenCalled();
    expect(mockTx.booking.create).not.toHaveBeenCalled();
  });

  it("F3: Order.create fails (non-P2002) → tx rollback, propagated error", async () => {
    mockTx.order.create.mockRejectedValue(new Error("DB connection lost"));
    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_test_123",
      }),
    ).rejects.toThrow(/DB connection lost/);
  });

  it("F5: Booking.create throws → rollback", async () => {
    mockTx.booking.create.mockRejectedValue(new Error("booking constraint violation"));
    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_test_123",
      }),
    ).rejects.toThrow(/booking constraint/);
  });

  it("F7: commitDiscountApplication USAGE_LIMIT_REACHED emits structured error log (Q12)", async () => {
    const draftWithDiscount = makeDraft({
      appliedDiscountCode: "SUMMER20",
      appliedDiscountId: "disc_1",
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draftWithDiscount);
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(draftWithDiscount);

    mockCalculateDiscountImpact.mockResolvedValue({
      valid: true,
      discount: { id: "disc_1", valueType: "PERCENTAGE", method: "CODE" },
      discountCodeId: "dc_1",
      discountCodeValue: "SUMMER20",
      discountAmount: 2000,
      allocations: { scope: "ORDER", amount: 2000 },
      title: "Summer 20% off",
      description: null,
      buyerKind: "GUEST",
    });
    mockCommitDiscountApplication.mockRejectedValue(
      new Error("USAGE_LIMIT_REACHED"),
    );

    const { log: mockLog } = await import("@/app/_lib/logger");

    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_test_123",
      }),
    ).rejects.toThrow(/USAGE_LIMIT_REACHED/);

    const logCalls = (mockLog as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const raceLog = logCalls.find(
      (call) => call[1] === "draft_order.convert.discount_race_blocked",
    );
    expect(raceLog).toBeTruthy();
    expect(raceLog![2]).toMatchObject({
      draftOrderId: "draft_1",
      discountCode: "SUMMER20",
      piId: "pi_test_123",
    });
  });

  it("F7 (evaluation side): calculateDiscountImpact returns invalid → ConflictError with log", async () => {
    const draftWithDiscount = makeDraft({
      appliedDiscountCode: "EXPIRED",
      appliedDiscountId: "disc_x",
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draftWithDiscount);
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(draftWithDiscount);
    mockCalculateDiscountImpact.mockResolvedValue({
      valid: false,
      error: "DISCOUNT_EXPIRED",
    });

    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_test_123",
      }),
    ).rejects.toThrow(/DISCOUNT_BECAME_INVALID_AT_CONVERT/);
  });

  it("F8: DraftReservation updateMany count=0 → ConflictError (cron release race)", async () => {
    mockTx.draftReservation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_test_123",
      }),
    ).rejects.toThrow(/lost race/i);
  });

  it("tx re-read: draft status changed from PAID during convert → ConflictError", async () => {
    mockTx.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "CANCELLED" }),
    );
    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_test_123",
      }),
    ).rejects.toThrow(/no longer in PAID/);
  });

  it("tx re-read: completedOrderId set by parallel convert → CONVERT_RACE_LOST", async () => {
    // Pre-tx sees completedOrderId=null (passes replay shortcut)
    const preDraft = makeDraft({ completedOrderId: null });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(preDraft);
    // In-tx re-read sees it populated
    mockTx.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ completedOrderId: "order_parallel_x" }),
    );
    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_test_123",
      }),
    ).rejects.toThrow(/CONVERT_RACE_LOST/);
  });

  it("F10: webhook emission failure is swallowed", async () => {
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft())
      .mockResolvedValueOnce(
        makeDraft({
          status: "COMPLETED",
          completedAt: new Date(),
          completedOrderId: "order_new_1",
        }),
      );
    mockEmit.mockRejectedValue(new Error("app webhook down"));

    await expect(
      convertDraftToOrder({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        stripePaymentIntentId: "pi_test_123",
      }),
    ).resolves.toMatchObject({ alreadyConverted: false });
  });
});

// ═══════════════════════════════════════════════════════════════
// Hold upgrade contract (§4)
// ═══════════════════════════════════════════════════════════════

describe("convertDraftToOrder — hold upgrade", () => {
  it("webhook actorSource → deterministic idempotency key (no attemptNonce)", async () => {
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft())
      .mockResolvedValueOnce(
        makeDraft({
          status: "COMPLETED",
          completedAt: new Date(),
          completedOrderId: "order_new_1",
        }),
      );

    await convertDraftToOrder({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
      actorSource: "webhook",
    });

    expect(mockComputeIdempotencyKey).toHaveBeenCalled();
    const keyArgs = mockComputeIdempotencyKey.mock.calls[0][0] as {
      inputs: Record<string, unknown>;
    };
    expect(keyArgs.inputs).toMatchObject({
      draftReservationId: "dr_1",
      stripePaymentIntentId: "pi_test_123",
    });
    // No attemptNonce in webhook path
    expect(keyArgs.inputs.attemptNonce).toBeUndefined();
  });

  it("admin_manual_recovery actorSource → attemptNonce in key (fresh attempt)", async () => {
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft())
      .mockResolvedValueOnce(
        makeDraft({
          status: "COMPLETED",
          completedAt: new Date(),
          completedOrderId: "order_new_1",
        }),
      );

    await convertDraftToOrder({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
      actorSource: "admin_manual_recovery",
    });

    const keyArgs = mockComputeIdempotencyKey.mock.calls[0][0] as {
      inputs: Record<string, unknown>;
    };
    expect(keyArgs.inputs.attemptNonce).toBeDefined();
    expect(typeof keyArgs.inputs.attemptNonce).toBe("string");
  });

  it("holds are confirmed sequentially (not parallel)", async () => {
    const accLines = [
      makeLine({ id: "dli_1", accommodationId: "a1" }),
      makeLine({ id: "dli_2", accommodationId: "a2" }),
    ];
    const reservations = [
      makeReservation({ id: "dr_1", draftLineItemId: "dli_1", holdExternalId: "h1" }),
      makeReservation({ id: "dr_2", draftLineItemId: "dli_2", holdExternalId: "h2" }),
    ];
    const draft = makeDraft({
      lineItems: accLines,
      reservations,
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draft);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(
        makeDraft({
          status: "COMPLETED",
          completedAt: new Date(),
          completedOrderId: "order_new_1",
        }),
      );

    const order: string[] = [];
    mockWithIdempotency.mockImplementation(
      async (_key: string, opts: { operation: string }, fn: () => Promise<string>) => {
        order.push(opts.operation);
        const result = await fn();
        return result;
      },
    );
    mockConfirmHold
      .mockImplementationOnce(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "mews_ref_1";
      })
      .mockResolvedValueOnce("mews_ref_2");

    await convertDraftToOrder({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
    });

    expect(order).toEqual(["confirmHold", "confirmHold"]);
    expect(mockConfirmHold).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Discount commit path
// ═══════════════════════════════════════════════════════════════

describe("convertDraftToOrder — discount commit", () => {
  it("no-op when draft has no applied discount", async () => {
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft())
      .mockResolvedValueOnce(
        makeDraft({
          status: "COMPLETED",
          completedAt: new Date(),
          completedOrderId: "order_new_1",
        }),
      );

    await convertDraftToOrder({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
    });

    expect(mockCalculateDiscountImpact).not.toHaveBeenCalled();
    expect(mockCommitDiscountApplication).not.toHaveBeenCalled();
  });

  it("commits discount against freshly-created OrderLineItems (ORDER-side IDs)", async () => {
    const draftWithDiscount = makeDraft({
      appliedDiscountCode: "SUMMER20",
      appliedDiscountId: "disc_1",
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(draftWithDiscount);
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(draftWithDiscount)
      .mockResolvedValueOnce(
        makeDraft({
          status: "COMPLETED",
          completedAt: new Date(),
          completedOrderId: "order_new_1",
        }),
      );
    mockCalculateDiscountImpact.mockResolvedValue({
      valid: true,
      discount: { id: "disc_1", valueType: "PERCENTAGE", method: "CODE" },
      discountCodeId: "dc_1",
      discountCodeValue: "SUMMER20",
      discountAmount: 2000,
      allocations: { scope: "ORDER", amount: 2000 },
      title: "Summer 20% off",
      description: null,
      buyerKind: "GUEST",
    });

    await convertDraftToOrder({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      stripePaymentIntentId: "pi_test_123",
    });

    expect(mockCalculateDiscountImpact).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        code: "SUMMER20",
      }),
    );
    // Line items passed used the ORDER-side OrderLineItem.id
    const callLines = mockCalculateDiscountImpact.mock.calls[0][0].lineItems;
    expect(callLines[0].id).toBe("oli_new_1"); // from makeOrderLineItem fixture
    expect(mockCommitDiscountApplication).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        orderId: "order_new_1",
        tenantId: "tenant_1",
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// computeConfirmHoldKey helper
// ═══════════════════════════════════════════════════════════════

describe("computeConfirmHoldKey", () => {
  beforeEach(() => {
    mockComputeIdempotencyKey.mockReset();
    mockComputeIdempotencyKey.mockReturnValue("key_mock");
  });

  it("produces same key across calls when forceFresh=false", () => {
    const k1 = computeConfirmHoldKey({
      tenantId: "t_1",
      provider: "mews",
      reservationId: "dr_1",
      paymentIntentId: "pi_1",
      forceFresh: false,
    });
    const k2 = computeConfirmHoldKey({
      tenantId: "t_1",
      provider: "mews",
      reservationId: "dr_1",
      paymentIntentId: "pi_1",
      forceFresh: false,
    });
    expect(k1).toBe(k2);
    // Inputs passed to computeIdempotencyKey are identical both times
    const call1 = mockComputeIdempotencyKey.mock.calls[0][0] as {
      inputs: Record<string, unknown>;
    };
    const call2 = mockComputeIdempotencyKey.mock.calls[1][0] as {
      inputs: Record<string, unknown>;
    };
    expect(call1.inputs).toEqual(call2.inputs);
    expect(call1.inputs.attemptNonce).toBeUndefined();
  });

  it("adds attemptNonce when forceFresh=true", () => {
    computeConfirmHoldKey({
      tenantId: "t_1",
      provider: "mews",
      reservationId: "dr_1",
      paymentIntentId: "pi_1",
      forceFresh: true,
    });
    const call = mockComputeIdempotencyKey.mock.calls[0][0] as {
      inputs: Record<string, unknown>;
    };
    expect(call.inputs.attemptNonce).toBeDefined();
  });

  it("forceFresh=true produces distinct nonces across calls", () => {
    computeConfirmHoldKey({
      tenantId: "t_1",
      provider: "mews",
      reservationId: "dr_1",
      paymentIntentId: "pi_1",
      forceFresh: true,
    });
    computeConfirmHoldKey({
      tenantId: "t_1",
      provider: "mews",
      reservationId: "dr_1",
      paymentIntentId: "pi_1",
      forceFresh: true,
    });
    const nonce1 = (mockComputeIdempotencyKey.mock.calls[0][0] as {
      inputs: Record<string, unknown>;
    }).inputs.attemptNonce;
    const nonce2 = (mockComputeIdempotencyKey.mock.calls[1][0] as {
      inputs: Record<string, unknown>;
    }).inputs.attemptNonce;
    expect(nonce1).not.toBe(nonce2);
  });
});
