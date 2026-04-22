import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, ValidationError } from "../errors/service-errors";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => {
  const prisma = {
    companyLocation: { findFirst: vi.fn(), update: vi.fn() },
    storeCreditTransaction: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  return { prisma };
});

const {
  getStoreCreditBalance,
  listTransactionsForLocation,
  issueCredit,
} = await import("./store-credit");
const { prisma } = await import("@/app/_lib/db/prisma");
type MockPrisma = {
  companyLocation: Record<string, ReturnType<typeof vi.fn>>;
  storeCreditTransaction: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};
const m = prisma as unknown as MockPrisma;

const TENANT = "t_1";

function reset(): void {
  for (const fn of Object.values(m.companyLocation)) fn.mockReset();
  for (const fn of Object.values(m.storeCreditTransaction)) fn.mockReset();
  m.$transaction.mockReset();
  m.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
}

describe("getStoreCreditBalance", () => {
  beforeEach(() => reset());

  it("returns the cached balance as bigint", async () => {
    m.companyLocation.findFirst.mockResolvedValue({
      storeCreditBalanceCents: BigInt(250000),
    });
    const out = await getStoreCreditBalance({
      tenantId: TENANT,
      locationId: "cl_1",
    });
    expect(out).toBe(BigInt(250000));
    expect(typeof out).toBe("bigint");
  });

  it("throws NotFoundError on cross-tenant access", async () => {
    m.companyLocation.findFirst.mockResolvedValue(null);
    await expect(
      getStoreCreditBalance({ tenantId: TENANT, locationId: "cl_other" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("queries with tenant scope", async () => {
    m.companyLocation.findFirst.mockResolvedValue({
      storeCreditBalanceCents: BigInt(0),
    });
    await getStoreCreditBalance({ tenantId: TENANT, locationId: "cl_1" });
    expect(m.companyLocation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cl_1", tenantId: TENANT },
      }),
    );
  });
});

describe("listTransactionsForLocation", () => {
  beforeEach(() => reset());

  it("returns transactions newest-first with nextCursor when there are more", async () => {
    // service asks for take+1 to detect more; return 3 for take=2.
    m.storeCreditTransaction.findMany.mockResolvedValue([
      { id: "sct_3", amountCents: BigInt(100), createdAt: new Date("2026-04-03") },
      { id: "sct_2", amountCents: BigInt(-50), createdAt: new Date("2026-04-02") },
      { id: "sct_1", amountCents: BigInt(1000), createdAt: new Date("2026-04-01") },
    ]);
    const out = await listTransactionsForLocation({
      tenantId: TENANT,
      locationId: "cl_1",
      take: 2,
    });
    expect(out.transactions.map((t) => t.id)).toEqual(["sct_3", "sct_2"]);
    expect(out.nextCursor).toBe("sct_2");
    // amountCents stays bigint end-to-end
    expect(typeof out.transactions[0].amountCents).toBe("bigint");
  });

  it("no more: nextCursor is null when take+1 was not reached", async () => {
    m.storeCreditTransaction.findMany.mockResolvedValue([
      { id: "sct_1", amountCents: BigInt(500), createdAt: new Date() },
    ]);
    const out = await listTransactionsForLocation({
      tenantId: TENANT,
      locationId: "cl_1",
      take: 2,
    });
    expect(out.transactions).toHaveLength(1);
    expect(out.nextCursor).toBeNull();
  });

  it("tenant-scoped with location filter", async () => {
    m.storeCreditTransaction.findMany.mockResolvedValue([]);
    await listTransactionsForLocation({
      tenantId: TENANT,
      locationId: "cl_1",
    });
    expect(m.storeCreditTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, companyLocationId: "cl_1" },
      }),
    );
  });

  it("cursor pagination passes cursor + skip:1", async () => {
    m.storeCreditTransaction.findMany.mockResolvedValue([]);
    await listTransactionsForLocation({
      tenantId: TENANT,
      locationId: "cl_1",
      cursor: "sct_10",
    });
    expect(m.storeCreditTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "sct_10" }, skip: 1 }),
    );
  });
});

