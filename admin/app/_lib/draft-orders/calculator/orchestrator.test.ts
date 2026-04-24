import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CalculatedDiscountImpact } from "@/app/_lib/discounts/apply";

// ── Mocks ────────────────────────────────────────────────────

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  accommodation: { findMany: vi.fn() },
  companyLocation: { findFirst: vi.fn() },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockCalculateDiscountImpact = vi.fn();
vi.mock("@/app/_lib/discounts/apply", () => ({
  calculateDiscountImpact: (...args: unknown[]) =>
    mockCalculateDiscountImpact(...args),
}));

// Tax stub always returns 0 — no mock needed; identity pass-through.

// Import after mocks.
const { computeDraftTotals } = await import("./orchestrator");

// ── Fixtures ────────────────────────────────────────────────────

function makeRawLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "dli_1",
    lineType: "PRODUCT" as const,
    accommodationId: null,
    productId: "prod_1",
    checkInDate: null,
    checkOutDate: null,
    quantity: 1,
    unitPriceCents: BigInt(10_000),
    subtotalCents: BigInt(10_000),
    lineDiscountCents: BigInt(0),
    lineDiscountType: null,
    lineDiscountValue: null,
    taxable: true,
    taxCode: null,
    taxAmountCents: BigInt(0),
    totalCents: BigInt(10_000),
    ...overrides,
  };
}

function makeRawDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "OPEN",
    buyerKind: "GUEST" as const,
    companyLocationId: null,
    contactEmail: "guest@test.com",
    guestAccountId: null,
    currency: "SEK",
    taxesIncluded: true,
    shippingCents: BigInt(0),
    pricesFrozenAt: null,
    appliedDiscountCode: null,
    subtotalCents: BigInt(0),
    orderDiscountCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(0),
    lineItems: [makeRawLine()],
    ...overrides,
  };
}

function makeValidImpact(
  overrides: Partial<Extract<CalculatedDiscountImpact, { valid: true }>> = {},
): Extract<CalculatedDiscountImpact, { valid: true }> {
  return {
    valid: true,
    discount: {} as never,
    discountCodeId: "code_1",
    discountCodeValue: "SUMMER",
    discountAmount: 1000,
    allocations: { scope: "ORDER", amount: 1000 },
    title: "Summer",
    description: null,
    buyerKind: "GUEST",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.accommodation.findMany.mockResolvedValue([]);
  mockPrisma.companyLocation.findFirst.mockResolvedValue(null);
});

// ── Draft not found ─────────────────────────────────────────────

describe("computeDraftTotals — draft not found", () => {
  it("throws NotFoundError when no DraftOrder matches", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
    await expect(
      computeDraftTotals("tenant_1", "ghost"),
    ).rejects.toThrow(/DraftOrder not found/);
  });
});

// ── Happy path — no discount, no frozen ─────────────────────────

describe("computeDraftTotals — happy path", () => {
  it("returns COMPUTED source with core totals for an open draft", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({ taxesIncluded: true }),
    );

    const result = await computeDraftTotals("tenant_1", "draft_1");

    expect(result.source).toBe("COMPUTED");
    expect(result.frozenAt).toBeNull();
    expect(result.subtotalCents).toBe(BigInt(10_000));
    expect(result.totalCents).toBe(BigInt(10_000)); // no discount, no shipping, no tax (stub)
    expect(mockCalculateDiscountImpact).not.toHaveBeenCalled();
  });
});

// ── tx injection (FAS 6.5A) ─────────────────────────────────────

