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
  searchAccommodations: vi.fn(),
  checkAvailability: vi.fn(),
  createDraftWithLines: vi.fn(),
  searchCustomers: vi.fn(),
  previewDraftTotals: vi.fn(),
}));

import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import {
  searchAccommodations,
  checkAvailability,
  createDraftWithLines,
  searchCustomers,
  previewDraftTotals,
} from "@/app/_lib/draft-orders";
import {
  searchAccommodationsAction,
  checkAvailabilityAction,
  createDraftWithLinesAction,
  searchCustomersAction,
  previewDraftTotalsAction,
} from "./actions";

type Mock = ReturnType<typeof vi.fn>;

const getAuthMock = getAuth as unknown as Mock;
const findUniqueMock = prisma.tenant.findUnique as unknown as Mock;
const searchMock = searchAccommodations as unknown as Mock;
const checkMock = checkAvailability as unknown as Mock;
const createMock = createDraftWithLines as unknown as Mock;
const searchCustomersMock = searchCustomers as unknown as Mock;
const previewMock = previewDraftTotals as unknown as Mock;

beforeEach(() => {
  getAuthMock.mockReset();
  findUniqueMock.mockReset();
  searchMock.mockReset();
  checkMock.mockReset();
  createMock.mockReset();
  searchCustomersMock.mockReset();
  previewMock.mockReset();
  getAuthMock.mockResolvedValue({
    orgId: "org_1",
    userId: "u",
    orgRole: "org:admin",
  });
  findUniqueMock.mockResolvedValue({ id: "tenant_t" });
});

