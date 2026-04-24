import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DraftOrder, DraftLineItem } from "@prisma/client";

// ── Mocks ────────────────────────────────────────────────────────

const mockTx = {
  draftOrder: {
    findFirst: vi.fn(),
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
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  draftOrderEvent: {
    create: vi.fn(),
  },
};

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  draftLineItem: { findFirst: vi.fn() },
  draftReservation: { findFirst: vi.fn() },
  accommodation: { findFirst: vi.fn() },
  productVariant: { findFirst: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
};

// FAS 6.5C: removeLineItem imports releaseHoldForDraftLine dynamically
// when a PLACED hold is present. Mock the module at the import boundary.
vi.mock("./holds", () => ({
  releaseHoldForDraftLine: vi.fn().mockResolvedValue({
    reservation: { holdState: "RELEASED" },
    adapterReleaseOk: true,
  }),
}));

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockEmit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/apps/webhooks", () => ({
  emitPlatformEvent: mockEmit,
}));

const mockCompAcc = vi.fn();
const mockCompProd = vi.fn();
vi.mock("@/app/_lib/pricing/line-pricing", () => ({
  computeAccommodationLinePrice: mockCompAcc,
  computeProductLinePrice: mockCompProd,
}));

const mockComputeAndPersist = vi.fn();
vi.mock("./calculator", () => ({
  computeAndPersistDraftTotalsInTx: mockComputeAndPersist,
}));

const { addLineItem, updateLineItem, removeLineItem } = await import("./lines");

// ── Fixtures ────────────────────────────────────────────────────

function makeDraft(overrides: Partial<DraftOrder> = {}): DraftOrder {
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
    subtotalCents: BigInt(0),
    orderDiscountCents: BigInt(0),
    shippingCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(0),
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
    ...overrides,
  } as DraftOrder;
}

function makeLineRow(overrides: Partial<DraftLineItem> = {}): DraftLineItem {
  return {
    id: "dli_new",
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
    productVariantId: null,
    productId: null,
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

beforeEach(() => {
  vi.resetAllMocks();
  // Pre-tx draft read and tx re-read return the same draft by default.
  mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockTx.draftOrder.findFirst.mockResolvedValue(makeDraft());
  // FAS 6.5C: default — no hold on the reservation (NOT_PLACED path).
  mockPrisma.draftReservation.findFirst.mockResolvedValue(null);
  // Default: first findFirst call (position lookup) → null; later calls (refresh) → line row.
  let callCount = 0;
  mockTx.draftLineItem.findFirst.mockImplementation(async () => {
    callCount += 1;
    if (callCount === 1) return null; // position lookup
    return makeLineRow(); // refresh after calculator
  });
  // Re-bind $transaction so it forwards the callback to our mockTx.
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx),
  );
  // Re-bind webhook emit default (not rejected).
  mockEmit.mockResolvedValue(undefined);
  mockTx.draftLineItem.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) =>
      makeLineRow(data as Partial<DraftLineItem>),
  );
  mockTx.draftReservation.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) =>
      ({
        id: "dr_1",
        ...data,
        holdState: "NOT_PLACED",
        holdExternalId: null,
        holdExpiresAt: null,
        holdLastAttemptAt: null,
        holdLastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as never,
  );
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  mockComputeAndPersist.mockResolvedValue({
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
    warnings: [],
  });
});

// ── ACCOMMODATION happy path ────────────────────────────────────

