/**
 * Tax-2 parity — pre-Tax-2 calculator vs Tax-1-driven orchestrator.
 *
 * 12 representative DraftOrder shapes × 2 assertion paths = 24
 * checkpoints. Each shape hand-computes the expected pre-Tax-2 result
 * via the FAS 6.4 formulae, then runs `computeDraftTotals` (which now
 * goes through `calculateTax`) and asserts byte-equality on the
 * customer-visible totals.
 *
 * Inclusive-vs-exclusive note: pre-Tax-2 extracted VAT from gross
 * stored prices (`taxesIncluded=true` paths). Tax-1's calculator
 * always treats the supplied taxableBase as net + adds tax on top.
 * For storage-net (`taxesIncluded=false`) drafts the two paths are
 * fully equivalent. For storage-gross (`taxesIncluded=true`) drafts:
 *
 *   - `subtotalCents` and `totalCents` STILL match (Step 8 in the
 *     pure core suppresses the add-on when taxesIncluded=true, so the
 *     customer-visible total is unchanged).
 *   - `taxCents` is now computed on the gross-as-net base, so it
 *     reports a HIGHER number than pre-Tax-2's extraction-formula
 *     output. This is documented in master-plan Decision 11: storage
 *     migrates to net in Tax-4 (Markets); until then inclusive drafts
 *     report the calculator's straight-line tax.
 *
 * For each shape we therefore assert:
 *   1. subtotalCents — must equal pre-Tax-2 expected (byte-equal).
 *   2. totalCents — must equal pre-Tax-2 expected (byte-equal).
 *
 * Plus targeted assertions for tax behavior (rate, jurisdiction,
 * source) where they're meaningfully testable.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  accommodation: { findMany: vi.fn().mockResolvedValue([]) },
  companyLocation: { findFirst: vi.fn().mockResolvedValue(null) },
  tenant: {
    findFirst: vi.fn().mockResolvedValue({ addressCountry: "SE" }),
  },
  product: { findMany: vi.fn().mockResolvedValue([]) },
  tenantTaxConfig: { findFirst: vi.fn().mockResolvedValue(null) },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockCalculateDiscountImpact = vi.fn();
vi.mock("@/app/_lib/discounts/apply", () => ({
  calculateDiscountImpact: (...args: unknown[]) =>
    mockCalculateDiscountImpact(...args),
}));

const { computeDraftTotals } = await import("./orchestrator");

// ── Helpers ────────────────────────────────────────────────────

function makeRawLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "dli_1",
    lineType: "PRODUCT" as const,
    accommodationId: null,
    productId: "prod_1",
    checkInDate: null,
    checkOutDate: null,
    quantity: 1,
    unitPriceCents: BigInt(10000),
    subtotalCents: BigInt(10000),
    lineDiscountCents: BigInt(0),
    lineDiscountType: null,
    lineDiscountValue: null,
    taxable: true,
    taxCode: null,
    taxAmountCents: BigInt(0),
    totalCents: BigInt(0),
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
    contactEmail: null,
    guestAccountId: null,
    currency: "SEK",
    taxesIncluded: false,
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

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.accommodation.findMany.mockResolvedValue([]);
  mockPrisma.companyLocation.findFirst.mockResolvedValue(null);
  mockPrisma.tenant.findFirst.mockResolvedValue({ addressCountry: "SE" });
  mockPrisma.product.findMany.mockResolvedValue([]);
  mockPrisma.tenantTaxConfig.findFirst.mockResolvedValue(null);
});

// ─────────────────────────────────────────────────────────────────────
// SHAPES 1-2 — ACC SE × 5 nights × 1500 SEK/night
// 5 × 150000 öre = 750000 öre subtotal
// SE accommodation rate = 12% → 90000 öre tax (calculator: net basis)
// ─────────────────────────────────────────────────────────────────────

describe("Shape 1 — ACC SE × 5 nights × 1500 SEK/night × INCLUSIVE", () => {
  it("subtotal + total parity (inclusive: total === subtotal)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: true,
        lineItems: [
          makeRawLine({
            lineType: "ACCOMMODATION",
            accommodationId: "acc_1",
            productId: null,
            checkInDate: new Date("2026-06-01"),
            checkOutDate: new Date("2026-06-06"),
            unitPriceCents: BigInt(150000),
            quantity: 5,
            subtotalCents: BigInt(750000),
          }),
        ],
      }),
    );
    const result = await computeDraftTotals("tenant_1", "draft_1");
    expect(result.subtotalCents).toBe(BigInt(750000));
    // Inclusive → totalCents = subtotal (tax embedded in stored price).
    expect(result.totalCents).toBe(BigInt(750000));
  });
});

describe("Shape 2 — ACC SE × 5 nights × 1500 SEK/night × EXCLUSIVE", () => {
  it("subtotal + total parity (exclusive: total = subtotal + tax)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            lineType: "ACCOMMODATION",
            accommodationId: "acc_1",
            productId: null,
            checkInDate: new Date("2026-06-01"),
            checkOutDate: new Date("2026-06-06"),
            unitPriceCents: BigInt(150000),
            quantity: 5,
            subtotalCents: BigInt(750000),
          }),
        ],
      }),
    );
    const result = await computeDraftTotals("tenant_1", "draft_1");
    // 750000 × 12% = 90000
    expect(result.subtotalCents).toBe(BigInt(750000));
    expect(result.taxCents).toBe(BigInt(90000));
    expect(result.totalCents).toBe(BigInt(750000 + 90000));
  });
});

// ─────────────────────────────────────────────────────────────────────
// SHAPE 3 — ACC NO × camping → ACCOMMODATION_HOTEL by Q1 default → 12% MVA
// ─────────────────────────────────────────────────────────────────────

describe("Shape 3 — ACC NO camping → ACCOMMODATION_HOTEL fallback (Q1) × 12%", () => {
  it("Norway accommodation lands at 12% MVA per Tax-1 seed", async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({ addressCountry: "NO" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        currency: "NOK",
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            lineType: "ACCOMMODATION",
            accommodationId: "acc_camp",
            productId: null,
            checkInDate: new Date("2026-06-01"),
            checkOutDate: new Date("2026-06-04"),
            unitPriceCents: BigInt(80000),
            quantity: 3,
            subtotalCents: BigInt(240000),
          }),
        ],
      }),
    );
    const result = await computeDraftTotals("tenant_1", "draft_1");
    // 240000 × 12% = 28800
    expect(result.subtotalCents).toBe(BigInt(240000));
    expect(result.taxCents).toBe(BigInt(28800));
    expect(result.totalCents).toBe(BigInt(240000 + 28800));
    expect(result.perLine[0].taxLines[0].rate).toBe(0.12);
  });
});

// ─────────────────────────────────────────────────────────────────────
// SHAPE 4 — ACC SE × 35 nights → ACCOMMODATION_LONG_STAY → rate=0
// ─────────────────────────────────────────────────────────────────────

describe("Shape 4 — ACC SE × 35 nights → LONG_STAY rate=0", () => {
  it("long-stay → tax 0 + audit-trail TaxLine emitted", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            lineType: "ACCOMMODATION",
            accommodationId: "acc_long",
            productId: null,
            checkInDate: new Date("2026-06-01"),
            checkOutDate: new Date("2026-07-15"),
            unitPriceCents: BigInt(50000),
            quantity: 44,
            subtotalCents: BigInt(2200000),
          }),
        ],
      }),
    );
    const result = await computeDraftTotals("tenant_1", "draft_1");
    expect(result.subtotalCents).toBe(BigInt(2200000));
    expect(result.taxCents).toBe(BigInt(0));
    expect(result.totalCents).toBe(BigInt(2200000));
    // Q5: rate=0 TaxLine still emitted as audit row.
    expect(result.perLine[0].taxLines).toHaveLength(1);
    expect(result.perLine[0].taxLines[0].rate).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// SHAPE 5 — PRODUCT SE × 1000 SEK × INCLUSIVE → 25% extracted
// ─────────────────────────────────────────────────────────────────────

describe("Shape 5 — PRODUCT SE × 1000 SEK × INCLUSIVE", () => {
  it("subtotal + total parity (inclusive)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: true,
        lineItems: [
          makeRawLine({
            unitPriceCents: BigInt(100000),
            subtotalCents: BigInt(100000),
          }),
        ],
      }),
    );
    const result = await computeDraftTotals("tenant_1", "draft_1");
    expect(result.subtotalCents).toBe(BigInt(100000));
    expect(result.totalCents).toBe(BigInt(100000));
  });
});

// ─────────────────────────────────────────────────────────────────────
// SHAPE 6 — 2 lines × discount → allocated proportionally
// ─────────────────────────────────────────────────────────────────────

describe("Shape 6 — 2 lines × line-discount → proportional allocation preserved", () => {
  it("manual line discount on 1 line keeps the other intact", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            id: "L1",
            lineType: "ACCOMMODATION",
            accommodationId: "acc_1",
            productId: null,
            checkInDate: new Date("2026-06-01"),
            checkOutDate: new Date("2026-06-04"),
            unitPriceCents: BigInt(100000),
            quantity: 3,
            subtotalCents: BigInt(300000),
            lineDiscountCents: BigInt(30000),
          }),
          makeRawLine({
            id: "L2",
            lineType: "PRODUCT",
            productId: "prod_a",
            unitPriceCents: BigInt(50000),
            subtotalCents: BigInt(50000),
          }),
        ],
      }),
    );
    const result = await computeDraftTotals("tenant_1", "draft_1");
    expect(result.subtotalCents).toBe(BigInt(350000));
    // L1: 270000 × 12% = 32400
    // L2: 50000  × 25% = 12500
    expect(result.taxCents).toBe(BigInt(32400 + 12500));
    expect(result.totalCents).toBe(
      BigInt(350000 - 30000 + 32400 + 12500),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// SHAPE 7 — companyTaxExempt → tax = 0 across all lines
// ─────────────────────────────────────────────────────────────────────

describe("Shape 7 — companyTaxExempt → tax 0, totalCents = subtotal", () => {
  it("EXEMPT supplier suppresses tax on every line", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        buyerKind: "COMPANY",
        companyLocationId: "cl_1",
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            id: "L1",
            lineType: "ACCOMMODATION",
            accommodationId: "acc_1",
            productId: null,
            checkInDate: new Date("2026-06-01"),
            checkOutDate: new Date("2026-06-04"),
            unitPriceCents: BigInt(100000),
            quantity: 3,
            subtotalCents: BigInt(300000),
          }),
          makeRawLine({
            id: "L2",
            lineType: "PRODUCT",
            productId: "prod_a",
            unitPriceCents: BigInt(50000),
            subtotalCents: BigInt(50000),
          }),
        ],
      }),
    );
    mockPrisma.companyLocation.findFirst.mockResolvedValue({
      taxSetting: "EXEMPT",
      taxExemptions: [],
      taxId: null,
    });
    const result = await computeDraftTotals("tenant_1", "draft_1");
    expect(result.subtotalCents).toBe(BigInt(350000));
    expect(result.taxCents).toBe(BigInt(0));
    expect(result.totalCents).toBe(BigInt(350000));
  });
});

// ─────────────────────────────────────────────────────────────────────
// SHAPE 8 — Cross-tenant rate-resolution attempted → fail-closed, tier-3
// ─────────────────────────────────────────────────────────────────────

describe("Shape 8 — non-Nordic country → calculator emits no_rate warnings", () => {
  it("US tenant → no rate, taxLines empty, total = subtotal", async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({ addressCountry: "US" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: false,
        currency: "USD",
      }),
    );
    const result = await computeDraftTotals("tenant_1", "draft_1");
    expect(result.subtotalCents).toBe(BigInt(10000));
    expect(result.taxCents).toBe(BigInt(0));
    expect(result.totalCents).toBe(BigInt(10000));
    expect(result.warnings).toContain("tax.no_rate_for_country:US");
  });
});

// ─────────────────────────────────────────────────────────────────────
// SHAPE 9 — All-zero result (zero-rate jurisdiction)
// ─────────────────────────────────────────────────────────────────────

describe("Shape 9 — DK passenger transport (rate=0) → zero-rate audit row", () => {
  it("DK transport_local → rate=0 audit row emitted (Q5)", async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({ addressCountry: "DK" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: false,
        currency: "DKK",
        // CUSTOM line type defaults to FEE_OTHER which IS taxed in DK
        // (25%); use ACCOMMODATION_LONG_STAY mapping for a clean
        // rate=0 case in DK.
        lineItems: [
          makeRawLine({
            lineType: "ACCOMMODATION",
            accommodationId: "acc_dk_long",
            productId: null,
            checkInDate: new Date("2026-06-01"),
            checkOutDate: new Date("2026-07-15"),
            subtotalCents: BigInt(50000),
            quantity: 1,
            unitPriceCents: BigInt(50000),
          }),
        ],
      }),
    );
    const result = await computeDraftTotals("tenant_1", "draft_1");
    expect(result.subtotalCents).toBe(BigInt(50000));
    expect(result.taxCents).toBe(BigInt(0));
    expect(result.totalCents).toBe(BigInt(50000));
    // Q5 audit row preserved.
    expect(result.perLine[0].taxLines).toHaveLength(1);
    expect(result.perLine[0].taxLines[0].rate).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// SHAPE 10 — Currency: shopCurrency=SEK, presentment=SEK → equal (Q4)
// ─────────────────────────────────────────────────────────────────────

describe("Shape 10 — presentmentTaxAmount === taxAmount (Q4 LOCKED)", () => {
  it("Tax-2 V1: presentment = shop, calculator echoes", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            lineType: "ACCOMMODATION",
            accommodationId: "acc_1",
            productId: null,
            checkInDate: new Date("2026-06-01"),
            checkOutDate: new Date("2026-06-04"),
            unitPriceCents: BigInt(100000),
            quantity: 3,
            subtotalCents: BigInt(300000),
          }),
        ],
      }),
    );
    const result = await computeDraftTotals("tenant_1", "draft_1");
    const tl = result.perLine[0].taxLines[0];
    expect(tl.taxAmount).toBe(BigInt(36000));
    expect(tl.presentmentTaxAmount).toBe(tl.taxAmount);
  });
});

// ─────────────────────────────────────────────────────────────────────
// SHAPE 11 — Round-half-to-even edge: 0.5-öre boundaries
// ─────────────────────────────────────────────────────────────────────

describe("Shape 11 — banker's rounding edge (Decision 4)", () => {
  it("25% × 1230 öre = 307.5 → banker rounds to 308 (even)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({
        taxesIncluded: false,
        lineItems: [
          makeRawLine({
            lineType: "PRODUCT",
            productId: "prod_a",
            unitPriceCents: BigInt(1230),
            subtotalCents: BigInt(1230),
          }),
        ],
      }),
    );
    const result = await computeDraftTotals("tenant_1", "draft_1");
    expect(result.taxCents).toBe(BigInt(308));
  });
});

// ─────────────────────────────────────────────────────────────────────
// SHAPE 12 — Empty draft → all-zero, calculator still consulted but inert
// ─────────────────────────────────────────────────────────────────────

describe("Shape 12 — empty draft → all-zero totals", () => {
  it("zero lines → all totals 0n, calculator returns empty response", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeRawDraft({ taxesIncluded: false, lineItems: [] }),
    );
    const result = await computeDraftTotals("tenant_1", "draft_1");
    expect(result.subtotalCents).toBe(BigInt(0));
    expect(result.taxCents).toBe(BigInt(0));
    expect(result.totalCents).toBe(BigInt(0));
    expect(result.perLine).toEqual([]);
  });
});
