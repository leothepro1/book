import { describe, it, expect } from "vitest";
import {
  buildTaxRequestFromDraft,
  resolveTaxCategory,
} from "./tax-request";
import type { RawDraftLineItem, RawDraftOrder } from "./context";

const baseDraft = (
  overrides: Partial<RawDraftOrder> = {},
): RawDraftOrder => ({
  id: "draft_1",
  tenantId: "t_1",
  status: "OPEN",
  buyerKind: "GUEST",
  companyLocationId: null,
  contactEmail: null,
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
  lineItems: [],
  ...overrides,
});

const baseLine = (
  overrides: Partial<RawDraftLineItem> = {},
): RawDraftLineItem => ({
  id: "ln_1",
  lineType: "PRODUCT",
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
});

describe("resolveTaxCategory", () => {
  it("ACCOMMODATION + nights ≤ 30 → ACCOMMODATION_HOTEL", () => {
    const line = baseLine({
      lineType: "ACCOMMODATION",
      accommodationId: "acc_1",
      checkInDate: new Date("2026-06-01"),
      checkOutDate: new Date("2026-06-06"),
    });
    expect(resolveTaxCategory(line, new Map())).toBe(
      "ACCOMMODATION_HOTEL",
    );
  });

  it("ACCOMMODATION + nights > 30 → ACCOMMODATION_LONG_STAY (Tax-1 Q8)", () => {
    const line = baseLine({
      lineType: "ACCOMMODATION",
      accommodationId: "acc_1",
      checkInDate: new Date("2026-06-01"),
      checkOutDate: new Date("2026-07-15"),
    });
    expect(resolveTaxCategory(line, new Map())).toBe(
      "ACCOMMODATION_LONG_STAY",
    );
  });

  it("ACCOMMODATION + missing dates → ACCOMMODATION_HOTEL fallback", () => {
    const line = baseLine({
      lineType: "ACCOMMODATION",
      accommodationId: "acc_1",
      checkInDate: null,
      checkOutDate: null,
    });
    expect(resolveTaxCategory(line, new Map())).toBe(
      "ACCOMMODATION_HOTEL",
    );
  });

  it("ACCOMMODATION + exactly 30 nights → ACCOMMODATION_HOTEL (boundary)", () => {
    const line = baseLine({
      lineType: "ACCOMMODATION",
      accommodationId: "acc_1",
      checkInDate: new Date("2026-06-01"),
      checkOutDate: new Date("2026-07-01"),
    });
    expect(resolveTaxCategory(line, new Map())).toBe(
      "ACCOMMODATION_HOTEL",
    );
  });

  it("PRODUCT + STANDARD → RETAIL_GENERAL", () => {
    const productTypeById = new Map<string, "STANDARD" | "GIFT_CARD">([
      ["prod_1", "STANDARD"],
    ]);
    expect(resolveTaxCategory(baseLine(), productTypeById)).toBe(
      "RETAIL_GENERAL",
    );
  });

  it("PRODUCT + GIFT_CARD → FEE_OTHER", () => {
    const productTypeById = new Map<string, "STANDARD" | "GIFT_CARD">([
      ["prod_1", "GIFT_CARD"],
    ]);
    expect(resolveTaxCategory(baseLine(), productTypeById)).toBe("FEE_OTHER");
  });

  it("PRODUCT + missing in productTypeById → STANDARD default", () => {
    expect(resolveTaxCategory(baseLine(), new Map())).toBe("RETAIL_GENERAL");
  });

  it("CUSTOM → FEE_OTHER (Q2 default)", () => {
    const line = baseLine({ lineType: "CUSTOM", productId: null });
    expect(resolveTaxCategory(line, new Map())).toBe("FEE_OTHER");
  });
});

