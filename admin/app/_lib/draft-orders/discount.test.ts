import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DraftOrder, DraftLineItem } from "@prisma/client";
import type { CalculatedDiscountImpact } from "@/app/_lib/discounts/apply";

// ── Mocks ────────────────────────────────────────────────────────

const mockTx = {
  draftOrder: { findFirst: vi.fn(), update: vi.fn() },
  draftOrderEvent: { create: vi.fn() },
};

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  accommodation: { findMany: vi.fn() },
  companyLocation: { findFirst: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockEmit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/apps/webhooks", () => ({ emitPlatformEvent: mockEmit }));

const mockCalculateDiscountImpact = vi.fn();
vi.mock("@/app/_lib/discounts/apply", () => ({
  calculateDiscountImpact: (...args: unknown[]) =>
    mockCalculateDiscountImpact(...args),
}));

const mockComputeAndPersist = vi.fn();
vi.mock("./calculator", async () => {
  const actual = await vi.importActual<typeof import("./calculator")>(
    "./calculator",
  );
  return {
    ...actual,
    computeAndPersistDraftTotalsInTx: mockComputeAndPersist,
  };
});

const { applyDiscountCode, removeDiscountCode, previewApplyDiscountCode } =
  await import("./discount");

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
    contactEmail: "guest@test.com",
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

function makeValidImpact(
  overrides: Partial<Extract<CalculatedDiscountImpact, { valid: true }>> = {},
): Extract<CalculatedDiscountImpact, { valid: true }> {
  return {
    valid: true,
    discount: {
      id: "disc_1",
      valueType: "PERCENTAGE",
    } as never,
    discountCodeId: "code_1",
    discountCodeValue: "SUMMER15",
    discountAmount: 1500,
    allocations: { scope: "ORDER", amount: 1500 },
    title: "Summer Sale",
    description: "15% off",
    buyerKind: "GUEST",
    ...overrides,
  };
}

function makeValidTotals(overrides: Record<string, unknown> = {}) {
  return {
    source: "COMPUTED" as const,
    frozenAt: null,
    currency: "SEK",
    subtotalCents: BigInt(10_000),
    totalLineDiscountCents: BigInt(0),
    orderDiscountCents: BigInt(1_500),
    totalDiscountCents: BigInt(1_500),
    taxCents: BigInt(0),
    shippingCents: BigInt(0),
    totalCents: BigInt(8_500),
    perLine: [],
    warnings: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx),
  );
  mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockTx.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockTx.draftOrder.update.mockResolvedValue(makeDraft());
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  mockComputeAndPersist.mockResolvedValue(makeValidTotals());
  mockEmit.mockResolvedValue(undefined);
  mockPrisma.accommodation.findMany.mockResolvedValue([]);
  mockPrisma.companyLocation.findFirst.mockResolvedValue(null);
});

// ═══════════════════════════════════════════════════════════════
// applyDiscountCode
// ═══════════════════════════════════════════════════════════════

describe("applyDiscountCode — happy path", () => {
  it("validates code pre-tx, persists fields, emits DISCOUNT_APPLIED, returns summary", async () => {
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    const result = await applyDiscountCode({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      code: "SUMMER15",
      actorUserId: "user_1",
    });

    // Pre-tx validation ran
    expect(mockCalculateDiscountImpact).toHaveBeenCalledTimes(1);
    const calledWith = mockCalculateDiscountImpact.mock.calls[0][0];
    expect(calledWith.code).toBe("SUMMER15");
    expect(calledWith.tenantId).toBe("tenant_1");

    // Discount fields persisted
    expect(mockTx.draftOrder.update).toHaveBeenCalledTimes(1);
    const updateData = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(updateData.appliedDiscountId).toBe("disc_1");
    expect(updateData.appliedDiscountCode).toBe("SUMMER15");
    expect(updateData.appliedDiscountAmount).toBe(BigInt(1500));
    expect(updateData.appliedDiscountType).toBe("PERCENTAGE");

    // Event emitted inside tx
    expect(mockTx.draftOrderEvent.create).toHaveBeenCalledTimes(1);
    const evData = mockTx.draftOrderEvent.create.mock.calls[0][0].data;
    expect(evData.type).toBe("DISCOUNT_APPLIED");
    expect(evData.metadata.code).toBe("SUMMER15");
    expect(evData.metadata.discountAmountCents).toBe("1500");

    // Totals recomputed
    expect(mockComputeAndPersist).toHaveBeenCalledTimes(1);

    // Platform webhook
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0].type).toBe("draft_order.updated");
    expect(mockEmit.mock.calls[0][0].payload.changeType).toBe("discount_applied");

    // Result shape
    expect(result.discount.code).toBe("SUMMER15");
    expect(result.discount.discountAmountCents).toBe(BigInt(1500));
    expect(result.discount.valueType).toBe("PERCENTAGE");
  });

  it("trims and validates code (Zod transform)", async () => {
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    await applyDiscountCode({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      code: "  SUMMER15  ",
    });

    expect(mockCalculateDiscountImpact.mock.calls[0][0].code).toBe("SUMMER15");
  });

  it("pre-tx validation runs BEFORE tx opens", async () => {
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    await applyDiscountCode({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      code: "SUMMER15",
    });

    const validateOrder = mockCalculateDiscountImpact.mock.invocationCallOrder[0];
    const txOrder = mockPrisma.$transaction.mock.invocationCallOrder[0];
    expect(validateOrder).toBeLessThan(txOrder);
  });
});

