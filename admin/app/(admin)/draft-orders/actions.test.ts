import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";

vi.mock("@/app/(admin)/_lib/auth/devAuth", () => ({
  getAuth: vi.fn(),
}));

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    draftOrder: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("@/app/_lib/draft-orders", () => ({
  listDrafts: vi.fn(),
}));

vi.mock("@/app/_lib/draft-orders/lifecycle", () => ({
  freezePrices: vi.fn(),
  sendInvoice: vi.fn(),
  cancelDraft: vi.fn(),
}));

vi.mock("@/app/_lib/draft-orders/resend-invoice", () => ({
  resendInvoice: vi.fn(),
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import { listDrafts } from "@/app/_lib/draft-orders";
import {
  freezePrices,
  sendInvoice,
  cancelDraft,
} from "@/app/_lib/draft-orders/lifecycle";
import { resendInvoice } from "@/app/_lib/draft-orders/resend-invoice";
import {
  getDrafts,
  bulkCancelDraftsAction,
  bulkSendInvoiceAction,
  bulkResendInvoiceAction,
} from "./actions";

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

// ═══════════════════════════════════════════════════════════════
// FAS 7.8 — bulk-action server actions
// ═══════════════════════════════════════════════════════════════

type FindManyMock = ReturnType<typeof vi.fn>;
type FindFirstMock = ReturnType<typeof vi.fn>;
type ServiceMock = ReturnType<typeof vi.fn>;

const draftFindManyMock = prisma.draftOrder.findMany as unknown as FindManyMock;
const draftFindFirstMock = prisma.draftOrder
  .findFirst as unknown as FindFirstMock;
const cancelDraftMock = cancelDraft as unknown as ServiceMock;
const sendInvoiceMock = sendInvoice as unknown as ServiceMock;
const freezePricesMock = freezePrices as unknown as ServiceMock;
const resendInvoiceMock = resendInvoice as unknown as ServiceMock;

type BulkRow = {
  id: string;
  displayNumber: string;
  status: string;
};

function makeRow(overrides: Partial<BulkRow> = {}): BulkRow {
  return {
    id: "d_1",
    displayNumber: "D-1001",
    status: "OPEN",
    ...overrides,
  };
}

beforeEach(() => {
  draftFindManyMock.mockReset();
  draftFindFirstMock.mockReset();
  cancelDraftMock.mockReset();
  sendInvoiceMock.mockReset();
  freezePricesMock.mockReset();
  resendInvoiceMock.mockReset();

  // Default: tenant resolves to "tenant_t" via the existing beforeEach,
  // happy returns from each mocked service.
  draftFindManyMock.mockResolvedValue([]);
  draftFindFirstMock.mockResolvedValue({
    pricesFrozenAt: new Date("2026-04-25T12:00:00Z"),
  });
  cancelDraftMock.mockResolvedValue({ draft: { id: "d_1" } });
  sendInvoiceMock.mockResolvedValue({
    draft: { id: "d_1" },
    invoiceUrl: "https://example/invoice/x",
  });
  freezePricesMock.mockResolvedValue({ draft: { id: "d_1" } });
  resendInvoiceMock.mockResolvedValue({
    draft: { id: "d_1" },
    invoiceUrl: "https://example/invoice/x",
    rotatedPaymentIntent: true,
  });
});

// ── Common cross-action invariants ─────────────────────────────

describe("bulk actions — auth + empty-input invariants", () => {
  it("B0 — empty draftIds short-circuits to all-zero counters (no DB call)", async () => {
    const result = await bulkCancelDraftsAction({ draftIds: [] });
    expect(result).toEqual({
      ok: true,
      total: 0,
      succeeded: [],
      failed: [],
      skipped: [],
    });
    expect(draftFindManyMock).not.toHaveBeenCalled();
    expect(cancelDraftMock).not.toHaveBeenCalled();
  });

  it("B1 — missing orgId fails closed with NO_TENANT_ERROR for all 3 actions", async () => {
    getAuthMock.mockResolvedValue({ orgId: null, userId: null, orgRole: null });

    const a = await bulkCancelDraftsAction({ draftIds: ["d_1"] });
    const b = await bulkSendInvoiceAction({ draftIds: ["d_1"] });
    const c = await bulkResendInvoiceAction({ draftIds: ["d_1"] });

    for (const r of [a, b, c]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("Ingen tenant");
    }
    expect(draftFindManyMock).not.toHaveBeenCalled();
    expect(cancelDraftMock).not.toHaveBeenCalled();
  });

  it("B2 — cross-tenant draftIds silently absent (findMany scopes to tenantId)", async () => {
    // Caller submits 3 ids; only 2 belong to the tenant.
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_a" }),
      makeRow({ id: "d_b" }),
    ]);
    const result = await bulkCancelDraftsAction({
      draftIds: ["d_a", "d_b", "d_alien"],
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.total).toBe(3);
    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);

    // Service was never called for d_alien.
    const calledIds = cancelDraftMock.mock.calls.map(
      (c) => (c[0] as { draftOrderId: string }).draftOrderId,
    );
    expect(calledIds).toEqual(expect.arrayContaining(["d_a", "d_b"]));
    expect(calledIds).not.toContain("d_alien");

    // Where-filter is tenant-scoped.
    const findArgs = draftFindManyMock.mock.calls[0][0] as {
      where: { tenantId: string };
    };
    expect(findArgs.where.tenantId).toBe("tenant_t");
  });

  it("B3 — actor.userId propagates into service call", async () => {
    getAuthMock.mockResolvedValueOnce({
      orgId: "org_1",
      userId: "user_42",
      orgRole: "org:admin",
    });
    draftFindManyMock.mockResolvedValueOnce([makeRow()]);

    await bulkCancelDraftsAction({ draftIds: ["d_1"] });

    expect(cancelDraftMock).toHaveBeenCalledTimes(1);
    const args = cancelDraftMock.mock.calls[0][0] as { actorUserId: string };
    expect(args.actorUserId).toBe("user_42");
  });
});

// ── bulkCancelDraftsAction ─────────────────────────────────────

describe("bulkCancelDraftsAction", () => {
  it("BC1 — happy: 3 OPEN drafts → 3 succeeded", async () => {
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_a", displayNumber: "D-A" }),
      makeRow({ id: "d_b", displayNumber: "D-B" }),
      makeRow({ id: "d_c", displayNumber: "D-C" }),
    ]);

    const result = await bulkCancelDraftsAction({
      draftIds: ["d_a", "d_b", "d_c"],
      reason: "internal cleanup",
    });

    if (!result.ok) throw new Error("expected ok");
    expect(result.total).toBe(3);
    expect(result.succeeded).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(cancelDraftMock).toHaveBeenCalledTimes(3);

    for (const call of cancelDraftMock.mock.calls) {
      const args = call[0] as { reason: string; tenantId: string };
      expect(args.reason).toBe("internal cleanup");
      expect(args.tenantId).toBe("tenant_t");
    }
  });

  it("BC2 — terminal status → skipped, service not called", async () => {
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_open", status: "OPEN" }),
      makeRow({ id: "d_canc", status: "CANCELLED" }),
      makeRow({ id: "d_done", status: "COMPLETED" }),
    ]);

    const result = await bulkCancelDraftsAction({
      draftIds: ["d_open", "d_canc", "d_done"],
    });

    if (!result.ok) throw new Error("expected ok");
    expect(result.succeeded).toHaveLength(1);
    expect(result.skipped).toHaveLength(2);
    expect(cancelDraftMock).toHaveBeenCalledTimes(1);
    const reasons = result.skipped.map((s) => s.reason);
    expect(reasons.every((r) => r.includes("kan inte avbrytas"))).toBe(true);
  });

  it("BC3 — PAID without reason → skipped (PAID requires reason)", async () => {
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_paid", status: "PAID" }),
    ]);
    const result = await bulkCancelDraftsAction({ draftIds: ["d_paid"] });

    if (!result.ok) throw new Error("expected ok");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/Betald order kräver anledning/);
    expect(cancelDraftMock).not.toHaveBeenCalled();
  });

  it("BC4 — PAID with reason → cancelDraft called", async () => {
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_paid", status: "PAID" }),
    ]);
    await bulkCancelDraftsAction({
      draftIds: ["d_paid"],
      reason: "refunded out-of-band",
    });
    expect(cancelDraftMock).toHaveBeenCalledTimes(1);
  });

  it("BC5 — ValidationError → skipped (race-on-terminal classification)", async () => {
    draftFindManyMock.mockResolvedValueOnce([makeRow()]);
    cancelDraftMock.mockRejectedValueOnce(
      new ValidationError("Draft is already in a terminal status"),
    );
    const result = await bulkCancelDraftsAction({ draftIds: ["d_1"] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.skipped).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });

  it("BC6 — ConflictError → skipped (race-on-terminal classification)", async () => {
    draftFindManyMock.mockResolvedValueOnce([makeRow()]);
    cancelDraftMock.mockRejectedValueOnce(
      new ConflictError("Draft mutated mid-flight"),
    );
    const result = await bulkCancelDraftsAction({ draftIds: ["d_1"] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.skipped).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });

  it("BC7 — runtime error → failed", async () => {
    draftFindManyMock.mockResolvedValueOnce([makeRow()]);
    cancelDraftMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const result = await bulkCancelDraftsAction({ draftIds: ["d_1"] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.failed).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.failed[0].error).toMatch(/ECONNRESET/);
  });
});

