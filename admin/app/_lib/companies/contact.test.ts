import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => {
  const prisma = {
    company: { findFirst: vi.fn() },
    companyLocation: { findMany: vi.fn() },
    companyContact: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    companyLocationAccess: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    guestAccount: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  return { prisma };
});

const {
  createContact,
  updateContact,
  removeContact,
  listContactsForCompany,
  getCompanyForGuest,
  resolveGuestCompanyContext,
} = await import("./contact");
const { prisma } = await import("@/app/_lib/db/prisma");
type MockPrisma = {
  company: Record<string, ReturnType<typeof vi.fn>>;
  companyLocation: Record<string, ReturnType<typeof vi.fn>>;
  companyContact: Record<string, ReturnType<typeof vi.fn>>;
  companyLocationAccess: Record<string, ReturnType<typeof vi.fn>>;
  guestAccount: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};
const m = prisma as unknown as MockPrisma;

const TENANT = "t_1";

function resetAllMocks(): void {
  for (const model of [
    m.company,
    m.companyLocation,
    m.companyContact,
    m.companyLocationAccess,
    m.guestAccount,
  ]) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  m.$transaction.mockReset();
  m.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
}

describe("createContact", () => {
  beforeEach(() => resetAllMocks());

  it("creates a new CompanyContact when none exists", async () => {
    m.company.findFirst.mockResolvedValue({ id: "co_1" });
    m.guestAccount.findFirst.mockResolvedValue({ id: "ga_1" });
    m.companyContact.findUnique.mockResolvedValue(null);
    m.companyContact.findFirst.mockResolvedValue(null); // no cross-company clash
    m.companyContact.create.mockResolvedValue({
      id: "cc_new",
      tenantId: TENANT,
      companyId: "co_1",
      guestAccountId: "ga_1",
      isMainContact: false,
    });

    const result = await createContact({
      tenantId: TENANT,
      companyId: "co_1",
      contact: { guestAccountId: "ga_1" },
    });
    expect(result.id).toBe("cc_new");
    expect(m.companyContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          companyId: "co_1",
          guestAccountId: "ga_1",
          isMainContact: false,
        }),
      }),
    );
  });

  it("is idempotent — re-creating for same (company, guest) returns the existing row", async () => {
    m.company.findFirst.mockResolvedValue({ id: "co_1" });
    m.guestAccount.findFirst.mockResolvedValue({ id: "ga_1" });
    m.companyContact.findUnique.mockResolvedValue({
      id: "cc_existing",
      companyId: "co_1",
      guestAccountId: "ga_1",
    });

    const result = await createContact({
      tenantId: TENANT,
      companyId: "co_1",
      contact: { guestAccountId: "ga_1" },
    });
    expect(result.id).toBe("cc_existing");
    expect(m.companyContact.create).not.toHaveBeenCalled();
  });

  it("rejects cross-company guest with ConflictError", async () => {
    m.company.findFirst.mockResolvedValue({ id: "co_1" });
    m.guestAccount.findFirst.mockResolvedValue({ id: "ga_shared" });
    m.companyContact.findUnique.mockResolvedValue(null);
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_elsewhere",
      companyId: "co_B",
    });

    await expect(
      createContact({
        tenantId: TENANT,
        companyId: "co_1",
        contact: { guestAccountId: "ga_shared" },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(m.companyContact.create).not.toHaveBeenCalled();
  });

  it("upserts a new GuestAccount for the email branch", async () => {
    m.company.findFirst.mockResolvedValue({ id: "co_1" });
    m.guestAccount.upsert.mockResolvedValue({ id: "ga_new" });
    m.companyContact.findUnique.mockResolvedValue(null);
    m.companyContact.findFirst.mockResolvedValue(null);
    m.companyContact.create.mockResolvedValue({ id: "cc_new" });

    await createContact({
      tenantId: TENANT,
      companyId: "co_1",
      contact: { email: " NewUser@Acme.SE ", name: "New User" },
    });
    expect(m.guestAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_email: { tenantId: TENANT, email: "newuser@acme.se" },
        },
      }),
    );
  });

  it("grants access to supplied locations — idempotent via skipDuplicates", async () => {
    m.company.findFirst.mockResolvedValue({ id: "co_1" });
    m.guestAccount.findFirst.mockResolvedValue({ id: "ga_1" });
    m.companyContact.findUnique.mockResolvedValue(null);
    m.companyContact.findFirst.mockResolvedValue(null);
    m.companyContact.create.mockResolvedValue({ id: "cc_new" });
    m.companyLocation.findMany.mockResolvedValue([
      { id: "cl_a" },
      { id: "cl_b" },
    ]);

    await createContact({
      tenantId: TENANT,
      companyId: "co_1",
      contact: { guestAccountId: "ga_1" },
      grantAccessToLocationIds: ["cl_a", "cl_b"],
    });

    expect(m.companyLocationAccess.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          {
            tenantId: TENANT,
            companyContactId: "cc_new",
            companyLocationId: "cl_a",
          },
          {
            tenantId: TENANT,
            companyContactId: "cc_new",
            companyLocationId: "cl_b",
          },
        ],
        skipDuplicates: true,
      }),
    );
  });

  it("rejects locations that do not belong to this company", async () => {
    m.company.findFirst.mockResolvedValue({ id: "co_1" });
    m.guestAccount.findFirst.mockResolvedValue({ id: "ga_1" });
    m.companyContact.findUnique.mockResolvedValue(null);
    m.companyContact.findFirst.mockResolvedValue(null);
    m.companyContact.create.mockResolvedValue({ id: "cc_new" });
    // Only cl_a belongs to this company; cl_other is excluded by the
    // (tenantId, companyId) filter.
    m.companyLocation.findMany.mockResolvedValue([{ id: "cl_a" }]);

    await expect(
      createContact({
        tenantId: TENANT,
        companyId: "co_1",
        contact: { guestAccountId: "ga_1" },
        grantAccessToLocationIds: ["cl_a", "cl_other"],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.companyLocationAccess.createMany).not.toHaveBeenCalled();
  });

  it("rejects when company is not in tenant", async () => {
    m.company.findFirst.mockResolvedValue(null);
    await expect(
      createContact({
        tenantId: TENANT,
        companyId: "co_other",
        contact: { guestAccountId: "ga_1" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateContact", () => {
  beforeEach(() => resetAllMocks());

  it("updates title + locale in a tenant-scoped updateMany", async () => {
    m.companyContact.updateMany.mockResolvedValue({ count: 1 });
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_1",
      title: "VD",
      locale: "sv",
    });

    const out = await updateContact({
      tenantId: TENANT,
      contactId: "cc_1",
      patch: { title: "VD", locale: "sv" },
    });
    expect(out.title).toBe("VD");
    expect(m.companyContact.updateMany).toHaveBeenCalledWith({
      where: { id: "cc_1", tenantId: TENANT },
      data: { title: "VD", locale: "sv" },
    });
  });

  it("throws NotFoundError when contact does not exist in tenant", async () => {
    m.companyContact.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      updateContact({
        tenantId: TENANT,
        contactId: "cc_missing",
        patch: { title: "X" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("removeContact", () => {
  beforeEach(() => resetAllMocks());

  it("refuses to remove a contact flagged as main", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_main",
      companyId: "co_1",
      isMainContact: true,
    });
    await expect(
      removeContact({ tenantId: TENANT, contactId: "cc_main" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.companyContact.delete).not.toHaveBeenCalled();
  });

  it("refuses when Company.mainContactId still points here (defensive)", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_phantom",
      companyId: "co_1",
      isMainContact: false, // flag drifted
    });
    m.company.findFirst.mockResolvedValue({ mainContactId: "cc_phantom" });
    await expect(
      removeContact({ tenantId: TENANT, contactId: "cc_phantom" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError when the contact does not exist", async () => {
    m.companyContact.findFirst.mockResolvedValue(null);
    await expect(
      removeContact({ tenantId: TENANT, contactId: "cc_missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes a normal contact", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_1",
      companyId: "co_1",
      isMainContact: false,
    });
    m.company.findFirst.mockResolvedValue({ mainContactId: "cc_other" });
    m.companyContact.delete.mockResolvedValue({ id: "cc_1" });
    await removeContact({ tenantId: TENANT, contactId: "cc_1" });
    expect(m.companyContact.delete).toHaveBeenCalledWith({
      where: { id: "cc_1" },
    });
  });
});

describe("listContactsForCompany", () => {
  beforeEach(() => resetAllMocks());

  it("returns contacts with guestAccount + locationAccess hydrated", async () => {
    m.companyContact.findMany.mockResolvedValue([
      {
        id: "cc_1",
        isMainContact: true,
        guestAccount: { id: "ga_1", name: "Anna" },
        locationAccess: [
          {
            id: "cla_1",
            companyLocation: { id: "cl_1", name: "HQ" },
          },
        ],
      },
    ]);
    const out = await listContactsForCompany({
      tenantId: TENANT,
      companyId: "co_1",
    });
    expect(out).toHaveLength(1);
    expect(out[0].locationAccess[0].companyLocation.name).toBe("HQ");
    expect(m.companyContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, companyId: "co_1" },
        orderBy: [{ isMainContact: "desc" }, { createdAt: "asc" }],
      }),
    );
  });
});

describe("getCompanyForGuest", () => {
  beforeEach(() => resetAllMocks());

  it("returns the single Company the guest belongs to", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_1",
      tenantId: TENANT,
      companyId: "co_1",
      guestAccountId: "ga_1",
      isMainContact: false,
      title: null,
      locale: null,
      company: { id: "co_1", name: "Acme", tenantId: TENANT },
    });
    const out = await getCompanyForGuest({
      tenantId: TENANT,
      guestAccountId: "ga_1",
    });
    expect(out?.id).toBe("co_1");
    expect(out?.contact.id).toBe("cc_1");
  });

  it("returns null when guest has no membership anywhere", async () => {
    m.companyContact.findFirst.mockResolvedValue(null);
    const out = await getCompanyForGuest({
      tenantId: TENANT,
      guestAccountId: "ga_x",
    });
    expect(out).toBeNull();
  });
});

describe("resolveGuestCompanyContext", () => {
  beforeEach(() => resetAllMocks());

  it("returns { company, contact, locations } in a single query graph", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_1",
      tenantId: TENANT,
      companyId: "co_1",
      guestAccountId: "ga_1",
      isMainContact: false,
      title: null,
      locale: null,
      company: { id: "co_1", name: "Acme", tenantId: TENANT },
      locationAccess: [
        { companyLocation: { id: "cl_1", name: "HQ" } },
        { companyLocation: { id: "cl_2", name: "GBG" } },
      ],
    });
    const out = await resolveGuestCompanyContext({
      tenantId: TENANT,
      guestAccountId: "ga_1",
    });
    expect(out?.company.id).toBe("co_1");
    expect(out?.contact.id).toBe("cc_1");
    expect(out?.locations).toHaveLength(2);
    expect(out?.locations[0].id).toBe("cl_1");
    expect(m.companyContact.findFirst).toHaveBeenCalledTimes(1);
  });

  it("returns null when guest has no membership", async () => {
    m.companyContact.findFirst.mockResolvedValue(null);
    const out = await resolveGuestCompanyContext({
      tenantId: TENANT,
      guestAccountId: "ga_x",
    });
    expect(out).toBeNull();
  });
});
