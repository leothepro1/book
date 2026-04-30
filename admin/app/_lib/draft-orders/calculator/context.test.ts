import { describe, it, expect, vi } from "vitest";
import {
  buildDiscountEngineInput,
  buildDraftTotalsInput,
  deriveStayWindow,
  resolveLineTaxRateBp,
} from "./context";
import type { RawDraftLineItem, RawDraftOrder } from "./context";

vi.mock("@/app/_lib/orders/tax", () => ({
  getTaxRate: () => 0, // matches the stub's behaviour
}));

// ── Fixtures ────────────────────────────────────────────────────

function makeLine(overrides: Partial<RawDraftLineItem> = {}): RawDraftLineItem {
  return {
    id: "dli_1",
    lineType: "PRODUCT",
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

function makeDraft(overrides: Partial<RawDraftOrder> = {}): RawDraftOrder {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "OPEN",
    buyerKind: "GUEST",
    companyLocationId: null,
    contactEmail: "guest@test.com",
    guestAccountId: null,
    currency: "SEK",
    taxesIncluded: true,
    shippingCents: BigInt(0),
    version: 1,
    appliedDiscountCode: null,
    subtotalCents: BigInt(0),
    orderDiscountCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(0),
    lineItems: [],
    ...overrides,
  };
}

// ── deriveStayWindow ───────────────────────────────────────────

describe("deriveStayWindow", () => {
  it("product-only draft → undefined dates, 0 nights", () => {
    const w = deriveStayWindow([makeLine()]);
    expect(w.checkInDate).toBeUndefined();
    expect(w.checkOutDate).toBeUndefined();
    expect(w.nights).toBe(0);
  });

  it("single ACC line → exact window", () => {
    const w = deriveStayWindow([
      makeLine({
        lineType: "ACCOMMODATION",
        accommodationId: "acc_1",
        checkInDate: new Date("2026-06-01"),
        checkOutDate: new Date("2026-06-04"),
      }),
    ]);
    expect(w.checkInDate?.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(w.checkOutDate?.toISOString().slice(0, 10)).toBe("2026-06-04");
    expect(w.nights).toBe(3);
  });

  it("multi-ACC window is earliest-in / latest-out", () => {
    const w = deriveStayWindow([
      makeLine({
        id: "a",
        lineType: "ACCOMMODATION",
        accommodationId: "acc_a",
        checkInDate: new Date("2026-06-05"),
        checkOutDate: new Date("2026-06-08"),
      }),
      makeLine({
        id: "b",
        lineType: "ACCOMMODATION",
        accommodationId: "acc_b",
        checkInDate: new Date("2026-06-01"),
        checkOutDate: new Date("2026-06-10"),
      }),
    ]);
    expect(w.checkInDate?.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(w.checkOutDate?.toISOString().slice(0, 10)).toBe("2026-06-10");
    expect(w.nights).toBe(9);
  });

  it("ignores ACC lines missing one of the dates", () => {
    const w = deriveStayWindow([
      makeLine({
        lineType: "ACCOMMODATION",
        accommodationId: "acc_1",
        checkInDate: new Date("2026-06-01"),
        checkOutDate: null, // malformed
      }),
    ]);
    expect(w.checkInDate).toBeUndefined();
    expect(w.nights).toBe(0);
  });
});

// ── resolveLineTaxRateBp ───────────────────────────────────────

describe("resolveLineTaxRateBp", () => {
  it("returns 0 when line.taxable=false (kill switch)", () => {
    const rate = resolveLineTaxRateBp(
      makeLine({
        lineType: "ACCOMMODATION",
        accommodationId: "acc_1",
        taxable: false,
      }),
      new Map([["acc_1", 2500]]),
    );
    expect(rate).toBe(0);
  });

  it("ACCOMMODATION uses Accommodation.taxRate from the map", () => {
    const rate = resolveLineTaxRateBp(
      makeLine({
        lineType: "ACCOMMODATION",
        accommodationId: "acc_1",
      }),
      new Map([["acc_1", 1200]]),
    );
    expect(rate).toBe(1200);
  });

  it("ACCOMMODATION with no map entry → 0 fallback", () => {
    const rate = resolveLineTaxRateBp(
      makeLine({
        lineType: "ACCOMMODATION",
        accommodationId: "acc_missing",
      }),
      new Map(),
    );
    expect(rate).toBe(0);
  });

  it("PRODUCT uses getTaxRate stub (returns 0 today)", () => {
    const rate = resolveLineTaxRateBp(makeLine({ lineType: "PRODUCT" }), new Map());
    expect(rate).toBe(0);
  });

  it("CUSTOM uses getTaxRate stub (returns 0 today)", () => {
    const rate = resolveLineTaxRateBp(makeLine({ lineType: "CUSTOM" }), new Map());
    expect(rate).toBe(0);
  });
});

// ── buildDiscountEngineInput ───────────────────────────────────

describe("buildDiscountEngineInput — ctx assembly", () => {
  it("orderAmount = sum(subtotal − lineDiscount) across lines, clamped to ≥ 0", () => {
    const draft = makeDraft();
    const lines = [
      makeLine({ id: "a", subtotalCents: BigInt(10_000), lineDiscountCents: BigInt(2_000) }),
      makeLine({ id: "b", subtotalCents: BigInt(5_000), lineDiscountCents: BigInt(0) }),
    ];
    const { ctx } = buildDiscountEngineInput(draft, lines);
    expect(ctx.orderAmount).toBe(13_000);
  });

  it("productIds are distinct + prefer productId, fall back to accommodationId", () => {
    const draft = makeDraft();
    const lines = [
      makeLine({ id: "a", productId: "p_1" }),
      makeLine({ id: "b", productId: "p_1" }), // duplicate
      makeLine({
        id: "c",
        lineType: "ACCOMMODATION",
        productId: null,
        accommodationId: "acc_x",
      }),
    ];
    const { ctx } = buildDiscountEngineInput(draft, lines);
    expect(ctx.productIds.sort()).toEqual(["acc_x", "p_1"]);
  });

  it("itemCount = sum(quantity) with negatives clamped to 0", () => {
    const draft = makeDraft();
    const lines = [
      makeLine({ id: "a", quantity: 3 }),
      makeLine({ id: "b", quantity: -5 }), // defensive
    ];
    expect(buildDiscountEngineInput(draft, lines).ctx.itemCount).toBe(3);
  });

  it("WALK_IN buyerKind maps to GUEST at ctx layer (audit Section 8)", () => {
    const draft = makeDraft({ buyerKind: "WALK_IN" });
    const { ctx } = buildDiscountEngineInput(draft, [makeLine()]);
    expect(ctx.buyerKind).toBe("GUEST");
  });

  it("COMPANY buyerKind passes through with companyLocationId", () => {
    const draft = makeDraft({
      buyerKind: "COMPANY",
      companyLocationId: "loc_1",
    });
    const { ctx } = buildDiscountEngineInput(draft, [makeLine()]);
    expect(ctx.buyerKind).toBe("COMPANY");
    expect(ctx.companyLocationId).toBe("loc_1");
  });

  it("guestSegmentIds is always empty (engine re-hydrates from guestEmail)", () => {
    const draft = makeDraft();
    const { ctx } = buildDiscountEngineInput(draft, [makeLine()]);
    expect(ctx.guestSegmentIds).toEqual([]);
  });

  it("discountLineItems carry post-manual-discount totalAmount", () => {
    const draft = makeDraft();
    const { discountLineItems } = buildDiscountEngineInput(draft, [
      makeLine({ id: "x", subtotalCents: BigInt(10_000), lineDiscountCents: BigInt(1_500) }),
    ]);
    expect(discountLineItems[0]).toEqual({
      id: "x",
      productId: "prod_1",
      totalAmount: 8_500,
    });
  });

  it("discountLineItems fall back to accommodationId when productId is null", () => {
    const draft = makeDraft();
    const { discountLineItems } = buildDiscountEngineInput(draft, [
      makeLine({
        id: "acc_line",
        lineType: "ACCOMMODATION",
        productId: null,
        accommodationId: "acc_42",
      }),
    ]);
    expect(discountLineItems[0].productId).toBe("acc_42");
  });

  it("empty draft → empty productIds, 0 orderAmount, 0 itemCount", () => {
    const draft = makeDraft();
    const { ctx, discountLineItems } = buildDiscountEngineInput(draft, []);
    expect(ctx.productIds).toEqual([]);
    expect(ctx.orderAmount).toBe(0);
    expect(ctx.itemCount).toBe(0);
    expect(discountLineItems).toEqual([]);
  });
});

// ── buildDraftTotalsInput ──────────────────────────────────────

describe("buildDraftTotalsInput", () => {
  it("passes through currency / taxesIncluded / shippingCents / companyTaxExempt", () => {
    const draft = makeDraft({
      currency: "EUR",
      taxesIncluded: false,
      shippingCents: BigInt(5_000),
    });
    const input = buildDraftTotalsInput({
      draft,
      lineItems: [],
      accTaxRateMap: new Map(),
      companyTaxExempt: true,
      orderDiscountImpact: null,
    });
    expect(input.currency).toBe("EUR");
    expect(input.taxesIncluded).toBe(false);
    expect(input.shippingCents).toBe(BigInt(5_000));
    expect(input.companyTaxExempt).toBe(true);
  });

  it("lines carry resolved taxRateBp from accTaxRateMap for ACC lines", () => {
    const draft = makeDraft();
    const accLine = makeLine({
      id: "a",
      lineType: "ACCOMMODATION",
      accommodationId: "acc_42",
    });
    const input = buildDraftTotalsInput({
      draft,
      lineItems: [accLine],
      accTaxRateMap: new Map([["acc_42", 1200]]),
      companyTaxExempt: false,
      orderDiscountImpact: null,
    });
    expect(input.lines[0].taxRateBp).toBe(1200);
  });

  it("orderDiscountImpact passes through verbatim", () => {
    const draft = makeDraft();
    const impact = {
      valid: true as const,
      discount: {} as never,
      discountCodeId: "c_1",
      discountCodeValue: "SUMMER",
      discountAmount: 1000,
      allocations: { scope: "ORDER", amount: 1000 } as const,
      title: "Summer",
      description: null,
      buyerKind: "GUEST" as const,
    };
    const input = buildDraftTotalsInput({
      draft,
      lineItems: [makeLine()],
      accTaxRateMap: new Map(),
      companyTaxExempt: false,
      orderDiscountImpact: impact,
    });
    expect(input.orderDiscountImpact).toBe(impact);
  });

  it("lineDiscountValue is stringified (Decimal → string) or left null", () => {
    const draft = makeDraft();
    const lines = [
      makeLine({ id: "a", lineDiscountValue: "15.0000" }),
      makeLine({ id: "b", lineDiscountValue: null }),
    ];
    const input = buildDraftTotalsInput({
      draft,
      lineItems: lines,
      accTaxRateMap: new Map(),
      companyTaxExempt: false,
      orderDiscountImpact: null,
    });
    expect(input.lines[0].lineDiscountValue).toBe("15.0000");
    expect(input.lines[1].lineDiscountValue).toBeNull();
  });

  it("buyerKind maps WALK_IN → GUEST", () => {
    const draft = makeDraft({ buyerKind: "WALK_IN" });
    const input = buildDraftTotalsInput({
      draft,
      lineItems: [],
      accTaxRateMap: new Map(),
      companyTaxExempt: false,
      orderDiscountImpact: null,
    });
    expect(input.buyerKind).toBe("GUEST");
  });
});
