import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

// Mock the underlying PMS pricer. Tests control its return value per case.
// The actual implementation hits Prisma + the PMS adapter; we don't care
// about that here — we only care that our wrapper forwards arguments and
// maps the result shape correctly.
vi.mock("../accommodations/pricing", () => ({
  resolveAccommodationPrice: vi.fn(),
  AccommodationPriceError: class AccommodationPriceError extends Error {
    constructor(
      message: string,
      public readonly code: string,
    ) {
      super(message);
      this.name = "AccommodationPriceError";
    }
  },
}));

// Mock the B2B resolver. Same approach — we test the wrapper's plumbing,
// not the resolver itself (covered exhaustively by b2b-resolver.test.ts).
vi.mock("./b2b-resolver", () => ({
  resolvePriceForLocation: vi.fn(),
}));

// Prisma is mocked at the wrapper level for the Product.currency lookup.
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    productVariant: { findFirst: vi.fn() },
  },
}));

const { computeAccommodationLinePrice, computeProductLinePrice } = await import(
  "./line-pricing"
);
const { resolveAccommodationPrice, AccommodationPriceError } = await import(
  "../accommodations/pricing"
);
const { resolvePriceForLocation } = await import("./b2b-resolver");
const { prisma } = await import("@/app/_lib/db/prisma");
const { NotFoundError } = await import("../errors/service-errors");
type MockFn = ReturnType<typeof vi.fn>;
const mockResolve = resolveAccommodationPrice as unknown as MockFn;
const mockResolvePrice = resolvePriceForLocation as unknown as MockFn;
const mockVariantFindFirst = (prisma as unknown as {
  productVariant: { findFirst: MockFn };
}).productVariant.findFirst;

// ── Fixtures ─────────────────────────────────────────────────────

const BASE_INPUT = {
  tenantId: "t_1",
  accommodationId: "acc_1",
  checkInDate: "2026-06-10",
  checkOutDate: "2026-06-13",
  guestCounts: { adults: 2, children: 1, infants: 0 },
};

function mockResult(partial: Partial<{
  pricePerNight: number;
  totalPrice: number;
  nights: number;
  currency: string;
  ratePlanId: string;
  ratePlanName: string;
  cancellationPolicy: string;
  accommodationId: string;
  externalId: string;
}> = {}) {
  return {
    ratePlan: {
      externalId: partial.ratePlanId ?? "rp_flex",
      name: partial.ratePlanName ?? "Flexibel",
      description: "desc",
      cancellationPolicy: (partial.cancellationPolicy ?? "FLEXIBLE") as
        | "FLEXIBLE"
        | "MODERATE"
        | "NON_REFUNDABLE",
      cancellationDescription: "cxl desc",
      pricePerNight: partial.pricePerNight ?? 149900,
      totalPrice: partial.totalPrice ?? 449700,
      currency: partial.currency ?? "SEK",
      validFrom: null,
      validTo: null,
      includedAddons: [],
    },
    pricePerNight: partial.pricePerNight ?? 149900,
    totalPrice: partial.totalPrice ?? 449700,
    nights: partial.nights ?? 3,
    currency: partial.currency ?? "SEK",
    accommodationId: partial.accommodationId ?? "acc_1",
    externalId: partial.externalId ?? "ext_acc_1",
  };
}

beforeEach(() => {
  mockResolve.mockReset();
});

// ── Tests ────────────────────────────────────────────────────────