describe("buildTaxRequestFromDraft", () => {
  it("happy path: 1 ACCOMMODATION line → 1 TaxRequest line with category + base", () => {
    const draft = baseDraft();
    const line = baseLine({
      lineType: "ACCOMMODATION",
      accommodationId: "acc_1",
      productId: null,
      checkInDate: new Date("2026-06-01"),
      checkOutDate: new Date("2026-06-06"),
    });
    const req = buildTaxRequestFromDraft({
      draft,
      lineItems: [line],
      taxableBaseByLineId: new Map([[line.id, BigInt(50000)]]),
      productTypeById: new Map(),
      fulfillmentCountryCode: "SE",
      buyerCountryCode: "SE",
      shopCurrency: "SEK",
      presentmentCurrency: "SEK",
    });
    expect(req.tenantId).toBe("t_1");
    expect(req.buyerLocation.countryCode).toBe("SE");
    expect(req.fulfillmentLocation.countryCode).toBe("SE");
    expect(req.lines).toHaveLength(1);
    expect(req.lines[0].lineId).toBe(line.id);
    expect(req.lines[0].taxCategory).toBe("ACCOMMODATION_HOTEL");
    expect(req.lines[0].taxableAmount).toBe(BigInt(50000));
  });

  it("missing taxableBase entry → 0n (defensive default)", () => {
    const line = baseLine();
    const req = buildTaxRequestFromDraft({
      draft: baseDraft(),
      lineItems: [line],
      taxableBaseByLineId: new Map(), // empty map
      productTypeById: new Map([[line.productId!, "STANDARD"]]),
      fulfillmentCountryCode: "SE",
      buyerCountryCode: "SE",
      shopCurrency: "SEK",
      presentmentCurrency: "SEK",
    });
    expect(req.lines[0].taxableAmount).toBe(BigInt(0));
  });

  it("shippingCents > 0 → 1 shipping line", () => {
    const draft = baseDraft({ shippingCents: BigInt(2500) });
    const req = buildTaxRequestFromDraft({
      draft,
      lineItems: [],
      taxableBaseByLineId: new Map(),
      productTypeById: new Map(),
      fulfillmentCountryCode: "SE",
      buyerCountryCode: "SE",
      shopCurrency: "SEK",
      presentmentCurrency: "SEK",
    });
    expect(req.shippingLines).toHaveLength(1);
    expect(req.shippingLines[0].shippingLineId).toBe(`shipping_${draft.id}`);
    expect(req.shippingLines[0].taxableAmount).toBe(BigInt(2500));
  });

  it("shippingCents = 0 → no shipping lines", () => {
    const req = buildTaxRequestFromDraft({
      draft: baseDraft({ shippingCents: BigInt(0) }),
      lineItems: [],
      taxableBaseByLineId: new Map(),
      productTypeById: new Map(),
      fulfillmentCountryCode: "SE",
      buyerCountryCode: "SE",
      shopCurrency: "SEK",
      presentmentCurrency: "SEK",
    });
    expect(req.shippingLines).toEqual([]);
  });

  it("presentmentCurrency carried through (Q4 LOCKED — equals shopCurrency)", () => {
    const req = buildTaxRequestFromDraft({
      draft: baseDraft(),
      lineItems: [],
      taxableBaseByLineId: new Map(),
      productTypeById: new Map(),
      fulfillmentCountryCode: "SE",
      buyerCountryCode: "SE",
      shopCurrency: "SEK",
      presentmentCurrency: "SEK",
    });
    expect(req.presentmentCurrency).toBe("SEK");
    expect(req.shopCurrency).toBe("SEK");
  });

  it("empty lines array → empty TaxRequest.lines", () => {
    const req = buildTaxRequestFromDraft({
      draft: baseDraft(),
      lineItems: [],
      taxableBaseByLineId: new Map(),
      productTypeById: new Map(),
      fulfillmentCountryCode: "SE",
      buyerCountryCode: "SE",
      shopCurrency: "SEK",
      presentmentCurrency: "SEK",
    });
    expect(req.lines).toEqual([]);
  });

  it("companyLocation populated → request carries B2B context", () => {
    const draft = baseDraft({
      buyerKind: "COMPANY",
      companyLocationId: "cl_1",
    });
    const req = buildTaxRequestFromDraft({
      draft,
      lineItems: [baseLine()],
      taxableBaseByLineId: new Map([[baseLine().id, BigInt(10000)]]),
      productTypeById: new Map(),
      fulfillmentCountryCode: "SE",
      buyerCountryCode: "SE",
      shopCurrency: "SEK",
      presentmentCurrency: "SEK",
      companyLocation: {
        taxExemptions: ["EU_REVERSE_CHARGE_EXEMPTION_RULE"],
        collectMode: "COLLECT",
        vatNumber: "SE123456789",
      },
    });
    expect(req.companyLocation).toBeDefined();
    expect(req.companyLocation?.id).toBe("cl_1");
    expect(req.companyLocation?.taxExemptions).toEqual([
      "EU_REVERSE_CHARGE_EXEMPTION_RULE",
    ]);
    expect(req.companyLocation?.collectMode).toBe("COLLECT");
    expect(req.companyLocation?.vatNumber).toBe("SE123456789");
  });

  it("no companyLocation context → field omitted", () => {
    const req = buildTaxRequestFromDraft({
      draft: baseDraft(),
      lineItems: [],
      taxableBaseByLineId: new Map(),
      productTypeById: new Map(),
      fulfillmentCountryCode: "SE",
      buyerCountryCode: "SE",
      shopCurrency: "SEK",
      presentmentCurrency: "SEK",
    });
    expect(req.companyLocation).toBeUndefined();
  });

  it("multi-line: PRODUCT + ACCOMMODATION + CUSTOM in one request", () => {
    const draft = baseDraft();
    const lines: RawDraftLineItem[] = [
      baseLine({ id: "L1", productId: "p1" }),
      baseLine({
        id: "L2",
        lineType: "ACCOMMODATION",
        productId: null,
        accommodationId: "acc_1",
        checkInDate: new Date("2026-06-01"),
        checkOutDate: new Date("2026-06-06"),
      }),
      baseLine({ id: "L3", lineType: "CUSTOM", productId: null }),
    ];
    const req = buildTaxRequestFromDraft({
      draft,
      lineItems: lines,
      taxableBaseByLineId: new Map([
        ["L1", BigInt(10000)],
        ["L2", BigInt(50000)],
        ["L3", BigInt(2500)],
      ]),
      productTypeById: new Map([["p1", "STANDARD"]]),
      fulfillmentCountryCode: "SE",
      buyerCountryCode: "SE",
      shopCurrency: "SEK",
      presentmentCurrency: "SEK",
    });
    expect(req.lines).toHaveLength(3);
    expect(req.lines.map((l) => l.taxCategory)).toEqual([
      "RETAIL_GENERAL",
      "ACCOMMODATION_HOTEL",
      "FEE_OTHER",
    ]);
    expect(req.lines.map((l) => l.taxableAmount)).toEqual([
      BigInt(10000),
      BigInt(50000),
      BigInt(2500),
    ]);
  });

  it("lineId mapping preserved for response correlation", () => {
    const draft = baseDraft();
    const lines = [
      baseLine({ id: "ln_alpha" }),
      baseLine({ id: "ln_beta" }),
    ];
    const req = buildTaxRequestFromDraft({
      draft,
      lineItems: lines,
      taxableBaseByLineId: new Map([
        ["ln_alpha", BigInt(100)],
        ["ln_beta", BigInt(200)],
      ]),
      productTypeById: new Map(),
      fulfillmentCountryCode: "SE",
      buyerCountryCode: "SE",
      shopCurrency: "SEK",
      presentmentCurrency: "SEK",
    });
    expect(req.lines[0].lineId).toBe("ln_alpha");
    expect(req.lines[1].lineId).toBe("ln_beta");
  });

  it("non-taxable line still carries taxable=false to calculator", () => {
    const line = baseLine({ taxable: false });
    const req = buildTaxRequestFromDraft({
      draft: baseDraft(),
      lineItems: [line],
      taxableBaseByLineId: new Map([[line.id, BigInt(10000)]]),
      productTypeById: new Map(),
      fulfillmentCountryCode: "SE",
      buyerCountryCode: "SE",
      shopCurrency: "SEK",
      presentmentCurrency: "SEK",
    });
    expect(req.lines[0].taxable).toBe(false);
  });
});
