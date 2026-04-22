import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError } from "../errors/service-errors";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => {
  const prisma = {
    catalog: { findFirst: vi.fn() },
    companyLocation: { findFirst: vi.fn(), findMany: vi.fn() },
    companyLocationCatalog: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  return { prisma };
});

const api = await import("./catalog-assignment");
const { prisma } = await import("@/app/_lib/db/prisma");
type MockPrisma = {
  catalog: Record<string, ReturnType<typeof vi.fn>>;
  companyLocation: Record<string, ReturnType<typeof vi.fn>>;
  companyLocationCatalog: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};
const m = prisma as unknown as MockPrisma;

const TENANT = "t_1";

function resetAllMocks(): void {
  for (const model of [
    m.catalog,
    m.companyLocation,
    m.companyLocationCatalog,
  ]) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  m.$transaction.mockReset();
  m.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
}

describe("assignCatalogToLocation", () => {
  beforeEach(() => resetAllMocks());

  it("creates a new assignment on the happy path", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    m.companyLocation.findFirst.mockResolvedValue({ id: "cl_1" });
    m.companyLocationCatalog.findUnique.mockResolvedValue(null);
    m.companyLocationCatalog.create.mockResolvedValue({ id: "clc_1" });

    const row = await api.assignCatalogToLocation({
      tenantId: TENANT,
      catalogId: "ca_1",
      companyLocationId: "cl_1",
    });
    expect(row.id).toBe("clc_1");
    expect(m.companyLocationCatalog.create).toHaveBeenCalled();
  });

  it("is idempotent — re-assigning returns the existing row", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    m.companyLocation.findFirst.mockResolvedValue({ id: "cl_1" });
    m.companyLocationCatalog.findUnique.mockResolvedValue({
      id: "clc_existing",
    });
    const row = await api.assignCatalogToLocation({
      tenantId: TENANT,
      catalogId: "ca_1",
      companyLocationId: "cl_1",
    });
    expect(row.id).toBe("clc_existing");
    expect(m.companyLocationCatalog.create).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant catalog", async () => {
    m.catalog.findFirst.mockResolvedValue(null);
    m.companyLocation.findFirst.mockResolvedValue({ id: "cl_1" });
    await expect(
      api.assignCatalogToLocation({
        tenantId: TENANT,
        catalogId: "ca_foreign",
        companyLocationId: "cl_1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.companyLocationCatalog.create).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant location", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    m.companyLocation.findFirst.mockResolvedValue(null);
    await expect(
      api.assignCatalogToLocation({
        tenantId: TENANT,
        catalogId: "ca_1",
        companyLocationId: "cl_foreign",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("listCatalogsForLocation", () => {
  beforeEach(() => resetAllMocks());

  it("returns [] when the location is not in tenant", async () => {
    m.companyLocation.findFirst.mockResolvedValue(null);
    const out = await api.listCatalogsForLocation({
      tenantId: TENANT,
      companyLocationId: "cl_foreign",
    });
    expect(out).toEqual([]);
  });

  it("returns catalogs filtered by tenant", async () => {
    m.companyLocation.findFirst.mockResolvedValue({ id: "cl_1" });
    m.companyLocationCatalog.findMany.mockResolvedValue([
      { catalog: { id: "ca_a", tenantId: TENANT } },
      { catalog: { id: "ca_b", tenantId: TENANT } },
    ]);
    const out = await api.listCatalogsForLocation({
      tenantId: TENANT,
      companyLocationId: "cl_1",
    });
    expect(out.map((c) => c.id)).toEqual(["ca_a", "ca_b"]);
  });
});

describe("listLocationsForCatalog", () => {
  beforeEach(() => resetAllMocks());

  it("returns [] when catalog is not in tenant", async () => {
    m.catalog.findFirst.mockResolvedValue(null);
    const out = await api.listLocationsForCatalog({
      tenantId: TENANT,
      catalogId: "ca_foreign",
    });
    expect(out).toEqual([]);
  });

  it("returns locations scoped to tenant", async () => {
    m.catalog.findFirst.mockResolvedValue({ id: "ca_1" });
    m.companyLocationCatalog.findMany.mockResolvedValue([
      { companyLocationId: "cl_a" },
      { companyLocationId: "cl_b" },
    ]);
    m.companyLocation.findMany.mockResolvedValue([
      { id: "cl_a", tenantId: TENANT },
      { id: "cl_b", tenantId: TENANT },
    ]);
    const out = await api.listLocationsForCatalog({
      tenantId: TENANT,
      catalogId: "ca_1",
    });
    expect(out.map((l) => l.id)).toEqual(["cl_a", "cl_b"]);
  });
});
