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
    draftOrder: { findFirst: vi.fn() },
    guestAccount: { findFirst: vi.fn() },
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

vi.mock("@/app/_lib/draft-orders/lines", () => ({
  addLineItem: vi.fn(),
  updateLineItem: vi.fn(),
  removeLineItem: vi.fn(),
}));

vi.mock("@/app/_lib/draft-orders/lifecycle", () => ({
  freezePrices: vi.fn(),
  sendInvoice: vi.fn(),
  cancelDraft: vi.fn(),
}));

vi.mock("@/app/_lib/draft-orders/mark-as-paid", () => ({
  markDraftAsPaid: vi.fn(),
}));

vi.mock("@/app/_lib/draft-orders/resend-invoice", () => ({
  resendInvoice: vi.fn(),
}));

vi.mock("@/app/_lib/draft-orders/approval", () => ({
  submitForApproval: vi.fn(),
  approveDraft: vi.fn(),
  rejectDraft: vi.fn(),
}));

vi.mock("@/app/_lib/email", () => ({
  sendEmailEvent: vi.fn(),
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
  addLineItem,
  updateLineItem,
  removeLineItem,
} from "@/app/_lib/draft-orders/lines";
import {
  freezePrices,
  sendInvoice,
  cancelDraft,
} from "@/app/_lib/draft-orders/lifecycle";
import { markDraftAsPaid } from "@/app/_lib/draft-orders/mark-as-paid";
import { resendInvoice } from "@/app/_lib/draft-orders/resend-invoice";
import {
  submitForApproval,
  approveDraft,
  rejectDraft,
} from "@/app/_lib/draft-orders/approval";
import { sendEmailEvent } from "@/app/_lib/email";
import {
  getDraftAction,
  updateDraftMetaAction,
  updateDraftCustomerAction,
  applyDraftDiscountCodeAction,
  removeDraftDiscountCodeAction,
  addDraftLineItemAction,
  updateDraftLineItemAction,
  removeDraftLineItemAction,
  sendDraftInvoiceAction,
  resendDraftInvoiceAction,
  markDraftAsPaidAction,
  cancelDraftAction,
  submitDraftForApprovalAction,
  approveDraftAction,
  rejectDraftAction,
} from "./actions";

type Mock = ReturnType<typeof vi.fn>;

const getAuthMock = getAuth as unknown as Mock;
const findUniqueMock = prisma.tenant.findUnique as unknown as Mock;
const getDraftMock = getDraft as unknown as Mock;
const updateDraftMetaMock = updateDraftMeta as unknown as Mock;
const updateDraftCustomerMock = updateDraftCustomer as unknown as Mock;
const applyDiscountCodeMock = applyDiscountCode as unknown as Mock;
const removeDiscountCodeMock = removeDiscountCode as unknown as Mock;
const addLineItemMock = addLineItem as unknown as Mock;
const updateLineItemMock = updateLineItem as unknown as Mock;
const removeLineItemMock = removeLineItem as unknown as Mock;
const freezePricesMock = freezePrices as unknown as Mock;
const sendInvoiceMock = sendInvoice as unknown as Mock;
const cancelDraftMock = cancelDraft as unknown as Mock;
const markDraftAsPaidMock = markDraftAsPaid as unknown as Mock;
const resendInvoiceMock = resendInvoice as unknown as Mock;
const submitForApprovalMock = submitForApproval as unknown as Mock;
const approveDraftMock = approveDraft as unknown as Mock;
const rejectDraftMock = rejectDraft as unknown as Mock;
const sendEmailEventMock = sendEmailEvent as unknown as Mock;
const draftOrderFindFirstMock = (
  prisma as unknown as { draftOrder: { findFirst: Mock } }
).draftOrder.findFirst;
const guestAccountFindFirstMock = (
  prisma as unknown as { guestAccount: { findFirst: Mock } }
).guestAccount.findFirst;

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

describe("addDraftLineItemAction", () => {
  const accLine = {
    lineType: "ACCOMMODATION" as const,
    accommodationId: "acc_1",
    checkInDate: "2026-05-12",
    checkOutDate: "2026-05-15",
    guestCounts: { adults: 2, children: 0, infants: 0 },
    taxable: true,
  };

  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await addDraftLineItemAction({ draftId: "d", line: accLine });
    expect(result.ok).toBe(false);
    expect(addLineItemMock).not.toHaveBeenCalled();
  });

  it("happy path passes draftOrderId + line + actorUserId, returns Result.draft", async () => {
    const draft = { id: "d", lineItems: [] };
    addLineItemMock.mockResolvedValueOnce({ draft, lineItem: { id: "l_1" }, reservation: null, totals: {} });
    const result = await addDraftLineItemAction({ draftId: "d", line: accLine });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(addLineItemMock).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      draftOrderId: "d",
      line: accLine,
      actorUserId: "u",
    });
  });

  it("ValidationError → { ok: false, error: msg }", async () => {
    addLineItemMock.mockRejectedValueOnce(
      new ValidationError("Line currency does not match draft currency"),
    );
    const result = await addDraftLineItemAction({ draftId: "d", line: accLine });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe("Line currency does not match draft currency");
  });

  it("NotFoundError → { ok: false, error: msg }", async () => {
    addLineItemMock.mockRejectedValueOnce(
      new NotFoundError("DraftOrder not found in tenant"),
    );
    const result = await addDraftLineItemAction({ draftId: "missing", line: accLine });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("DraftOrder not found in tenant");
  });

  it("unknown error bubbles up", async () => {
    addLineItemMock.mockRejectedValueOnce(new Error("DB exploded"));
    await expect(
      addDraftLineItemAction({ draftId: "d", line: accLine }),
    ).rejects.toThrow("DB exploded");
  });
});

