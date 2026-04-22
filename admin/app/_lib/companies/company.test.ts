import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => {
  const prisma = {
    company: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    companyLocation: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    companyContact: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    companyLocationAccess: {
      create: vi.fn(),
      count: vi.fn(),
    },
    guestAccount: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
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
  createCompany,
  getCompany,
  setMainContact,
} = await import("./company");
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

describe("createCompany", () => {
  beforeEach(() => resetAllMocks());

  it("creates Company + Location + Contact + Access atomically and wires mainContactId", async () => {
    m.guestAccount.findFirst.mockResolvedValue({ id: "ga_1" });
    m.companyContact.findFirst.mockResolvedValue(null); // no prior company for this guest
    m.company.create.mockResolvedValue({ id: "co_1", mainContactId: null });
    m.companyLocation.create.mockResolvedValue({ id: "cl_1" });
    m.companyContact.create.mockResolvedValue({
      id: "cc_1",
      tenantId: TENANT,
      companyId: "co_1",
      guestAccountId: "ga_1",
      isMainContact: true,
    });
    m.companyLocationAccess.create.mockResolvedValue({
      id: "cla_1",
      companyContactId: "cc_1",
      companyLocationId: "cl_1",
    });
    m.company.update.mockResolvedValue({ id: "co_1", mainContactId: "cc_1" });

    const result = await createCompany({
      tenantId: TENANT,
      name: "Acme AB",
      firstLocation: {
        name: "Stockholm HQ",
        billingAddress: { line1: "Storgatan 1", city: "Stockholm" },
      },
      mainContact: { guestAccountId: "ga_1" },
    });

    expect(m.$transaction).toHaveBeenCalledTimes(1);
    expect(m.companyContact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          guestAccountId: "ga_1",
        }),
      }),
    );
    expect(m.company.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          name: "Acme AB",
        }),
      }),
    );
    expect(m.companyLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: "co_1",
          name: "Stockholm HQ",
        }),
      }),
    );
    expect(m.companyContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: "co_1",
          guestAccountId: "ga_1",
          isMainContact: true,
        }),
      }),
    );
    expect(m.companyLocationAccess.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyContactId: "cc_1",
          companyLocationId: "cl_1",
        }),
      }),
    );
    expect(m.company.update).toHaveBeenCalledWith({
      where: { id: "co_1" },
      data: { mainContactId: "cc_1" },
    });
    expect(result.company.id).toBe("co_1");
    expect(result.mainContact.id).toBe("cc_1");
    expect(result.mainContactAccess.id).toBe("cla_1");
  });

  it("rejects when guestAccount is already a contact in another company", async () => {
    m.guestAccount.findFirst.mockResolvedValue({ id: "ga_shared" });
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_existing",
      companyId: "co_other",
    });

    await expect(
      createCompany({
        tenantId: TENANT,
        name: "New Co",
        firstLocation: {
          name: "HQ",
          billingAddress: { line1: "X" },
        },
        mainContact: { guestAccountId: "ga_shared" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      context: { conflictCompanyId: "co_other" },
    });
    await expect(
      createCompany({
        tenantId: TENANT,
        name: "New Co",
        firstLocation: { name: "HQ", billingAddress: { line1: "X" } },
        mainContact: { guestAccountId: "ga_shared" },
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Nothing should have been created
    expect(m.company.create).not.toHaveBeenCalled();
    expect(m.companyLocation.create).not.toHaveBeenCalled();
    expect(m.companyContact.create).not.toHaveBeenCalled();
    expect(m.companyLocationAccess.create).not.toHaveBeenCalled();
  });

  it("propagates mid-transaction failure — access create throws, mainContactId never set", async () => {
    m.guestAccount.findFirst.mockResolvedValue({ id: "ga_1" });
    m.companyContact.findFirst.mockResolvedValue(null);
    m.company.create.mockResolvedValue({ id: "co_1" });
    m.companyLocation.create.mockResolvedValue({ id: "cl_1" });
    m.companyContact.create.mockResolvedValue({ id: "cc_1" });
    m.companyLocationAccess.create.mockRejectedValue(
      new Error("DB: unique violation"),
    );

    await expect(
      createCompany({
        tenantId: TENANT,
        name: "X",
        firstLocation: { name: "HQ", billingAddress: { line1: "Y" } },
        mainContact: { guestAccountId: "ga_1" },
      }),
    ).rejects.toThrow("DB: unique violation");

    // company.update for mainContactId must NEVER be reached after the throw
    expect(m.company.update).not.toHaveBeenCalled();
  });

  it("creates a new GuestAccount when mainContact has newGuestEmail", async () => {
    m.guestAccount.findUnique.mockResolvedValue(null);
    m.guestAccount.upsert.mockResolvedValue({ id: "ga_new" });
    m.companyContact.findFirst.mockResolvedValue(null);
    m.company.create.mockResolvedValue({ id: "co_1" });
    m.companyLocation.create.mockResolvedValue({ id: "cl_1" });
    m.companyContact.create.mockResolvedValue({ id: "cc_1" });
    m.companyLocationAccess.create.mockResolvedValue({ id: "cla_1" });
    m.company.update.mockResolvedValue({ id: "co_1", mainContactId: "cc_1" });

    await createCompany({
      tenantId: TENANT,
      name: "Acme",
      firstLocation: { name: "HQ", billingAddress: { line1: "X" } },
      mainContact: {
        newGuestEmail: "  Boss@Acme.SE  ",
        newGuestName: "Anna Boss",
      },
    });

    expect(m.guestAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_email: { tenantId: TENANT, email: "boss@acme.se" } },
        create: expect.objectContaining({
          tenantId: TENANT,
          email: "boss@acme.se",
          name: "Anna Boss",
        }),
      }),
    );
  });
});

