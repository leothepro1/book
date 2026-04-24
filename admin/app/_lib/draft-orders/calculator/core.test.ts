import { describe, it, expect } from "vitest";
import type { CalculatedDiscountImpact } from "@/app/_lib/discounts/apply";
import { computeDraftTotalsPure } from "./core";
import type { DraftTotalsInput, DraftTotalsLineInput } from "./types";

// ── Fixtures ────────────────────────────────────────────────────

function makeLine(
  overrides: Partial<DraftTotalsLineInput> = {},
): DraftTotalsLineInput {
  return {
    id: "dli_1",
    lineType: "PRODUCT",
    unitPriceCents: BigInt(10_000), // 100 SEK
    quantity: 1,
    subtotalCents: BigInt(10_000),
    taxable: true,
    taxRateBp: 2500, // 25% standard
    lineDiscountCents: BigInt(0),
    lineDiscountType: null,
    lineDiscountValue: null,
    ...overrides,
  };
}

function makeInput(overrides: Partial<DraftTotalsInput> = {}): DraftTotalsInput {
  return {
    currency: "SEK",
    buyerKind: "GUEST",
    taxesIncluded: true, // B2C default (gross prices)
    companyTaxExempt: false,
    shippingCents: BigInt(0),
    lines: [makeLine()],
    orderDiscountImpact: null,
    ...overrides,
  };
}