describe("computeDraftTotals — tx injection", () => {
  it("routes all reads through the passed tx, never touching global prisma", async () => {
    const mockTx = {
      draftOrder: {
        findFirst: vi
          .fn()
          .mockResolvedValue(makeRawDraft({ taxesIncluded: false })),
      },
      accommodation: { findMany: vi.fn().mockResolvedValue([]) },
      companyLocation: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    const result = await computeDraftTotals(
      "tenant_1",
      "draft_1",
      {},
      mockTx as never,
    );

    expect(result.source).toBe("COMPUTED");
    expect(mockTx.draftOrder.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.draftOrder.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to global prisma when tx is omitted (backward-compat)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({ taxesIncluded: true }),
    );
    await computeDraftTotals("tenant_1", "draft_1");
    expect(mockPrisma.draftOrder.findFirst).toHaveBeenCalledTimes(1);
  });
});

// ── Frozen short-circuit (audit §6) ─────────────────────────────

describe("computeDraftTotals — frozen snapshot short-circuit", () => {
  it("returns FROZEN_SNAPSHOT with frozenAt populated when pricesFrozenAt is set", async () => {
    const frozenAt = new Date("2026-04-01T10:00:00Z");
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        pricesFrozenAt: frozenAt,
        subtotalCents: BigInt(99_999),
        orderDiscountCents: BigInt(1_234),
        totalTaxCents: BigInt(2_000),
        totalCents: BigInt(100_765),
        lineItems: [
          makeRawLine({
            subtotalCents: BigInt(99_999),
            lineDiscountCents: BigInt(500),
            taxAmountCents: BigInt(2_000),
            totalCents: BigInt(100_765),
          }),
        ],
      }),
    );

    const result = await computeDraftTotals("tenant_1", "draft_1");

    expect(result.source).toBe("FROZEN_SNAPSHOT");
    expect(result.frozenAt?.toISOString()).toBe(frozenAt.toISOString());
    // Values pulled from persisted snapshot, not recomputed.
    expect(result.subtotalCents).toBe(BigInt(99_999));
    expect(result.orderDiscountCents).toBe(BigInt(1_234));
    expect(result.taxCents).toBe(BigInt(2_000));
    expect(result.totalCents).toBe(BigInt(100_765));
    expect(result.perLine[0].totalCents).toBe(BigInt(100_765));
    // Core is bypassed entirely; discount engine not called.
    expect(mockCalculateDiscountImpact).not.toHaveBeenCalled();
  });

  it("bypasses snapshot when ignorePricesFrozenAt=true (preview mode)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        pricesFrozenAt: new Date("2026-04-01T10:00:00Z"),
        subtotalCents: BigInt(99_999), // persisted stale value
        lineItems: [makeRawLine()], // live line = 10_000
      }),
    );

    const result = await computeDraftTotals("tenant_1", "draft_1", {
      ignorePricesFrozenAt: true,
    });

    expect(result.source).toBe("COMPUTED");
    expect(result.frozenAt).toBeNull();
    expect(result.subtotalCents).toBe(BigInt(10_000)); // live, not persisted
  });
});

// ── companyTaxExempt (audit §5) ─────────────────────────────────

describe("computeDraftTotals — companyTaxExempt (EXEMPT honoured)", () => {
  it("COMPANY + taxSetting=EXEMPT zeroes tax regardless of rate", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        buyerKind: "COMPANY",
        companyLocationId: "loc_1",
        taxesIncluded: false, // B2B convention — add-on tax
        lineItems: [
          makeRawLine({
            lineType: "ACCOMMODATION",
            accommodationId: "acc_1",
            productId: null,
            subtotalCents: BigInt(10_000),
            unitPriceCents: BigInt(10_000),
          }),
        ],
      }),
    );
    mockPrisma.accommodation.findMany.mockResolvedValue([
      { id: "acc_1", taxRate: 1200 }, // 12%
    ]);
    mockPrisma.companyLocation.findFirst.mockResolvedValue({
      taxSetting: "EXEMPT",
    });

    const result = await computeDraftTotals("tenant_1", "draft_1");

    expect(result.taxCents).toBe(BigInt(0));
    expect(result.totalCents).toBe(BigInt(10_000)); // no tax added
  });

  it("COMPANY + taxSetting=COLLECT charges tax normally", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        buyerKind: "COMPANY",
        companyLocationId: "loc_1",
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            lineType: "ACCOMMODATION",
            accommodationId: "acc_1",
            productId: null,
            subtotalCents: BigInt(10_000),
            unitPriceCents: BigInt(10_000),
          }),
        ],
      }),
    );
    mockPrisma.accommodation.findMany.mockResolvedValue([
      { id: "acc_1", taxRate: 1200 },
    ]);
    mockPrisma.companyLocation.findFirst.mockResolvedValue({
      taxSetting: "COLLECT",
    });

    const result = await computeDraftTotals("tenant_1", "draft_1");

    // Tax charged: round(10000 × 1200 / 10000) = 1200
    expect(result.taxCents).toBe(BigInt(1_200));
    expect(result.totalCents).toBe(BigInt(11_200));
  });

  it("COMPANY + taxSetting=COLLECT_UNLESS_EXEMPT treated as COLLECT (6.4 scope)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        buyerKind: "COMPANY",
        companyLocationId: "loc_1",
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            lineType: "ACCOMMODATION",
            accommodationId: "acc_1",
            productId: null,
            subtotalCents: BigInt(10_000),
            unitPriceCents: BigInt(10_000),
          }),
        ],
      }),
    );
    mockPrisma.accommodation.findMany.mockResolvedValue([
      { id: "acc_1", taxRate: 1200 },
    ]);
    mockPrisma.companyLocation.findFirst.mockResolvedValue({
      taxSetting: "COLLECT_UNLESS_EXEMPT",
    });

    const result = await computeDraftTotals("tenant_1", "draft_1");

    expect(result.taxCents).toBe(BigInt(1_200)); // Treated as COLLECT
  });

  it("GUEST buyer never triggers EXEMPT lookup", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({ buyerKind: "GUEST", companyLocationId: null }),
    );

    await computeDraftTotals("tenant_1", "draft_1");

    expect(mockPrisma.companyLocation.findFirst).not.toHaveBeenCalled();
  });
});