describe("updateDraftLineItemAction", () => {
  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await updateDraftLineItemAction({
      draftId: "d",
      lineItemId: "l_1",
      patch: { lineType: "ACCOMMODATION", quantity: 3 },
    });
    expect(result.ok).toBe(false);
    expect(updateLineItemMock).not.toHaveBeenCalled();
  });

  it("happy path passes draftOrderId + lineItemId + patch + actorUserId", async () => {
    const draft = { id: "d" };
    updateLineItemMock.mockResolvedValueOnce({ draft, lineItem: {}, reservation: null, totals: {} });
    const patch = { lineType: "ACCOMMODATION" as const, quantity: 3 };
    const result = await updateDraftLineItemAction({
      draftId: "d",
      lineItemId: "l_1",
      patch,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(updateLineItemMock).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      draftOrderId: "d",
      lineItemId: "l_1",
      patch,
      actorUserId: "u",
    });
  });

  it("ValidationError (hold-active) → { ok: false, error: msg }", async () => {
    updateLineItemMock.mockRejectedValueOnce(
      new ValidationError(
        "Cannot modify line — hold is active; release it first",
      ),
    );
    const result = await updateDraftLineItemAction({
      draftId: "d",
      lineItemId: "l_1",
      patch: { lineType: "ACCOMMODATION", quantity: 3 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe(
        "Cannot modify line — hold is active; release it first",
      );
  });

  it("NotFoundError → { ok: false, error: msg }", async () => {
    updateLineItemMock.mockRejectedValueOnce(
      new NotFoundError("DraftLineItem not found in draft"),
    );
    const result = await updateDraftLineItemAction({
      draftId: "d",
      lineItemId: "missing",
      patch: { lineType: "ACCOMMODATION", quantity: 1 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("DraftLineItem not found in draft");
  });

  it("CUSTOM patch with unitPriceCents passes through bigint as-is", async () => {
    updateLineItemMock.mockResolvedValueOnce({ draft: {}, lineItem: {}, reservation: null, totals: {} });
    const patch = {
      lineType: "CUSTOM" as const,
      unitPriceCents: BigInt(15000),
    };
    await updateDraftLineItemAction({
      draftId: "d",
      lineItemId: "l_1",
      patch,
    });
    expect(updateLineItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ patch }),
    );
  });
});

describe("removeDraftLineItemAction", () => {
  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await removeDraftLineItemAction({
      draftId: "d",
      lineItemId: "l_1",
    });
    expect(result.ok).toBe(false);
    expect(removeLineItemMock).not.toHaveBeenCalled();
  });

  it("happy path returns { ok: true, draft }", async () => {
    const draft = { id: "d" };
    removeLineItemMock.mockResolvedValueOnce({ draft, totals: {} });
    const result = await removeDraftLineItemAction({
      draftId: "d",
      lineItemId: "l_1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(removeLineItemMock).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      draftOrderId: "d",
      lineItemId: "l_1",
      actorUserId: "u",
    });
  });

  it("ValidationError (hold in flight) → { ok: false, error: msg }", async () => {
    removeLineItemMock.mockRejectedValueOnce(
      new ValidationError("Cannot remove line — hold placement is in flight"),
    );
    const result = await removeDraftLineItemAction({
      draftId: "d",
      lineItemId: "l_1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe(
        "Cannot remove line — hold placement is in flight",
      );
  });

  it("unknown error bubbles up", async () => {
    removeLineItemMock.mockRejectedValueOnce(new Error("Boom"));
    await expect(
      removeDraftLineItemAction({ draftId: "d", lineItemId: "l_1" }),
    ).rejects.toThrow("Boom");
  });
});

// ── sendDraftInvoiceAction ──────────────────────────────────────

describe("sendDraftInvoiceAction", () => {
  const draftRow = {
    pricesFrozenAt: null,
    contactEmail: "anna@example.com",
    contactFirstName: "Anna",
    contactLastName: "Lind",
    guestAccountId: null,
    displayNumber: "D-2026-0042",
    totalCents: BigInt(123400),
    currency: "SEK",
    expiresAt: new Date("2026-05-31T00:00:00Z"),
  };

  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await sendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    expect(freezePricesMock).not.toHaveBeenCalled();
  });

  it("draft not found → { ok: false, error: ... }", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(null);
    const result = await sendDraftInvoiceAction({ draftId: "missing" });
    expect(result.ok).toBe(false);
    expect(freezePricesMock).not.toHaveBeenCalled();
    expect(sendInvoiceMock).not.toHaveBeenCalled();
  });

  it("already frozen → freezePrices NOT called, sendInvoice called", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce({
      ...draftRow,
      pricesFrozenAt: new Date("2026-04-25T00:00:00Z"),
    });
    sendInvoiceMock.mockResolvedValueOnce({
      draft: { id: "d" },
      invoiceUrl: "https://t.rutgr.com/invoice/abc",
    });
    sendEmailEventMock.mockResolvedValueOnce({ status: "sent" });
    const result = await sendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(true);
    expect(freezePricesMock).not.toHaveBeenCalled();
    expect(sendInvoiceMock).toHaveBeenCalled();
  });

  it("not frozen → freezePrices + sendInvoice both called in order", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(draftRow);
    freezePricesMock.mockResolvedValueOnce({});
    sendInvoiceMock.mockResolvedValueOnce({
      draft: { id: "d" },
      invoiceUrl: "https://t.rutgr.com/invoice/abc",
    });
    sendEmailEventMock.mockResolvedValueOnce({ status: "sent" });
    await sendDraftInvoiceAction({ draftId: "d" });
    expect(freezePricesMock).toHaveBeenCalled();
    expect(sendInvoiceMock).toHaveBeenCalled();
    // freezePrices called before sendInvoice
    const freezeOrder = freezePricesMock.mock.invocationCallOrder[0];
    const sendOrder = sendInvoiceMock.mock.invocationCallOrder[0];
    expect(freezeOrder).toBeLessThan(sendOrder);
  });

  it("recipient email present → email sent, returns emailStatus", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce({
      ...draftRow,
      pricesFrozenAt: new Date(),
    });
    sendInvoiceMock.mockResolvedValueOnce({
      draft: { id: "d" },
      invoiceUrl: "https://x",
    });
    findUniqueMock.mockResolvedValueOnce({ id: "tenant_t", name: "Hotel X" });
    sendEmailEventMock.mockResolvedValueOnce({ status: "sent" });
    const result = await sendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.emailStatus).toBe("sent");
      expect(result.invoiceUrl).toBe("https://x");
    }
    expect(sendEmailEventMock).toHaveBeenCalled();
    const args = sendEmailEventMock.mock.calls[0];
    expect(args[1]).toBe("DRAFT_INVOICE");
    expect(args[2]).toBe("anna@example.com");
    const vars = args[3] as Record<string, string>;
    expect(vars.guestName).toBe("Anna Lind");
    expect(vars.displayNumber).toBe("D-2026-0042");
    expect(vars.invoiceUrl).toBe("https://x");
  });

  it("no recipient email (no contactEmail, no guestAccount) → emailStatus null, no email call", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce({
      ...draftRow,
      pricesFrozenAt: new Date(),
      contactEmail: null,
      guestAccountId: null,
    });
    sendInvoiceMock.mockResolvedValueOnce({
      draft: { id: "d" },
      invoiceUrl: "https://x",
    });
    const result = await sendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.emailStatus).toBeNull();
    expect(sendEmailEventMock).not.toHaveBeenCalled();
  });

  it("email fails → action still returns ok=true with emailStatus='failed'", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce({
      ...draftRow,
      pricesFrozenAt: new Date(),
    });
    sendInvoiceMock.mockResolvedValueOnce({
      draft: { id: "d" },
      invoiceUrl: "https://x",
    });
    findUniqueMock.mockResolvedValueOnce({ id: "tenant_t", name: "Hotel X" });
    sendEmailEventMock.mockResolvedValueOnce({ status: "failed", error: "boom" });
    const result = await sendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.emailStatus).toBe("failed");
  });

  it("falls back to GuestAccount.email when contactEmail is null", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce({
      ...draftRow,
      pricesFrozenAt: new Date(),
      contactEmail: null,
      guestAccountId: "guest_1",
    });
    guestAccountFindFirstMock.mockResolvedValueOnce({
      email: "guest@example.com",
      firstName: "Guest",
      lastName: "From-DB",
    });
    sendInvoiceMock.mockResolvedValueOnce({
      draft: { id: "d" },
      invoiceUrl: "https://x",
    });
    findUniqueMock.mockResolvedValueOnce({ id: "tenant_t", name: "Hotel X" });
    sendEmailEventMock.mockResolvedValueOnce({ status: "sent" });
    await sendDraftInvoiceAction({ draftId: "d" });
    const args = sendEmailEventMock.mock.calls[0];
    expect(args[2]).toBe("guest@example.com");
  });

  it("sendInvoice ValidationError → { ok: false, error }", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce({
      ...draftRow,
      pricesFrozenAt: new Date(),
    });
    sendInvoiceMock.mockRejectedValueOnce(
      new ValidationError("Stripe is not configured for this tenant"),
    );
    const result = await sendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe("Stripe is not configured for this tenant");
  });

  it("freezePrices ValidationError → { ok: false, error }", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(draftRow);
    freezePricesMock.mockRejectedValueOnce(
      new ValidationError("Draft is not in a freezable status"),
    );
    const result = await sendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    expect(sendInvoiceMock).not.toHaveBeenCalled();
  });
});