/** Stub for calculateDiscountImpact result shape (valid=true). */
function makeValidImpact(
  overrides: Partial<Extract<CalculatedDiscountImpact, { valid: true }>> = {},
): Extract<CalculatedDiscountImpact, { valid: true }> {
  return {
    valid: true,
    discount: {} as never, // never read by core; orchestrator passes real data
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

// ── Case 1: Empty draft ─────────────────────────────────────────

describe("computeDraftTotalsPure — empty draft", () => {
  it("returns zeros and empty perLine for a draft with no lines", () => {
    const result = computeDraftTotalsPure(makeInput({ lines: [] }));
    expect(result.subtotalCents).toBe(BigInt(0));
    expect(result.totalDiscountCents).toBe(BigInt(0));
    expect(result.taxCents).toBe(BigInt(0));
    expect(result.totalCents).toBe(BigInt(0));
    expect(result.perLine).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("empty draft with shipping sums to shippingCents", () => {
    const result = computeDraftTotalsPure(
      makeInput({ lines: [], shippingCents: BigInt(5_000) }),
    );
    expect(result.totalCents).toBe(BigInt(5_000));
    expect(result.shippingCents).toBe(BigInt(5_000));
  });
});

// ── Case 2+3: degenerate line values ───────────────────────────

describe("computeDraftTotalsPure — degenerate line values", () => {
  it("quantity=0 contributes zero (no error, no warning)", () => {
    const line = makeLine({ quantity: 0, subtotalCents: BigInt(0) });
    const result = computeDraftTotalsPure(makeInput({ lines: [line] }));
    expect(result.subtotalCents).toBe(BigInt(0));
    expect(result.totalCents).toBe(BigInt(0));
    expect(result.warnings).toEqual([]);
  });

  it("unitPriceCents=0 produces zeros without error", () => {
    const line = makeLine({ unitPriceCents: BigInt(0), subtotalCents: BigInt(0) });
    const result = computeDraftTotalsPure(makeInput({ lines: [line] }));
    expect(result.subtotalCents).toBe(BigInt(0));
    expect(result.totalCents).toBe(BigInt(0));
    expect(result.warnings).toEqual([]);
  });

  it("negative quantity → clamped to 0 + INVALID_QUANTITY warning", () => {
    const line = makeLine({ quantity: -2, subtotalCents: BigInt(0) });
    const result = computeDraftTotalsPure(makeInput({ lines: [line] }));
    expect(result.warnings).toContain("INVALID_QUANTITY");
    expect(result.totalCents).toBe(BigInt(0));
  });

  it("subtotal snapshot mismatches unitPrice × quantity → warn + trust snapshot", () => {
    const line = makeLine({
      unitPriceCents: BigInt(10_000),
      quantity: 2,
      subtotalCents: BigInt(99_999), // deliberate mismatch
    });
    const result = computeDraftTotalsPure(makeInput({ lines: [line] }));
    expect(result.warnings).toContain("SUBTOTAL_SNAPSHOT_MISMATCH");
    expect(result.subtotalCents).toBe(BigInt(99_999)); // trusts snapshot
  });
});

// ── Case: manual line discount — fixed ─────────────────────────

describe("computeDraftTotalsPure — manual fixed line discount", () => {
  it("applies lineDiscountCents when > 0", () => {
    const line = makeLine({ lineDiscountCents: BigInt(2_000), taxRateBp: 0 });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [line], taxesIncluded: false }),
    );
    expect(result.perLine[0].manualLineDiscountCents).toBe(BigInt(2_000));
    expect(result.totalLineDiscountCents).toBe(BigInt(2_000));
  });

  it("clamps line discount that exceeds subtotal", () => {
    const line = makeLine({
      subtotalCents: BigInt(10_000),
      lineDiscountCents: BigInt(50_000),
    });
    const result = computeDraftTotalsPure(makeInput({ lines: [line] }));
    expect(result.perLine[0].manualLineDiscountCents).toBe(BigInt(10_000));
    expect(result.perLine[0].taxableBaseCents).toBe(BigInt(0));
  });
});

// ── Case: manual line discount — percentage ────────────────────

describe("computeDraftTotalsPure — manual percentage line discount", () => {
  it("computes floor(subtotal × pct / 100) when fixed=0 and type=PERCENTAGE", () => {
    const line = makeLine({
      subtotalCents: BigInt(10_000),
      lineDiscountCents: BigInt(0),
      lineDiscountType: "PERCENTAGE",
      lineDiscountValue: "15.0000", // 15%
    });
    const result = computeDraftTotalsPure(makeInput({ lines: [line] }));
    expect(result.perLine[0].manualLineDiscountCents).toBe(BigInt(1_500));
  });

  it("floors (not rounds) — 33.33% of 100 öre = 33 öre", () => {
    const line = makeLine({
      subtotalCents: BigInt(100),
      lineDiscountType: "PERCENTAGE",
      lineDiscountValue: "33.3300",
    });
    const result = computeDraftTotalsPure(makeInput({ lines: [line] }));
    // 100 × 33.33 / 100 = 33.33 → floor = 33
    expect(result.perLine[0].manualLineDiscountCents).toBe(BigInt(33));
  });

  it("ignores percentage when value is null or zero", () => {
    const line = makeLine({
      lineDiscountType: "PERCENTAGE",
      lineDiscountValue: null,
    });
    const result = computeDraftTotalsPure(makeInput({ lines: [line] }));
    expect(result.perLine[0].manualLineDiscountCents).toBe(BigInt(0));
  });
});

// ── Case: double-set line discount (data hygiene) ──────────────

describe("computeDraftTotalsPure — line discount double-set", () => {
  it("fixed wins when both lineDiscountCents and percentage are set + warn", () => {
    const line = makeLine({
      subtotalCents: BigInt(10_000),
      lineDiscountCents: BigInt(500), // fixed 5 SEK
      lineDiscountType: "PERCENTAGE",
      lineDiscountValue: "10.0000", // would be 1000 via percentage
    });
    const result = computeDraftTotalsPure(makeInput({ lines: [line] }));
    expect(result.perLine[0].manualLineDiscountCents).toBe(BigInt(500));
    expect(result.warnings).toContain("LINE_DISCOUNT_DOUBLE_SET");
  });
});

// ── Case: non-taxable lines ─────────────────────────────────────

describe("computeDraftTotalsPure — non-taxable lines", () => {
  it("line.taxable=false → taxCents=BigInt(0) regardless of rate", () => {
    const line = makeLine({ taxable: false, taxRateBp: 2500 });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [line], taxesIncluded: false }),
    );
    expect(result.perLine[0].taxCents).toBe(BigInt(0));
    expect(result.taxCents).toBe(BigInt(0));
  });

  it("mixing taxable and non-taxable lines — only taxable lines contribute tax", () => {
    const taxable = makeLine({
      id: "l_tax",
      taxable: true,
      taxRateBp: 2500,
      subtotalCents: BigInt(10_000),
    });
    const nonTaxable = makeLine({
      id: "l_no_tax",
      taxable: false,
      taxRateBp: 2500,
      subtotalCents: BigInt(10_000),
    });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [taxable, nonTaxable], taxesIncluded: false }),
    );
    // Only the taxable line contributes: round(10000 × 2500 / 10000) = 2500
    expect(result.taxCents).toBe(BigInt(2_500));
    expect(result.perLine[0].taxCents).toBe(BigInt(2_500));
    expect(result.perLine[1].taxCents).toBe(BigInt(0));
  });
});

