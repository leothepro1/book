import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => {
  const prisma = {
    companyContact: { findFirst: vi.fn() },
    companyLocation: { findFirst: vi.fn() },
    companyLocationAccess: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  return { prisma };
});

const {
  grantAccess,
  revokeAccess,
  listAccessForContact,
  listContactsWithAccessToLocation,
  hasAccess,
} = await import("./location-access");
const { prisma } = await import("@/app/_lib/db/prisma");

type MockPrisma = {
  companyContact: Record<string, ReturnType<typeof vi.fn>>;
  companyLocation: Record<string, ReturnType<typeof vi.fn>>;
  companyLocationAccess: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};
const m = prisma as unknown as MockPrisma;

const TENANT = "t_1";

function reset(): void {
  for (const model of [
    m.companyContact,
    m.companyLocation,
    m.companyLocationAccess,
  ]) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  m.$transaction.mockReset();
  m.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
}

describe("grantAccess", () => {
  beforeEach(() => reset());

  it("creates a new access row when contact and location match on companyId", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_1",
      companyId: "co_A",
      isMainContact: false,
    });
    m.companyLocation.findFirst.mockResolvedValue({
      id: "cl_1",
      companyId: "co_A",
    });
    m.companyLocationAccess.findUnique.mockResolvedValue(null);
    m.companyLocationAccess.create.mockResolvedValue({
      id: "cla_new",
      tenantId: TENANT,
      companyContactId: "cc_1",
      companyLocationId: "cl_1",
    });

    const out = await grantAccess({
      tenantId: TENANT,
      companyContactId: "cc_1",
      companyLocationId: "cl_1",
    });
    expect(out.id).toBe("cla_new");
    expect(m.companyLocationAccess.create).toHaveBeenCalled();
  });

  it("is idempotent — returns the existing row if present", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_1",
      companyId: "co_A",
      isMainContact: false,
    });
    m.companyLocation.findFirst.mockResolvedValue({
      id: "cl_1",
      companyId: "co_A",
    });
    m.companyLocationAccess.findUnique.mockResolvedValue({
      id: "cla_existing",
    });

    const out = await grantAccess({
      tenantId: TENANT,
      companyContactId: "cc_1",
      companyLocationId: "cl_1",
    });
    expect(out.id).toBe("cla_existing");
    expect(m.companyLocationAccess.create).not.toHaveBeenCalled();
  });

  it("refuses cross-company grant — contact.companyId != location.companyId", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_1",
      companyId: "co_A",
      isMainContact: false,
    });
    m.companyLocation.findFirst.mockResolvedValue({
      id: "cl_2",
      companyId: "co_B",
    });
    await expect(
      grantAccess({
        tenantId: TENANT,
        companyContactId: "cc_1",
        companyLocationId: "cl_2",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.companyLocationAccess.create).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when contact is missing in tenant", async () => {
    m.companyContact.findFirst.mockResolvedValue(null);
    await expect(
      grantAccess({
        tenantId: TENANT,
        companyContactId: "cc_missing",
        companyLocationId: "cl_1",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError when location is missing in tenant", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_1",
      companyId: "co_A",
      isMainContact: false,
    });
    m.companyLocation.findFirst.mockResolvedValue(null);
    await expect(
      grantAccess({
        tenantId: TENANT,
        companyContactId: "cc_1",
        companyLocationId: "cl_missing",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("revokeAccess", () => {
  beforeEach(() => reset());

  it("deletes the access when the contact is not main", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_1",
      companyId: "co_A",
      isMainContact: false,
    });
    m.companyLocationAccess.findUnique.mockResolvedValue({ id: "cla_1" });
    m.companyLocationAccess.delete.mockResolvedValue({ id: "cla_1" });

    await revokeAccess({
      tenantId: TENANT,
      companyContactId: "cc_1",
      companyLocationId: "cl_1",
    });
    expect(m.companyLocationAccess.delete).toHaveBeenCalledWith({
      where: { id: "cla_1" },
    });
  });

  it("refuses to strip the LAST access from the main contact", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_main",
      companyId: "co_A",
      isMainContact: true,
    });
    m.companyLocationAccess.findUnique.mockResolvedValue({ id: "cla_only" });
    m.companyLocationAccess.count.mockResolvedValue(0); // zero remaining

    await expect(
      revokeAccess({
        tenantId: TENANT,
        companyContactId: "cc_main",
        companyLocationId: "cl_1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.companyLocationAccess.delete).not.toHaveBeenCalled();
  });

  it("allows revoking a main contact's access when they have others", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_main",
      companyId: "co_A",
      isMainContact: true,
    });
    m.companyLocationAccess.findUnique.mockResolvedValue({ id: "cla_1" });
    m.companyLocationAccess.count.mockResolvedValue(2); // >0 remaining
    m.companyLocationAccess.delete.mockResolvedValue({ id: "cla_1" });

    await revokeAccess({
      tenantId: TENANT,
      companyContactId: "cc_main",
      companyLocationId: "cl_1",
    });
    expect(m.companyLocationAccess.delete).toHaveBeenCalled();
  });

  it("throws NotFoundError when no access row exists", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_1",
      companyId: "co_A",
      isMainContact: false,
    });
    m.companyLocationAccess.findUnique.mockResolvedValue(null);
    await expect(
      revokeAccess({
        tenantId: TENANT,
        companyContactId: "cc_1",
        companyLocationId: "cl_1",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listAccessForContact", () => {
  beforeEach(() => reset());

  it("lists every CompanyLocation a contact can act on", async () => {
    m.companyLocationAccess.findMany.mockResolvedValue([
      { id: "cla_1", companyLocation: { id: "cl_1", name: "HQ" } },
      { id: "cla_2", companyLocation: { id: "cl_2", name: "GBG" } },
    ]);
    const out = await listAccessForContact({
      tenantId: TENANT,
      companyContactId: "cc_1",
    });
    expect(out).toHaveLength(2);
    expect(m.companyLocationAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, companyContactId: "cc_1" },
      }),
    );
  });
});

