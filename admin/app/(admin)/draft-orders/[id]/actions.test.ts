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
  sendInvoice: vi.fn(),
  cancelDraft: vi.fn(),
}));

vi.mock("@/app/_lib/draft-orders/mark-as-paid", () => ({
  markDraftAsPaid: vi.fn(),
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
  sendInvoice,
  cancelDraft,
} from "@/app/_lib/draft-orders/lifecycle";
import { markDraftAsPaid } from "@/app/_lib/draft-orders/mark-as-paid";
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
  markDraftAsPaidAction,
  cancelDraftAction,
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
const sendInvoiceMock = sendInvoice as unknown as Mock;
const cancelDraftMock = cancelDraft as unknown as Mock;
const markDraftAsPaidMock = markDraftAsPaid as unknown as Mock;
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
    expect(sendInvoiceMock).not.toHaveBeenCalled();
  });

  it("draft not found → { ok: false, error: ... }", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(null);
    const result = await sendDraftInvoiceAction({ draftId: "missing" });
    expect(result.ok).toBe(false);
    expect(sendInvoiceMock).not.toHaveBeenCalled();
  });

  it("happy path → sendInvoice called, email sent", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(draftRow);
    sendInvoiceMock.mockResolvedValueOnce({
      draft: { id: "d" },
      invoiceUrl: "https://t.rutgr.com/invoice/abc",
      shareLinkToken: "abc",
    });
    sendEmailEventMock.mockResolvedValueOnce({ status: "sent" });
    const result = await sendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(true);
    expect(sendInvoiceMock).toHaveBeenCalled();
  });

  it("recipient email present → email sent, returns emailStatus", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(draftRow);
    sendInvoiceMock.mockResolvedValueOnce({
      draft: { id: "d" },
      invoiceUrl: "https://x",
      shareLinkToken: "tok",
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
      contactEmail: null,
      guestAccountId: null,
    });
    sendInvoiceMock.mockResolvedValueOnce({
      draft: { id: "d" },
      invoiceUrl: "https://x",
      shareLinkToken: "tok",
    });
    const result = await sendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.emailStatus).toBeNull();
    expect(sendEmailEventMock).not.toHaveBeenCalled();
  });

  it("email fails → action still returns ok=true with emailStatus='failed'", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(draftRow);
    sendInvoiceMock.mockResolvedValueOnce({
      draft: { id: "d" },
      invoiceUrl: "https://x",
      shareLinkToken: "tok",
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
      shareLinkToken: "tok",
    });
    findUniqueMock.mockResolvedValueOnce({ id: "tenant_t", name: "Hotel X" });
    sendEmailEventMock.mockResolvedValueOnce({ status: "sent" });
    await sendDraftInvoiceAction({ draftId: "d" });
    const args = sendEmailEventMock.mock.calls[0];
    expect(args[2]).toBe("guest@example.com");
  });

  it("sendInvoice ValidationError → { ok: false, error }", async () => {
    draftOrderFindFirstMock.mockResolvedValueOnce(draftRow);
    sendInvoiceMock.mockRejectedValueOnce(
      new ValidationError("Tenant has no portalSlug — cannot build invoice URL"),
    );
    const result = await sendDraftInvoiceAction({ draftId: "d" });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe("Tenant has no portalSlug — cannot build invoice URL");
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
