import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

const mockPrisma = {
  accommodation: {
    findMany: vi.fn(),
  },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));

const { searchAccommodations } = await import("./search-accommodations");

// ── Fixtures ────────────────────────────────────────────────────

function makeAcc(overrides: Record<string, unknown> = {}) {
  return {
    id: "a_1",
    name: "Stuga A",
    accommodationType: "CABIN",
    status: "ACTIVE",
    basePricePerNight: 80000,
    currency: "SEK",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.accommodation.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════
// Empty + happy path
// ═══════════════════════════════════════════════════════════════

describe("searchAccommodations — empty", () => {
  it("empty query returns [] without DB call", async () => {
    expect(await searchAccommodations("tenant_1", "")).toEqual([]);
    expect(await searchAccommodations("tenant_1", "  ")).toEqual([]);
    expect(mockPrisma.accommodation.findMany).not.toHaveBeenCalled();
  });
});

describe("searchAccommodations — happy", () => {
  it("name match returns mapped DTOs", async () => {
    mockPrisma.accommodation.findMany.mockResolvedValue([
      makeAcc({ id: "a_1", name: "Stuga A" }),
      makeAcc({ id: "a_2", name: "Stuga B" }),
    ]);
    const result = await searchAccommodations("tenant_1", "stuga");
    expect(result).toEqual([
      {
        id: "a_1",
        name: "Stuga A",
        type: "CABIN",
        status: "ACTIVE",
        basePricePerNight: 80000,
        currency: "SEK",
      },
      {
        id: "a_2",
        name: "Stuga B",
        type: "CABIN",
        status: "ACTIVE",
        basePricePerNight: 80000,
        currency: "SEK",
      },
    ]);
  });

  it("query passed as insensitive contains", async () => {
    await searchAccommodations("tenant_1", "stuga");
    const args = mockPrisma.accommodation.findMany.mock.calls[0][0] as {
      where: { name: { contains: string; mode: string } };
    };
    expect(args.where.name.contains).toBe("stuga");
    expect(args.where.name.mode).toBe("insensitive");
  });
});

// ═══════════════════════════════════════════════════════════════
// T-archived-excluded-by-default + T-status-filter-default
// ═══════════════════════════════════════════════════════════════

describe("searchAccommodations — T-archived-excluded-by-default", () => {
  it("WHERE always sets archivedAt: null", async () => {
    await searchAccommodations("tenant_1", "x");
    const args = mockPrisma.accommodation.findMany.mock.calls[0][0] as {
      where: { archivedAt: null };
    };
    expect(args.where.archivedAt).toBeNull();
  });
});

describe("searchAccommodations — T-status-filter-default", () => {
  it("default statusFilter is ACTIVE only", async () => {
    await searchAccommodations("tenant_1", "x");
    const args = mockPrisma.accommodation.findMany.mock.calls[0][0] as {
      where: { status: { in: string[] } };
    };
    expect(args.where.status.in).toEqual(["ACTIVE"]);
  });

  it("custom statusFilter (e.g. INACTIVE included) honored", async () => {
    await searchAccommodations("tenant_1", "x", {
      statusFilter: ["ACTIVE", "INACTIVE"],
    });
    const args = mockPrisma.accommodation.findMany.mock.calls[0][0] as {
      where: { status: { in: string[] } };
    };
    expect(args.where.status.in).toEqual(["ACTIVE", "INACTIVE"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Tenant isolation
// ═══════════════════════════════════════════════════════════════

describe("searchAccommodations — tenant isolation", () => {
  it("WHERE always carries the supplied tenantId", async () => {
    await searchAccommodations("tenant_alpha", "x");
    const args = mockPrisma.accommodation.findMany.mock.calls[0][0] as {
      where: { tenantId: string };
    };
    expect(args.where.tenantId).toBe("tenant_alpha");
  });
});

// ═══════════════════════════════════════════════════════════════
// Limit + sort
// ═══════════════════════════════════════════════════════════════

describe("searchAccommodations — pagination + sort", () => {
  it("default limit = 10", async () => {
    await searchAccommodations("tenant_1", "x");
    const args = mockPrisma.accommodation.findMany.mock.calls[0][0] as {
      take: number;
    };
    expect(args.take).toBe(10);
  });

  it("orderBy = name asc, id asc (deterministic)", async () => {
    await searchAccommodations("tenant_1", "x");
    const args = mockPrisma.accommodation.findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, "asc" | "desc">>;
    };
    expect(args.orderBy).toEqual([{ name: "asc" }, { id: "asc" }]);
  });

  it("custom limit honored", async () => {
    await searchAccommodations("tenant_1", "x", { limit: 25 });
    const args = mockPrisma.accommodation.findMany.mock.calls[0][0] as {
      take: number;
    };
    expect(args.take).toBe(25);
  });
});