describe("addLineItem — ACCOMMODATION", () => {
  beforeEach(() => {
    mockCompAcc.mockResolvedValue({
      unitPriceCents: BigInt(150_000),
      nights: 3,
      subtotalCents: BigInt(450_000),
      currency: "SEK",
      ratePlan: {
        id: "rp_1",
        name: "Flexible",
        cancellationPolicy: "Free until 24h",
      },
      accommodationExternalId: "ext_1",
      sourceRule: "LIVE_PMS",
      appliedCatalogId: null,
    });
    mockPrisma.accommodation.findFirst.mockResolvedValue({
      name: "Deluxe Double",
    });
  });

  it("resolves price + creates line + creates DraftReservation + emits event", async () => {
    const result = await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: {
        lineType: "ACCOMMODATION",
        accommodationId: "acc_1",
        checkInDate: "2026-06-01",
        checkOutDate: "2026-06-04",
        guestCounts: { adults: 2, children: 0, infants: 0 },
      },
    });

    expect(mockCompAcc).toHaveBeenCalledTimes(1);
    expect(mockTx.draftLineItem.create).toHaveBeenCalledTimes(1);
    const lineCreate = mockTx.draftLineItem.create.mock.calls[0][0];
    expect(lineCreate.data.lineType).toBe("ACCOMMODATION");
    expect(lineCreate.data.quantity).toBe(1); // ACC implicit quantity
    expect(lineCreate.data.nights).toBe(3);
    expect(lineCreate.data.appliedRule).toBe("LIVE_PMS");

    // DraftReservation created
    expect(mockTx.draftReservation.create).toHaveBeenCalledTimes(1);
    expect(result.reservation).not.toBeNull();

    // Event
    expect(mockTx.draftOrderEvent.create).toHaveBeenCalledTimes(1);
    const eventArg = mockTx.draftOrderEvent.create.mock.calls[0][0];
    expect(eventArg.data.type).toBe("LINE_ADDED");
    expect(eventArg.data.metadata.lineType).toBe("ACCOMMODATION");

    // Platform webhook
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0].type).toBe("draft_order.updated");
  });

  it("PMS helper is called BEFORE $transaction (no tx held during PMS call)", async () => {
    await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: {
        lineType: "ACCOMMODATION",
        accommodationId: "acc_1",
        checkInDate: "2026-06-01",
        checkOutDate: "2026-06-04",
        guestCounts: { adults: 2, children: 0, infants: 0 },
      },
    });

    const pmsOrder = mockCompAcc.mock.invocationCallOrder[0];
    const txOrder = mockPrisma.$transaction.mock.invocationCallOrder[0];
    expect(pmsOrder).toBeLessThan(txOrder);
  });

  it("position is max(existing) + 1 when other lines exist", async () => {
    let call = 0;
    mockTx.draftLineItem.findFirst.mockImplementation(async () => {
      call += 1;
      if (call === 1) return { position: 4 } as DraftLineItem; // existing highest
      return makeLineRow();
    });

    await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: {
        lineType: "ACCOMMODATION",
        accommodationId: "acc_1",
        checkInDate: "2026-06-01",
        checkOutDate: "2026-06-04",
        guestCounts: { adults: 1, children: 0, infants: 0 },
      },
    });

    const createData = mockTx.draftLineItem.create.mock.calls[0][0].data;
    expect(createData.position).toBe(5);
  });

  it("position is 0 when draft has no existing lines", async () => {
    // Default beforeEach implementation already does this (call 1 → null, call 2 → lineRow).
    await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: {
        lineType: "ACCOMMODATION",
        accommodationId: "acc_1",
        checkInDate: "2026-06-01",
        checkOutDate: "2026-06-04",
        guestCounts: { adults: 1, children: 0, infants: 0 },
      },
    });

    expect(mockTx.draftLineItem.create.mock.calls[0][0].data.position).toBe(0);
  });

  it("rejects when Accommodation not found in tenant", async () => {
    mockPrisma.accommodation.findFirst.mockResolvedValue(null);

    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        line: {
          lineType: "ACCOMMODATION",
          accommodationId: "missing",
          checkInDate: "2026-06-01",
          checkOutDate: "2026-06-04",
          guestCounts: { adults: 1, children: 0, infants: 0 },
        },
      }),
    ).rejects.toThrow(/Accommodation not found/);
  });

  it("rejects when PMS currency disagrees with draft currency", async () => {
    mockCompAcc.mockResolvedValue({
      unitPriceCents: BigInt(100),
      nights: 3,
      subtotalCents: BigInt(300),
      currency: "EUR", // draft has SEK
      ratePlan: { id: "rp_1", name: "x", cancellationPolicy: null },
      accommodationExternalId: "ext",
      sourceRule: "LIVE_PMS",
      appliedCatalogId: null,
    });

    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        line: {
          lineType: "ACCOMMODATION",
          accommodationId: "acc_1",
          checkInDate: "2026-06-01",
          checkOutDate: "2026-06-04",
          guestCounts: { adults: 1, children: 0, infants: 0 },
        },
      }),
    ).rejects.toThrow(/currency/);
  });
});

// ── PRODUCT happy path ──────────────────────────────────────────

