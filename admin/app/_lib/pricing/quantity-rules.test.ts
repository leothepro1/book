import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    productVariant: { findMany: vi.fn() },
    catalog: { findMany: vi.fn() },
    productCollectionItem: { findMany: vi.fn() },
    catalogQuantityRule: { findMany: vi.fn() },
  },
}));

const { validateQuantityForLocation, batchValidate } = await import(
  "./quantity-rules"
);
const { prisma } = await import("@/app/_lib/db/prisma");
type MockPrisma = {
  productVariant: Record<string, ReturnType<typeof vi.fn>>;
  catalog: Record<string, ReturnType<typeof vi.fn>>;
  productCollectionItem: Record<string, ReturnType<typeof vi.fn>>;
  catalogQuantityRule: Record<string, ReturnType<typeof vi.fn>>;
};
const m = prisma as unknown as MockPrisma;

const TENANT = "t_1";
const LOCATION = "cl_1";

function reset(): void {
  for (const model of [
    m.productVariant,
    m.catalog,
    m.productCollectionItem,
    m.catalogQuantityRule,
  ]) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  m.productCollectionItem.findMany.mockResolvedValue([]);
}

function mockVariant(id = "pv_1", productId = "p_1", unit = 10000): void {
  m.productVariant.findMany.mockResolvedValue([
    { id, price: 0, productId, product: { price: unit } },
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
    createdAt: overrides.createdAt ?? new Date("2026-01-01"),
    includeAllProducts: overrides.includeAllProducts ?? true,
    overallAdjustmentPercent: overrides.overallAdjustmentPercent ?? null,
    fixedPrices: overrides.fixedPrices ?? [],
    quantityRules: overrides.quantityRules ?? [],
    inclusions: overrides.inclusions ?? [],
  };
}

describe("no rules → null", () => {
  beforeEach(() => reset());

  it("returns null when no catalog covers the product", async () => {
    mockVariant();
    m.catalog.findMany.mockResolvedValue([]);
    const v = await validateQuantityForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(v).toBeNull();
  });

  it("returns null when the winning catalog has NO quantity rule for this product", async () => {
    mockVariant();
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-10"),
      }),
    ]);
    m.catalogQuantityRule.findMany.mockResolvedValue([]);
    const v = await validateQuantityForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 1,
    });
    expect(v).toBeNull();
  });
});

describe("violation detection", () => {
  beforeEach(() => reset());

  async function runWith(ruleRow: Record<string, unknown>, quantity: number) {
    mockVariant();
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-10"),
      }),
    ]);
    m.catalogQuantityRule.findMany.mockResolvedValue([ruleRow]);
    return validateQuantityForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity,
    });
  }

  it("BELOW_MIN when quantity < minQuantity", async () => {
    const v = await runWith(
      {
        catalogId: "ca_a",
        productVariantId: "pv_1",
        minQuantity: 5,
        maxQuantity: null,
        increment: null,
      },
      2,
    );
    expect(v).toEqual({ code: "BELOW_MIN", required: 5, actual: 2 });
  });

  it("ABOVE_MAX when quantity > maxQuantity", async () => {
    const v = await runWith(
      {
        catalogId: "ca_a",
        productVariantId: "pv_1",
        minQuantity: null,
        maxQuantity: 10,
        increment: null,
      },
      12,
    );
    expect(v).toEqual({ code: "ABOVE_MAX", required: 10, actual: 12 });
  });

  it("INVALID_INCREMENT when quantity not a multiple of increment", async () => {
    const v = await runWith(
      {
        catalogId: "ca_a",
        productVariantId: "pv_1",
        minQuantity: null,
        maxQuantity: null,
        increment: 6,
      },
      10,
    );
    expect(v).toEqual({ code: "INVALID_INCREMENT", increment: 6, actual: 10 });
  });

  it("returns null when all three checks pass", async () => {
    const v = await runWith(
      {
        catalogId: "ca_a",
        productVariantId: "pv_1",
        minQuantity: 5,
        maxQuantity: 100,
        increment: 5,
      },
      25,
    );
    expect(v).toBeNull();
  });
});

describe("rules follow the winning catalog", () => {
  beforeEach(() => reset());

  it("uses winning-catalog rules even when the losing catalog has stricter rules", async () => {
    mockVariant();
    m.catalog.findMany.mockResolvedValue([
      catalog({
        id: "ca_winner",
        createdAt: new Date("2026-01-01"),
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-30"), // lower price
      }),
      catalog({
        id: "ca_loser",
        createdAt: new Date("2026-02-01"),
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-10"), // higher price
      }),
    ]);
    // Only the winning catalog's rule is returned to the validator because
    // it fetches rules for the winning catalog IDs only. Confirm behaviour
    // by mocking a permissive rule on winner and a strict rule on loser —
    // the strict one must NOT be consulted.
    m.catalogQuantityRule.findMany.mockImplementation(async (args: unknown) => {
      const a = args as { where?: { catalogId?: { in?: string[] } } };
      const ids = a.where?.catalogId?.in ?? [];
      if (ids.includes("ca_winner") && !ids.includes("ca_loser")) {
        return [
          {
            catalogId: "ca_winner",
            productVariantId: "pv_1",
            minQuantity: 1, // permissive
            maxQuantity: null,
            increment: null,
          },
        ];
      }
      throw new Error("validator queried losing-catalog rules");
    });

    const v = await validateQuantityForLocation({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      productRef: { type: "variant", id: "pv_1" },
      quantity: 2,
    });
    // Permissive winner rule passes; strict loser rule was never consulted.
    expect(v).toBeNull();
  });
});

describe("batchValidate", () => {
  beforeEach(() => reset());

  it("returns per-item results preserving input order", async () => {
    m.productVariant.findMany.mockResolvedValue([
      { id: "pv_1", price: 0, productId: "p_1", product: { price: 1000 } },
      { id: "pv_2", price: 0, productId: "p_2", product: { price: 2000 } },
    ]);
    m.catalog.findMany.mockResolvedValue([
      catalog({
        includeAllProducts: true,
        overallAdjustmentPercent: new Prisma.Decimal("-10"),
      }),
    ]);
    m.catalogQuantityRule.findMany.mockResolvedValue([
      {
        catalogId: "ca_a",
        productVariantId: "pv_1",
        minQuantity: 10,
        maxQuantity: null,
        increment: null,
      },
      // pv_2 has no rule → null violation
    ]);
    const out = await batchValidate({
      tenantId: TENANT,
      companyLocationId: LOCATION,
      items: [
        { productRef: { type: "variant", id: "pv_1" }, quantity: 2 },
        { productRef: { type: "variant", id: "pv_2" }, quantity: 2 },
      ],
    });
    expect(out[0].violation).toEqual({
      code: "BELOW_MIN",
      required: 10,
      actual: 2,
    });
    expect(out[1].violation).toBeNull();
  });
});
