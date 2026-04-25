import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(admin)/_lib/auth/devAuth", () => ({
  getAuth: vi.fn(),
}));

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
  },
}));

vi.mock("@/app/_lib/draft-orders", () => ({
  listDrafts: vi.fn(),
}));

import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import { listDrafts } from "@/app/_lib/draft-orders";
import { getDrafts } from "./actions";

type GetAuthMock = ReturnType<typeof vi.fn>;
type FindUniqueMock = ReturnType<typeof vi.fn>;
type ListDraftsMock = ReturnType<typeof vi.fn>;

const getAuthMock = getAuth as unknown as GetAuthMock;
const findUniqueMock = prisma.tenant.findUnique as unknown as FindUniqueMock;
const listDraftsMock = listDrafts as unknown as ListDraftsMock;

function defaultListResult() {
  return { items: [], totalCount: 0, page: 1, limit: 25 };
}

beforeEach(() => {
  getAuthMock.mockReset();
  findUniqueMock.mockReset();
  listDraftsMock.mockReset();
  getAuthMock.mockResolvedValue({ orgId: "org_1", userId: "u", orgRole: "org:admin" });
  findUniqueMock.mockResolvedValue({ id: "tenant_t" });
  listDraftsMock.mockResolvedValue(defaultListResult());
});

describe("getDrafts — auth + tenant resolution", () => {
  it("T1 — missing orgId returns empty result", async () => {
    getAuthMock.mockResolvedValueOnce({ orgId: null, userId: null, orgRole: null });
    const result = await getDrafts({});
    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 25 });
    expect(listDraftsMock).not.toHaveBeenCalled();
  });

  it("T2 — missing tenant returns empty result", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const result = await getDrafts({});
    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 25 });
    expect(listDraftsMock).not.toHaveBeenCalled();
  });
});

describe("getDrafts — happy path forwarding", () => {
  it("T3 — passes tenantId + filters + sort + pagination to listDrafts", async () => {
    await getDrafts({ tab: "öppna", page: 2, limit: 50, sortBy: "createdAt", sortDirection: "desc", search: "abc" });
    expect(listDraftsMock).toHaveBeenCalledWith("tenant_t", {
      filters: { status: ["OPEN", "PENDING_APPROVAL", "APPROVED"], search: "abc" },
      sort: { by: "createdAt", direction: "desc" },
      page: 2,
      limit: 50,
    });
  });
});

describe("getDrafts — tab → status filter mapping", () => {
  async function runWithTab(tab: string | undefined) {
    listDraftsMock.mockClear();
    await getDrafts(tab === undefined ? {} : { tab });
    return listDraftsMock.mock.calls[0]?.[1]?.filters;
  }

  it("T4 — tab 'öppna' → [OPEN, PENDING_APPROVAL, APPROVED]", async () => {
    expect((await runWithTab("öppna")).status).toEqual(["OPEN", "PENDING_APPROVAL", "APPROVED"]);
  });

  it("T5 — tab 'fakturerade' → [INVOICED, OVERDUE]", async () => {
    expect((await runWithTab("fakturerade")).status).toEqual(["INVOICED", "OVERDUE"]);
  });

  it("T6 — tab 'betalda' → [PAID]", async () => {
    expect((await runWithTab("betalda")).status).toEqual(["PAID"]);
  });

  it("T7 — tab 'stängda' → [COMPLETED, CANCELLED, REJECTED]", async () => {
    expect((await runWithTab("stängda")).status).toEqual(["COMPLETED", "CANCELLED", "REJECTED"]);
  });

  it("T8 — tab 'alla' or undefined → no status filter", async () => {
    const allaFilters = await runWithTab("alla");
    expect(allaFilters.status).toBeUndefined();
    const undefinedFilters = await runWithTab(undefined);
    expect(undefinedFilters.status).toBeUndefined();
  });
});

describe("getDrafts — search + sort + result shape", () => {
  it("T9 — search param passes through", async () => {
    await getDrafts({ search: "draft-1042" });
    const call = listDraftsMock.mock.calls[0][1];
    expect(call.filters.search).toBe("draft-1042");
  });

  it("T9b — empty search string is dropped (not forwarded)", async () => {
    await getDrafts({ search: "" });
    const call = listDraftsMock.mock.calls[0][1];
    expect(call.filters.search).toBeUndefined();
  });

  it("T10 — default sort is expiresAt asc", async () => {
    await getDrafts({});
    const call = listDraftsMock.mock.calls[0][1];
    expect(call.sort).toEqual({ by: "expiresAt", direction: "asc" });
  });

  it("T11 — custom sortBy/sortDirection passes through", async () => {
    await getDrafts({ sortBy: "totalAmount", sortDirection: "desc" });
    const call = listDraftsMock.mock.calls[0][1];
    expect(call.sort).toEqual({ by: "totalAmount", direction: "desc" });
  });

  it("T12 — result shape mapping (totalCount → total)", async () => {
    listDraftsMock.mockResolvedValueOnce({
      items: [{ id: "d1" }, { id: "d2" }],
      totalCount: 42,
      page: 3,
      limit: 25,
    });
    const result = await getDrafts({ page: 3 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(42);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(25);
  });
});
