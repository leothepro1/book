import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "@/app/_lib/errors/service-errors";

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

vi.mock("@/app/_lib/draft-orders/update-meta", () => ({
  updateDraftMeta: vi.fn(),
}));

vi.mock("@/app/_lib/draft-orders/update-customer", () => ({
  updateDraftCustomer: vi.fn(),
}));

vi.mock("@/app/_lib/draft-orders/discount", () => ({
  applyDiscountCode: vi.fn(),
  removeDiscountCode: vi.fn(),
}));

import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import { getDraft } from "@/app/_lib/draft-orders/get";
import { updateDraftMeta } from "@/app/_lib/draft-orders/update-meta";
import { updateDraftCustomer } from "@/app/_lib/draft-orders/update-customer";
import {
  applyDiscountCode,
  removeDiscountCode,
} from "@/app/_lib/draft-orders/discount";
import {
  getDraftAction,
  updateDraftMetaAction,
  updateDraftCustomerAction,
  applyDraftDiscountCodeAction,
  removeDraftDiscountCodeAction,
} from "./actions";

type Mock = ReturnType<typeof vi.fn>;

const getAuthMock = getAuth as unknown as Mock;
const findUniqueMock = prisma.tenant.findUnique as unknown as Mock;
const getDraftMock = getDraft as unknown as Mock;
const updateDraftMetaMock = updateDraftMeta as unknown as Mock;
const updateDraftCustomerMock = updateDraftCustomer as unknown as Mock;
const applyDiscountCodeMock = applyDiscountCode as unknown as Mock;
const removeDiscountCodeMock = removeDiscountCode as unknown as Mock;