describe("computeAccommodationLinePrice", () => {
  it("forwards tenantId, accommodationId, dates, guests total, and ratePlanId to resolveAccommodationPrice", async () => {
    mockResolve.mockResolvedValue(mockResult());
    await computeAccommodationLinePrice({
      ...BASE_INPUT,
      ratePlanId: "rp_flex",
    });

    expect(mockResolve).toHaveBeenCalledTimes(1);
    const call = mockResolve.mock.calls[0][0];
    expect(call.tenantId).toBe("t_1");
    expect(call.accommodationId).toBe("acc_1");
    expect(call.ratePlanId).toBe("rp_flex");
    // guests flattened from adults + children (infants ignored)
    expect(call.guests).toBe(3);
    expect(call.checkIn).toBeInstanceOf(Date);
    expect(call.checkOut).toBeInstanceOf(Date);
    expect(call.checkIn.toISOString().slice(0, 10)).toBe("2026-06-10");
    expect(call.checkOut.toISOString().slice(0, 10)).toBe("2026-06-13");
  });

  it("always returns sourceRule = 'LIVE_PMS' (per Pass 3 Risk #8)", async () => {
    mockResolve.mockResolvedValue(mockResult());
    const out = await computeAccommodationLinePrice(BASE_INPUT);
    expect(out.sourceRule).toBe("LIVE_PMS");
  });

  it("always returns appliedCatalogId = null for accommodation lines", async () => {
    mockResolve.mockResolvedValue(mockResult());
    const out = await computeAccommodationLinePrice(BASE_INPUT);
    expect(out.appliedCatalogId).toBeNull();
  });

  it("maps resolveAccommodationPrice fields into the result shape", async () => {
    mockResolve.mockResolvedValue(
      mockResult({
        pricePerNight: 200000, // 2000 kr
        totalPrice: 600000, // 3 nights × 2000 kr
        nights: 3,
        currency: "EUR",
        ratePlanId: "rp_nonref",
        ratePlanName: "Non-refundable",
        cancellationPolicy: "NON_REFUNDABLE",
      }),
    );
    const out = await computeAccommodationLinePrice(BASE_INPUT);
    expect(out.unitPriceCents).toBe(BigInt(200000));
    expect(out.subtotalCents).toBe(BigInt(600000));
    expect(out.nights).toBe(3);
    expect(out.currency).toBe("EUR");
    expect(out.ratePlan).toEqual({
      id: "rp_nonref",
      name: "Non-refundable",
      cancellationPolicy: "NON_REFUNDABLE",
    });
  });

  it("propagates errors from resolveAccommodationPrice without wrapping", async () => {
    const err = new AccommodationPriceError(
      "PMS down",
      "PMS_UNAVAILABLE",
    );
    mockResolve.mockRejectedValue(err);
    await expect(computeAccommodationLinePrice(BASE_INPUT)).rejects.toBe(err);
  });

  it("works with ratePlanId omitted (passes undefined through to underlying pricer)", async () => {
    mockResolve.mockResolvedValue(mockResult());
    await computeAccommodationLinePrice(BASE_INPUT);
    expect(mockResolve.mock.calls[0][0].ratePlanId).toBeUndefined();
  });

  it("accepts an optional currency preference input (PMS currency still wins in output)", async () => {
    // Caller hints EUR, PMS returns SEK — output mirrors PMS.
    mockResolve.mockResolvedValue(mockResult({ currency: "SEK" }));
    const out = await computeAccommodationLinePrice({
      ...BASE_INPUT,
      currency: "EUR",
    });
    expect(out.currency).toBe("SEK");
  });

  it("does not mutate the input object", async () => {
    mockResolve.mockResolvedValue(mockResult());
    const input = {
      ...BASE_INPUT,
      guestCounts: { ...BASE_INPUT.guestCounts },
    };
    const snapshot = JSON.stringify(input);
    await computeAccommodationLinePrice(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("surfaces accommodationExternalId from Accommodation.externalId, distinct from ratePlan.externalId", async () => {
    // The two "externalId" values have very different meanings:
    //   - Accommodation.externalId = the PMS room-category id (used downstream
    //     by the route to populate Booking.unit)
    //   - RatePlan.externalId = the PMS rate plan id (surfaced as ratePlan.id)
    // This test pins that we don't conflate them.
    mockResolve.mockResolvedValue(
      mockResult({
        externalId: "ext_acc_roomcat_xyz",
        ratePlanId: "ext_rateplan_abc",
      }),
    );
    const out = await computeAccommodationLinePrice(BASE_INPUT);
    expect(out.accommodationExternalId).toBe("ext_acc_roomcat_xyz");
    expect(out.ratePlan.id).toBe("ext_rateplan_abc");
    expect(out.accommodationExternalId).not.toBe(out.ratePlan.id);
  });
});

// ═══════════════════════════════════════════════════════════════
// computeProductLinePrice
// ═══════════════════════════════════════════════════════════════

const PRODUCT_BASE_INPUT = {
  tenantId: "t_1",
  productVariantId: "pv_1",
  quantity: 1,
  buyerContext: { kind: "guest" as const, guestAccountId: "ga_1" },
};

function mockResolverReturn(overrides: Partial<{
  priceCents: bigint;
  basePriceCents: bigint;
  appliedCatalogId: string | null;
  appliedRule: "BASE" | "FIXED" | "VOLUME" | "ADJUSTMENT";
  appliedTierMinQty: number | null;
}> = {}) {
  return {
    priceCents: overrides.priceCents ?? BigInt(10000),
    basePriceCents: overrides.basePriceCents ?? BigInt(10000),
    appliedCatalogId: overrides.appliedCatalogId ?? null,
    appliedRule: overrides.appliedRule ?? "BASE",
    appliedTierMinQty: overrides.appliedTierMinQty ?? null,
    resolvedAt: new Date("2026-04-23T10:00:00.000Z"),
  };
}

function mockVariantCurrency(currency: string) {
  mockVariantFindFirst.mockResolvedValue({ product: { currency } });
}

describe("computeProductLinePrice — buyerContext → companyLocationId routing", () => {
  beforeEach(() => {
    mockResolvePrice.mockReset();
    mockVariantFindFirst.mockReset();
  });

  it("passes companyLocationId when buyerContext.kind === 'company'", async () => {
    mockResolvePrice.mockResolvedValue(mockResolverReturn());
    mockVariantCurrency("SEK");
    await computeProductLinePrice({
      ...PRODUCT_BASE_INPUT,
      buyerContext: {
        kind: "company",
        companyLocationId: "cl_42",
        companyContactId: "cc_1",
      },
    });
    expect(mockResolvePrice).toHaveBeenCalledTimes(1);
    const call = mockResolvePrice.mock.calls[0][0];
    expect(call.companyLocationId).toBe("cl_42");
    expect(call.productRef).toEqual({ type: "variant", id: "pv_1" });
    expect(call.quantity).toBe(1);
  });

  it("passes companyLocationId: null when buyerContext.kind === 'guest'", async () => {
    mockResolvePrice.mockResolvedValue(mockResolverReturn());
    mockVariantCurrency("SEK");
    await computeProductLinePrice({
      ...PRODUCT_BASE_INPUT,
      buyerContext: { kind: "guest", guestAccountId: "ga_x" },
    });
    expect(mockResolvePrice.mock.calls[0][0].companyLocationId).toBeNull();
  });

  it("passes companyLocationId: null when buyerContext.kind === 'walk_in'", async () => {
    mockResolvePrice.mockResolvedValue(mockResolverReturn());
    mockVariantCurrency("SEK");
    await computeProductLinePrice({
      ...PRODUCT_BASE_INPUT,
      buyerContext: { kind: "walk_in" },
    });
    expect(mockResolvePrice.mock.calls[0][0].companyLocationId).toBeNull();
  });
});

describe("computeProductLinePrice — appliedRule pass-through", () => {
  beforeEach(() => {
    mockResolvePrice.mockReset();
    mockVariantFindFirst.mockReset();
    mockVariantCurrency("SEK");
  });

  it("BASE rule + null appliedCatalogId (guest path)", async () => {
    mockResolvePrice.mockResolvedValue(
      mockResolverReturn({ appliedRule: "BASE", appliedCatalogId: null }),
    );
    const out = await computeProductLinePrice(PRODUCT_BASE_INPUT);
    expect(out.sourceRule).toBe("BASE");
    expect(out.appliedCatalogId).toBeNull();
  });

  it("FIXED rule carries appliedCatalogId from resolver", async () => {
    mockResolvePrice.mockResolvedValue(
      mockResolverReturn({
        appliedRule: "FIXED",
        appliedCatalogId: "cat_fixed",
        priceCents: BigInt(7500),
      }),
    );
    const out = await computeProductLinePrice({
      ...PRODUCT_BASE_INPUT,
      buyerContext: { kind: "company", companyLocationId: "cl_1" },
    });
    expect(out.sourceRule).toBe("FIXED");
    expect(out.appliedCatalogId).toBe("cat_fixed");
    expect(out.unitPriceCents).toBe(BigInt(7500));
  });

  it("VOLUME rule carries appliedCatalogId (quantity-aware)", async () => {
    mockResolvePrice.mockResolvedValue(
      mockResolverReturn({
        appliedRule: "VOLUME",
        appliedCatalogId: "cat_volume",
        appliedTierMinQty: 10,
        priceCents: BigInt(800),
      }),
    );
    const out = await computeProductLinePrice({
      ...PRODUCT_BASE_INPUT,
      quantity: 12,
      buyerContext: { kind: "company", companyLocationId: "cl_1" },
    });
    expect(out.sourceRule).toBe("VOLUME");
    expect(out.appliedCatalogId).toBe("cat_volume");
    expect(out.unitPriceCents).toBe(BigInt(800));
  });

  it("ADJUSTMENT rule carries appliedCatalogId", async () => {
    mockResolvePrice.mockResolvedValue(
      mockResolverReturn({
        appliedRule: "ADJUSTMENT",
        appliedCatalogId: "cat_adj",
        priceCents: BigInt(9000),
      }),
    );
    const out = await computeProductLinePrice({
      ...PRODUCT_BASE_INPUT,
      buyerContext: { kind: "company", companyLocationId: "cl_1" },
    });
    expect(out.sourceRule).toBe("ADJUSTMENT");
    expect(out.appliedCatalogId).toBe("cat_adj");
  });
});

describe("computeProductLinePrice — subtotal math", () => {
  beforeEach(() => {
    mockResolvePrice.mockReset();
    mockVariantFindFirst.mockReset();
    mockVariantCurrency("SEK");
  });

  it("subtotalCents = unitPriceCents × 1", async () => {
    mockResolvePrice.mockResolvedValue(
      mockResolverReturn({ priceCents: BigInt(12345) }),
    );
    const out = await computeProductLinePrice({
      ...PRODUCT_BASE_INPUT,
      quantity: 1,
    });
    expect(out.unitPriceCents).toBe(BigInt(12345));
    expect(out.subtotalCents).toBe(BigInt(12345));
    expect(out.quantity).toBe(1);
  });

  it("subtotalCents = unitPriceCents × 2", async () => {
    mockResolvePrice.mockResolvedValue(
      mockResolverReturn({ priceCents: BigInt(5000) }),
    );
    const out = await computeProductLinePrice({
      ...PRODUCT_BASE_INPUT,
      quantity: 2,
    });
    expect(out.subtotalCents).toBe(BigInt(10000));
  });

  it("subtotalCents = unitPriceCents × 10", async () => {
    mockResolvePrice.mockResolvedValue(
      mockResolverReturn({ priceCents: BigInt(999) }),
    );
    const out = await computeProductLinePrice({
      ...PRODUCT_BASE_INPUT,
      quantity: 10,
    });
    expect(out.subtotalCents).toBe(BigInt(9990));
  });
});

describe("computeProductLinePrice — currency handling", () => {
  beforeEach(() => {
    mockResolvePrice.mockReset();
    mockVariantFindFirst.mockReset();
    mockResolvePrice.mockResolvedValue(mockResolverReturn());
  });

  it("loads currency from Product.currency via Prisma, not from input", async () => {
    mockVariantCurrency("EUR");
    const out = await computeProductLinePrice(PRODUCT_BASE_INPUT);
    expect(out.currency).toBe("EUR");
    expect(mockVariantFindFirst).toHaveBeenCalledTimes(1);
    const call = mockVariantFindFirst.mock.calls[0][0];
    expect(call.where.id).toBe("pv_1");
    expect(call.where.product.tenantId).toBe("t_1");
    expect(call.select.product.select.currency).toBe(true);
  });

  it("caller's input.currency is IGNORED — Product.currency always wins", async () => {
    mockVariantCurrency("NOK");
    const out = await computeProductLinePrice({
      ...PRODUCT_BASE_INPUT,
      currency: "EUR", // caller preference, should be ignored
    });
    expect(out.currency).toBe("NOK");
  });
});

describe("computeProductLinePrice — error handling", () => {
  beforeEach(() => {
    mockResolvePrice.mockReset();
    mockVariantFindFirst.mockReset();
  });

  it("throws NotFoundError when variant lookup returns null", async () => {
    mockResolvePrice.mockResolvedValue(mockResolverReturn());
    mockVariantFindFirst.mockResolvedValue(null);
    await expect(
      computeProductLinePrice(PRODUCT_BASE_INPUT),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("propagates resolver errors unwrapped", async () => {
    const err = new NotFoundError("Product not found in tenant", {
      type: "variant",
      id: "pv_missing",
    });
    mockResolvePrice.mockRejectedValue(err);
    // Variant lookup never happens — resolver throws first.
    await expect(
      computeProductLinePrice(PRODUCT_BASE_INPUT),
    ).rejects.toBe(err);
  });
});

describe("computeProductLinePrice — input + quantity invariants", () => {
  beforeEach(() => {
    mockResolvePrice.mockReset();
    mockVariantFindFirst.mockReset();
    mockResolvePrice.mockResolvedValue(mockResolverReturn());
    mockVariantCurrency("SEK");
  });

  it("does not mutate the input object", async () => {
    const input = {
      ...PRODUCT_BASE_INPUT,
      buyerContext: { ...PRODUCT_BASE_INPUT.buyerContext },
    };
    const snapshot = JSON.stringify(input);
    await computeProductLinePrice(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("passes quantity unchanged to the resolver (volume correctness)", async () => {
    await computeProductLinePrice({
      ...PRODUCT_BASE_INPUT,
      quantity: 7,
    });
    expect(mockResolvePrice.mock.calls[0][0].quantity).toBe(7);
  });
});