describe("applyDiscountCode — invalid codes", () => {
  const cases: Array<[string, string]> = [
    ["DISCOUNT_NOT_FOUND", "unknown code"],
    ["DISCOUNT_EXPIRED", "expired"],
    ["DISCOUNT_DISABLED", "disabled"],
    ["USAGE_LIMIT_REACHED", "global limit hit"],
    ["CODE_USAGE_LIMIT_REACHED", "code-level limit hit"],
    ["CODE_INACTIVE", "code row inactive"],
    ["CONDITION_NOT_MET", "conditions failed"],
    ["ONCE_PER_CUSTOMER_VIOLATED", "repeat use"],
    ["NOT_ELIGIBLE_FOR_COMPANIES", "COMPANY blocked"],
    ["TENANT_DISCOUNTS_DISABLED", "tenant toggle off"],
  ];

  for (const [errorCode, label] of cases) {
    it(`throws ValidationError on ${errorCode} (${label})`, async () => {
      mockCalculateDiscountImpact.mockResolvedValue({
        valid: false,
        error: errorCode,
      });

      await expect(
        applyDiscountCode({
          tenantId: "tenant_1",
          draftOrderId: "draft_1",
          code: "BAD",
        }),
      ).rejects.toThrow(/not eligible/i);

      // Tx not opened on early rejection
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  }
});

describe("applyDiscountCode — race safety (DISCOUNT_INVALID warning)", () => {
  it("rolls back tx with ConflictError when calculator warnings include DISCOUNT_INVALID", async () => {
    // Pre-tx: validation passes
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());
    // Tx-internal calculator finds the code invalidated (race)
    mockComputeAndPersist.mockResolvedValue(
      makeValidTotals({ warnings: ["DISCOUNT_INVALID"] }),
    );

    await expect(
      applyDiscountCode({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        code: "SUMMER15",
      }),
    ).rejects.toThrow(/became invalid/i);

    // Platform webhook NOT emitted on failure
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe("applyDiscountCode — mutability guards", () => {
  it("rejects when draft not found", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);

    await expect(
      applyDiscountCode({
        tenantId: "tenant_1",
        draftOrderId: "ghost",
        code: "X",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects INVOICED draft", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "INVOICED" }),
    );
    await expect(
      applyDiscountCode({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        code: "X",
      }),
    ).rejects.toThrow(/not editable/i);
  });

});

describe("applyDiscountCode — buyer context threading", () => {
  it("COMPANY buyer threads companyLocationId + buyerKind into calculateDiscountImpact", async () => {
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
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    await applyDiscountCode({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      code: "B2B10",
    });

    const ctx = mockCalculateDiscountImpact.mock.calls[0][0].ctx;
    expect(ctx.buyerKind).toBe("COMPANY");
    expect(ctx.companyLocationId).toBe("loc_1");
  });
});

// ═══════════════════════════════════════════════════════════════
// removeDiscountCode
// ═══════════════════════════════════════════════════════════════

describe("removeDiscountCode — happy path", () => {
  beforeEach(() => {
    const appliedDraft = makeDraft({
      appliedDiscountId: "disc_1",
      appliedDiscountCode: "SUMMER15",
      appliedDiscountAmount: BigInt(1500),
      appliedDiscountType: "PERCENTAGE",
    });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(appliedDraft);
    mockTx.draftOrder.findFirst.mockResolvedValue(appliedDraft);
  });

  it("nulls all 4 applied-discount fields, emits DISCOUNT_REMOVED, recomputes", async () => {
    await removeDiscountCode({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(mockTx.draftOrder.update).toHaveBeenCalledTimes(1);
    const data = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(data.appliedDiscountId).toBeNull();
    expect(data.appliedDiscountCode).toBeNull();
    expect(data.appliedDiscountAmount).toBeNull();
    expect(data.appliedDiscountType).toBeNull();

    const evData = mockTx.draftOrderEvent.create.mock.calls[0][0].data;
    expect(evData.type).toBe("DISCOUNT_REMOVED");
    expect(evData.metadata.previousCode).toBe("SUMMER15");
    expect(evData.metadata.previousAmountCents).toBe("1500");

    expect(mockComputeAndPersist).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0].payload.changeType).toBe("discount_removed");
  });
});

describe("removeDiscountCode — no-discount rejection", () => {
  it("throws NO_DISCOUNT_TO_REMOVE when no code applied (operator Q — not idempotent)", async () => {
    // Default draft has appliedDiscountCode = null
    await expect(
      removeDiscountCode({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
      }),
    ).rejects.toThrow(/no applied discount/i);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// previewApplyDiscountCode
// ═══════════════════════════════════════════════════════════════

describe("previewApplyDiscountCode — valid code", () => {
  it("returns projected totals WITHOUT writing anything", async () => {
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    const result = await previewApplyDiscountCode({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      code: "SUMMER15",
    });

    // Result shape
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("expected valid");
    expect(result.impact.code).toBe("SUMMER15");
    expect(result.impact.discountAmountCents).toBe(BigInt(1500));
    expect(result.projectedTotals.source).toBe("COMPUTED");

    // Zero writes
    expect(mockTx.draftOrder.update).not.toHaveBeenCalled();
    expect(mockTx.draftOrderEvent.create).not.toHaveBeenCalled();
    expect(mockComputeAndPersist).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();

    // No webhook
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe("previewApplyDiscountCode — invalid code", () => {
  it("returns { valid: false, error } without error thrown", async () => {
    mockCalculateDiscountImpact.mockResolvedValue({
      valid: false,
      error: "DISCOUNT_EXPIRED",
    });

    const result = await previewApplyDiscountCode({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      code: "OLD",
    });

    expect(result).toEqual({ valid: false, error: "DISCOUNT_EXPIRED" });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("previewApplyDiscountCode — mutability guards", () => {
  it("throws on INVOICED draft", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "INVOICED" }),
    );
    await expect(
      previewApplyDiscountCode({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
        code: "X",
      }),
    ).rejects.toThrow(/not editable/i);
  });

  it("throws NotFoundError when draft missing", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
    await expect(
      previewApplyDiscountCode({
        tenantId: "tenant_1",
        draftOrderId: "ghost",
        code: "X",
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("previewApplyDiscountCode — accommodation tax lookup", () => {
  it("resolves accommodation tax rates for projected totals (ACC lines present)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        taxesIncluded: false,
        lineItems: [
          makeLine({
            id: "l_acc",
            lineType: "ACCOMMODATION",
            accommodationId: "acc_1",
            productId: null,
          }),
        ],
      }),
    );
    mockPrisma.accommodation.findMany.mockResolvedValue([
      { id: "acc_1", taxRate: 1200 },
    ]);
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    const result = await previewApplyDiscountCode({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      code: "X",
    });

    expect(mockPrisma.accommodation.findMany).toHaveBeenCalledTimes(1);
    expect(result.valid).toBe(true);
  });

  it("honours CompanyLocation.taxSetting=EXEMPT in projected totals", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        buyerKind: "COMPANY",
        companyLocationId: "loc_1",
        taxesIncluded: false,
      }),
    );
    mockPrisma.companyLocation.findFirst.mockResolvedValue({
      taxSetting: "EXEMPT",
    });
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    await previewApplyDiscountCode({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      code: "X",
    });

    expect(mockPrisma.companyLocation.findFirst).toHaveBeenCalledTimes(1);
  });
});
