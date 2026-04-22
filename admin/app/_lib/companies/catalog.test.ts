import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import {
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => {
  const prisma = {
    catalog: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    catalogFixedPrice: {
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    catalogQuantityRule: {
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    catalogInclusion: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    companyLocationCatalog: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  return { prisma };
});

const catalogApi = await import("./catalog");
const { prisma } = await import("@/app/_lib/db/prisma");
type MockPrisma = {
  catalog: Record<string, ReturnType<typeof vi.fn>>;
  catalogFixedPrice: Record<string, ReturnType<typeof vi.fn>>;
  catalogQuantityRule: Record<string, ReturnType<typeof vi.fn>>;
  catalogInclusion: Record<string, ReturnType<typeof vi.fn>>;
  companyLocationCatalog: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};
const m = prisma as unknown as MockPrisma;

const TENANT = "t_1";

function resetAllMocks(): void {
  for (const model of [
    m.catalog,
    m.catalogFixedPrice,
    m.catalogQuantityRule,
    m.catalogInclusion,
    m.companyLocationCatalog,
  ]) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  m.$transaction.mockReset();
  m.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
}

describe("createCatalog", () => {
  beforeEach(() => resetAllMocks());

  it("creates a catalog with defaults", async () => {
    m.catalog.create.mockResolvedValue({ id: "ca_1" });
    await catalogApi.createCatalog({ tenantId: TENANT, name: "VIP" });
    expect(m.catalog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          name: "VIP",
          status: "ACTIVE",
          includeAllProducts: true,
        }),
      }),
    );
  });

  it("rejects adjustment > 999.99 via Zod", async () => {
    await expect(
      catalogApi.createCatalog({
        tenantId: TENANT,
        name: "Bad",
        overallAdjustmentPercent: 1500,
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("rejects adjustment < -100 via Zod", async () => {
    await expect(
      catalogApi.createCatalog({
        tenantId: TENANT,
        name: "Bad",
        overallAdjustmentPercent: -250,
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("persists adjustment as Prisma.Decimal", async () => {
    m.catalog.create.mockResolvedValue({ id: "ca_1" });
    await catalogApi.createCatalog({
      tenantId: TENANT,
      name: "Bronze",
      overallAdjustmentPercent: -15.25,
    });
    const arg = m.catalog.create.mock.calls[0][0] as {
      data: { overallAdjustmentPercent: unknown };
    };
    expect(arg.data.overallAdjustmentPercent).toBeInstanceOf(Prisma.Decimal);
    expect(
      (arg.data.overallAdjustmentPercent as Prisma.Decimal).toFixed(2),
    ).toBe("-15.25");
  });
});

describe("getCatalog / listCatalogs", () => {
  beforeEach(() => resetAllMocks());

  it("is tenant-scoped on findFirst", async () => {
    m.catalog.findFirst.mockResolvedValue(null);
    const out = await catalogApi.getCatalog({
      tenantId: TENANT,
      catalogId: "ca_other",
    });
    expect(out).toBeNull();
    expect(m.catalog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ca_other", tenantId: TENANT },
      }),
    );
  });

  it("listCatalogs paginates with cursor + nextCursor", async () => {
    // Simulate take+1 boundary: request take=2 but return 3 to signal "more".
    m.catalog.findMany.mockResolvedValue([
      { id: "ca_a" },
      { id: "ca_b" },
      { id: "ca_c" },
    ]);
    const out = await catalogApi.listCatalogs({ tenantId: TENANT, take: 2 });
    expect(out.catalogs.map((c) => c.id)).toEqual(["ca_a", "ca_b"]);
    expect(out.nextCursor).toBe("ca_b");
  });
});

describe("updateCatalog / status helpers", () => {
  beforeEach(() => resetAllMocks());

  it("throws NotFoundError on tenant mismatch", async () => {
    m.catalog.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      catalogApi.updateCatalog({
        tenantId: TENANT,
        catalogId: "ca_other",
        patch: { name: "X" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("archive maps to DRAFT status (enum has no ARCHIVED)", async () => {
    m.catalog.updateMany.mockResolvedValue({ count: 1 });
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1", status: "DRAFT" });
    await catalogApi.archiveCatalog({ tenantId: TENANT, catalogId: "ca_1" });
    expect(m.catalog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DRAFT" }),
      }),
    );
  });
});

describe("deleteCatalog", () => {
  beforeEach(() => resetAllMocks());

  it("refuses when the catalog is assigned", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    m.companyLocationCatalog.count.mockResolvedValue(3);
    await expect(
      catalogApi.deleteCatalog({ tenantId: TENANT, catalogId: "ca_1" }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      context: expect.objectContaining({ code: "CATALOG_IN_USE" }),
    });
    expect(m.catalog.delete).not.toHaveBeenCalled();
  });

  it("throws NotFoundError on tenant mismatch", async () => {
    m.catalog.findFirst.mockResolvedValue(null);
    await expect(
      catalogApi.deleteCatalog({ tenantId: TENANT, catalogId: "ca_other" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes when unassigned", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    m.companyLocationCatalog.count.mockResolvedValue(0);
    m.catalog.delete.mockResolvedValue({ id: "ca_1" });
    await catalogApi.deleteCatalog({ tenantId: TENANT, catalogId: "ca_1" });
    expect(m.catalog.delete).toHaveBeenCalledWith({ where: { id: "ca_1" } });
  });
});

describe("setFixedPrice — polymorphic XOR + upsert", () => {
  beforeEach(() => resetAllMocks());

  it("rejects when no ref is set (parsed out by Zod before service)", async () => {
    await expect(
      catalogApi.setFixedPrice({
        tenantId: TENANT,
        catalogId: "ca_1",
        // Cast through unknown to pass TS; runtime Zod catches it.
        productRef: { type: "accommodation", id: "" } as unknown as never,
        fixedPriceCents: BigInt(1000),
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("rejects when fixedPriceCents is negative", async () => {
    await expect(
      catalogApi.setFixedPrice({
        tenantId: TENANT,
        catalogId: "ca_1",
        productRef: { type: "accommodation", id: "acc_1" },
        fixedPriceCents: BigInt(-1),
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("creates a new fixed price when none exists", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    m.catalogFixedPrice.findFirst.mockResolvedValue(null);
    m.catalogFixedPrice.create.mockResolvedValue({ id: "cfp_1" });
    await catalogApi.setFixedPrice({
      tenantId: TENANT,
      catalogId: "ca_1",
      productRef: { type: "variant", id: "pv_1" },
      fixedPriceCents: BigInt(5000),
    });
    expect(m.catalogFixedPrice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          catalogId: "ca_1",
          accommodationId: null,
          productVariantId: "pv_1",
          fixedPriceCents: BigInt(5000),
        }),
      }),
    );
  });

  it("updates when a row already exists for the same (catalog, ref)", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    m.catalogFixedPrice.findFirst.mockResolvedValue({ id: "cfp_old" });
    m.catalogFixedPrice.update.mockResolvedValue({ id: "cfp_old" });
    await catalogApi.setFixedPrice({
      tenantId: TENANT,
      catalogId: "ca_1",
      productRef: { type: "accommodation", id: "acc_1" },
      fixedPriceCents: BigInt(9000),
    });
    expect(m.catalogFixedPrice.update).toHaveBeenCalledWith({
      where: { id: "cfp_old" },
      data: { fixedPriceCents: BigInt(9000) },
    });
    expect(m.catalogFixedPrice.create).not.toHaveBeenCalled();
  });
});

describe("setQuantityRule", () => {
  beforeEach(() => resetAllMocks());

  it("rejects the 11th volume tier", async () => {
    const tiers = Array.from({ length: 11 }, (_, i) => ({
      minQty: 2 + i,
      priceCents: String(1000 - i * 10),
    }));
    await expect(
      catalogApi.setQuantityRule({
        tenantId: TENANT,
        catalogId: "ca_1",
        productRef: { type: "variant", id: "pv_1" },
        volumePricing: tiers,
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("rejects unsorted volumePricing", async () => {
    await expect(
      catalogApi.setQuantityRule({
        tenantId: TENANT,
        catalogId: "ca_1",
        productRef: { type: "variant", id: "pv_1" },
        volumePricing: [
          { minQty: 10, priceCents: "500" },
          { minQty: 5, priceCents: "400" },
        ],
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("rejects non-decreasing priceCents", async () => {
    await expect(
      catalogApi.setQuantityRule({
        tenantId: TENANT,
        catalogId: "ca_1",
        productRef: { type: "variant", id: "pv_1" },
        volumePricing: [
          { minQty: 5, priceCents: "500" },
          { minQty: 10, priceCents: "500" },
        ],
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("rejects minQty <= 1 (tier 1 is the 'base' implicit tier)", async () => {
    await expect(
      catalogApi.setQuantityRule({
        tenantId: TENANT,
        catalogId: "ca_1",
        productRef: { type: "variant", id: "pv_1" },
        volumePricing: [{ minQty: 1, priceCents: "500" }],
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("rejects min > max", async () => {
    await expect(
      catalogApi.setQuantityRule({
        tenantId: TENANT,
        catalogId: "ca_1",
        productRef: { type: "variant", id: "pv_1" },
        minQuantity: 10,
        maxQuantity: 5,
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("creates a valid volume ladder", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    m.catalogQuantityRule.findFirst.mockResolvedValue(null);
    m.catalogQuantityRule.create.mockResolvedValue({ id: "qr_1" });
    await catalogApi.setQuantityRule({
      tenantId: TENANT,
      catalogId: "ca_1",
      productRef: { type: "variant", id: "pv_1" },
      volumePricing: [
        { minQty: 10, priceCents: "900" },
        { minQty: 50, priceCents: "800" },
        { minQty: 100, priceCents: "700" },
      ],
    });
    expect(m.catalogQuantityRule.create).toHaveBeenCalled();
  });
});

describe("addInclusion", () => {
  beforeEach(() => resetAllMocks());

  it("accepts collection refs (unlike fixed-price / quantity-rule)", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    m.catalogInclusion.findFirst.mockResolvedValue(null);
    m.catalogInclusion.create.mockResolvedValue({ id: "inc_1" });
    await catalogApi.addInclusion({
      tenantId: TENANT,
      catalogId: "ca_1",
      productRef: { type: "collection", id: "col_1" },
    });
    expect(m.catalogInclusion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          catalogId: "ca_1",
          collectionId: "col_1",
          accommodationId: null,
          productVariantId: null,
        }),
      }),
    );
  });

  it("is idempotent — returns existing inclusion row", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    m.catalogInclusion.findFirst.mockResolvedValue({ id: "inc_existing" });
    const row = await catalogApi.addInclusion({
      tenantId: TENANT,
      catalogId: "ca_1",
      productRef: { type: "accommodation", id: "acc_1" },
    });
    expect(row.id).toBe("inc_existing");
    expect(m.catalogInclusion.create).not.toHaveBeenCalled();
  });
});

describe("cross-tenant isolation", () => {
  beforeEach(() => resetAllMocks());

  it("setFixedPrice refuses a catalog from another tenant", async () => {
    m.catalog.findFirst.mockResolvedValue(null); // not found for this tenant
    await expect(
      catalogApi.setFixedPrice({
        tenantId: TENANT,
        catalogId: "ca_other",
        productRef: { type: "accommodation", id: "acc_1" },
        fixedPriceCents: BigInt(100),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("setQuantityRule refuses cross-tenant catalog", async () => {
    m.catalog.findFirst.mockResolvedValue(null);
    await expect(
      catalogApi.setQuantityRule({
        tenantId: TENANT,
        catalogId: "ca_other",
        productRef: { type: "variant", id: "pv_1" },
        minQuantity: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("addInclusion refuses cross-tenant catalog", async () => {
    m.catalog.findFirst.mockResolvedValue(null);
    await expect(
      catalogApi.addInclusion({
        tenantId: TENANT,
        catalogId: "ca_other",
        productRef: { type: "collection", id: "col_1" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── Race-retry wrapper behaviour ────────────────────────────────
// These verify that P2002 on the first write triggers a single retry
// which takes the update path via the second findFirst. Same pattern
// for each setter; one test per setter is sufficient.

function prismaP2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError("race", {
    code: "P2002",
    clientVersion: "6.x.test",
    meta: { target },
  });
}

describe("race retry — setFixedPrice", () => {
  beforeEach(() => resetAllMocks());

  it("on P2002 first attempt, retries and takes update path", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    // Attempt 1: findFirst sees nothing, create → throws P2002.
    // Attempt 2: findFirst now sees the row the winner wrote, update.
    let findCall = 0;
    m.catalogFixedPrice.findFirst.mockImplementation(async () => {
      findCall++;
      return findCall === 1 ? null : { id: "cfp_winner" };
    });
    m.catalogFixedPrice.create.mockRejectedValueOnce(
      prismaP2002(["catalogId", "productVariantId"]),
    );
    m.catalogFixedPrice.update.mockResolvedValue({ id: "cfp_winner" });

    const row = await catalogApi.setFixedPrice({
      tenantId: TENANT,
      catalogId: "ca_1",
      productRef: { type: "variant", id: "pv_1" },
      fixedPriceCents: BigInt(5000),
    });
    expect(row.id).toBe("cfp_winner");
    expect(m.catalogFixedPrice.create).toHaveBeenCalledTimes(1);
    expect(m.catalogFixedPrice.update).toHaveBeenCalledWith({
      where: { id: "cfp_winner" },
      data: { fixedPriceCents: BigInt(5000) },
    });
    expect(findCall).toBe(2);
  });
});

describe("race retry — setQuantityRule", () => {
  beforeEach(() => resetAllMocks());

  it("on P2002 first attempt, retries and takes update path", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    let findCall = 0;
    m.catalogQuantityRule.findFirst.mockImplementation(async () => {
      findCall++;
      return findCall === 1 ? null : { id: "qr_winner" };
    });
    m.catalogQuantityRule.create.mockRejectedValueOnce(
      prismaP2002(["catalogId", "accommodationId"]),
    );
    m.catalogQuantityRule.update.mockResolvedValue({ id: "qr_winner" });

    const row = await catalogApi.setQuantityRule({
      tenantId: TENANT,
      catalogId: "ca_1",
      productRef: { type: "accommodation", id: "acc_1" },
      minQuantity: 5,
    });
    expect(row.id).toBe("qr_winner");
    expect(m.catalogQuantityRule.update).toHaveBeenCalled();
    expect(findCall).toBe(2);
  });
});

describe("race retry — addInclusion", () => {
  beforeEach(() => resetAllMocks());

  it("on P2002 first attempt, retries and returns the winner's row", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    let findCall = 0;
    m.catalogInclusion.findFirst.mockImplementation(async () => {
      findCall++;
      return findCall === 1 ? null : { id: "inc_winner" };
    });
    m.catalogInclusion.create.mockRejectedValueOnce(
      prismaP2002(["catalogId", "collectionId"]),
    );

    const row = await catalogApi.addInclusion({
      tenantId: TENANT,
      catalogId: "ca_1",
      productRef: { type: "collection", id: "col_1" },
    });
    expect(row.id).toBe("inc_winner");
    // addInclusion returns existing on retry (no update — idempotent).
    expect(m.catalogInclusion.create).toHaveBeenCalledTimes(1);
    expect(findCall).toBe(2);
  });
});