describe("searchAccommodationsAction", () => {
  it("T1 — missing orgId returns []", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await searchAccommodationsAction("foo");
    expect(result).toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("T2 — missing tenant returns []", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const result = await searchAccommodationsAction("foo");
    expect(result).toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("T3 — happy path passes tenantId + query + limit:20", async () => {
    searchMock.mockResolvedValueOnce([{ id: "a1", name: "Room" }]);
    const result = await searchAccommodationsAction("rom");
    expect(searchMock).toHaveBeenCalledWith("tenant_t", "rom", { limit: 20 });
    expect(result).toEqual([{ id: "a1", name: "Room" }]);
  });
});

describe("checkAvailabilityAction", () => {
  it("T4 — missing orgId returns unavailable with 'Ingen tenant'", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await checkAvailabilityAction(
      "a1",
      new Date("2026-05-01"),
      new Date("2026-05-03"),
    );
    expect(result).toEqual({ available: false, reason: "Ingen tenant" });
    expect(checkMock).not.toHaveBeenCalled();
  });

  it("T5 — happy path passes through to checkAvailability", async () => {
    const from = new Date("2026-05-01");
    const to = new Date("2026-05-03");
    checkMock.mockResolvedValueOnce({ available: true });
    const result = await checkAvailabilityAction("a1", from, to);
    expect(checkMock).toHaveBeenCalledWith("tenant_t", "a1", from, to);
    expect(result).toEqual({ available: true });
  });
});

describe("createDraftWithLinesAction", () => {
  it("T6 — missing orgId returns ok:false with 'Ingen tenant'", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await createDraftWithLinesAction({ lines: [] });
    expect(result).toEqual({ ok: false, error: "Ingen tenant" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("T7 — happy path forwards input with tenantId injected", async () => {
    createMock.mockResolvedValueOnce({
      ok: true,
      draft: { id: "d1", lines: [] },
    });
    const lines = [
      {
        accommodationId: "a1",
        fromDate: new Date("2026-05-01"),
        toDate: new Date("2026-05-03"),
        guestCount: 2,
      },
    ];
    const result = await createDraftWithLinesAction({ lines });
    expect(createMock).toHaveBeenCalledWith({ lines, tenantId: "tenant_t" });
    expect(result).toEqual({ ok: true, draft: { id: "d1", lines: [] } });
  });

  it("T8 — tenantId from input is OVERRIDDEN by server-resolved tenantId (security)", async () => {
    createMock.mockResolvedValueOnce({
      ok: true,
      draft: { id: "d1", lines: [] },
    });
    // Caller attempts to inject foreign tenantId — must be ignored.
    const malicious = {
      lines: [],
      tenantId: "tenant_OTHER",
    } as unknown as Parameters<typeof createDraftWithLinesAction>[0];
    await createDraftWithLinesAction(malicious);
    const callArg = createMock.mock.calls[0][0];
    expect(callArg.tenantId).toBe("tenant_t");
    expect(callArg.tenantId).not.toBe("tenant_OTHER");
  });
});

describe("searchCustomersAction", () => {
  it("T9 — missing orgId returns []", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await searchCustomersAction("anna");
    expect(result).toEqual([]);
    expect(searchCustomersMock).not.toHaveBeenCalled();
  });

  it("T10 — missing tenant returns []", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const result = await searchCustomersAction("anna");
    expect(result).toEqual([]);
    expect(searchCustomersMock).not.toHaveBeenCalled();
  });

  it("T11 — happy path passes tenantId + query (no opts override)", async () => {
    const customer = {
      id: "g1",
      email: "anna@example.se",
      name: "Anna Andersson",
      phone: null,
      draftOrderCount: 0,
      orderCount: 3,
    };
    searchCustomersMock.mockResolvedValueOnce([customer]);
    const result = await searchCustomersAction("anna");
    expect(searchCustomersMock).toHaveBeenCalledWith("tenant_t", "anna");
    expect(result).toEqual([customer]);
  });
});

describe("previewDraftTotalsAction", () => {
  it("T12 — missing orgId returns null", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await previewDraftTotalsAction({ lines: [] });
    expect(result).toBeNull();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("T13 — missing tenant returns null", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const result = await previewDraftTotalsAction({ lines: [] });
    expect(result).toBeNull();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("T14 — happy path forwards input with tenantId injected", async () => {
    const previewResult = {
      subtotal: BigInt(125000),
      discountAmount: BigInt(0),
      taxAmount: BigInt(15000),
      total: BigInt(140000),
      currency: "SEK",
      lineBreakdown: [],
      discountApplicable: false,
    };
    previewMock.mockResolvedValueOnce(previewResult);
    const lines = [
      {
        accommodationId: "a1",
        fromDate: new Date("2026-05-01"),
        toDate: new Date("2026-05-03"),
        guestCount: 2,
      },
    ];
    const result = await previewDraftTotalsAction({ lines });
    expect(previewMock).toHaveBeenCalledWith({ lines, tenantId: "tenant_t" });
    expect(result).toEqual(previewResult);
  });

  it("T15 — tenantId from input is OVERRIDDEN by server-resolved tenantId (security)", async () => {
    previewMock.mockResolvedValueOnce({
      subtotal: BigInt(0),
      discountAmount: BigInt(0),
      taxAmount: BigInt(0),
      total: BigInt(0),
      currency: "SEK",
      lineBreakdown: [],
      discountApplicable: false,
    });
    const malicious = {
      lines: [],
      tenantId: "tenant_OTHER",
    } as unknown as Parameters<typeof previewDraftTotalsAction>[0];
    await previewDraftTotalsAction(malicious);
    const callArg = previewMock.mock.calls[0][0];
    expect(callArg.tenantId).toBe("tenant_t");
    expect(callArg.tenantId).not.toBe("tenant_OTHER");
  });

  it("T16 — discountCode passed through unchanged", async () => {
    previewMock.mockResolvedValueOnce({
      subtotal: BigInt(125000),
      discountAmount: BigInt(12500),
      taxAmount: BigInt(15000),
      total: BigInt(127500),
      currency: "SEK",
      lineBreakdown: [],
      discountApplicable: true,
    });
    await previewDraftTotalsAction({
      lines: [
        {
          accommodationId: "a1",
          fromDate: new Date("2026-05-01"),
          toDate: new Date("2026-05-03"),
          guestCount: 2,
        },
      ],
      discountCode: "SOMMAR2026",
    });
    const callArg = previewMock.mock.calls[0][0];
    expect(callArg.discountCode).toBe("SOMMAR2026");
  });
});
