import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    paymentTerms: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const {
  listAvailableTerms,
  createCustomTerm,
  getTerms,
  snapshotTerms,
  computeDueDate,
} = await import("./payment-terms");
const { prisma } = await import("@/app/_lib/db/prisma");
type MockPrisma = {
  paymentTerms: Record<string, ReturnType<typeof vi.fn>>;
};
const m = prisma as unknown as MockPrisma;

function resetAllMocks(): void {
  for (const fn of Object.values(m.paymentTerms)) fn.mockReset();
}

const TENANT = "t_1";

describe("listAvailableTerms", () => {
  beforeEach(() => resetAllMocks());

  it("returns system defaults first, then tenant customs", async () => {
    // Mock returns rows as Prisma would after `orderBy: name asc`, mixed.
    // Service must partition: all system rows first (preserving name order),
    // then all tenant-custom rows (preserving name order).
    m.paymentTerms.findMany.mockResolvedValue([
      { id: "pt_cust_a", tenantId: TENANT, name: "A-custom" },
      { id: "pt_sys_1", tenantId: null, name: "Förfaller vid mottagning" },
      { id: "pt_sys_2", tenantId: null, name: "Netto 30 dagar" },
      { id: "pt_cust_b", tenantId: TENANT, name: "Z-custom" },
    ]);
    const out = await listAvailableTerms({ tenantId: TENANT });
    expect(out.map((t) => t.id)).toEqual([
      "pt_sys_1",
      "pt_sys_2",
      "pt_cust_a",
      "pt_cust_b",
    ]);
  });

  it("queries only system + own-tenant rows (never cross-tenant)", async () => {
    m.paymentTerms.findMany.mockResolvedValue([]);
    await listAvailableTerms({ tenantId: TENANT });
    expect(m.paymentTerms.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ tenantId: null }, { tenantId: TENANT }] },
      }),
    );
  });
});

describe("createCustomTerm", () => {
  beforeEach(() => resetAllMocks());

  it("rejects NET without netDays", async () => {
    await expect(
      createCustomTerm({
        tenantId: TENANT,
        name: "Net X",
        type: "NET",
      }),
    ).rejects.toBeInstanceOf(Error); // Zod refine rejects synchronously
    expect(m.paymentTerms.create).not.toHaveBeenCalled();
  });

  it("rejects NET with netDays=0", async () => {
    await expect(
      createCustomTerm({
        tenantId: TENANT,
        name: "Net Zero",
        type: "NET",
        netDays: 0,
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("rejects FIXED_DATE with a past date", async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24);
    await expect(
      createCustomTerm({
        tenantId: TENANT,
        name: "Past Due",
        type: "FIXED_DATE",
        fixedDate: past,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects FIXED_DATE missing fixedDate", async () => {
    await expect(
      createCustomTerm({
        tenantId: TENANT,
        name: "No Date",
        type: "FIXED_DATE",
      }),
    ).rejects.toBeInstanceOf(Error); // Zod refine
  });

  it("creates a valid NET term", async () => {
    m.paymentTerms.create.mockResolvedValue({
      id: "pt_new",
      tenantId: TENANT,
      type: "NET",
      netDays: 21,
    });
    await createCustomTerm({
      tenantId: TENANT,
      name: "Net 21",
      type: "NET",
      netDays: 21,
    });
    expect(m.paymentTerms.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT,
        name: "Net 21",
        type: "NET",
        netDays: 21,
      }),
    });
  });

  it("creates a valid FIXED_DATE term in the future", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    m.paymentTerms.create.mockResolvedValue({ id: "pt_fut" });
    await createCustomTerm({
      tenantId: TENANT,
      name: "Pay by Q1",
      type: "FIXED_DATE",
      fixedDate: future,
    });
    expect(m.paymentTerms.create).toHaveBeenCalled();
  });
});

describe("getTerms", () => {
  beforeEach(() => resetAllMocks());

  it("returns null when the row is for a different tenant", async () => {
    m.paymentTerms.findUnique.mockResolvedValue({
      id: "pt_1",
      tenantId: "t_other",
    });
    const out = await getTerms({ tenantId: TENANT, termsId: "pt_1" });
    expect(out).toBeNull();
  });

  it("returns the row when it's a system default", async () => {
    m.paymentTerms.findUnique.mockResolvedValue({
      id: "pt_sys",
      tenantId: null,
    });
    const out = await getTerms({ tenantId: TENANT, termsId: "pt_sys" });
    expect(out).toMatchObject({ id: "pt_sys" });
  });
});

describe("snapshotTerms", () => {
  beforeEach(() => resetAllMocks());

  it("returns the expected snapshot shape", async () => {
    m.paymentTerms.findUnique.mockResolvedValue({
      id: "pt_net30",
      tenantId: null,
      name: "Netto 30 dagar",
      type: "NET",
      netDays: 30,
      fixedDate: null,
    });
    const snap = await snapshotTerms({ tenantId: TENANT, termsId: "pt_net30" });
    expect(snap).toMatchObject({
      termsId: "pt_net30",
      name: "Netto 30 dagar",
      type: "NET",
      netDays: 30,
      fixedDate: null,
    });
    expect(typeof snap.snapshotAt).toBe("string");
    expect(() => new Date(snap.snapshotAt).toISOString()).not.toThrow();
  });

  it("throws NotFoundError when terms are not accessible", async () => {
    m.paymentTerms.findUnique.mockResolvedValue(null);
    await expect(
      snapshotTerms({ tenantId: TENANT, termsId: "pt_missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("computeDueDate", () => {
  const base = new Date("2026-04-22T10:00:00.000Z");

  it("DUE_ON_RECEIPT → same instant as orderCreatedAt", () => {
    const out = computeDueDate(
      {
        termsId: "x",
        name: "Receipt",
        type: "DUE_ON_RECEIPT",
        netDays: null,
        fixedDate: null,
        snapshotAt: "2026-04-22T10:00:00.000Z",
      },
      base,
    );
    expect(out?.toISOString()).toBe(base.toISOString());
  });

  it("DUE_ON_FULFILLMENT → null", () => {
    const out = computeDueDate(
      {
        termsId: "x",
        name: "On fulfillment",
        type: "DUE_ON_FULFILLMENT",
        netDays: null,
        fixedDate: null,
        snapshotAt: "2026-04-22T10:00:00.000Z",
      },
      base,
    );
    expect(out).toBeNull();
  });

  it("NET → orderCreatedAt + netDays", () => {
    const out = computeDueDate(
      {
        termsId: "x",
        name: "Net 30",
        type: "NET",
        netDays: 30,
        fixedDate: null,
        snapshotAt: "2026-04-22T10:00:00.000Z",
      },
      base,
    );
    expect(out?.toISOString()).toBe("2026-05-22T10:00:00.000Z");
  });

  it("FIXED_DATE → fixedDate", () => {
    const out = computeDueDate(
      {
        termsId: "x",
        name: "End of Q2",
        type: "FIXED_DATE",
        netDays: null,
        fixedDate: "2026-06-30T23:59:59.000Z",
        snapshotAt: "2026-04-22T10:00:00.000Z",
      },
      base,
    );
    expect(out?.toISOString()).toBe("2026-06-30T23:59:59.000Z");
  });

  it("NET without netDays → ValidationError", () => {
    expect(() =>
      computeDueDate(
        {
          termsId: "bad",
          name: "Broken",
          type: "NET",
          netDays: null,
          fixedDate: null,
          snapshotAt: "2026-04-22T10:00:00.000Z",
        },
        base,
      ),
    ).toThrow(ValidationError);
  });
});
