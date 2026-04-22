import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: { order: { findMany: vi.fn() } },
}));

const { listOrdersForLocation } = await import("./orders");
const { prisma } = await import("@/app/_lib/db/prisma");
type MockPrisma = { order: Record<string, ReturnType<typeof vi.fn>> };
const m = prisma as unknown as MockPrisma;

const TENANT = "t_1";

function reset(): void {
  for (const fn of Object.values(m.order)) fn.mockReset();
}

describe("listOrdersForLocation", () => {
  beforeEach(() => reset());

  it("returns orders newest-first with cursor pagination", async () => {
    m.order.findMany.mockResolvedValue([
      { id: "o_c", createdAt: new Date("2026-04-22"), balanceAmountCents: BigInt(0) },
      { id: "o_b", createdAt: new Date("2026-04-21"), balanceAmountCents: BigInt(1000) },
      { id: "o_a", createdAt: new Date("2026-04-20"), balanceAmountCents: BigInt(0) },
    ]);
    const out = await listOrdersForLocation({
      tenantId: TENANT,
      locationId: "cl_1",
      take: 2,
    });
    expect(out.orders.map((o) => o.id)).toEqual(["o_c", "o_b"]);
    expect(out.nextCursor).toBe("o_b");
  });

  it("onlyUnpaid filter narrows to PENDING with positive balance", async () => {
    m.order.findMany.mockResolvedValue([]);
    await listOrdersForLocation({
      tenantId: TENANT,
      locationId: "cl_1",
      onlyUnpaid: true,
    });
    const where = (m.order.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    }).where;
    expect(where.financialStatus).toBe("PENDING");
    expect(where.balanceAmountCents).toEqual({ gt: BigInt(0) });
  });

  it("no filter when onlyUnpaid omitted", async () => {
    m.order.findMany.mockResolvedValue([]);
    await listOrdersForLocation({ tenantId: TENANT, locationId: "cl_1" });
    const where = (m.order.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    }).where;
    expect(where.financialStatus).toBeUndefined();
    expect(where.balanceAmountCents).toBeUndefined();
  });

  it("tenant-scoped + location-scoped", async () => {
    m.order.findMany.mockResolvedValue([]);
    await listOrdersForLocation({ tenantId: TENANT, locationId: "cl_1" });
    expect(m.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          companyLocationId: "cl_1",
        }),
      }),
    );
  });

  it("BigInt balanceAmountCents preserved", async () => {
    m.order.findMany.mockResolvedValue([
      { id: "o_1", balanceAmountCents: BigInt("9999999999") },
    ]);
    const out = await listOrdersForLocation({
      tenantId: TENANT,
      locationId: "cl_1",
    });
    expect(typeof out.orders[0].balanceAmountCents).toBe("bigint");
  });
});
