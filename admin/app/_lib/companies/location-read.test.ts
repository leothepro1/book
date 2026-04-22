import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => {
  const prisma = {
    company: { findFirst: vi.fn() },
    companyLocation: { findMany: vi.fn(), findFirst: vi.fn() },
    companyLocationAccess: { count: vi.fn(), groupBy: vi.fn() },
    companyLocationCatalog: { count: vi.fn(), groupBy: vi.fn() },
    paymentTerms: { findMany: vi.fn(), findUnique: vi.fn() },
    order: { groupBy: vi.fn(), aggregate: vi.fn() },
  };
  return { prisma };
});

const {
  listLocationsForCompanyWithSummary,
  getLocationOverviewStats,
  getLocationOverviewBundle,
} = await import("./location");
const { prisma } = await import("@/app/_lib/db/prisma");
type MockPrisma = {
  company: Record<string, ReturnType<typeof vi.fn>>;
  companyLocation: Record<string, ReturnType<typeof vi.fn>>;
  companyLocationAccess: Record<string, ReturnType<typeof vi.fn>>;
  companyLocationCatalog: Record<string, ReturnType<typeof vi.fn>>;
  paymentTerms: Record<string, ReturnType<typeof vi.fn>>;
  order: Record<string, ReturnType<typeof vi.fn>>;
};
const m = prisma as unknown as MockPrisma;

const TENANT = "t_1";

function reset(): void {
  for (const model of [
    m.company,
    m.companyLocation,
    m.companyLocationAccess,
    m.companyLocationCatalog,
    m.paymentTerms,
    m.order,
  ]) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
}

describe("listLocationsForCompanyWithSummary", () => {
  beforeEach(() => reset());

  it("hydrates counts + paymentTerms name + lastOrderAt in batch (5 queries)", async () => {
    m.companyLocation.findMany.mockResolvedValue([
      {
        id: "cl_1",
        tenantId: TENANT,
        companyId: "co_1",
        paymentTermsId: "pt_net30",
      },
      {
        id: "cl_2",
        tenantId: TENANT,
        companyId: "co_1",
        paymentTermsId: null,
      },
    ]);
    m.companyLocationAccess.groupBy.mockResolvedValue([
      { companyLocationId: "cl_1", _count: { _all: 3 } },
    ]);
    m.companyLocationCatalog.groupBy.mockResolvedValue([
      { companyLocationId: "cl_1", _count: { _all: 1 } },
      { companyLocationId: "cl_2", _count: { _all: 2 } },
    ]);
    m.paymentTerms.findMany.mockResolvedValue([
      { id: "pt_net30", name: "Netto 30 dagar" },
    ]);
    const lastOrder = new Date("2026-04-10T10:00:00.000Z");
    m.order.groupBy.mockResolvedValue([
      { companyLocationId: "cl_1", _max: { createdAt: lastOrder } },
    ]);

    const out = await listLocationsForCompanyWithSummary({
      tenantId: TENANT,
      companyId: "co_1",
    });

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "cl_1",
      contactCount: 3,
      catalogCount: 1,
      paymentTermsName: "Netto 30 dagar",
      lastOrderAt: lastOrder,
    });
    expect(out[1]).toMatchObject({
      id: "cl_2",
      contactCount: 0, // no groupBy row → 0
      catalogCount: 2,
      paymentTermsName: null,
      lastOrderAt: null,
    });

    // N+1 guard
    expect(m.companyLocation.findMany).toHaveBeenCalledTimes(1);
    expect(m.companyLocationAccess.groupBy).toHaveBeenCalledTimes(1);
    expect(m.companyLocationCatalog.groupBy).toHaveBeenCalledTimes(1);
    expect(m.paymentTerms.findMany).toHaveBeenCalledTimes(1);
    expect(m.order.groupBy).toHaveBeenCalledTimes(1);
  });

  it("short-circuits when company has no locations", async () => {
    m.companyLocation.findMany.mockResolvedValue([]);
    const out = await listLocationsForCompanyWithSummary({
      tenantId: TENANT,
      companyId: "co_empty",
    });
    expect(out).toEqual([]);
    expect(m.companyLocationAccess.groupBy).not.toHaveBeenCalled();
  });

  it("tenant-scoped on primary fetch", async () => {
    m.companyLocation.findMany.mockResolvedValue([]);
    await listLocationsForCompanyWithSummary({
      tenantId: TENANT,
      companyId: "co_1",
    });
    expect(m.companyLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          companyId: "co_1",
        }),
      }),
    );
  });
});

