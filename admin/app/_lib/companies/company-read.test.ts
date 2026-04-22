import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => {
  const prisma = {
    company: { findMany: vi.fn() },
    companyLocation: { groupBy: vi.fn(), count: vi.fn() },
    companyContact: { findMany: vi.fn(), count: vi.fn() },
    order: { count: vi.fn(), aggregate: vi.fn() },
  };
  return { prisma };
});

const {
  listCompaniesWithMainContacts,
  getCompanyOverviewStats,
} = await import("./company");
const { prisma } = await import("@/app/_lib/db/prisma");
type MockPrisma = {
  company: Record<string, ReturnType<typeof vi.fn>>;
  companyLocation: Record<string, ReturnType<typeof vi.fn>>;
  companyContact: Record<string, ReturnType<typeof vi.fn>>;
  order: Record<string, ReturnType<typeof vi.fn>>;
};
const m = prisma as unknown as MockPrisma;

const TENANT = "t_1";

function reset(): void {
  for (const model of [
    m.company,
    m.companyLocation,
    m.companyContact,
    m.order,
  ]) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
}

describe("listCompaniesWithMainContacts", () => {
  beforeEach(() => reset());

  it("hydrates mainContact + locationCount in batch (3 queries total)", async () => {
    m.company.findMany.mockResolvedValue([
      { id: "co_1", tenantId: TENANT, mainContactId: "cc_1" },
      { id: "co_2", tenantId: TENANT, mainContactId: "cc_2" },
      { id: "co_3", tenantId: TENANT, mainContactId: null },
    ]);
    m.companyContact.findMany.mockResolvedValue([
      { id: "cc_1", guestAccount: { id: "ga_a", name: "Alice" } },
      { id: "cc_2", guestAccount: { id: "ga_b", name: "Bob" } },
    ]);
    m.companyLocation.groupBy.mockResolvedValue([
      { companyId: "co_1", _count: { _all: 2 } },
      { companyId: "co_2", _count: { _all: 0 } },
      // co_3 omitted → should default to 0
    ]);

    const out = await listCompaniesWithMainContacts({ tenantId: TENANT, take: 50 });
    expect(out.companies).toHaveLength(3);
    expect(out.companies[0].mainContact?.guestAccount.name).toBe("Alice");
    expect(out.companies[0].locationCount).toBe(2);
    expect(out.companies[1].mainContact?.guestAccount.name).toBe("Bob");
    expect(out.companies[1].locationCount).toBe(0);
    expect(out.companies[2].mainContact).toBeNull();
    expect(out.companies[2].locationCount).toBe(0);

    // N+1 guard: exactly 1 call per model regardless of result count.
    expect(m.company.findMany).toHaveBeenCalledTimes(1);
    expect(m.companyContact.findMany).toHaveBeenCalledTimes(1);
    expect(m.companyLocation.groupBy).toHaveBeenCalledTimes(1);
  });

  it("tenant-scoped: contact lookup is filtered by tenantId", async () => {
    m.company.findMany.mockResolvedValue([
      { id: "co_1", tenantId: TENANT, mainContactId: "cc_1" },
    ]);
    m.companyContact.findMany.mockResolvedValue([]);
    m.companyLocation.groupBy.mockResolvedValue([]);
    await listCompaniesWithMainContacts({ tenantId: TENANT, take: 50 });
    expect(m.companyContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });

  it("empty companies short-circuits without secondary queries", async () => {
    m.company.findMany.mockResolvedValue([]);
    const out = await listCompaniesWithMainContacts({ tenantId: TENANT, take: 50 });
    expect(out.companies).toEqual([]);
    expect(m.companyContact.findMany).not.toHaveBeenCalled();
    expect(m.companyLocation.groupBy).not.toHaveBeenCalled();
  });
});

describe("getCompanyOverviewStats", () => {
  beforeEach(() => reset());

  it("runs 5 aggregates in parallel and returns BigInt outstanding", async () => {
    m.companyLocation.count.mockResolvedValue(3);
    m.companyContact.count.mockResolvedValue(7);
    m.order.count
      .mockResolvedValueOnce(12) // activeOrderCount
      .mockResolvedValueOnce(2); // overdueOrderCount
    m.order.aggregate.mockResolvedValue({
      _sum: { balanceAmountCents: BigInt(5500000) },
    });

    const out = await getCompanyOverviewStats({
      tenantId: TENANT,
      companyId: "co_1",
    });
    expect(out).toEqual({
      locationCount: 3,
      contactCount: 7,
      activeOrderCount: 12,
      outstandingBalanceCents: BigInt(5500000),
      overdueOrderCount: 2,
    });
    expect(typeof out.outstandingBalanceCents).toBe("bigint");
  });

  it("returns 0n outstanding when no matching orders", async () => {
    m.companyLocation.count.mockResolvedValue(1);
    m.companyContact.count.mockResolvedValue(0);
    m.order.count.mockResolvedValue(0).mockResolvedValue(0);
    m.order.aggregate.mockResolvedValue({
      _sum: { balanceAmountCents: null },
    });
    const out = await getCompanyOverviewStats({
      tenantId: TENANT,
      companyId: "co_1",
    });
    expect(out.outstandingBalanceCents).toBe(BigInt(0));
  });

  it("active-order count excludes CANCELLED / REFUNDED / PARTIALLY_REFUNDED", async () => {
    m.companyLocation.count.mockResolvedValue(0);
    m.companyContact.count.mockResolvedValue(0);
    m.order.count.mockResolvedValue(0);
    m.order.aggregate.mockResolvedValue({ _sum: { balanceAmountCents: null } });
    await getCompanyOverviewStats({ tenantId: TENANT, companyId: "co_1" });
    const activeOrderCall = m.order.count.mock.calls[0][0] as {
      where: { status: { notIn: string[] } };
    };
    expect(activeOrderCall.where.status.notIn).toEqual([
      "CANCELLED",
      "REFUNDED",
      "PARTIALLY_REFUNDED",
    ]);
  });

  it("overdue count filters on financialStatus=PENDING and paymentDueAt < now", async () => {
    m.companyLocation.count.mockResolvedValue(0);
    m.companyContact.count.mockResolvedValue(0);
    m.order.count.mockResolvedValue(0);
    m.order.aggregate.mockResolvedValue({ _sum: { balanceAmountCents: null } });
    await getCompanyOverviewStats({ tenantId: TENANT, companyId: "co_1" });
    // Second call is overdue count.
    const overdueCall = m.order.count.mock.calls[1][0] as {
      where: { financialStatus: string; paymentDueAt: { lt: Date } };
    };
    expect(overdueCall.where.financialStatus).toBe("PENDING");
    expect(overdueCall.where.paymentDueAt.lt).toBeInstanceOf(Date);
  });

  it("tenant-scoped on every query", async () => {
    m.companyLocation.count.mockResolvedValue(0);
    m.companyContact.count.mockResolvedValue(0);
    m.order.count.mockResolvedValue(0);
    m.order.aggregate.mockResolvedValue({ _sum: { balanceAmountCents: null } });
    await getCompanyOverviewStats({ tenantId: TENANT, companyId: "co_1" });
    expect(m.companyLocation.count.mock.calls[0][0]).toMatchObject({
      where: { tenantId: TENANT },
    });
    expect(m.order.count.mock.calls[0][0]).toMatchObject({
      where: { tenantId: TENANT },
    });
    expect(m.order.aggregate.mock.calls[0][0]).toMatchObject({
      where: { tenantId: TENANT },
    });
  });
});