describe("addLineItem — PRODUCT", () => {
  beforeEach(() => {
    mockCompProd.mockResolvedValue({
      unitPriceCents: BigInt(5_000),
      quantity: 2,
      subtotalCents: BigInt(10_000),
      currency: "SEK",
      sourceRule: "BASE",
      appliedCatalogId: null,
    });
    mockPrisma.productVariant.findFirst.mockResolvedValue({
      option1: "Red",
      option2: "Large",
      option3: null,
      sku: "RED-LG",
      imageUrl: "https://cdn/img.jpg",
      productId: "prod_1",
      product: { title: "Sauna Hat" },
    });
  });

  it("resolves price + creates line; no DraftReservation (non-accommodation)", async () => {
    const result = await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: {
        lineType: "PRODUCT",
        productVariantId: "var_1",
        quantity: 2,
      },
    });

    expect(mockCompProd).toHaveBeenCalledTimes(1);
    expect(mockTx.draftLineItem.create).toHaveBeenCalledTimes(1);
    expect(mockTx.draftReservation.create).not.toHaveBeenCalled();
    expect(result.reservation).toBeNull();

    const createData = mockTx.draftLineItem.create.mock.calls[0][0].data;
    expect(createData.lineType).toBe("PRODUCT");
    expect(createData.quantity).toBe(2);
    expect(createData.title).toBe("Sauna Hat");
    expect(createData.variantTitle).toBe("Red / Large");
    expect(createData.sku).toBe("RED-LG");
    expect(createData.productId).toBe("prod_1");
  });

  it("COMPANY buyer routes buyerContext.company to price resolver", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        buyerKind: "COMPANY",
        companyLocationId: "loc_1",
        taxesIncluded: false,
      }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        buyerKind: "COMPANY",
        companyLocationId: "loc_1",
        taxesIncluded: false,
      }),
    );

    await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: { lineType: "PRODUCT", productVariantId: "var_1", quantity: 2 },
    });

    const callArg = mockCompProd.mock.calls[0][0];
    expect(callArg.buyerContext).toEqual({
      kind: "company",
      companyLocationId: "loc_1",
    });
  });

  it("WALK_IN buyer routes buyerContext.walk_in (no catalog lookup)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ buyerKind: "WALK_IN", guestAccountId: null }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ buyerKind: "WALK_IN", guestAccountId: null }),
    );

    await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: { lineType: "PRODUCT", productVariantId: "var_1", quantity: 1 },
    });

    expect(mockCompProd.mock.calls[0][0].buyerContext).toEqual({
      kind: "walk_in",
    });
  });

  it("variantTitle is null when variant has no options", async () => {
    mockPrisma.productVariant.findFirst.mockResolvedValue({
      option1: null,
      option2: null,
      option3: null,
      sku: null,
      imageUrl: null,
      productId: "prod_1",
      product: { title: "Plain" },
    });

    await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: { lineType: "PRODUCT", productVariantId: "var_1", quantity: 1 },
    });

    expect(
      mockTx.draftLineItem.create.mock.calls[0][0].data.variantTitle,
    ).toBeNull();
  });

  it("rejects when variant not found in tenant", async () => {
    mockPrisma.productVariant.findFirst.mockResolvedValue(null);

    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        line: { lineType: "PRODUCT", productVariantId: "ghost", quantity: 1 },
      }),
    ).rejects.toThrow(/ProductVariant not found/);
  });
});

// ── CUSTOM happy path ───────────────────────────────────────────

describe("addLineItem — CUSTOM", () => {
  it("uses input unitPriceCents verbatim + no external calls", async () => {
    const result = await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: {
        lineType: "CUSTOM",
        title: "Sauna cleaning fee",
        quantity: 1,
        unitPriceCents: BigInt(25_000),
      },
    });

    expect(mockCompAcc).not.toHaveBeenCalled();
    expect(mockCompProd).not.toHaveBeenCalled();
    expect(mockPrisma.accommodation.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.productVariant.findFirst).not.toHaveBeenCalled();

    const createData = mockTx.draftLineItem.create.mock.calls[0][0].data;
    expect(createData.lineType).toBe("CUSTOM");
    expect(createData.unitPriceCents).toBe(BigInt(25_000));
    expect(createData.subtotalCents).toBe(BigInt(25_000));
    expect(createData.appliedRule).toBe("CUSTOM");
    expect(result.reservation).toBeNull();
  });

  it("multiplies unitPrice by quantity for subtotal", async () => {
    await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: {
        lineType: "CUSTOM",
        title: "Gift box",
        quantity: 4,
        unitPriceCents: BigInt(1_000),
      },
    });
    expect(
      mockTx.draftLineItem.create.mock.calls[0][0].data.subtotalCents,
    ).toBe(BigInt(4_000));
  });
});

// ── Mutability guards ──────────────────────────────────────────

