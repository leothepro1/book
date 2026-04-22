import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => {
  const prisma = {
    company: { findFirst: vi.fn() },
    companyLocation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    paymentTerms: { findUnique: vi.fn() },
    order: { count: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  return { prisma };
});

const {
  createLocation,
  updateLocation,
  deleteLocation,
} = await import("./location");
const { prisma } = await import("@/app/_lib/db/prisma");
type MockPrisma = {
  company: Record<string, ReturnType<typeof vi.fn>>;
  companyLocation: Record<string, ReturnType<typeof vi.fn>>;
  paymentTerms: Record<string, ReturnType<typeof vi.fn>>;
  order: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};
const m = prisma as unknown as MockPrisma;

const TENANT = "t_1";

function resetAllMocks(): void {
  for (const model of [m.company, m.companyLocation, m.paymentTerms, m.order]) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  m.$transaction.mockReset();
  m.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
}

describe("createLocation", () => {
  beforeEach(() => resetAllMocks());

  it("creates a location when company belongs to tenant", async () => {
    m.company.findFirst.mockResolvedValue({ id: "co_1" });
    m.companyLocation.create.mockResolvedValue({ id: "cl_new" });

    const loc = await createLocation({
      tenantId: TENANT,
      companyId: "co_1",
      name: "Göteborg",
      billingAddress: { line1: "Avenyn 1" },
    });
    expect(loc.id).toBe("cl_new");
    expect(m.companyLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          companyId: "co_1",
          name: "Göteborg",
        }),
      }),
    );
  });

  it("rejects when company does not belong to tenant", async () => {
    m.company.findFirst.mockResolvedValue(null);
    await expect(
      createLocation({
        tenantId: TENANT,
        companyId: "co_other",
        name: "X",
        billingAddress: { line1: "A" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(m.companyLocation.create).not.toHaveBeenCalled();
  });

  it("rejects when paymentTermsId is from a different tenant", async () => {
    m.company.findFirst.mockResolvedValue({ id: "co_1" });
    m.paymentTerms.findUnique.mockResolvedValue({ tenantId: "t_other" });
    await expect(
      createLocation({
        tenantId: TENANT,
        companyId: "co_1",
        name: "X",
        billingAddress: { line1: "A" },
        paymentTermsId: "pt_foreign",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts a system-default paymentTermsId (tenantId IS NULL)", async () => {
    m.company.findFirst.mockResolvedValue({ id: "co_1" });
    m.paymentTerms.findUnique.mockResolvedValue({ tenantId: null });
    m.companyLocation.create.mockResolvedValue({ id: "cl_ok" });
    await expect(
      createLocation({
        tenantId: TENANT,
        companyId: "co_1",
        name: "X",
        billingAddress: { line1: "A" },
        paymentTermsId: "pt_sys",
      }),
    ).resolves.toMatchObject({ id: "cl_ok" });
  });
});

describe("updateLocation", () => {
  beforeEach(() => resetAllMocks());

  it("rejects depositPercent > 100 via Zod", async () => {
    await expect(
      updateLocation({
        tenantId: TENANT,
        locationId: "cl_1",
        patch: { depositPercent: 150 },
      }),
    ).rejects.toBeInstanceOf(Error); // ZodError
  });

  it("rejects negative depositPercent via Zod", async () => {
    await expect(
      updateLocation({
        tenantId: TENANT,
        locationId: "cl_1",
        patch: { depositPercent: -5 },
      }),
    ).rejects.toBeInstanceOf(Error); // ZodError
  });

  it("rejects cross-tenant paymentTermsId", async () => {
    m.companyLocation.findFirst.mockResolvedValue({ id: "cl_1" });
    m.paymentTerms.findUnique.mockResolvedValue({ tenantId: "t_other" });
    await expect(
      updateLocation({
        tenantId: TENANT,
        locationId: "cl_1",
        patch: { paymentTermsId: "pt_foreign" },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects when location is not in tenant", async () => {
    m.companyLocation.findFirst.mockResolvedValue(null);
    await expect(
      updateLocation({
        tenantId: TENANT,
        locationId: "cl_missing",
        patch: { name: "New" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleteLocation", () => {
  beforeEach(() => resetAllMocks());

  it("refuses to delete the only location of a company", async () => {
    m.companyLocation.findFirst.mockResolvedValue({
      id: "cl_1",
      companyId: "co_1",
    });
    m.companyLocation.count.mockResolvedValue(1);
    await expect(
      deleteLocation({ tenantId: TENANT, locationId: "cl_1" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(m.companyLocation.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a location that has orders", async () => {
    m.companyLocation.findFirst.mockResolvedValue({
      id: "cl_1",
      companyId: "co_1",
    });
    m.companyLocation.count.mockResolvedValue(3);
    m.order.count.mockResolvedValue(7);
    await expect(
      deleteLocation({ tenantId: TENANT, locationId: "cl_1" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.companyLocation.delete).not.toHaveBeenCalled();
  });

  it("deletes when there are siblings and no orders", async () => {
    m.companyLocation.findFirst.mockResolvedValue({
      id: "cl_1",
      companyId: "co_1",
    });
    m.companyLocation.count.mockResolvedValue(3);
    m.order.count.mockResolvedValue(0);
    m.companyLocation.delete.mockResolvedValue({ id: "cl_1" });
    await expect(
      deleteLocation({ tenantId: TENANT, locationId: "cl_1" }),
    ).resolves.toBeUndefined();
    expect(m.companyLocation.delete).toHaveBeenCalledWith({
      where: { id: "cl_1" },
    });
  });
});