// ── Case: companyTaxExempt ──────────────────────────────────────

describe("computeDraftTotalsPure — companyTaxExempt", () => {
  it("companyTaxExempt=true zeroes tax on all lines regardless of taxable flag", () => {
    const a = makeLine({ id: "a", taxable: true, taxRateBp: 2500 });
    const b = makeLine({ id: "b", taxable: true, taxRateBp: 1200 });
    const result = computeDraftTotalsPure(
      makeInput({
        lines: [a, b],
        taxesIncluded: false,
        companyTaxExempt: true,
      }),
    );
    expect(result.taxCents).toBe(BigInt(0));
    expect(result.perLine[0].taxCents).toBe(BigInt(0));
    expect(result.perLine[1].taxCents).toBe(BigInt(0));
  });
});

// ── Case: zero tax rate (current stub) ─────────────────────────

describe("computeDraftTotalsPure — zero tax rate", () => {
  it("taxRateBp=0 → taxCents=0; totalCents identical regardless of taxesIncluded", () => {
    const line = makeLine({ taxRateBp: 0, subtotalCents: BigInt(10_000) });
    const resultIncl = computeDraftTotalsPure(
      makeInput({ lines: [line], taxesIncluded: true }),
    );
    const resultExcl = computeDraftTotalsPure(
      makeInput({ lines: [line], taxesIncluded: false }),
    );
    expect(resultIncl.taxCents).toBe(BigInt(0));
    expect(resultExcl.taxCents).toBe(BigInt(0));
    expect(resultIncl.totalCents).toBe(resultExcl.totalCents);
    expect(resultIncl.totalCents).toBe(BigInt(10_000));
  });
});

// ── Case: taxesIncluded=true (Swedish B2C, gross prices) ──────

describe("computeDraftTotalsPure — taxesIncluded=true (gross prices)", () => {
  it("25% VAT extracted from 125 SEK gross → 25 SEK tax, total 125 SEK", () => {
    const line = makeLine({
      unitPriceCents: BigInt(12_500),
      quantity: 1,
      subtotalCents: BigInt(12_500),
      taxRateBp: 2500,
    });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [line], taxesIncluded: true }),
    );
    // tax = round(12500 × 2500 / 12500) = 2500
    expect(result.perLine[0].taxCents).toBe(BigInt(2_500));
    // total embeds tax: subtotal − discount + shipping = 12500
    expect(result.totalCents).toBe(BigInt(12_500));
  });

  it("12% VAT (Swedish hospitality) extracted from 1120 ören → 120 ören tax", () => {
    const line = makeLine({
      lineType: "ACCOMMODATION",
      unitPriceCents: BigInt(1_120),
      quantity: 1,
      subtotalCents: BigInt(1_120),
      taxRateBp: 1200,
    });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [line], taxesIncluded: true }),
    );
    // tax = round(1120 × 1200 / 11200) = round(120.0) = 120
    expect(result.perLine[0].taxCents).toBe(BigInt(120));
    expect(result.totalCents).toBe(BigInt(1_120));
  });

  it("discount reduces gross AND the extracted tax proportionally", () => {
    const line = makeLine({
      unitPriceCents: BigInt(12_500),
      quantity: 1,
      subtotalCents: BigInt(12_500),
      taxRateBp: 2500,
      lineDiscountCents: BigInt(1_250), // 10% off gross
    });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [line], taxesIncluded: true }),
    );
    // Discounted gross = 11250; tax = round(11250 × 2500 / 12500) = 2250
    expect(result.perLine[0].taxCents).toBe(BigInt(2_250));
    expect(result.totalCents).toBe(BigInt(11_250)); // subtotal − discount + shipping
  });
});

// ── Case: taxesIncluded=false (B2B, net prices) ────────────────

