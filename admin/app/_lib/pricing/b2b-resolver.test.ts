import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { NotFoundError } from "../errors/service-errors";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    accommodation: { findMany: vi.fn() },
    productVariant: { findMany: vi.fn() },
    catalog: { findMany: vi.fn() },
    productCollectionItem: { findMany: vi.fn() },
  },
}));

// effectivePrice is a pure helper — no mock needed. Confirmed pure in the
// exploration report (app/_lib/products/pricing.ts).

const {
  resolvePriceForLocation,
  batchResolvePricesForLocation,
  __internal,
} = await import("./b2b-resolver");
const { prisma } = await import("@/app/_lib/db/prisma");
type MockPrisma = {
  accommodation: Record<string, ReturnType<typeof vi.fn>>;
  productVariant: Record<string, ReturnType<typeof vi.fn>>;
  catalog: Record<string, ReturnType<typeof vi.fn>>;
  productCollectionItem: Record<string, ReturnType<typeof vi.fn>>;
};
const m = prisma as unknown as MockPrisma;

const TENANT = "t_1";
const LOCATION = "cl_1";
const now = new Date("2026-04-22T10:00:00.000Z");

function resetAllMocks(): void {
  for (const model of [
    m.accommodation,
    m.productVariant,
    m.catalog,
    m.productCollectionItem,
  ]) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  // Default: no collection memberships unless a test says otherwise.
  m.productCollectionItem.findMany.mockResolvedValue([]);
}

function mockAccommodationBase(id: string, basePricePerNight: number) {
  m.accommodation.findMany.mockResolvedValue([
    { id, basePricePerNight },
  ]);
}

function mockVariantBase(
  id: string,
  productPrice: number,
  variantPrice: number,
  productId = "p_1",
) {
  m.productVariant.findMany.mockResolvedValue([
    { id, price: variantPrice, productId, product: { price: productPrice } },
  ]);
}

function catalog(overrides: Partial<{
  id: string;
  createdAt: Date;
  includeAllProducts: boolean;
  overallAdjustmentPercent: Prisma.Decimal | null;
  fixedPrices: unknown[];
  quantityRules: unknown[];
  inclusions: unknown[];
}> = {}) {
  return {
    id: overrides.id ?? "ca_a",
    tenantId: TENANT,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    includeAllProducts: overrides.includeAllProducts ?? true,
    overallAdjustmentPercent: overrides.overallAdjustmentPercent ?? null,
    fixedPrices: overrides.fixedPrices ?? [],
    quantityRules: overrides.quantityRules ?? [],
    inclusions: overrides.inclusions ?? [],
  };
}

// ── 1. Short-circuit: null locationId ───────────────────────────