describe("addLineItem — mutability guards", () => {
  it("rejects when draft not found in tenant", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);

    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "ghost",
        line: {
          lineType: "CUSTOM",
          title: "x",
          quantity: 1,
          unitPriceCents: BigInt(100),
        },
      }),
    ).rejects.toThrow(/DraftOrder not found/);
  });

  it("rejects when draft is not OPEN", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "INVOICED" }),
    );

    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        line: {
          lineType: "CUSTOM",
          title: "x",
          quantity: 1,
          unitPriceCents: BigInt(100),
        },
      }),
    ).rejects.toThrow(/not editable/);
  });

  it("rejects when draft has pricesFrozenAt set", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ pricesFrozenAt: new Date() }),
    );

    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        line: {
          lineType: "CUSTOM",
          title: "x",
          quantity: 1,
          unitPriceCents: BigInt(100),
        },
      }),
    ).rejects.toThrow(/frozen/);
  });

  it("rejects when draft is cancelled", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "CANCELLED", cancelledAt: new Date() }),
    );

    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        line: {
          lineType: "CUSTOM",
          title: "x",
          quantity: 1,
          unitPriceCents: BigInt(100),
        },
      }),
    ).rejects.toThrow(/not editable/);
  });
});

// ── Zod rejection ───────────────────────────────────────────────

describe("addLineItem — input validation", () => {
  it("rejects ACC line with checkOut <= checkIn", async () => {
    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        line: {
          lineType: "ACCOMMODATION",
          accommodationId: "acc_1",
          checkInDate: "2026-06-04",
          checkOutDate: "2026-06-01",
          guestCounts: { adults: 1, children: 0, infants: 0 },
        },
      }),
    ).rejects.toThrow(/checkOutDate/);
  });

  it("rejects ACC line with adults < 1", async () => {
    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        line: {
          lineType: "ACCOMMODATION",
          accommodationId: "acc_1",
          checkInDate: "2026-06-01",
          checkOutDate: "2026-06-04",
          guestCounts: { adults: 0, children: 0, infants: 0 },
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects PRODUCT with quantity < 1", async () => {
    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        line: { lineType: "PRODUCT", productVariantId: "v", quantity: 0 },
      }),
    ).rejects.toThrow();
  });

  it("rejects CUSTOM with negative unitPriceCents", async () => {
    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        line: {
          lineType: "CUSTOM",
          title: "x",
          quantity: 1,
          unitPriceCents: BigInt(-100),
        },
      }),
    ).rejects.toThrow();
  });
});

// ── Totals integration ─────────────────────────────────────────

describe("addLineItem — totals integration", () => {
  it("calls computeAndPersistDraftTotalsInTx with the tx", async () => {
    await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: {
        lineType: "CUSTOM",
        title: "x",
        quantity: 1,
        unitPriceCents: BigInt(100),
      },
    });

    expect(mockComputeAndPersist).toHaveBeenCalledTimes(1);
    const args = mockComputeAndPersist.mock.calls[0];
    expect(args[0]).toBe(mockTx); // tx passed through
    expect(args[1]).toBe("tenant_1");
    expect(args[2]).toBe("draft_1");
  });

  it("returns the totals from the orchestrator in the result", async () => {
    const result = await addLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      line: {
        lineType: "CUSTOM",
        title: "x",
        quantity: 1,
        unitPriceCents: BigInt(100),
      },
    });

    expect(result.totals.source).toBe("COMPUTED");
  });
});

// ── Platform webhook resilience ────────────────────────────────

describe("addLineItem — platform webhook", () => {
  it("swallows webhook failures (fire-and-forget)", async () => {
    mockEmit.mockRejectedValueOnce(new Error("app down"));
    await expect(
      addLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        line: {
          lineType: "CUSTOM",
          title: "x",
          quantity: 1,
          unitPriceCents: BigInt(100),
        },
      }),
    ).resolves.toMatchObject({ draft: expect.any(Object) });
  });
});

// ═══════════════════════════════════════════════════════════════
// updateLineItem
// ═══════════════════════════════════════════════════════════════

function setUpdateBeforeEachDefaults(
  existingLine: DraftLineItem = makeLineRow({
    id: "dli_existing",
    lineType: "PRODUCT",
    productId: "prod_1",
    productVariantId: "var_1",
    quantity: 2,
    subtotalCents: BigInt(10_000),
  }),
) {
  mockPrisma.draftLineItem.findFirst.mockResolvedValue(existingLine);
  mockTx.draftLineItem.update.mockResolvedValue(existingLine);
  mockTx.draftReservation.updateMany.mockResolvedValue({ count: 0 });
  mockTx.draftReservation.findFirst.mockResolvedValue(null);
  // Default: tx.draftLineItem.findFirst for refresh returns updated row
  mockTx.draftLineItem.findFirst.mockImplementation(async () => existingLine);
}

