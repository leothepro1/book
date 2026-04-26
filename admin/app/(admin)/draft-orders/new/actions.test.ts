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
}));

import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import {
  searchAccommodations,
  checkAvailability,
  createDraftWithLines,
} from "@/app/_lib/draft-orders";
import {
  searchAccommodationsAction,
  checkAvailabilityAction,
  createDraftWithLinesAction,
} from "./actions";

type Mock = ReturnType<typeof vi.fn>;

const getAuthMock = getAuth as unknown as Mock;
const findUniqueMock = prisma.tenant.findUnique as unknown as Mock;
const searchMock = searchAccommodations as unknown as Mock;
const checkMock = checkAvailability as unknown as Mock;
const createMock = createDraftWithLines as unknown as Mock;

beforeEach(() => {
  getAuthMock.mockReset();
  findUniqueMock.mockReset();
  searchMock.mockReset();
  checkMock.mockReset();
  createMock.mockReset();
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
