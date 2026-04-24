import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DraftOrder } from "@prisma/client";

// ── Mocks ────────────────────────────────────────────────────

const mockTx = {
  $queryRaw: vi.fn(),
  draftOrder: { create: vi.fn() },
  draftOrderEvent: { create: vi.fn() },
};

const mockPrisma = {
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockEmit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/apps/webhooks", () => ({
  emitPlatformEvent: mockEmit,
}));

const { createDraft } = await import("./create");

// ── Fixtures ────────────────────────────────────────────────

function makeDraftRow(overrides: Partial<DraftOrder> = {}): DraftOrder {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    displayNumber: "D-2026-1001",
    status: "OPEN",
    buyerKind: "GUEST",
    guestAccountId: null,
    companyLocationId: null,
    companyContactId: null,
    contactEmail: null,
    contactPhone: null,
    contactFirstName: null,
    contactLastName: null,
    poNumber: null,
    subtotalCents: BigInt(0),
    orderDiscountCents: BigInt(0),
    shippingCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(0),
    currency: "SEK",
    taxesIncluded: true,
    pricesFrozenAt: null,
    appliedDiscountId: null,
    appliedDiscountCode: null,
    appliedDiscountAmount: null,
    appliedDiscountType: null,
    paymentTermsId: null,
    paymentTermsFrozen: null,
    depositPercent: null,
    shareLinkToken: null,
    shareLinkExpiresAt: null,
    invoiceUrl: null,
    invoiceSentAt: null,
    invoiceEmailSubject: null,
    invoiceEmailMessage: null,
    expiresAt: new Date(),
    completedAt: null,
    completedOrderId: null,
    cancelledAt: null,
    cancellationReason: null,
    createdByUserId: null,
    createdAt: new Date("2026-04-24T10:00:00Z"),
    updatedAt: new Date("2026-04-24T10:00:00Z"),
    version: 1,
    internalNote: null,
    customerNote: null,
    metafields: null,
    tags: [],
    ...overrides,
  } as DraftOrder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.$queryRaw.mockResolvedValue([{ lastNumber: 1001 }]);
  mockTx.draftOrder.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) =>
      makeDraftRow(data as Partial<DraftOrder>),
  );
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
});

// ── Happy paths — all 3 buyer kinds ─────────────────────────

describe("createDraft — GUEST buyer", () => {
  it("creates a GUEST draft with taxesIncluded=true (D2C default)", async () => {
    const { draft } = await createDraft({
      tenantId: "tenant_1",
      buyerKind: "GUEST",
      guestAccountId: "acc_1",
    });

    expect(draft.buyerKind).toBe("GUEST");
    expect(draft.taxesIncluded).toBe(true);
    expect(draft.status).toBe("OPEN");
  });

  it("accepts contactEmail in lieu of guestAccountId", async () => {
    const { draft } = await createDraft({
      tenantId: "tenant_1",
      buyerKind: "GUEST",
      contactEmail: "walkin@test.com",
    });
    expect(draft.contactEmail).toBe("walkin@test.com");
  });
});

describe("createDraft — COMPANY buyer", () => {
  it("creates a COMPANY draft with taxesIncluded=false (B2B default)", async () => {
    const { draft } = await createDraft({
      tenantId: "tenant_1",
      buyerKind: "COMPANY",
      companyLocationId: "loc_1",
      companyContactId: "con_1",
    });
    expect(draft.buyerKind).toBe("COMPANY");
    expect(draft.taxesIncluded).toBe(false);
  });

  it("rejects COMPANY without companyLocationId", async () => {
    await expect(
      createDraft({
        tenantId: "tenant_1",
        buyerKind: "COMPANY",
      }),
    ).rejects.toThrow(/companyLocationId/);
  });
});

describe("createDraft — WALK_IN buyer", () => {
  it("creates a WALK_IN draft with taxesIncluded=true and no FK requirement", async () => {
    const { draft } = await createDraft({
      tenantId: "tenant_1",
      buyerKind: "WALK_IN",
    });
    expect(draft.buyerKind).toBe("WALK_IN");
    expect(draft.taxesIncluded).toBe(true);
  });
});

// ── Default-value logic ────────────────────────────────────