describe("updateLineItem — metadata-only patches (PRODUCT)", () => {
  beforeEach(() => {
    setUpdateBeforeEachDefaults();
  });

  it("taxable patch alone does NOT re-price (no PMS call)", async () => {
    await updateLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_existing",
      patch: { lineType: "PRODUCT", taxable: false },
    });

    expect(mockCompProd).not.toHaveBeenCalled();
    expect(mockTx.draftLineItem.update).toHaveBeenCalledTimes(1);
    const eventArg = mockTx.draftOrderEvent.create.mock.calls[0][0];
    expect(eventArg.data.metadata.priceChanged).toBe(false);
  });

  it("line-discount fields do NOT trigger re-price", async () => {
    await updateLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_existing",
      patch: {
        lineType: "PRODUCT",
        lineDiscountCents: BigInt(500),
        lineDiscountTitle: "Loyalty",
      },
    });
    expect(mockCompProd).not.toHaveBeenCalled();
    expect(mockTx.draftOrderEvent.create.mock.calls[0][0].data.metadata
      .priceChanged).toBe(false);
  });
});

describe("updateLineItem — re-pricing triggers", () => {
  beforeEach(() => {
    setUpdateBeforeEachDefaults();
    mockCompProd.mockResolvedValue({
      unitPriceCents: BigInt(6_000),
      quantity: 3,
      subtotalCents: BigInt(18_000),
      currency: "SEK",
      sourceRule: "VOLUME",
      appliedCatalogId: "cat_1",
    });
  });

  it("PRODUCT quantity change triggers re-price via computeProductLinePrice", async () => {
    await updateLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_existing",
      patch: { lineType: "PRODUCT", quantity: 3 },
    });

    expect(mockCompProd).toHaveBeenCalledTimes(1);
    expect(mockCompProd.mock.calls[0][0].quantity).toBe(3);

    const updateData = mockTx.draftLineItem.update.mock.calls[0][0].data;
    expect(updateData.unitPriceCents).toBe(BigInt(6_000));
    expect(updateData.subtotalCents).toBe(BigInt(18_000));
    expect(updateData.appliedRule).toBe("VOLUME");
    expect(updateData.appliedCatalogId).toBe("cat_1");

    expect(
      mockTx.draftOrderEvent.create.mock.calls[0][0].data.metadata
        .priceChanged,
    ).toBe(true);
  });

  it("PMS re-price occurs BEFORE $transaction (PMS call not inside tx)", async () => {
    const accLine = makeLineRow({
      id: "dli_acc",
      lineType: "ACCOMMODATION",
      accommodationId: "acc_1",
      checkInDate: new Date("2026-06-01"),
      checkOutDate: new Date("2026-06-04"),
      nights: 3,
      guestCounts: { adults: 2, children: 0, infants: 0 },
      ratePlanId: "rp_1",
    });
    setUpdateBeforeEachDefaults(accLine);
    mockCompAcc.mockResolvedValue({
      unitPriceCents: BigInt(100_000),
      nights: 4,
      subtotalCents: BigInt(400_000),
      currency: "SEK",
      ratePlan: {
        id: "rp_1",
        name: "Flexible",
        cancellationPolicy: null,
      },
      accommodationExternalId: "ext",
      sourceRule: "LIVE_PMS",
      appliedCatalogId: null,
    });
    mockPrisma.accommodation.findFirst.mockResolvedValue({ name: "Deluxe" });

    await updateLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_acc",
      patch: {
        lineType: "ACCOMMODATION",
        checkOutDate: "2026-06-05",
      },
    });

    const pmsOrder = mockCompAcc.mock.invocationCallOrder[0];
    const txOrder = mockPrisma.$transaction.mock.invocationCallOrder[0];
    expect(pmsOrder).toBeLessThan(txOrder);
  });

  it("ACC date patch updates companion DraftReservation snapshot", async () => {
    const accLine = makeLineRow({
      id: "dli_acc",
      lineType: "ACCOMMODATION",
      accommodationId: "acc_1",
      checkInDate: new Date("2026-06-01"),
      checkOutDate: new Date("2026-06-04"),
      guestCounts: { adults: 2, children: 0, infants: 0 },
      ratePlanId: "rp_1",
    });
    setUpdateBeforeEachDefaults(accLine);
    mockCompAcc.mockResolvedValue({
      unitPriceCents: BigInt(100_000),
      nights: 5,
      subtotalCents: BigInt(500_000),
      currency: "SEK",
      ratePlan: {
        id: "rp_1",
        name: "Flex",
        cancellationPolicy: null,
      },
      accommodationExternalId: "ext",
      sourceRule: "LIVE_PMS",
      appliedCatalogId: null,
    });
    mockPrisma.accommodation.findFirst.mockResolvedValue({ name: "Deluxe" });

    await updateLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_acc",
      patch: {
        lineType: "ACCOMMODATION",
        checkInDate: "2026-06-02",
        checkOutDate: "2026-06-07",
      },
    });

    expect(mockTx.draftReservation.updateMany).toHaveBeenCalledTimes(1);
    const resvData = mockTx.draftReservation.updateMany.mock.calls[0][0].data;
    expect((resvData.checkInDate as Date).toISOString().slice(0, 10)).toBe(
      "2026-06-02",
    );
    expect((resvData.checkOutDate as Date).toISOString().slice(0, 10)).toBe(
      "2026-06-07",
    );
  });

  it("CUSTOM quantity + unitPrice change recomputes inline (no external call)", async () => {
    const customLine = makeLineRow({
      id: "dli_custom",
      lineType: "CUSTOM",
      unitPriceCents: BigInt(1_000),
      quantity: 1,
      subtotalCents: BigInt(1_000),
    });
    setUpdateBeforeEachDefaults(customLine);

    await updateLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_custom",
      patch: {
        lineType: "CUSTOM",
        quantity: 3,
        unitPriceCents: BigInt(2_500),
      },
    });

    expect(mockCompAcc).not.toHaveBeenCalled();
    expect(mockCompProd).not.toHaveBeenCalled();
    const updateData = mockTx.draftLineItem.update.mock.calls[0][0].data;
    expect(updateData.unitPriceCents).toBe(BigInt(2_500));
    expect(updateData.subtotalCents).toBe(BigInt(7_500));
  });
});