beforeEach(() => {
  vi.resetAllMocks();
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

describe("updateDraftMetaAction", () => {
  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({ orgId: null, userId: null, orgRole: null });
    const result = await updateDraftMetaAction({ draftId: "d", tags: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Ingen tenant");
    expect(updateDraftMetaMock).not.toHaveBeenCalled();
  });

  it("missing tenant → { ok: false, error: 'Ingen tenant' }", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const result = await updateDraftMetaAction({ draftId: "d", tags: [] });
    expect(result.ok).toBe(false);
    expect(updateDraftMetaMock).not.toHaveBeenCalled();
  });

  it("happy path passes patch through to service with admin_ui actor", async () => {
    const draft = { id: "d", version: 2 };
    updateDraftMetaMock.mockResolvedValueOnce({ ok: true, draft });
    const expiresAt = new Date("2026-06-01");
    const result = await updateDraftMetaAction({
      draftId: "d",
      customerNote: "Hej kund",
      internalNote: "intern",
      tags: ["x"],
      expiresAt,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(updateDraftMetaMock).toHaveBeenCalledWith(
      "d",
      "tenant_t",
      {
        customerNote: "Hej kund",
        internalNote: "intern",
        tags: ["x"],
        expiresAt,
      },
      { source: "admin_ui", userId: "u" },
    );
  });

  it("only sends fields that were provided (omits undefined)", async () => {
    updateDraftMetaMock.mockResolvedValueOnce({ ok: true, draft: { id: "d" } });
    await updateDraftMetaAction({ draftId: "d", customerNote: "only this" });
    const patch = updateDraftMetaMock.mock.calls[0][2];
    expect(patch).toEqual({ customerNote: "only this" });
  });

  it("propagates service failure as Result", async () => {
    updateDraftMetaMock.mockResolvedValueOnce({ ok: false, error: "Utkastet kunde inte hittas" });
    const result = await updateDraftMetaAction({ draftId: "d", tags: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Utkastet kunde inte hittas");
  });
});

describe("updateDraftCustomerAction", () => {
  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({ orgId: null, userId: null, orgRole: null });
    const result = await updateDraftCustomerAction({
      draftId: "d",
      guestAccountId: "g",
    });
    expect(result.ok).toBe(false);
    expect(updateDraftCustomerMock).not.toHaveBeenCalled();
  });

  it("happy path passes guestAccountId + admin_ui actor", async () => {
    const draft = { id: "d", guestAccountId: "g", version: 2 };
    updateDraftCustomerMock.mockResolvedValueOnce({ ok: true, draft });
    const result = await updateDraftCustomerAction({
      draftId: "d",
      guestAccountId: "g",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(updateDraftCustomerMock).toHaveBeenCalledWith(
      "d",
      "tenant_t",
      { guestAccountId: "g" },
      { source: "admin_ui", userId: "u" },
    );
  });

  it("clears customer (null) and propagates result", async () => {
    updateDraftCustomerMock.mockResolvedValueOnce({
      ok: true,
      draft: { id: "d", guestAccountId: null },
    });
    const result = await updateDraftCustomerAction({
      draftId: "d",
      guestAccountId: null,
    });
    expect(result.ok).toBe(true);
    expect(updateDraftCustomerMock).toHaveBeenCalledWith(
      "d",
      "tenant_t",
      { guestAccountId: null },
      expect.anything(),
    );
  });

  it("service failure surfaces as Result", async () => {
    updateDraftCustomerMock.mockResolvedValueOnce({
      ok: false,
      error: "Kunden kunde inte hittas",
    });
    const result = await updateDraftCustomerAction({
      draftId: "d",
      guestAccountId: "missing",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Kunden kunde inte hittas");
  });
});

describe("applyDraftDiscountCodeAction", () => {
  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({ orgId: null, userId: null, orgRole: null });
    const result = await applyDraftDiscountCodeAction({ draftId: "d", code: "X" });
    expect(result.ok).toBe(false);
    expect(applyDiscountCodeMock).not.toHaveBeenCalled();
  });

  it("happy path returns { ok: true, draft }", async () => {
    const draft = { id: "d", appliedDiscountCode: "SUMMER20" };
    applyDiscountCodeMock.mockResolvedValueOnce({
      draft,
      totals: {},
      discount: {},
    });
    const result = await applyDraftDiscountCodeAction({
      draftId: "d",
      code: "SUMMER20",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(applyDiscountCodeMock).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      draftOrderId: "d",
      code: "SUMMER20",
      actorUserId: "u",
    });
  });

  it("ValidationError → { ok: false, error: msg }", async () => {
    applyDiscountCodeMock.mockRejectedValueOnce(
      new ValidationError("Discount code not eligible"),
    );
    const result = await applyDraftDiscountCodeAction({ draftId: "d", code: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Discount code not eligible");
  });

  it("NotFoundError → { ok: false, error: msg }", async () => {
    applyDiscountCodeMock.mockRejectedValueOnce(
      new NotFoundError("DraftOrder not found in tenant"),
    );
    const result = await applyDraftDiscountCodeAction({ draftId: "d", code: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("DraftOrder not found in tenant");
  });

  it("ConflictError → { ok: false, error: msg }", async () => {
    applyDiscountCodeMock.mockRejectedValueOnce(
      new ConflictError("Discount became invalid between validation and commit"),
    );
    const result = await applyDraftDiscountCodeAction({ draftId: "d", code: "X" });
    expect(result.ok).toBe(false);
  });

  it("unknown error bubbles up (action throws)", async () => {
    applyDiscountCodeMock.mockRejectedValueOnce(new Error("DB exploded"));
    await expect(
      applyDraftDiscountCodeAction({ draftId: "d", code: "X" }),
    ).rejects.toThrow("DB exploded");
  });
});

describe("removeDraftDiscountCodeAction", () => {
  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({ orgId: null, userId: null, orgRole: null });
    const result = await removeDraftDiscountCodeAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    expect(removeDiscountCodeMock).not.toHaveBeenCalled();
  });

  it("happy path returns { ok: true, draft }", async () => {
    const draft = { id: "d", appliedDiscountCode: null };
    removeDiscountCodeMock.mockResolvedValueOnce({ draft, totals: {} });
    const result = await removeDraftDiscountCodeAction({ draftId: "d" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(removeDiscountCodeMock).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      draftOrderId: "d",
      actorUserId: "u",
    });
  });

  it("ValidationError (no discount to remove) → { ok: false }", async () => {
    removeDiscountCodeMock.mockRejectedValueOnce(
      new ValidationError("Draft has no applied discount to remove"),
    );
    const result = await removeDraftDiscountCodeAction({ draftId: "d" });
    expect(result.ok).toBe(false);
  });

  it("unknown error bubbles up", async () => {
    removeDiscountCodeMock.mockRejectedValueOnce(new Error("Boom"));
    await expect(
      removeDraftDiscountCodeAction({ draftId: "d" }),
    ).rejects.toThrow("Boom");
  });
});