// ── markDraftAsPaidAction ───────────────────────────────────────

describe("markDraftAsPaidAction", () => {
  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await markDraftAsPaidAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    expect(markDraftAsPaidMock).not.toHaveBeenCalled();
  });

  it("happy path passes draftOrderId + reference + actorUserId", async () => {
    const draft = { id: "d", status: "COMPLETED" };
    markDraftAsPaidMock.mockResolvedValueOnce({ draft, order: { id: "o_1" } });
    const result = await markDraftAsPaidAction({
      draftId: "d",
      reference: "BG-9876",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(markDraftAsPaidMock).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      draftOrderId: "d",
      reference: "BG-9876",
      actorUserId: "u",
    });
  });

  it("ValidationError → { ok: false, error }", async () => {
    markDraftAsPaidMock.mockRejectedValueOnce(
      new ValidationError("Draft must be in INVOICED or OVERDUE status to mark paid"),
    );
    const result = await markDraftAsPaidAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe(
        "Draft must be in INVOICED or OVERDUE status to mark paid",
      );
  });

  it("NotFoundError → { ok: false, error }", async () => {
    markDraftAsPaidMock.mockRejectedValueOnce(
      new NotFoundError("DraftOrder not found in tenant"),
    );
    const result = await markDraftAsPaidAction({ draftId: "missing" });
    expect(result.ok).toBe(false);
  });

  it("ConflictError (from convert) → { ok: false, error }", async () => {
    markDraftAsPaidMock.mockRejectedValueOnce(
      new ConflictError("Draft mutated during convert"),
    );
    const result = await markDraftAsPaidAction({ draftId: "d" });
    expect(result.ok).toBe(false);
  });
});