describe("updateLineItem — mutability + validation", () => {
  beforeEach(() => {
    setUpdateBeforeEachDefaults();
  });

  it("rejects when line not found in draft", async () => {
    mockPrisma.draftLineItem.findFirst.mockResolvedValue(null);
    await expect(
      updateLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "ghost",
        patch: { lineType: "PRODUCT", taxable: false },
      }),
    ).rejects.toThrow(/DraftLineItem not found/);
  });

  it("rejects when patch lineType does not match stored lineType", async () => {
    await expect(
      updateLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "dli_existing",
        patch: { lineType: "CUSTOM", title: "wrong type" },
      }),
    ).rejects.toThrow(/Patch lineType does not match/);
  });

  it("rejects when draft is frozen", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ pricesFrozenAt: new Date() }),
    );
    await expect(
      updateLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "dli_existing",
        patch: { lineType: "PRODUCT", taxable: false },
      }),
    ).rejects.toThrow(/frozen/);
  });
});

// ═══════════════════════════════════════════════════════════════
// removeLineItem
// ═══════════════════════════════════════════════════════════════

describe("removeLineItem — PRODUCT line", () => {
  beforeEach(() => {
    const line = makeLineRow({
      id: "dli_to_remove",
      lineType: "PRODUCT",
      productId: "prod_1",
      productVariantId: "var_1",
    });
    mockPrisma.draftLineItem.findFirst.mockResolvedValue(line);
    mockTx.draftLineItem.delete.mockResolvedValue(line);
    mockTx.draftReservation.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("deletes the line, no DraftReservation touch for non-ACC", async () => {
    const result = await removeLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_to_remove",
    });

    expect(mockTx.draftLineItem.delete).toHaveBeenCalledTimes(1);
    expect(mockTx.draftReservation.deleteMany).not.toHaveBeenCalled();
    expect(result.draft).toBeDefined();
    expect(result.totals).toBeDefined();

    const eventArg = mockTx.draftOrderEvent.create.mock.calls[0][0];
    expect(eventArg.data.type).toBe("LINE_REMOVED");
    expect(eventArg.data.metadata.lineType).toBe("PRODUCT");
  });

  it("emits draft_order.updated platform webhook (changeType=line_removed)", async () => {
    await removeLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_to_remove",
    });
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const call = mockEmit.mock.calls[0][0];
    expect(call.type).toBe("draft_order.updated");
    expect(call.payload.changeType).toBe("line_removed");
  });
});