describe("issueCredit", () => {
  beforeEach(() => reset());

  it("inserts a transaction and increments balance atomically (happy path)", async () => {
    m.companyLocation.findFirst.mockResolvedValue({ id: "cl_1" });
    m.storeCreditTransaction.create.mockResolvedValue({
      id: "sct_new",
      amountCents: BigInt(50000),
      reason: "ADMIN_ISSUE",
      createdByStaffId: "staff_1",
    });
    m.companyLocation.update.mockResolvedValue({ id: "cl_1" });

    const out = await issueCredit({
      tenantId: TENANT,
      locationId: "cl_1",
      amountCents: BigInt(50000),
      reason: "ADMIN_ISSUE",
      createdByStaffId: "staff_1",
    });
    expect(out.id).toBe("sct_new");
    expect(m.$transaction).toHaveBeenCalledTimes(1);
    expect(m.storeCreditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          companyLocationId: "cl_1",
          amountCents: BigInt(50000),
          reason: "ADMIN_ISSUE",
        }),
      }),
    );
    expect(m.companyLocation.update).toHaveBeenCalledWith({
      where: { id: "cl_1" },
      data: { storeCreditBalanceCents: { increment: BigInt(50000) } },
    });
    // Order: insert before update — ensures ledger row exists if balance
    // update ever fails, not the other way around.
    const insertOrder =
      m.storeCreditTransaction.create.mock.invocationCallOrder[0];
    const updateOrder = m.companyLocation.update.mock.invocationCallOrder[0];
    expect(insertOrder).toBeLessThan(updateOrder);
  });

  it("rejects ORDER_PAYMENT reason (system-driven, not admin-issuable)", async () => {
    await expect(
      issueCredit({
        tenantId: TENANT,
        locationId: "cl_1",
        amountCents: BigInt(1000),
        reason: "ORDER_PAYMENT",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.companyLocation.findFirst).not.toHaveBeenCalled();
  });

  it("rejects EXPIRATION reason (system-driven)", async () => {
    await expect(
      issueCredit({
        tenantId: TENANT,
        locationId: "cl_1",
        amountCents: BigInt(1000),
        reason: "EXPIRATION",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects zero or negative amounts", async () => {
    await expect(
      issueCredit({
        tenantId: TENANT,
        locationId: "cl_1",
        amountCents: BigInt(0),
        reason: "ADMIN_ISSUE",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      issueCredit({
        tenantId: TENANT,
        locationId: "cl_1",
        amountCents: BigInt(-100),
        reason: "ADJUSTMENT",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects cross-tenant location inside the transaction", async () => {
    m.companyLocation.findFirst.mockResolvedValue(null);
    await expect(
      issueCredit({
        tenantId: TENANT,
        locationId: "cl_other",
        amountCents: BigInt(100),
        reason: "ADMIN_ISSUE",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(m.storeCreditTransaction.create).not.toHaveBeenCalled();
    expect(m.companyLocation.update).not.toHaveBeenCalled();
  });

  it("atomicity — if balance update throws, the error surfaces (rollback is DB's job)", async () => {
    m.companyLocation.findFirst.mockResolvedValue({ id: "cl_1" });
    m.storeCreditTransaction.create.mockResolvedValue({
      id: "sct_new",
      amountCents: BigInt(100),
      reason: "ADMIN_ISSUE",
      createdByStaffId: null,
    });
    m.companyLocation.update.mockRejectedValue(new Error("DB: unique violation"));
    await expect(
      issueCredit({
        tenantId: TENANT,
        locationId: "cl_1",
        amountCents: BigInt(100),
        reason: "ADMIN_ISSUE",
      }),
    ).rejects.toThrow("DB: unique violation");
  });
});