describe("getLocationOverviewStats", () => {
  beforeEach(() => reset());

  it("returns BigInt outstanding + null draft count (FAS 4 pre-wire)", async () => {
    m.companyLocationAccess.count.mockResolvedValue(4);
    m.companyLocationCatalog.count.mockResolvedValue(2);
    m.order.aggregate.mockResolvedValue({
      _sum: { balanceAmountCents: BigInt(1234567) },
    });
    const out = await getLocationOverviewStats({
      tenantId: TENANT,
      locationId: "cl_1",
    });
    expect(out).toEqual({
      contactCount: 4,
      catalogCount: 2,
      pendingDraftCount: null,
      outstandingBalanceCents: BigInt(1234567),
    });
    expect(typeof out.outstandingBalanceCents).toBe("bigint");
  });

  it("0n outstanding when aggregate returns null", async () => {
    m.companyLocationAccess.count.mockResolvedValue(0);
    m.companyLocationCatalog.count.mockResolvedValue(0);
    m.order.aggregate.mockResolvedValue({
      _sum: { balanceAmountCents: null },
    });
    const out = await getLocationOverviewStats({
      tenantId: TENANT,
      locationId: "cl_1",
    });
    expect(out.outstandingBalanceCents).toBe(BigInt(0));
  });

  it("tenant-scoped on every count + aggregate", async () => {
    m.companyLocationAccess.count.mockResolvedValue(0);
    m.companyLocationCatalog.count.mockResolvedValue(0);
    m.order.aggregate.mockResolvedValue({ _sum: { balanceAmountCents: null } });
    await getLocationOverviewStats({ tenantId: TENANT, locationId: "cl_1" });
    expect(m.companyLocationAccess.count.mock.calls[0][0]).toMatchObject({
      where: { tenantId: TENANT, companyLocationId: "cl_1" },
    });
    expect(m.order.aggregate.mock.calls[0][0]).toMatchObject({
      where: expect.objectContaining({ tenantId: TENANT }),
    });
  });
});

describe("getLocationOverviewBundle", () => {
  beforeEach(() => reset());

  it("returns null when location isn't in tenant (avoids second query)", async () => {
    m.companyLocation.findFirst.mockResolvedValue(null);
    const out = await getLocationOverviewBundle({
      tenantId: TENANT,
      locationId: "cl_other",
    });
    expect(out).toBeNull();
    expect(m.company.findFirst).not.toHaveBeenCalled();
    expect(m.paymentTerms.findUnique).not.toHaveBeenCalled();
  });

  it("happy path — bundles company + location + paymentTerms + stats + balance in ≤4 parallel queries", async () => {
    m.companyLocation.findFirst.mockResolvedValue({
      id: "cl_1",
      tenantId: TENANT,
      companyId: "co_1",
      paymentTermsId: "pt_net30",
      storeCreditBalanceCents: BigInt(150000),
    });
    m.company.findFirst.mockResolvedValue({
      id: "co_1",
      tenantId: TENANT,
      name: "Acme",
    });
    m.paymentTerms.findUnique.mockResolvedValue({
      id: "pt_net30",
      name: "Netto 30 dagar",
    });
    m.companyLocationAccess.count.mockResolvedValue(3);
    m.companyLocationCatalog.count.mockResolvedValue(1);
    m.order.aggregate.mockResolvedValue({
      _sum: { balanceAmountCents: BigInt(25000) },
    });

    const out = await getLocationOverviewBundle({
      tenantId: TENANT,
      locationId: "cl_1",
    });

    expect(out).not.toBeNull();
    expect(out!.company.id).toBe("co_1");
    expect(out!.location.id).toBe("cl_1");
    expect(out!.paymentTerms?.name).toBe("Netto 30 dagar");
    expect(out!.stats.contactCount).toBe(3);
    expect(out!.stats.outstandingBalanceCents).toBe(BigInt(25000));
    expect(out!.storeCreditBalanceCents).toBe(BigInt(150000));

    expect(m.companyLocation.findFirst).toHaveBeenCalledTimes(1);
    expect(m.company.findFirst).toHaveBeenCalledTimes(1);
    expect(m.paymentTerms.findUnique).toHaveBeenCalledTimes(1);
    expect(m.companyLocationAccess.count).toHaveBeenCalledTimes(1);
    expect(m.companyLocationCatalog.count).toHaveBeenCalledTimes(1);
    expect(m.order.aggregate).toHaveBeenCalledTimes(1);
  });
});
