import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

const mockPrisma = {
  draftOrder: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  accommodation: {
    findMany: vi.fn(),
  },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));

const { listDrafts, computeAccommodationSummary } = await import("./list");

// ── Fixtures ────────────────────────────────────────────────────

type Row = {
  id: string;
  displayNumber: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  totalCents: bigint;
  currency: string;
  guestAccountId: string | null;
  contactEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  lineItems: Array<{
    lineType: string;
    accommodationId: string | null;
    title: string;
  }>;
};

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "draft_1",
    displayNumber: "D-2026-0001",
    status: "OPEN",
    expiresAt: new Date("2026-05-01T00:00:00Z"),
    createdAt: new Date("2026-04-25T00:00:00Z"),
    updatedAt: new Date("2026-04-25T00:00:00Z"),
    totalCents: BigInt(123_45),
    currency: "SEK",
    guestAccountId: "guest_1",
    contactEmail: "kund@example.com",
    contactFirstName: "Anna",
    contactLastName: "Andersson",
    lineItems: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.draftOrder.findMany.mockResolvedValue([]);
  mockPrisma.draftOrder.count.mockResolvedValue(0);
  mockPrisma.accommodation.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════
// computeAccommodationSummary — E3 contract
// ═══════════════════════════════════════════════════════════════

describe("computeAccommodationSummary (E3)", () => {
  it("empty lines → 'Inga rader'", () => {
    expect(computeAccommodationSummary([])).toBe("Inga rader");
  });

  it("1 distinct → '1× Stuga A'", () => {
    expect(
      computeAccommodationSummary([
        {
          lineType: "ACCOMMODATION",
          accommodationId: "a1",
          accommodationName: "Stuga A",
        },
      ]),
    ).toBe("1× Stuga A");
  });

  it("3 distinct, count desc + name asc tiebreak", () => {
    const summary = computeAccommodationSummary([
      { lineType: "ACCOMMODATION", accommodationId: "a", accommodationName: "Stuga A" },
      { lineType: "ACCOMMODATION", accommodationId: "a", accommodationName: "Stuga A" },
      { lineType: "ACCOMMODATION", accommodationId: "b", accommodationName: "Husvagnsplats" },
      { lineType: "ACCOMMODATION", accommodationId: "c", accommodationName: "Tältplats" },
    ]);
    expect(summary).toBe("2× Stuga A, 1× Husvagnsplats, 1× Tältplats");
  });

  it("> 3 distinct → truncates with ' +N till'", () => {
    const summary = computeAccommodationSummary([
      { lineType: "ACCOMMODATION", accommodationId: "a", accommodationName: "Stuga A" },
      { lineType: "ACCOMMODATION", accommodationId: "a", accommodationName: "Stuga A" },
      { lineType: "ACCOMMODATION", accommodationId: "b", accommodationName: "Husvagnsplats" },
      { lineType: "ACCOMMODATION", accommodationId: "c", accommodationName: "Tältplats" },
      { lineType: "ACCOMMODATION", accommodationId: "d", accommodationName: "Bungalow" },
      { lineType: "ACCOMMODATION", accommodationId: "e", accommodationName: "Lägenhet" },
    ]);
    expect(summary).toBe("2× Stuga A, 1× Bungalow, 1× Husvagnsplats +2 till");
  });

  it("lines with null accommodationName excluded; remaining counted", () => {
    expect(
      computeAccommodationSummary([
        { lineType: "ACCOMMODATION", accommodationId: null, accommodationName: null },
        { lineType: "ACCOMMODATION", accommodationId: "a", accommodationName: "Stuga A" },
      ]),
    ).toBe("1× Stuga A");
  });

  it("all-null lines → 'Inga rader'", () => {
    expect(
      computeAccommodationSummary([
        { lineType: "ACCOMMODATION", accommodationId: null, accommodationName: null },
        { lineType: "ACCOMMODATION", accommodationId: null, accommodationName: null },
      ]),
    ).toBe("Inga rader");
  });

  it("uses U+00D7 multiplication sign, not 'x'", () => {
    const out = computeAccommodationSummary([
      { lineType: "ACCOMMODATION", accommodationId: "a", accommodationName: "Stuga" },
    ]);
    expect(out).toContain("×");
    expect(out).not.toContain("1x ");
  });
});

// ═══════════════════════════════════════════════════════════════
// listDrafts
// ═══════════════════════════════════════════════════════════════

describe("listDrafts — empty + happy path", () => {
  it("returns empty page when no drafts match", async () => {
    const result = await listDrafts("tenant_1");
    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(25);
  });

  it("happy 5-draft mix, default sort=expiresAt asc", async () => {
    const rows = [
      makeRow({ id: "d_a", displayNumber: "D-1" }),
      makeRow({ id: "d_b", displayNumber: "D-2" }),
      makeRow({ id: "d_c", displayNumber: "D-3" }),
      makeRow({ id: "d_d", displayNumber: "D-4" }),
      makeRow({ id: "d_e", displayNumber: "D-5" }),
    ];
    mockPrisma.draftOrder.findMany.mockResolvedValue(rows);
    mockPrisma.draftOrder.count.mockResolvedValue(5);

    const result = await listDrafts("tenant_1");

    expect(result.items.length).toBe(5);
    expect(result.totalCount).toBe(5);

    const orderArgs = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, "asc" | "desc">>;
    };
    expect(orderArgs.orderBy).toEqual([{ expiresAt: "asc" }, { id: "asc" }]);
  });
});