describe("removeLineItem — ACCOMMODATION line", () => {
  beforeEach(() => {
    const line = makeLineRow({
      id: "dli_acc",
      lineType: "ACCOMMODATION",
      accommodationId: "acc_1",
    });
    mockPrisma.draftLineItem.findFirst.mockResolvedValue(line);
    mockTx.draftLineItem.delete.mockResolvedValue(line);
    mockTx.draftReservation.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("deletes companion DraftReservation BEFORE deleting DraftLineItem (no cascade)", async () => {
    await removeLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_acc",
    });

    expect(mockTx.draftReservation.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockTx.draftLineItem.delete).toHaveBeenCalledTimes(1);

    const resvOrder = mockTx.draftReservation.deleteMany.mock.invocationCallOrder[0];
    const lineOrder = mockTx.draftLineItem.delete.mock.invocationCallOrder[0];
    expect(resvOrder).toBeLessThan(lineOrder);
  });
});

describe("removeLineItem — NO position reordering (gaps allowed)", () => {
  it("does not renumber remaining DraftLineItem positions after remove", async () => {
    const line = makeLineRow({ id: "dli_x", lineType: "PRODUCT" });
    mockPrisma.draftLineItem.findFirst.mockResolvedValue(line);
    mockTx.draftLineItem.delete.mockResolvedValue(line);
    mockTx.draftReservation.deleteMany.mockResolvedValue({ count: 0 });

    await removeLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_x",
    });

    // `update` is never called on other DraftLineItem rows to re-pack positions.
    expect(mockTx.draftLineItem.update).not.toHaveBeenCalled();
  });
});

describe("removeLineItem — mutability", () => {
  it("rejects when line not in draft", async () => {
    mockPrisma.draftLineItem.findFirst.mockResolvedValue(null);
    await expect(
      removeLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "ghost",
      }),
    ).rejects.toThrow(/DraftLineItem not found/);
  });

  it("rejects when draft is INVOICED", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "INVOICED" }),
    );
    await expect(
      removeLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "dli_1",
      }),
    ).rejects.toThrow(/not editable/);
  });
});

// ═══════════════════════════════════════════════════════════════
// FAS 6.5C — hold integration in lines.ts
// ═══════════════════════════════════════════════════════════════

async function loadHoldsMock() {
  const mod = await import("./holds");
  return mod as unknown as {
    releaseHoldForDraftLine: ReturnType<typeof vi.fn>;
  };
}

describe("removeLineItem — hold-aware (ACC line)", () => {
  beforeEach(() => {
    const accLine = makeLineRow({
      id: "dli_acc",
      lineType: "ACCOMMODATION",
      accommodationId: "acc_1",
      productId: null,
    });
    mockPrisma.draftLineItem.findFirst.mockResolvedValue(accLine);
    mockTx.draftLineItem.delete.mockResolvedValue(accLine);
    mockTx.draftReservation.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("PLACED hold: calls releaseHoldForDraftLine BEFORE delete tx, then deletes", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "PLACED",
    } as never);
    const holds = await loadHoldsMock();

    await removeLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_acc",
      actorUserId: "user_1",
    });

    expect(holds.releaseHoldForDraftLine).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      draftLineItemId: "dli_acc",
      source: "line_removed",
      actorUserId: "user_1",
    });
    expect(mockTx.draftLineItem.delete).toHaveBeenCalledTimes(1);
  });

  it("PLACING hold: rejects with HOLD_IN_FLIGHT (cannot remove)", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "PLACING",
    } as never);

    await expect(
      removeLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "dli_acc",
      }),
    ).rejects.toThrow(/in flight/i);

    expect(mockTx.draftLineItem.delete).not.toHaveBeenCalled();
  });

  it("CONFIRMED hold: rejects (hold belongs to an Order)", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "CONFIRMED",
    } as never);

    await expect(
      removeLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "dli_acc",
      }),
    ).rejects.toThrow(/confirmed/i);
  });

  it("NOT_PLACED hold: deletes directly (no release call)", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "NOT_PLACED",
    } as never);
    const holds = await loadHoldsMock();

    await removeLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_acc",
    });

    expect(holds.releaseHoldForDraftLine).not.toHaveBeenCalled();
    expect(mockTx.draftLineItem.delete).toHaveBeenCalledTimes(1);
  });

  it("FAILED hold: deletes directly (no release call — no PMS state)", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "FAILED",
    } as never);
    const holds = await loadHoldsMock();

    await removeLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_acc",
    });

    expect(holds.releaseHoldForDraftLine).not.toHaveBeenCalled();
    expect(mockTx.draftLineItem.delete).toHaveBeenCalledTimes(1);
  });

  it("RELEASED hold: deletes directly", async () => {
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "RELEASED",
    } as never);
    const holds = await loadHoldsMock();

    await removeLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_acc",
    });

    expect(holds.releaseHoldForDraftLine).not.toHaveBeenCalled();
  });
});