describe("companyLocationId null → BASE", () => {
  beforeEach(() => resetAllMocks());

  it("returns base without loading any catalogs", async () => {
    mockAccommodationBase("acc_1", 50000);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: null,
      productRef: { type: "accommodation", id: "acc_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(50000));
    expect(out.basePriceCents).toBe(BigInt(50000));
    expect(out.appliedRule).toBe("BASE");
    expect(out.appliedCatalogId).toBeNull();
    expect(m.catalog.findMany).not.toHaveBeenCalled();
  });
});

// ── 2. Location with zero catalogs → BASE ───────────────────────

describe("location with zero assigned catalogs → BASE", () => {
  beforeEach(() => resetAllMocks());

  it("returns base", async () => {
    mockAccommodationBase("acc_1", 80000);
    m.catalog.findMany.mockResolvedValue([]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "accommodation", id: "acc_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(80000));
    expect(out.appliedRule).toBe("BASE");
  });
});

// ── 3. Adjustment only, includeAllProducts=true ────────────────

describe("single catalog, includeAll + adjustment", () => {
  beforeEach(() => resetAllMocks());

  it("applies the adjustment", async () => {
    mockAccommodationBase("acc_1", 10000);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-10"),
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "accommodation", id: "acc_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(9000));
    expect(out.appliedRule).toBe("ADJUSTMENT");
    expect(out.appliedCatalogId).toBe("ca_a");
  });
});

// ── 4. includeAll=false, no inclusion → BASE ────────────────────

describe("single catalog, not including the product", () => {
  beforeEach(() => resetAllMocks());

  it("returns BASE when the catalog does not cover the product", async () => {
    mockAccommodationBase("acc_1", 10000);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: false,
        overallAdjustmentPercent: new Prisma.Decimal("-10"),
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "accommodation", id: "acc_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(10000));
    expect(out.appliedRule).toBe("BASE");
    expect(out.appliedCatalogId).toBeNull();
  });
});

// ── 5. Explicit inclusion → adjustment applies ──────────────────

describe("single catalog, explicit Inclusion", () => {
  beforeEach(() => resetAllMocks());

  it("applies when an Inclusion row matches the ref", async () => {
    mockAccommodationBase("acc_1", 10000);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: false,
        overallAdjustmentPercent: new Prisma.Decimal("-20"),
        inclusions: [
          {
            id: "inc_1",
            accommodationId: "acc_1",
            productVariantId: null,
            collectionId: null,
          },
        ],
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "accommodation", id: "acc_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(8000));
    expect(out.appliedRule).toBe("ADJUSTMENT");
  });
});

// ── 6. Collection inclusion, variant in collection → adjusted ──
// ── 7. Collection inclusion, variant NOT in collection → BASE ──

describe("collection-based Inclusion for variants", () => {
  beforeEach(() => resetAllMocks());

  it("adjusts when the variant's product is in the collection", async () => {
    mockVariantBase("pv_1", 1000, 0, "prod_1");
    m.productCollectionItem.findMany.mockResolvedValue([
      { productId: "prod_1", collectionId: "col_1" },
    ]);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: false,
        overallAdjustmentPercent: new Prisma.Decimal("-20"),
        inclusions: [
          {
            id: "inc_1",
            accommodationId: null,
            productVariantId: null,
            collectionId: "col_1",
          },
        ],
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(800));
    expect(out.appliedRule).toBe("ADJUSTMENT");
  });

  it("returns BASE when the variant's product is NOT in the collection", async () => {
    mockVariantBase("pv_1", 1000, 0, "prod_unrelated");
    // productCollectionItem.findMany returns [] by default (no memberships)
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: false,
        overallAdjustmentPercent: new Prisma.Decimal("-20"),
        inclusions: [
          {
            id: "inc_1",
            accommodationId: null,
            productVariantId: null,
            collectionId: "col_1",
          },
        ],
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(1000));
    expect(out.appliedRule).toBe("BASE");
  });
});

// ── 8. Fixed price only ────────────────────────────────────────

describe("single catalog, fixed price only", () => {
  beforeEach(() => resetAllMocks());

  it("applies the fixed price", async () => {
    mockVariantBase("pv_1", 10000, 0);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: false,
        fixedPrices: [
          {
            id: "cfp_1",
            accommodationId: null,
            productVariantId: "pv_1",
            fixedPriceCents: BigInt(7500),
          },
        ],
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(7500));
    expect(out.appliedRule).toBe("FIXED");
  });
});

// ── 9. Fixed beats adjustment ──────────────────────────────────

describe("fixed price + adjustment on same catalog", () => {
  beforeEach(() => resetAllMocks());

  it("fixed wins over adjustment (even if adjustment would be lower)", async () => {
    // Adjustment at -90% would give 1000; fixed is 7500. Fixed still wins
    // because the algorithm checks volume → fixed → adjustment within the
    // candidate. Confirmed: fixed takes precedence.
    mockVariantBase("pv_1", 10000, 0);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-90"),
        fixedPrices: [
          {
            id: "cfp_1",
            accommodationId: null,
            productVariantId: "pv_1",
            fixedPriceCents: BigInt(7500),
          },
        ],
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(7500));
    expect(out.appliedRule).toBe("FIXED");
  });
});

// ── 10. Volume tier exact boundary ─────────────────────────────

describe("volume tier at exact boundary (qty = tier.minQty)", () => {
  beforeEach(() => resetAllMocks());

  it("matches the tier", async () => {
    mockVariantBase("pv_1", 10000, 0);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: true,
        quantityRules: [
          {
            id: "qr_1",
            accommodationId: null,
            productVariantId: "pv_1",
            volumePricing: [
              { minQty: 10, priceCents: "9000" },
              { minQty: 50, priceCents: "7500" },
            ],
          },
        ],
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 10,
    });
    expect(out.priceCents).toBe(BigInt(9000));
    expect(out.appliedRule).toBe("VOLUME");
    expect(out.appliedTierMinQty).toBe(10);
  });
});

// ── 11. Volume below lowest tier → falls through to fixed/adj ─