// ── cancelDraftAction ───────────────────────────────────────────

describe("cancelDraftAction", () => {
  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await cancelDraftAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    expect(cancelDraftMock).not.toHaveBeenCalled();
  });

  it("happy path passes reason + actorUserId", async () => {
    const draft = { id: "d", status: "CANCELLED" };
    cancelDraftMock.mockResolvedValueOnce({
      draft,
      releasedHolds: 0,
      holdReleaseErrors: [],
    });
    const result = await cancelDraftAction({
      draftId: "d",
      reason: "kund ångrade",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(cancelDraftMock).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      draftOrderId: "d",
      reason: "kund ångrade",
      actorUserId: "u",
    });
  });

  it("ValidationError (PAID drafts) → { ok: false, error }", async () => {
    cancelDraftMock.mockRejectedValueOnce(
      new ValidationError("Cannot cancel a PAID draft — refund via Stripe, then retry"),
    );
    const result = await cancelDraftAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe(
        "Cannot cancel a PAID draft — refund via Stripe, then retry",
      );
  });

  it("ConflictError → { ok: false, error }", async () => {
    cancelDraftMock.mockRejectedValueOnce(
      new ConflictError("Draft mutated during cancel — retry"),
    );
    const result = await cancelDraftAction({ draftId: "d" });
    expect(result.ok).toBe(false);
  });
});