// ── bulkSendInvoiceAction ──────────────────────────────────────

describe("bulkSendInvoiceAction", () => {
  it("BS1 — happy: 2 OPEN with frozen prices → 2 succeeded, no freeze", async () => {
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_a", status: "OPEN" }),
      makeRow({ id: "d_b", status: "APPROVED" }),
    ]);
    // Both have pricesFrozenAt → freezePrices not called.
    draftFindFirstMock.mockResolvedValue({
      pricesFrozenAt: new Date("2026-04-25T12:00:00Z"),
    });

    const result = await bulkSendInvoiceAction({ draftIds: ["d_a", "d_b"] });

    if (!result.ok) throw new Error("expected ok");
    expect(result.succeeded).toHaveLength(2);
    expect(freezePricesMock).not.toHaveBeenCalled();
    expect(sendInvoiceMock).toHaveBeenCalledTimes(2);
  });

  it("BS2 — auto-freeze on unfrozen draft (freeze BEFORE send)", async () => {
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_unfrozen", status: "OPEN" }),
    ]);
    draftFindFirstMock.mockResolvedValueOnce({ pricesFrozenAt: null });

    const callOrder: string[] = [];
    freezePricesMock.mockImplementationOnce(async () => {
      callOrder.push("freeze");
      return { draft: { id: "d_unfrozen" } };
    });
    sendInvoiceMock.mockImplementationOnce(async () => {
      callOrder.push("send");
      return {
        draft: { id: "d_unfrozen" },
        invoiceUrl: "https://example/invoice/x",
      };
    });

    const result = await bulkSendInvoiceAction({ draftIds: ["d_unfrozen"] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.succeeded).toHaveLength(1);
    expect(callOrder).toEqual(["freeze", "send"]);
  });

  it("BS3 — status not in {OPEN, APPROVED} → skipped, no service call", async () => {
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_inv", status: "INVOICED" }),
      makeRow({ id: "d_paid", status: "PAID" }),
    ]);
    const result = await bulkSendInvoiceAction({
      draftIds: ["d_inv", "d_paid"],
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.skipped).toHaveLength(2);
    expect(sendInvoiceMock).not.toHaveBeenCalled();
    expect(freezePricesMock).not.toHaveBeenCalled();
  });

  it("BS4 — sendInvoice ValidationError → skipped", async () => {
    draftFindManyMock.mockResolvedValueOnce([makeRow({ status: "OPEN" })]);
    sendInvoiceMock.mockRejectedValueOnce(
      new ValidationError("Cannot send invoice without line items"),
    );
    const result = await bulkSendInvoiceAction({ draftIds: ["d_1"] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.skipped).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });
});