// ── Accommodation tax rate resolution ───────────────────────────

describe("computeDraftTotals — tax rate resolution", () => {
  it("ACCOMMODATION line uses Accommodation.taxRate", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            id: "dli_acc",
            lineType: "ACCOMMODATION",
            accommodationId: "acc_42",
            productId: null,
            subtotalCents: BigInt(10_000),
            unitPriceCents: BigInt(10_000),
          }),
        ],
      }),
    );
    mockPrisma.accommodation.findMany.mockResolvedValue([
      { id: "acc_42", taxRate: 1200 },
    ]);

    const result = await computeDraftTotals("tenant_1", "draft_1");

    // round(10000 × 1200 / 10000) = 1200
    expect(result.taxCents).toBe(BigInt(1_200));
  });

  it("line.taxable=false always forces 0 regardless of Accommodation.taxRate", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            id: "dli_exempt",
            lineType: "ACCOMMODATION",
            accommodationId: "acc_1",
            productId: null,
            taxable: false, // kill switch
          }),
        ],
      }),
    );
    mockPrisma.accommodation.findMany.mockResolvedValue([
      { id: "acc_1", taxRate: 2500 },
    ]);

    const result = await computeDraftTotals("tenant_1", "draft_1");

    expect(result.taxCents).toBe(BigInt(0));
  });

  it("PRODUCT line uses getTaxRate() stub (0 today)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({ taxesIncluded: false }),
    );

    const result = await computeDraftTotals("tenant_1", "draft_1");

    expect(result.taxCents).toBe(BigInt(0));
  });

  it("accommodation with no Accommodation row → 0 bp fallback", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            lineType: "ACCOMMODATION",
            accommodationId: "acc_missing",
            productId: null,
          }),
        ],
      }),
    );
    mockPrisma.accommodation.findMany.mockResolvedValue([]); // none matched

    const result = await computeDraftTotals("tenant_1", "draft_1");

    expect(result.taxCents).toBe(BigInt(0));
  });
});

// ── Discount code path ──────────────────────────────────────────