describe("computeDraftTotalsPure — taxesIncluded=false (net prices)", () => {
  it("25% VAT added on top of 100 SEK net → 25 SEK tax, total 125 SEK", () => {
    const line = makeLine({
      unitPriceCents: BigInt(10_000),
      quantity: 1,
      subtotalCents: BigInt(10_000),
      taxRateBp: 2500,
    });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [line], taxesIncluded: false }),
    );
    // tax = round(10000 × 2500 / 10000) = 2500
    expect(result.perLine[0].taxCents).toBe(BigInt(2_500));
    expect(result.totalCents).toBe(BigInt(12_500)); // 10000 + 2500 + 0
  });

  it("discount reduces taxable net base", () => {
    const line = makeLine({
      unitPriceCents: BigInt(10_000),
      quantity: 1,
      subtotalCents: BigInt(10_000),
      taxRateBp: 2500,
      lineDiscountCents: BigInt(1_000),
    });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [line], taxesIncluded: false }),
    );
    // Discounted net = 9000; tax = round(9000 × 2500 / 10000) = 2250
    expect(result.perLine[0].taxCents).toBe(BigInt(2_250));
    expect(result.totalCents).toBe(BigInt(11_250)); // 10000 − 1000 + 2250 + 0
  });
});

// ── Case: order-level discount — scope=ORDER (pro-rata) ───────

describe("computeDraftTotalsPure — order discount scope=ORDER", () => {
  it("distributes pro-rata by line net, floor + remainder-to-last", () => {
    // Two lines: 10000 + 30000 = 40000 net; order discount = 1000
    // Line 0 share = floor(1000 × 10000 / 40000) = 250
    // Line 1 (last) = 1000 − 250 = 750
    const a = makeLine({ id: "a", subtotalCents: BigInt(10_000), taxRateBp: 0 });
    const b = makeLine({ id: "b", subtotalCents: BigInt(30_000), taxRateBp: 0 });
    const impact = makeValidImpact({
      allocations: { scope: "ORDER", amount: 1000 },
    });
    const result = computeDraftTotalsPure(
      makeInput({
        lines: [a, b],
        orderDiscountImpact: impact,
        taxesIncluded: false,
      }),
    );
    expect(result.perLine[0].allocatedOrderDiscountCents).toBe(BigInt(250));
    expect(result.perLine[1].allocatedOrderDiscountCents).toBe(BigInt(750));
    expect(result.orderDiscountCents).toBe(BigInt(1_000));
  });

  it("allocation sums exactly equal the total discount (remainder rounding)", () => {
    // Three uneven lines with a discount that doesn't divide evenly
    const a = makeLine({ id: "a", subtotalCents: BigInt(333) });
    const b = makeLine({ id: "b", subtotalCents: BigInt(333) });
    const c = makeLine({ id: "c", subtotalCents: BigInt(334) });
    const impact = makeValidImpact({
      allocations: { scope: "ORDER", amount: 100 },
    });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [a, b, c], orderDiscountImpact: impact }),
    );
    const sum =
      result.perLine[0].allocatedOrderDiscountCents +
      result.perLine[1].allocatedOrderDiscountCents +
      result.perLine[2].allocatedOrderDiscountCents;
    expect(sum).toBe(BigInt(100));
  });

  it("order discount > subtotal clamped per line net", () => {
    const line = makeLine({ subtotalCents: BigInt(1_000) });
    const impact = makeValidImpact({
      allocations: { scope: "ORDER", amount: 99_999 },
    });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [line], orderDiscountImpact: impact }),
    );
    // Allocation capped at line net (1000)
    expect(result.perLine[0].allocatedOrderDiscountCents).toBe(BigInt(1_000));
    expect(result.perLine[0].taxableBaseCents).toBe(BigInt(0));
  });
});

// ── Case: order-level discount — scope=LINE (explicit per-line) ──

describe("computeDraftTotalsPure — order discount scope=LINE", () => {
  it("uses perLine amounts directly, caps at line net", () => {
    const a = makeLine({ id: "a", subtotalCents: BigInt(10_000) });
    const b = makeLine({ id: "b", subtotalCents: BigInt(5_000) });
    const impact = makeValidImpact({
      allocations: {
        scope: "LINE",
        perLine: [
          { lineItemId: "a", amount: 2_000 },
          { lineItemId: "b", amount: 8_000 }, // exceeds subtotal
        ],
      },
    });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [a, b], orderDiscountImpact: impact }),
    );
    expect(result.perLine[0].allocatedOrderDiscountCents).toBe(BigInt(2_000));
    expect(result.perLine[1].allocatedOrderDiscountCents).toBe(BigInt(5_000));
  });

  it("silently drops allocations for unknown lineItemIds", () => {
    const line = makeLine({ id: "known", subtotalCents: BigInt(10_000) });
    const impact = makeValidImpact({
      allocations: {
        scope: "LINE",
        perLine: [
          { lineItemId: "known", amount: 1_000 },
          { lineItemId: "ghost", amount: 9_999 },
        ],
      },
    });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [line], orderDiscountImpact: impact }),
    );
    expect(result.perLine[0].allocatedOrderDiscountCents).toBe(BigInt(1_000));
    expect(result.orderDiscountCents).toBe(BigInt(1_000)); // Ghost silently dropped
  });
});