// ── bulkResendInvoiceAction ────────────────────────────────────

describe("bulkResendInvoiceAction", () => {
  it("BR1 — happy: 2 INVOICED → 2 succeeded", async () => {
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_a", status: "INVOICED" }),
      makeRow({ id: "d_b", status: "OVERDUE" }),
    ]);
    const result = await bulkResendInvoiceAction({
      draftIds: ["d_a", "d_b"],
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.succeeded).toHaveLength(2);
    expect(resendInvoiceMock).toHaveBeenCalledTimes(2);
  });

  it("BR2 — non-INVOICED/OVERDUE → skipped, no service call", async () => {
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_open", status: "OPEN" }),
      makeRow({ id: "d_paid", status: "PAID" }),
    ]);
    const result = await bulkResendInvoiceAction({
      draftIds: ["d_open", "d_paid"],
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.skipped).toHaveLength(2);
    expect(resendInvoiceMock).not.toHaveBeenCalled();
  });

  it("BR3 — ConflictError → skipped (PI succeeded race)", async () => {
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_inv", status: "INVOICED" }),
    ]);
    resendInvoiceMock.mockRejectedValueOnce(
      new ConflictError("PI already succeeded — use markDraftAsPaid"),
    );
    const result = await bulkResendInvoiceAction({ draftIds: ["d_inv"] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.skipped).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });

  it("BR4 — runtime error → failed", async () => {
    draftFindManyMock.mockResolvedValueOnce([
      makeRow({ id: "d_inv", status: "INVOICED" }),
    ]);
    resendInvoiceMock.mockRejectedValueOnce(new Error("Stripe 503"));
    const result = await bulkResendInvoiceAction({ draftIds: ["d_inv"] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.failed).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });
});