// ── resendDraftInvoiceAction (FAS 7.4) ─────────────────────────

describe("resendDraftInvoiceAction", () => {
  const draftRow = {
    contactEmail: "anna@example.com",
    contactFirstName: "Anna",
    contactLastName: "Lind",
    guestAccountId: null,
    displayNumber: "D-2026-0042",
    totalCents: BigInt(123400),
    currency: "SEK",
    expiresAt: new Date("2026-05-31T00:00:00Z"),
  };

  const resendResult = {
    draft: { id: "d" },
    invoiceUrl: "https://t.rutgr.com/invoice/new_token",
    shareLinkToken: "new_token",
    shareLinkExpiresAt: new Date("2026-06-10T00:00:00Z"),
    clientSecret: "cs_new",
    stripePaymentIntentId: "pi_new",
    rotatedPaymentIntent: true,
    previousPiCancelError: null,
  };

  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await resendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    expect(resendInvoiceMock).not.toHaveBeenCalled();
  });

  it("draft not found → { ok: false, error }", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(null);
    const result = await resendDraftInvoiceAction({ draftId: "missing" });
    expect(result.ok).toBe(false);
    expect(resendInvoiceMock).not.toHaveBeenCalled();
  });

  it("happy path → calls resendInvoice + sends email + returns ok", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(draftRow);
    resendInvoiceMock.mockResolvedValueOnce(resendResult);
    findUniqueMock.mockResolvedValueOnce({ id: "tenant_t", name: "Hotel X" });
    sendEmailEventMock.mockResolvedValueOnce({ status: "sent" });

    const result = await resendDraftInvoiceAction({ draftId: "d" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invoiceUrl).toBe(
        "https://t.rutgr.com/invoice/new_token",
      );
      expect(result.rotatedPaymentIntent).toBe(true);
      expect(result.emailStatus).toBe("sent");
    }
    expect(resendInvoiceMock).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      draftOrderId: "d",
      invoiceEmailSubject: undefined,
      invoiceEmailMessage: undefined,
      actorUserId: "u",
    });
    const emailArgs = sendEmailEventMock.mock.calls[0];
    expect(emailArgs[2]).toBe("anna@example.com");
    const vars = emailArgs[3] as Record<string, string>;
    expect(vars.invoiceUrl).toBe("https://t.rutgr.com/invoice/new_token");
  });

  it("ValidationError (status not INVOICED) → { ok: false, error }", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(draftRow);
    resendInvoiceMock.mockRejectedValueOnce(
      new ValidationError(
        "Cannot resend invoice — draft is not in INVOICED or OVERDUE state",
      ),
    );
    const result = await resendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain("INVOICED");
  });

  it("ConflictError (PI succeeded) → { ok: false, error }", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(draftRow);
    resendInvoiceMock.mockRejectedValueOnce(
      new ConflictError(
        "Cannot resend invoice — previous PaymentIntent already succeeded; mark draft as paid instead",
      ),
    );
    const result = await resendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(false);
  });

  it("no recipient email → emailStatus null, no email call", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce({
      ...draftRow,
      contactEmail: null,
      guestAccountId: null,
    });
    resendInvoiceMock.mockResolvedValueOnce(resendResult);

    const result = await resendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.emailStatus).toBeNull();
    expect(sendEmailEventMock).not.toHaveBeenCalled();
  });

  it("email override params propagated to service", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(draftRow);
    resendInvoiceMock.mockResolvedValueOnce(resendResult);
    findUniqueMock.mockResolvedValueOnce({ id: "tenant_t", name: "Hotel X" });
    sendEmailEventMock.mockResolvedValueOnce({ status: "sent" });

    await resendDraftInvoiceAction({
      draftId: "d",
      invoiceEmailSubject: "Påminnelse",
      invoiceEmailMessage: "Vi väntar fortfarande på betalning.",
    });

    expect(resendInvoiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceEmailSubject: "Påminnelse",
        invoiceEmailMessage: "Vi väntar fortfarande på betalning.",
      }),
    );
  });
});

