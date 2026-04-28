import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(admin)/_lib/auth/devAuth", () => ({
  getAuth: vi.fn(),
}));

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
  },
}));

vi.mock("@/app/_lib/draft-orders/get", () => ({
  getDraft: vi.fn(),
}));

import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import { getDraft } from "@/app/_lib/draft-orders/get";
import { getDraftAction } from "./actions";

type Mock = ReturnType<typeof vi.fn>;

const getAuthMock = getAuth as unknown as Mock;
const findUniqueMock = prisma.tenant.findUnique as unknown as Mock;
const getDraftMock = getDraft as unknown as Mock;

beforeEach(() => {
  getAuthMock.mockReset();
  findUniqueMock.mockReset();
  getDraftMock.mockReset();
  getAuthMock.mockResolvedValue({
    orgId: "org_1",
    userId: "u",
    orgRole: "org:admin",
  });
  findUniqueMock.mockResolvedValue({ id: "tenant_t" });
});

describe("getDraftAction", () => {
  it("T1 — missing orgId returns null", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await getDraftAction("draft_1");
    expect(result).toBeNull();
    expect(getDraftMock).not.toHaveBeenCalled();
  });

  it("T2 — missing tenant returns null", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const result = await getDraftAction("draft_1");
    expect(result).toBeNull();
    expect(getDraftMock).not.toHaveBeenCalled();
  });

  it("T3 — service returns null (draft not found) → action returns null", async () => {
    getDraftMock.mockResolvedValueOnce(null);
    const result = await getDraftAction("draft_missing");
    expect(getDraftMock).toHaveBeenCalledWith("draft_missing", "tenant_t");
    expect(result).toBeNull();
  });

  it("T4 — happy path passes draftId + tenantId, returns DraftDetail", async () => {
    const detail = {
      draft: { id: "draft_1", displayNumber: "D-2026-0042" },
      events: [],
      customer: null,
      reservations: [],
      stripePaymentIntent: null,
      prev: null,
      next: null,
    };
    getDraftMock.mockResolvedValueOnce(detail);
    const result = await getDraftAction("draft_1");
    expect(getDraftMock).toHaveBeenCalledWith("draft_1", "tenant_t");
    expect(result).toBe(detail);
  });
});