// ── Case: staff + order discount on same line ─────────────────

describe("computeDraftTotalsPure — staff-manual + order-level stack", () => {
  it("manual first, then order discount on post-manual net", () => {
    // subtotal 10000; staff -2000; order -1000 (LINE-scope targeting this line)
    const line = makeLine({
      subtotalCents: BigInt(10_000),
      lineDiscountCents: BigInt(2_000),
      taxRateBp: 0, // isolate discount math from tax
    });
    const impact = makeValidImpact({
      allocations: {
        scope: "LINE",
        perLine: [{ lineItemId: "dli_1", amount: 1_000 }],
      },
    });
    const result = computeDraftTotalsPure(
      makeInput({
        lines: [line],
        orderDiscountImpact: impact,
        taxesIncluded: false,
      }),
    );
    expect(result.perLine[0].manualLineDiscountCents).toBe(BigInt(2_000));
    expect(result.perLine[0].allocatedOrderDiscountCents).toBe(BigInt(1_000));
    expect(result.perLine[0].totalLineDiscountCents).toBe(BigInt(3_000));
    // net after all discounts = 10000 − 3000 = 7000
    expect(result.perLine[0].taxableBaseCents).toBe(BigInt(7_000));
    expect(result.perLine[0].totalCents).toBe(BigInt(7_000));
  });
});

// ── Case: shipping pass-through ────────────────────────────────

describe("computeDraftTotalsPure — shipping", () => {
  it("shippingCents added to totalCents, NOT taxed (6.4 policy)", () => {
    const line = makeLine({
      subtotalCents: BigInt(10_000),
      taxRateBp: 2500,
    });
    const result = computeDraftTotalsPure(
      makeInput({
        lines: [line],
        taxesIncluded: false,
        shippingCents: BigInt(4_900),
      }),
    );
    // Line tax unchanged by shipping presence
    expect(result.perLine[0].taxCents).toBe(BigInt(2_500));
    expect(result.taxCents).toBe(BigInt(2_500));
    // Total includes shipping as pass-through
    expect(result.totalCents).toBe(BigInt(17_400)); // 10000 + 2500 + 4900
    expect(result.shippingCents).toBe(BigInt(4_900));
  });
});

// ── Case: large BigInt (B2B scale) ─────────────────────────────

describe("computeDraftTotalsPure — large BigInt", () => {
  it("handles a 100 MSEK B2B draft with no overflow", () => {
    // 100 MSEK = 10_000_000_000 ören
    const line = makeLine({
      unitPriceCents: BigInt(10_000_000_000),
      quantity: 1,
      subtotalCents: BigInt(10_000_000_000),
      taxRateBp: 2500,
    });
    const result = computeDraftTotalsPure(
      makeInput({ lines: [line], taxesIncluded: false }),
    );
    // tax = round(10^10 × 2500 / 10000) = 2.5 × 10^9
    expect(result.perLine[0].taxCents).toBe(BigInt(2_500_000_000));
    expect(result.totalCents).toBe(BigInt(12_500_000_000));
  });
});

// ── Case: invariant — sum(perLine.totalCents) + shipping === totalCents ──

describe("computeDraftTotalsPure — invariants", () => {
  it("sum of perLine totals plus shipping equals totalCents", () => {
    const a = makeLine({
      id: "a",
      subtotalCents: BigInt(12_500),
      taxRateBp: 2500,
    });
    const b = makeLine({
      id: "b",
      subtotalCents: BigInt(1_120),
      taxRateBp: 1200,
      lineDiscountCents: BigInt(100),
    });
    const result = computeDraftTotalsPure(
      makeInput({
        lines: [a, b],
        taxesIncluded: true,
        shippingCents: BigInt(5_000),
      }),
    );
    const linesSum =
      result.perLine[0].totalCents + result.perLine[1].totalCents;
    expect(linesSum + result.shippingCents).toBe(result.totalCents);
  });

  it("output always marks source=COMPUTED and frozenAt=null", () => {
    const result = computeDraftTotalsPure(makeInput());
    expect(result.source).toBe("COMPUTED");
    expect(result.frozenAt).toBeNull();
  });
});