// ── Approval actions (FAS 7.6-lite) ────────────────────────────

describe("submitDraftForApprovalAction", () => {
  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await submitDraftForApprovalAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    expect(submitForApprovalMock).not.toHaveBeenCalled();
  });

  it("missing userId → { ok: false, error: '...identitet kunde inte fastställas' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: "org_1",
      userId: null,
      orgRole: "org:admin",
    });
    const result = await submitDraftForApprovalAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/identitet/);
    expect(submitForApprovalMock).not.toHaveBeenCalled();
  });

  it("happy path passes draftOrderId + requestNote + actorUserId", async () => {
    const draft = { id: "d", status: "PENDING_APPROVAL" };
    submitForApprovalMock.mockResolvedValueOnce({ draft });
    const result = await submitDraftForApprovalAction({
      draftId: "d",
      requestNote: "Snälla godkänn snart",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(submitForApprovalMock).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      draftOrderId: "d",
      requestNote: "Snälla godkänn snart",
      actorUserId: "u",
    });
  });

  it("ValidationError → { ok: false, error: msg }", async () => {
    submitForApprovalMock.mockRejectedValueOnce(
      new ValidationError("Draft is not in OPEN status"),
    );
    const result = await submitDraftForApprovalAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Draft is not in OPEN status");
  });

  it("ConflictError → { ok: false, error: msg }", async () => {
    submitForApprovalMock.mockRejectedValueOnce(
      new ConflictError("Draft mutated during submit-for-approval — retry"),
    );
    const result = await submitDraftForApprovalAction({ draftId: "d" });
    expect(result.ok).toBe(false);
  });
});