describe("volume below lowest tier", () => {
  beforeEach(() => resetAllMocks());

  it("falls through to fixed price when no tier matches", async () => {
    mockVariantBase("pv_1", 10000, 0);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: true,
        quantityRules: [
          {
            id: "qr_1",
            accommodationId: null,
            productVariantId: "pv_1",
            volumePricing: [{ minQty: 10, priceCents: "9000" }],
          },
        ],
        fixedPrices: [
          {
            id: "cfp_1",
            accommodationId: null,
            productVariantId: "pv_1",
            fixedPriceCents: BigInt(9500),
          },
        ],
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 3,
    });
    expect(out.priceCents).toBe(BigInt(9500));
    expect(out.appliedRule).toBe("FIXED");
  });
});

// ── 12. Volume wins over fixed + adjustment on same catalog ────

describe("volume + fixed + adjustment on same catalog", () => {
  beforeEach(() => resetAllMocks());

  it("volume wins when a tier matches", async () => {
    mockVariantBase("pv_1", 10000, 0);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-5"),
        fixedPrices: [
          {
            id: "cfp_1",
            accommodationId: null,
            productVariantId: "pv_1",
            fixedPriceCents: BigInt(9400),
          },
        ],
        quantityRules: [
          {
            id: "qr_1",
            accommodationId: null,
            productVariantId: "pv_1",
            volumePricing: [{ minQty: 5, priceCents: "8000" }],
          },
        ],
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 10,
    });
    expect(out.priceCents).toBe(BigInt(8000));
    expect(out.appliedRule).toBe("VOLUME");
  });
});

// ── 13. Two catalogs, lowest wins ──────────────────────────────

describe("two catalogs — lowest price wins", () => {
  beforeEach(() => resetAllMocks());

  it("picks the catalog with the lower fixed price", async () => {
    mockVariantBase("pv_1", 10000, 0);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        id: "ca_a",
        createdAt: new Date("2026-01-01"),
        includeAllProducts: false,
        fixedPrices: [
          {
            id: "cfp_a",
            accommodationId: null,
            productVariantId: "pv_1",
            fixedPriceCents: BigInt(8000),
          },
        ],
      }),
      catalog({
        id: "ca_b",
        createdAt: new Date("2026-02-01"),
        includeAllProducts: false,
        fixedPrices: [
          {
            id: "cfp_b",
            accommodationId: null,
            productVariantId: "pv_1",
            fixedPriceCents: BigInt(7500),
          },
        ],
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(7500));
    expect(out.appliedCatalogId).toBe("ca_b");
  });
});

// ── 14. Tie → earliest-created wins ────────────────────────────

describe("two catalogs tied — earliest-created wins", () => {
  beforeEach(() => resetAllMocks());

  it("is deterministic on tiebreak", async () => {
    mockVariantBase("pv_1", 10000, 0);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        id: "ca_earlier",
        createdAt: new Date("2026-01-01"),
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-20"),
      }),
      catalog({
        id: "ca_later",
        createdAt: new Date("2026-03-01"),
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-20"),
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(out.appliedCatalogId).toBe("ca_earlier");
  });
});

// ── 15. Mixed coverage — inclusion vs includeAll ───────────────

describe("mixed coverage — one via inclusion, one via includeAll", () => {
  beforeEach(() => resetAllMocks());

  it("the lowest candidate still wins", async () => {
    mockVariantBase("pv_1", 10000, 0, "prod_x");
    m.productCollectionItem.findMany.mockResolvedValue([]);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        id: "ca_inc",
        createdAt: new Date("2026-01-01"),
        includeAllProducts: false,
        overallAdjustmentPercent: new Prisma.Decimal("-15"),
        inclusions: [
          {
            id: "inc_1",
            accommodationId: null,
            productVariantId: "pv_1",
            collectionId: null,
          },
        ],
      }),
      catalog({
        id: "ca_all",
        createdAt: new Date("2026-02-01"),
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-25"),
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    // -25% of 10000 = 7500, wins over -15% of 10000 = 8500.
    expect(out.priceCents).toBe(BigInt(7500));
    expect(out.appliedCatalogId).toBe("ca_all");
  });
});

// ── 16. Banker's rounding, -20% of 1099 ────────────────────────