describe("listContactsWithAccessToLocation", () => {
  beforeEach(() => reset());

  it("lists all contacts with access to a given location", async () => {
    m.companyLocationAccess.findMany.mockResolvedValue([
      {
        id: "cla_1",
        companyContact: {
          id: "cc_1",
          isMainContact: true,
          title: "VD",
          guestAccount: { id: "ga_1", name: "Anna" },
        },
      },
    ]);
    const out = await listContactsWithAccessToLocation({
      tenantId: TENANT,
      companyLocationId: "cl_1",
    });
    expect(out).toHaveLength(1);
    expect(out[0].companyContact.guestAccount.name).toBe("Anna");
  });
});

describe("hasAccess", () => {
  beforeEach(() => reset());

  it("returns true when access exists", async () => {
    m.companyLocationAccess.findFirst.mockResolvedValue({ id: "cla_1" });
    const out = await hasAccess({
      tenantId: TENANT,
      companyContactId: "cc_1",
      companyLocationId: "cl_1",
    });
    expect(out).toBe(true);
  });

  it("returns false when access is absent (fail-closed)", async () => {
    m.companyLocationAccess.findFirst.mockResolvedValue(null);
    const out = await hasAccess({
      tenantId: TENANT,
      companyContactId: "cc_x",
      companyLocationId: "cl_x",
    });
    expect(out).toBe(false);
  });

  it("scopes the lookup by tenantId, contactId, and locationId", async () => {
    m.companyLocationAccess.findFirst.mockResolvedValue(null);
    await hasAccess({
      tenantId: TENANT,
      companyContactId: "cc_1",
      companyLocationId: "cl_1",
    });
    expect(m.companyLocationAccess.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT,
          companyContactId: "cc_1",
          companyLocationId: "cl_1",
        },
      }),
    );
  });
});