describe("createDraft — default values", () => {
  it("caller-provided taxesIncluded wins over buyerKind default", async () => {
    const { draft } = await createDraft({
      tenantId: "tenant_1",
      buyerKind: "COMPANY",
      companyLocationId: "loc_1",
      taxesIncluded: true, // override the COMPANY=false default
    });
    expect(draft.taxesIncluded).toBe(true);
  });

  it("assigns displayNumber via sequence tx call", async () => {
    await createDraft({
      tenantId: "tenant_1",
      buyerKind: "GUEST",
      guestAccountId: "acc_1",
    });
    expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    const createCall = mockTx.draftOrder.create.mock.calls[0][0];
    expect(createCall.data.displayNumber).toMatch(/^D-\d{4}-1001$/);
  });

  it("sets 7-day default expiresAt when not provided", async () => {
    const before = Date.now();
    await createDraft({
      tenantId: "tenant_1",
      buyerKind: "GUEST",
      guestAccountId: "acc_1",
    });
    const createCall = mockTx.draftOrder.create.mock.calls[0][0];
    const exp = (createCall.data.expiresAt as Date).getTime();
    const after = Date.now();
    const sevenDays = 7 * 24 * 3600 * 1000;
    expect(exp).toBeGreaterThanOrEqual(before + sevenDays - 100);
    expect(exp).toBeLessThanOrEqual(after + sevenDays + 100);
  });

  it("clamps caller-provided expiresAt into [1d, 90d]", async () => {
    const tooShort = new Date(Date.now() + 60 * 1000); // 1 min from now
    await createDraft({
      tenantId: "tenant_1",
      buyerKind: "GUEST",
      guestAccountId: "acc_1",
      expiresAt: tooShort,
    });
    const createCall = mockTx.draftOrder.create.mock.calls[0][0];
    const exp = (createCall.data.expiresAt as Date).getTime();
    expect(exp).toBeGreaterThanOrEqual(Date.now() + 24 * 3600 * 1000 - 100);
  });

  it("clamps absurdly far-future expiresAt to 90 days", async () => {
    const tooLong = new Date(Date.now() + 365 * 24 * 3600 * 1000);
    await createDraft({
      tenantId: "tenant_1",
      buyerKind: "GUEST",
      guestAccountId: "acc_1",
      expiresAt: tooLong,
    });
    const createCall = mockTx.draftOrder.create.mock.calls[0][0];
    const exp = (createCall.data.expiresAt as Date).getTime();
    expect(exp).toBeLessThanOrEqual(
      Date.now() + 90 * 24 * 3600 * 1000 + 100,
    );
  });

  it("defaults currency to SEK and shipping to 0n when omitted", async () => {
    await createDraft({
      tenantId: "tenant_1",
      buyerKind: "GUEST",
      guestAccountId: "acc_1",
    });
    const createCall = mockTx.draftOrder.create.mock.calls[0][0];
    expect(createCall.data.currency).toBe("SEK");
    expect(createCall.data.shippingCents).toBe(BigInt(0));
  });
});

// ── Events ─────────────────────────────────────────────────

describe("createDraft — events", () => {
  it("emits a CREATED DraftOrderEvent inside the same tx", async () => {
    await createDraft({
      tenantId: "tenant_1",
      buyerKind: "GUEST",
      guestAccountId: "acc_1",
      actorUserId: "user_1",
    });
    expect(mockTx.draftOrderEvent.create).toHaveBeenCalledTimes(1);
    const call = mockTx.draftOrderEvent.create.mock.calls[0][0];
    expect(call.data.type).toBe("CREATED");
    expect(call.data.actorUserId).toBe("user_1");
    expect(call.data.actorSource).toBe("admin_ui");
    expect(call.data.metadata).toMatchObject({
      buyerKind: "GUEST",
    });
    expect(call.data.metadata.displayNumber).toMatch(/^D-\d{4}-1001$/);
  });
});

// ── Platform webhook ──────────────────────────────────────

describe("createDraft — platform webhook emission", () => {
  it("emits draft_order.created fire-and-forget after commit", async () => {
    await createDraft({
      tenantId: "tenant_1",
      buyerKind: "GUEST",
      guestAccountId: "acc_1",
    });
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const call = mockEmit.mock.calls[0][0];
    expect(call.type).toBe("draft_order.created");
    expect(call.tenantId).toBe("tenant_1");
    expect(call.payload).toMatchObject({
      draftOrderId: "draft_1",
      buyerKind: "GUEST",
    });
  });

  it("swallows webhook failures (fire-and-forget)", async () => {
    mockEmit.mockRejectedValueOnce(new Error("app down"));
    // Should NOT throw.
    await expect(
      createDraft({
        tenantId: "tenant_1",
        buyerKind: "GUEST",
        guestAccountId: "acc_1",
      }),
    ).resolves.toMatchObject({ draft: expect.any(Object) });
  });
});

// ── Zod rejections ────────────────────────────────────────

describe("createDraft — input validation", () => {
  it("rejects GUEST buyer without guestAccountId AND without contactEmail", async () => {
    await expect(
      createDraft({
        tenantId: "tenant_1",
        buyerKind: "GUEST",
      }),
    ).rejects.toThrow(/guestAccountId or contactEmail/);
  });

  it("rejects invalid currency length", async () => {
    await expect(
      createDraft({
        tenantId: "tenant_1",
        buyerKind: "WALK_IN",
        currency: "EURO",
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid contactEmail format", async () => {
    await expect(
      createDraft({
        tenantId: "tenant_1",
        buyerKind: "GUEST",
        contactEmail: "not-an-email",
      }),
    ).rejects.toThrow();
  });

  it("rejects negative shippingCents", async () => {
    await expect(
      createDraft({
        tenantId: "tenant_1",
        buyerKind: "WALK_IN",
        shippingCents: BigInt(-100),
      }),
    ).rejects.toThrow();
  });
});

// ── Snapshot fields ───────────────────────────────────────

describe("createDraft — snapshot preservation", () => {
  it("persists all contact snapshot fields verbatim", async () => {
    await createDraft({
      tenantId: "tenant_1",
      buyerKind: "WALK_IN",
      contactEmail: "snap@test.com",
      contactPhone: "+46 70 123 45 67",
      contactFirstName: "Snap",
      contactLastName: "Shot",
      poNumber: "PO-2026-001",
      internalNote: "internal",
      customerNote: "customer",
      tags: ["vip", "bulk"],
    });
    const createCall = mockTx.draftOrder.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      contactEmail: "snap@test.com",
      contactPhone: "+46 70 123 45 67",
      contactFirstName: "Snap",
      contactLastName: "Shot",
      poNumber: "PO-2026-001",
      internalNote: "internal",
      customerNote: "customer",
      tags: ["vip", "bulk"],
    });
  });
});