describe("updateLineItem — hold-aware reservation patches (ACC line)", () => {
  function useAccLine(): void {
    const accLine = makeLineRow({
      id: "dli_acc",
      lineType: "ACCOMMODATION",
      accommodationId: "acc_1",
      productId: null,
      checkInDate: new Date("2026-06-01"),
      checkOutDate: new Date("2026-06-04"),
      guestCounts: { adults: 2, children: 0, infants: 0 },
      ratePlanId: "rp_1",
    });
    mockPrisma.draftLineItem.findFirst.mockResolvedValue(accLine);
    mockTx.draftLineItem.update.mockResolvedValue(accLine);
    mockTx.draftReservation.updateMany.mockResolvedValue({ count: 0 });
    mockTx.draftReservation.findFirst.mockResolvedValue(null);
    mockTx.draftLineItem.findFirst.mockResolvedValue(accLine);
  }

  it("PLACED + date patch: rejects HOLD_ACTIVE_CANNOT_MODIFY (no PMS call)", async () => {
    useAccLine();
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "PLACED",
    } as never);
    mockCompAcc.mockResolvedValue({
      unitPriceCents: BigInt(100_000),
      nights: 3,
      subtotalCents: BigInt(300_000),
      currency: "SEK",
      ratePlan: { id: "rp_1", name: "Flex", cancellationPolicy: null },
      accommodationExternalId: "ext",
      sourceRule: "LIVE_PMS",
      appliedCatalogId: null,
    });

    await expect(
      updateLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "dli_acc",
        patch: {
          lineType: "ACCOMMODATION",
          checkOutDate: "2026-06-05",
        },
      }),
    ).rejects.toThrow(/active.*release/i);

    expect(mockCompAcc).not.toHaveBeenCalled();
    expect(mockTx.draftLineItem.update).not.toHaveBeenCalled();
  });

  it("PLACING + guestCounts patch: rejects HOLD_IN_FLIGHT", async () => {
    useAccLine();
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "PLACING",
    } as never);

    await expect(
      updateLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "dli_acc",
        patch: {
          lineType: "ACCOMMODATION",
          guestCounts: { adults: 3, children: 0, infants: 0 },
        },
      }),
    ).rejects.toThrow(/in flight/i);
  });

  it("PLACED + metadata-only patch (taxable): ALLOWED (not reservation-relevant)", async () => {
    useAccLine();
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "PLACED",
    } as never);

    await expect(
      updateLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "dli_acc",
        patch: { lineType: "ACCOMMODATION", taxable: false },
      }),
    ).resolves.toBeDefined();

    expect(mockTx.draftLineItem.update).toHaveBeenCalledTimes(1);
  });

  it("PLACED + line-discount patch: ALLOWED", async () => {
    useAccLine();
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "PLACED",
    } as never);

    await expect(
      updateLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "dli_acc",
        patch: {
          lineType: "ACCOMMODATION",
          lineDiscountCents: BigInt(500),
        },
      }),
    ).resolves.toBeDefined();
  });

  it("NOT_PLACED + date patch: proceeds normally (re-prices)", async () => {
    useAccLine();
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "NOT_PLACED",
    } as never);
    mockCompAcc.mockResolvedValue({
      unitPriceCents: BigInt(100_000),
      nights: 4,
      subtotalCents: BigInt(400_000),
      currency: "SEK",
      ratePlan: { id: "rp_1", name: "Flex", cancellationPolicy: null },
      accommodationExternalId: "ext",
      sourceRule: "LIVE_PMS",
      appliedCatalogId: null,
    });
    mockPrisma.accommodation.findFirst.mockResolvedValue({ name: "Deluxe" });

    await updateLineItem({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      lineItemId: "dli_acc",
      patch: {
        lineType: "ACCOMMODATION",
        checkOutDate: "2026-06-05",
      },
    });

    expect(mockCompAcc).toHaveBeenCalledTimes(1);
    expect(mockTx.draftLineItem.update).toHaveBeenCalledTimes(1);
  });

  it("CONFIRMED + reservation-relevant patch: rejects", async () => {
    useAccLine();
    mockPrisma.draftReservation.findFirst.mockResolvedValue({
      holdState: "CONFIRMED",
    } as never);

    await expect(
      updateLineItem({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        lineItemId: "dli_acc",
        patch: {
          lineType: "ACCOMMODATION",
          ratePlanId: "rp_other",
        },
      }),
    ).rejects.toThrow(/confirmed/i);
  });
});