describe("listDrafts — filters", () => {
  it("status filter (multi) maps to status: { in: [...] }", async () => {
    await listDrafts("tenant_1", {
      filters: { status: ["OPEN", "PENDING_APPROVAL"] },
    });

    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      where: { status?: { in: string[] } };
    };
    expect(args.where.status).toEqual({ in: ["OPEN", "PENDING_APPROVAL"] });
  });

  it("expiresAt range maps to gte/lte", async () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-04-30T00:00:00Z");
    await listDrafts("tenant_1", {
      filters: { expiresAtFrom: from, expiresAtTo: to },
    });
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      where: { expiresAt: { gte: Date; lte: Date } };
    };
    expect(args.where.expiresAt.gte).toBe(from);
    expect(args.where.expiresAt.lte).toBe(to);
  });

  it("customerEmail uses contains insensitive", async () => {
    await listDrafts("tenant_1", { filters: { customerEmail: "foo@bar" } });
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      where: { contactEmail: { contains: string; mode: string } };
    };
    expect(args.where.contactEmail.contains).toBe("foo@bar");
    expect(args.where.contactEmail.mode).toBe("insensitive");
  });

  it("free-text search OR's across displayNumber/email/firstName/lastName", async () => {
    await listDrafts("tenant_1", { filters: { search: "Anna" } });
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(Array.isArray(args.where.OR)).toBe(true);
    expect(args.where.OR.length).toBe(4);
  });
});

describe("listDrafts — sort variants", () => {
  it("totalAmount maps to totalCents column", async () => {
    await listDrafts("tenant_1", {
      sort: { by: "totalAmount", direction: "desc" },
    });
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, "asc" | "desc">>;
    };
    expect(args.orderBy[0]).toEqual({ totalCents: "desc" });
    expect(args.orderBy[1]).toEqual({ id: "desc" });
  });

  it("createdAt desc respected", async () => {
    await listDrafts("tenant_1", {
      sort: { by: "createdAt", direction: "desc" },
    });
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, "asc" | "desc">>;
    };
    expect(args.orderBy[0]).toEqual({ createdAt: "desc" });
  });
});

describe("listDrafts — pagination", () => {
  it("page=2 limit=10 → skip=10 take=10", async () => {
    await listDrafts("tenant_1", { page: 2, limit: 10 });
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
  });

  it("default limit=25, page=1 → skip=0 take=25", async () => {
    await listDrafts("tenant_1");
    const args = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(0);
    expect(args.take).toBe(25);
  });
});

describe("listDrafts — tenant isolation (T-tenant-isolation)", () => {
  it("WHERE clause always carries the supplied tenantId", async () => {
    await listDrafts("tenant_alpha");
    await listDrafts("tenant_beta");

    const callA = mockPrisma.draftOrder.findMany.mock.calls[0][0] as {
      where: { tenantId: string };
    };
    const callB = mockPrisma.draftOrder.findMany.mock.calls[1][0] as {
      where: { tenantId: string };
    };
    expect(callA.where.tenantId).toBe("tenant_alpha");
    expect(callB.where.tenantId).toBe("tenant_beta");

    const countA = mockPrisma.draftOrder.count.mock.calls[0][0] as {
      where: { tenantId: string };
    };
    expect(countA.where.tenantId).toBe("tenant_alpha");
  });

  it("accommodation hydration is also tenant-scoped", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([
      makeRow({
        lineItems: [
          { lineType: "ACCOMMODATION", accommodationId: "a1", title: "Stuga A" },
        ],
      }),
    ]);
    mockPrisma.draftOrder.count.mockResolvedValue(1);
    mockPrisma.accommodation.findMany.mockResolvedValue([
      { id: "a1", name: "Stuga A" },
    ]);

    await listDrafts("tenant_alpha");

    const accArgs = mockPrisma.accommodation.findMany.mock.calls[0][0] as {
      where: { tenantId: string; id: { in: string[] } };
    };
    expect(accArgs.where.tenantId).toBe("tenant_alpha");
    expect(accArgs.where.id.in).toEqual(["a1"]);
  });
});

describe("listDrafts — DTO mapping", () => {
  it("maps customer name from firstName + lastName", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([makeRow()]);
    mockPrisma.draftOrder.count.mockResolvedValue(1);

    const result = await listDrafts("tenant_1");
    expect(result.items[0].customer).toEqual({
      id: "guest_1",
      email: "kund@example.com",
      name: "Anna Andersson",
    });
  });

  it("customer is null when contactEmail is null", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([
      makeRow({ contactEmail: null }),
    ]);
    mockPrisma.draftOrder.count.mockResolvedValue(1);

    const result = await listDrafts("tenant_1");
    expect(result.items[0].customer).toBeNull();
  });

  it("accommodationSummary built from hydrated names", async () => {
    mockPrisma.draftOrder.findMany.mockResolvedValue([
      makeRow({
        lineItems: [
          { lineType: "ACCOMMODATION", accommodationId: "a1", title: "Snapshot" },
          { lineType: "ACCOMMODATION", accommodationId: "a1", title: "Snapshot" },
          { lineType: "ACCOMMODATION", accommodationId: "a2", title: "Other Snapshot" },
        ],
      }),
    ]);
    mockPrisma.draftOrder.count.mockResolvedValue(1);
    mockPrisma.accommodation.findMany.mockResolvedValue([
      { id: "a1", name: "Stuga A" },
      { id: "a2", name: "Husvagnsplats" },
    ]);

    const result = await listDrafts("tenant_1");
    expect(result.items[0].accommodationSummary).toBe(
      "2× Stuga A, 1× Husvagnsplats",
    );
    expect(result.items[0].lineCount).toBe(3);
  });
});