describe("adjustment arithmetic with banker's rounding", () => {
  beforeEach(() => resetAllMocks());

  it("-20% of 1099 = 879 (1099 × 80 / 100 = 879.20 → rounds down)", async () => {
    mockVariantBase("pv_1", 1099, 0);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-20"),
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(879));
  });

  it("exact-half rounds to even (5 halves up, 4 halves down)", () => {
    // 2.5 → 2, 3.5 → 4, 4.5 → 4, 5.5 → 6
    expect(__internal.bankerDivide(BigInt(5), BigInt(2))).toBe(BigInt(2));
    expect(__internal.bankerDivide(BigInt(7), BigInt(2))).toBe(BigInt(4));
    expect(__internal.bankerDivide(BigInt(9), BigInt(2))).toBe(BigInt(4));
    expect(__internal.bankerDivide(BigInt(11), BigInt(2))).toBe(BigInt(6));
  });

  it("converts Decimal to basis-points-like integer", () => {
    expect(__internal.adjustmentToBasisPoints(new Prisma.Decimal("15.25"))).toBe(
      BigInt(1525),
    );
    expect(__internal.adjustmentToBasisPoints(new Prisma.Decimal("-20"))).toBe(
      BigInt(-2000),
    );
    expect(__internal.adjustmentToBasisPoints(null)).toBeNull();
  });
});

// ── 17. DRAFT catalog excluded ─────────────────────────────────

describe("DRAFT catalog is excluded", () => {
  beforeEach(() => resetAllMocks());

  it("the where-clause filters status=ACTIVE", async () => {
    mockVariantBase("pv_1", 10000, 0);
    m.catalog.findMany.mockResolvedValue([]); // what Prisma would return for status=ACTIVE
    await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(m.catalog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });
});

// ── 18. Cross-tenant catalog excluded ──────────────────────────

describe("cross-tenant catalog is excluded", () => {
  beforeEach(() => resetAllMocks());

  it("the where-clause filters by tenantId", async () => {
    mockVariantBase("pv_1", 10000, 0);
    m.catalog.findMany.mockResolvedValue([]);
    await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(m.catalog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });
});

// ── 19. Batch — catalogs fetched ONCE ──────────────────────────

describe("batchResolvePricesForLocation batching", () => {
  beforeEach(() => resetAllMocks());

  it("fetches catalogs exactly once for N items", async () => {
    m.productVariant.findMany.mockResolvedValue([
      { id: "pv_1", price: 0, productId: "p_1", product: { price: 1000 } },
      { id: "pv_2", price: 500, productId: "p_2", product: { price: 2000 } },
    ]);
    m.catalog.findMany.mockResolvedValue([]);
    await batchResolvePricesForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      items: [
        { productRef: { type: "variant", id: "pv_1" }, quantity: 1 },
        { productRef: { type: "variant", id: "pv_2" }, quantity: 3 },
      ],
    });
    expect(m.catalog.findMany).toHaveBeenCalledTimes(1);
    // variants and accommodations each batch into one findMany.
    expect(m.productVariant.findMany).toHaveBeenCalledTimes(1);
  });
});

// ── 20. basePriceCents always present on response ──────────────

describe("basePriceCents is always returned", () => {
  beforeEach(() => resetAllMocks());

  it("when a catalog wins — callers can show 'you save X'", async () => {
    mockVariantBase("pv_1", 10000, 0);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-10"),
      }),
    ]);
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(out.priceCents).toBe(BigInt(9000));
    expect(out.basePriceCents).toBe(BigInt(10000));
    expect(out.basePriceCents - out.priceCents).toBe(BigInt(1000));
  });
});

// ── Missing-product behaviour ──────────────────────────────────

describe("product missing in tenant", () => {
  beforeEach(() => resetAllMocks());

  it("throws NotFoundError for an accommodation that does not exist", async () => {
    m.accommodation.findMany.mockResolvedValue([]);
    await expect(
      resolvePriceForLocation({
        tenantId: TENANT,
        companyLocationId: null,
        productRef: { type: "accommodation", id: "acc_missing" },
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── resolvedAt semantics ───────────────────────────────────────

describe("resolvedAt", () => {
  beforeEach(() => resetAllMocks());

  it("is a Date close to call time", async () => {
    mockAccommodationBase("acc_1", 100);
    const before = Date.now();
    const out = await resolvePriceForLocation({
      tenantId: TENANT,
      companyLocationId: null,
      productRef: { type: "accommodation", id: "acc_1" },
      quantity: 1,
    });
    const after = Date.now();
    expect(out.resolvedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(out.resolvedAt.getTime()).toBeLessThanOrEqual(after);
    // Reference time to satisfy unused-warning for `now`.
    expect(now.getTime()).toBeGreaterThan(0);
  });
});
