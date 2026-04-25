import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

const mockPrisma = {
  guestAccount: {
    findMany: vi.fn(),
  },
  draftOrder: {
    groupBy: vi.fn(),
  },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));

const { searchCustomers } = await import("./search-customers");

// ── Fixtures ────────────────────────────────────────────────────

type GuestRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  phone: string | null;
  _count: { orders: number };
};

function makeGuest(overrides: Partial<GuestRow> = {}): GuestRow {
  return {
    id: "g_1",
    email: "kund@example.com",
    firstName: "Anna",
    lastName: "Andersson",
    name: null,
    phone: null,
    _count: { orders: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.guestAccount.findMany.mockResolvedValue([]);
  mockPrisma.draftOrder.groupBy.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════
// Empty + happy path
// ═══════════════════════════════════════════════════════════════

describe("searchCustomers — empty", () => {
  it("empty/whitespace query returns [] without DB call", async () => {
    expect(await searchCustomers("tenant_1", "")).toEqual([]);
    expect(await searchCustomers("tenant_1", "   ")).toEqual([]);
    expect(mockPrisma.guestAccount.findMany).not.toHaveBeenCalled();
  });

  it("no DB matches returns []", async () => {
    mockPrisma.guestAccount.findMany.mockResolvedValue([]);
    const result = await searchCustomers("tenant_1", "noone");
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Email + name match
// ═══════════════════════════════════════════════════════════════

describe("searchCustomers — match patterns", () => {
  it("OR's across email/firstName/lastName/name with insensitive contains", async () => {
    mockPrisma.guestAccount.findMany.mockResolvedValue([makeGuest()]);

    await searchCustomers("tenant_1", "anna");

    const args = mockPrisma.guestAccount.findMany.mock.calls[0][0] as {
      where: { OR: Array<Record<string, unknown>>; tenantId: string };
    };
    expect(args.where.tenantId).toBe("tenant_1");
    expect(args.where.OR.length).toBe(4);
    const fieldsSearched = args.where.OR.map(
      (clause) => Object.keys(clause)[0],
    );
    expect(fieldsSearched.sort()).toEqual(
      ["email", "firstName", "lastName", "name"].sort(),
    );
    for (const clause of args.where.OR) {
      const inner = Object.values(clause)[0] as { mode: string };
      expect(inner.mode).toBe("insensitive");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// T-display-name-fallback
// ═══════════════════════════════════════════════════════════════

describe("searchCustomers — T-display-name-fallback", () => {
  it("path 1: firstName + lastName composed", async () => {
    mockPrisma.guestAccount.findMany.mockResolvedValue([
      makeGuest({ firstName: "Anna", lastName: "Andersson", name: "Old Name" }),
    ]);
    const result = await searchCustomers("tenant_1", "anna");
    expect(result[0].name).toBe("Anna Andersson");
  });

  it("path 2: deprecated name when firstName/lastName both null", async () => {
    mockPrisma.guestAccount.findMany.mockResolvedValue([
      makeGuest({ firstName: null, lastName: null, name: "Legacy Customer" }),
    ]);
    const result = await searchCustomers("tenant_1", "legacy");
    expect(result[0].name).toBe("Legacy Customer");
  });

  it("path 3: null when firstName, lastName, AND name all empty", async () => {
    mockPrisma.guestAccount.findMany.mockResolvedValue([
      makeGuest({ firstName: null, lastName: null, name: null }),
    ]);
    const result = await searchCustomers("tenant_1", "no");
    expect(result[0].name).toBeNull();
  });

  it("path 1 wins even when only firstName is set", async () => {
    mockPrisma.guestAccount.findMany.mockResolvedValue([
      makeGuest({ firstName: "Anna", lastName: null, name: "Other" }),
    ]);
    const result = await searchCustomers("tenant_1", "anna");
    expect(result[0].name).toBe("Anna");
  });
});

// ═══════════════════════════════════════════════════════════════
// T-no-phone-search
// ═══════════════════════════════════════════════════════════════

describe("searchCustomers — T-no-phone-search", () => {
  it("phone is NOT included in OR clauses", async () => {
    await searchCustomers("tenant_1", "0701234567");

    const args = mockPrisma.guestAccount.findMany.mock.calls[0][0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    const fieldsSearched = args.where.OR.map(
      (clause) => Object.keys(clause)[0],
    );
    expect(fieldsSearched).not.toContain("phone");
  });
});

// ═══════════════════════════════════════════════════════════════
// T-tenant-isolation
// ═══════════════════════════════════════════════════════════════

describe("searchCustomers — tenant isolation", () => {
  it("WHERE always carries the supplied tenantId", async () => {
    await searchCustomers("tenant_alpha", "x");
    const args = mockPrisma.guestAccount.findMany.mock.calls[0][0] as {
      where: { tenantId: string };
    };
    expect(args.where.tenantId).toBe("tenant_alpha");
  });

  it("draftOrder.groupBy also tenant-scoped", async () => {
    mockPrisma.guestAccount.findMany.mockResolvedValue([
      makeGuest({ id: "g_a" }),
    ]);
    mockPrisma.draftOrder.groupBy.mockResolvedValue([]);

    await searchCustomers("tenant_alpha", "x");

    const args = mockPrisma.draftOrder.groupBy.mock.calls[0][0] as {
      where: { tenantId: string; guestAccountId: { in: string[] } };
    };
    expect(args.where.tenantId).toBe("tenant_alpha");
    expect(args.where.guestAccountId.in).toEqual(["g_a"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Limit
// ═══════════════════════════════════════════════════════════════

describe("searchCustomers — limit", () => {
  it("default limit = 10", async () => {
    await searchCustomers("tenant_1", "x");
    const args = mockPrisma.guestAccount.findMany.mock.calls[0][0] as {
      take: number;
    };
    expect(args.take).toBe(10);
  });

  it("custom limit honored", async () => {
    await searchCustomers("tenant_1", "x", { limit: 5 });
    const args = mockPrisma.guestAccount.findMany.mock.calls[0][0] as {
      take: number;
    };
    expect(args.take).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Counts hydration
// ═══════════════════════════════════════════════════════════════

describe("searchCustomers — counts", () => {
  it("draftOrderCount populated from groupBy aggregate", async () => {
    mockPrisma.guestAccount.findMany.mockResolvedValue([
      makeGuest({ id: "g_a", _count: { orders: 3 } }),
      makeGuest({ id: "g_b", _count: { orders: 0 } }),
    ]);
    mockPrisma.draftOrder.groupBy.mockResolvedValue([
      { guestAccountId: "g_a", _count: { _all: 7 } },
    ]);

    const result = await searchCustomers("tenant_1", "x");
    expect(result.find((r) => r.id === "g_a")).toMatchObject({
      draftOrderCount: 7,
      orderCount: 3,
    });
    expect(result.find((r) => r.id === "g_b")).toMatchObject({
      draftOrderCount: 0,
      orderCount: 0,
    });
  });
});