describe("computeDraftTotals — applied discount code", () => {
  it("valid discount impact feeds into core output", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        appliedDiscountCode: "SUMMER15",
        taxesIncluded: false,
        lineItems: [makeRawLine({ subtotalCents: BigInt(10_000) })],
      }),
    );
    mockCalculateDiscountImpact.mockResolvedValue(
      makeValidImpact({
        discountAmount: 1500,
        allocations: { scope: "ORDER", amount: 1500 },
      }),
    );

    const result = await computeDraftTotals("tenant_1", "draft_1");

    expect(result.orderDiscountCents).toBe(BigInt(1_500));
    expect(result.warnings).not.toContain("DISCOUNT_INVALID");
    expect(mockCalculateDiscountImpact).toHaveBeenCalledTimes(1);
    // Orchestrator passed the correct code
    const callArg = mockCalculateDiscountImpact.mock.calls[0][0];
    expect(callArg.code).toBe("SUMMER15");
    expect(callArg.tenantId).toBe("tenant_1");
  });

  it("rejected discount emits DISCOUNT_INVALID warning and runs core without discount", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        appliedDiscountCode: "EXPIRED",
        taxesIncluded: false,
        lineItems: [makeRawLine({ subtotalCents: BigInt(10_000) })],
      }),
    );
    mockCalculateDiscountImpact.mockResolvedValue({
      valid: false,
      error: "DISCOUNT_EXPIRED",
    });

    const result = await computeDraftTotals("tenant_1", "draft_1");

    expect(result.warnings).toContain("DISCOUNT_INVALID");
    expect(result.orderDiscountCents).toBe(BigInt(0));
    expect(result.subtotalCents).toBe(BigInt(10_000));
  });

  it("COMPANY buyer → calculateDiscountImpact receives buyerKind=COMPANY", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        buyerKind: "COMPANY",
        companyLocationId: "loc_1",
        appliedDiscountCode: "B2B10",
      }),
    );
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    await computeDraftTotals("tenant_1", "draft_1");

    const ctx = mockCalculateDiscountImpact.mock.calls[0][0].ctx;
    expect(ctx.buyerKind).toBe("COMPANY");
    expect(ctx.companyLocationId).toBe("loc_1");
  });

  it("WALK_IN buyer → calculateDiscountImpact receives buyerKind=GUEST (audit §8)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        buyerKind: "WALK_IN",
        appliedDiscountCode: "ANY",
      }),
    );
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    await computeDraftTotals("tenant_1", "draft_1");

    const ctx = mockCalculateDiscountImpact.mock.calls[0][0].ctx;
    expect(ctx.buyerKind).toBe("GUEST");
  });

  it("orderAmount and lineItems fed to discount engine use post-manual-discount nets", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        appliedDiscountCode: "SUMMER15",
        lineItems: [
          makeRawLine({
            id: "l1",
            subtotalCents: BigInt(10_000),
            lineDiscountCents: BigInt(2_000), // staff −2000
          }),
        ],
      }),
    );
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    await computeDraftTotals("tenant_1", "draft_1");

    const callArg = mockCalculateDiscountImpact.mock.calls[0][0];
    expect(callArg.ctx.orderAmount).toBe(8_000); // 10000 − 2000 manual
    expect(callArg.lineItems[0].totalAmount).toBe(8_000);
  });

  it("does NOT call calculateDiscountImpact with auto:true (CODE-path only — audit Q1-open)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({ appliedDiscountCode: null }),
    );

    await computeDraftTotals("tenant_1", "draft_1");

    // No code, no call. AUTO is never attempted on drafts.
    expect(mockCalculateDiscountImpact).not.toHaveBeenCalled();
  });
});

// ── Stay window derivation (for discount ctx) ──────────────────

describe("computeDraftTotals — stay window for discount ctx", () => {
  it("spans all accommodation lines — earliest check-in, latest check-out", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        appliedDiscountCode: "SUMMER",
        lineItems: [
          makeRawLine({
            id: "a",
            lineType: "ACCOMMODATION",
            accommodationId: "acc_1",
            productId: null,
            checkInDate: new Date("2026-06-05"),
            checkOutDate: new Date("2026-06-08"),
          }),
          makeRawLine({
            id: "b",
            lineType: "ACCOMMODATION",
            accommodationId: "acc_2",
            productId: null,
            checkInDate: new Date("2026-06-01"),
            checkOutDate: new Date("2026-06-10"),
          }),
        ],
      }),
    );
    mockPrisma.accommodation.findMany.mockResolvedValue([
      { id: "acc_1", taxRate: 1200 },
      { id: "acc_2", taxRate: 1200 },
    ]);
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    await computeDraftTotals("tenant_1", "draft_1");

    const ctx = mockCalculateDiscountImpact.mock.calls[0][0].ctx;
    expect(ctx.checkInDate?.toISOString()).toBe(
      new Date("2026-06-01").toISOString(),
    );
    expect(ctx.checkOutDate?.toISOString()).toBe(
      new Date("2026-06-10").toISOString(),
    );
    expect(ctx.nights).toBe(9);
  });

  it("product-only draft → nights=0, dates undefined", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({ appliedDiscountCode: "ANY" }),
    );
    mockCalculateDiscountImpact.mockResolvedValue(makeValidImpact());

    await computeDraftTotals("tenant_1", "draft_1");

    const ctx = mockCalculateDiscountImpact.mock.calls[0][0].ctx;
    expect(ctx.nights).toBe(0);
    expect(ctx.checkInDate).toBeUndefined();
    expect(ctx.checkOutDate).toBeUndefined();
  });
});