describe("getCompany", () => {
  beforeEach(() => resetAllMocks());

  it("is tenant-scoped — returns null for cross-tenant id", async () => {
    m.company.findFirst.mockResolvedValue(null);
    const out = await getCompany({ tenantId: "t_1", companyId: "co_other" });
    expect(out).toBeNull();
    expect(m.company.findFirst).toHaveBeenCalledWith({
      where: { id: "co_other", tenantId: "t_1" },
    });
  });

  it("returns the row when tenant matches", async () => {
    m.company.findFirst.mockResolvedValue({ id: "co_1", tenantId: "t_1" });
    const out = await getCompany({ tenantId: "t_1", companyId: "co_1" });
    expect(out).toEqual({ id: "co_1", tenantId: "t_1" });
  });
});

describe("setMainContact", () => {
  beforeEach(() => resetAllMocks());

  it("throws ValidationError when contact belongs to a different company", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_x",
      companyId: "co_other",
    });
    await expect(
      setMainContact({ tenantId: TENANT, companyId: "co_1", contactId: "cc_x" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.companyContact.update).not.toHaveBeenCalled();
    expect(m.company.update).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when contact does not exist in tenant", async () => {
    m.companyContact.findFirst.mockResolvedValue(null);
    await expect(
      setMainContact({ tenantId: TENANT, companyId: "co_1", contactId: "cc_missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to promote a contact with zero location access", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_no_access",
      companyId: "co_1",
    });
    m.companyLocationAccess.count.mockResolvedValue(0);
    await expect(
      setMainContact({
        tenantId: TENANT,
        companyId: "co_1",
        contactId: "cc_no_access",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.company.update).not.toHaveBeenCalled();
  });

  it("is atomic — clears old main, sets new main, updates company.mainContactId", async () => {
    m.companyContact.findFirst.mockResolvedValue({
      id: "cc_new",
      companyId: "co_1",
    });
    m.companyLocationAccess.count.mockResolvedValue(2);
    m.companyContact.updateMany.mockResolvedValue({ count: 1 });
    m.companyContact.update.mockResolvedValue({
      id: "cc_new",
      isMainContact: true,
    });
    m.company.update.mockResolvedValue({ id: "co_1", mainContactId: "cc_new" });

    const result = await setMainContact({
      tenantId: TENANT,
      companyId: "co_1",
      contactId: "cc_new",
    });

    expect(m.$transaction).toHaveBeenCalledTimes(1);
    expect(m.companyContact.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        companyId: "co_1",
        isMainContact: true,
        id: { not: "cc_new" },
      },
      data: { isMainContact: false },
    });
    expect(m.companyContact.update).toHaveBeenCalledWith({
      where: { id: "cc_new" },
      data: { isMainContact: true },
    });
    expect(m.company.update).toHaveBeenCalledWith({
      where: { id: "co_1" },
      data: { mainContactId: "cc_new" },
    });
    expect(result.mainContactId).toBe("cc_new");

    // Order matters: clear-old must run BEFORE set-new must run BEFORE company.update
    const clearOrder = m.companyContact.updateMany.mock.invocationCallOrder[0];
    const setOrder = m.companyContact.update.mock.invocationCallOrder[0];
    const companyOrder = m.company.update.mock.invocationCallOrder[0];
    expect(clearOrder).toBeLessThan(setOrder);
    expect(setOrder).toBeLessThan(companyOrder);
  });
});