describe("approveDraftAction", () => {
  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await approveDraftAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    expect(approveDraftMock).not.toHaveBeenCalled();
  });

  it("missing userId → { ok: false, error: '...identitet kunde inte fastställas' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: "org_1",
      userId: null,
      orgRole: "org:admin",
    });
    const result = await approveDraftAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    expect(approveDraftMock).not.toHaveBeenCalled();
  });

  it("happy path passes draftOrderId + approvalNote + actorUserId", async () => {
    const draft = { id: "d", status: "APPROVED" };
    approveDraftMock.mockResolvedValueOnce({ draft });
    const result = await approveDraftAction({
      draftId: "d",
      approvalNote: "OK",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(approveDraftMock).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      draftOrderId: "d",
      approvalNote: "OK",
      actorUserId: "u",
    });
  });

  it("ValidationError (self-approval) → { ok: false, error: msg }", async () => {
    approveDraftMock.mockRejectedValueOnce(
      new ValidationError("Cannot approve your own approval request"),
    );
    const result = await approveDraftAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe("Cannot approve your own approval request");
  });

  it("ConflictError → { ok: false, error: msg }", async () => {
    approveDraftMock.mockRejectedValueOnce(
      new ConflictError("Draft mutated during approval — retry"),
    );
    const result = await approveDraftAction({ draftId: "d" });
    expect(result.ok).toBe(false);
  });
});

describe("rejectDraftAction", () => {
  it("missing orgId → { ok: false, error: 'Ingen tenant' }", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: null,
      userId: null,
      orgRole: null,
    });
    const result = await rejectDraftAction({
      draftId: "d",
      rejectionReason: "x",
    });
    expect(result.ok).toBe(false);
    expect(rejectDraftMock).not.toHaveBeenCalled();
  });

  it("happy path passes draftOrderId + rejectionReason + actorUserId", async () => {
    const draft = { id: "d", status: "REJECTED" };
    rejectDraftMock.mockResolvedValueOnce({ draft });
    const result = await rejectDraftAction({
      draftId: "d",
      rejectionReason: "Pris för högt",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toBe(draft);
    expect(rejectDraftMock).toHaveBeenCalledWith({
      tenantId: "tenant_t",
      draftOrderId: "d",
      rejectionReason: "Pris för högt",
      actorUserId: "u",
    });
  });

  it("ValidationError (empty reason raised by zod) → { ok: false, error: msg }", async () => {
    rejectDraftMock.mockRejectedValueOnce(
      new ValidationError("rejectionReason is required"),
    );
    const result = await rejectDraftAction({
      draftId: "d",
      rejectionReason: "x",
    });
    expect(result.ok).toBe(false);
  });

  it("ConflictError → { ok: false, error: msg }", async () => {
    rejectDraftMock.mockRejectedValueOnce(
      new ConflictError("Draft mutated during rejection — retry"),
    );
    const result = await rejectDraftAction({
      draftId: "d",
      rejectionReason: "x",
    });
    expect(result.ok).toBe(false);
  });
});
