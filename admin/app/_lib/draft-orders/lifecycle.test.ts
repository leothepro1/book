import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DraftOrder, DraftLineItem } from "@prisma/client";

// ── Mocks ────────────────────────────────────────────────────────

const mockTx = {
  draftOrder: { findFirst: vi.fn(), update: vi.fn() },
  draftLineItem: { update: vi.fn() },
  draftOrderEvent: { create: vi.fn() },
};

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockEmit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/apps/webhooks", () => ({ emitPlatformEvent: mockEmit }));

const mockComputeDraftTotals = vi.fn();
vi.mock("./calculator", async () => {
  const actual = await vi.importActual<typeof import("./calculator")>(
    "./calculator",
  );
  return {
    ...actual,
    computeDraftTotals: mockComputeDraftTotals,
  };
});

const { freezePrices } = await import("./lifecycle");

// ── Fixtures ────────────────────────────────────────────────────

function makeLine(overrides: Partial<DraftLineItem> = {}): DraftLineItem {
  return {
    id: "dli_1",
    tenantId: "tenant_1",
    draftOrderId: "draft_1",
    lineType: "PRODUCT",
    position: 0,
    accommodationId: null,
    checkInDate: null,
    checkOutDate: null,
    nights: null,
    guestCounts: null,
    ratePlanId: null,
    ratePlanName: null,
    ratePlanCancellationPolicy: null,
    selectedAddons: null,
    productVariantId: "var_1",
    productId: "prod_1",
    variantTitle: null,
    sku: null,
    imageUrl: null,
    taxable: true,
    taxCode: null,
    title: "Test",
    quantity: 1,
    unitPriceCents: BigInt(10_000),
    subtotalCents: BigInt(10_000),
    lineDiscountCents: BigInt(0),
    taxAmountCents: BigInt(0),
    totalCents: BigInt(10_000),
    appliedCatalogId: null,
    appliedRule: "BASE",
    lineDiscountTitle: null,
    lineDiscountType: null,
    lineDiscountValue: null,
    attributes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DraftLineItem;
}

type RawDraft = DraftOrder & { lineItems: DraftLineItem[] };

function makeDraft(overrides: Partial<RawDraft> = {}): RawDraft {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    displayNumber: "D-2026-1001",
    status: "OPEN",
    buyerKind: "GUEST",
    guestAccountId: "acc_1",
    companyLocationId: null,
    companyContactId: null,
    contactEmail: null,
    contactPhone: null,
    contactFirstName: null,
    contactLastName: null,
    poNumber: null,
    subtotalCents: BigInt(10_000),
    orderDiscountCents: BigInt(0),
    shippingCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(10_000),
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
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    completedAt: null,
    completedOrderId: null,
    cancelledAt: null,
    cancellationReason: null,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    internalNote: null,
    customerNote: null,
    metafields: null,
    tags: [],
    lineItems: [makeLine()],
    ...overrides,
  } as RawDraft;
}

function makeTotals(overrides: Record<string, unknown> = {}) {
  return {
    source: "COMPUTED" as const,
    frozenAt: null,
    currency: "SEK",
    subtotalCents: BigInt(10_000),
    totalLineDiscountCents: BigInt(0),
    orderDiscountCents: BigInt(0),
    totalDiscountCents: BigInt(0),
    taxCents: BigInt(0),
    shippingCents: BigInt(0),
    totalCents: BigInt(10_000),
    perLine: [
      {
        lineId: "dli_1",
        subtotalCents: BigInt(10_000),
        manualLineDiscountCents: BigInt(0),
        allocatedOrderDiscountCents: BigInt(0),
        totalLineDiscountCents: BigInt(0),
        taxableBaseCents: BigInt(10_000),
        taxCents: BigInt(0),
        totalCents: BigInt(10_000),
      },
    ],
    warnings: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx),
  );
  mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockTx.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockTx.draftOrder.update.mockResolvedValue(makeDraft());
  mockTx.draftLineItem.update.mockResolvedValue({});
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });
  mockComputeDraftTotals.mockResolvedValue(makeTotals());
  mockEmit.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════
// Happy path
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — happy path", () => {
  it("writes totals + pricesFrozenAt + version+1 in a single DraftOrder.update", async () => {
    const before = Date.now();
    const result = await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_1",
    });
    const after = Date.now();

    expect(mockTx.draftOrder.update).toHaveBeenCalledTimes(1);
    const data = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(data.subtotalCents).toBe(BigInt(10_000));
    expect(data.orderDiscountCents).toBe(BigInt(0));
    expect(data.totalTaxCents).toBe(BigInt(0));
    expect(data.totalCents).toBe(BigInt(10_000));
    expect(data.version).toEqual({ increment: 1 });
    expect(data.pricesFrozenAt).toBeInstanceOf(Date);
    const ts = (data.pricesFrozenAt as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);

    expect(result.frozenAt).toBeInstanceOf(Date);
    expect(result.totals.source).toBe("FROZEN_SNAPSHOT");
    expect(result.totals.frozenAt).toEqual(data.pricesFrozenAt);
  });

  it("writes per-line taxAmountCents + totalCents via draftLineItem.update", async () => {
    await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(mockTx.draftLineItem.update).toHaveBeenCalledTimes(1);
    const lineData = mockTx.draftLineItem.update.mock.calls[0][0].data;
    expect(lineData.taxAmountCents).toBe(BigInt(0));
    expect(lineData.totalCents).toBe(BigInt(10_000));
  });

  it("emits PRICES_FROZEN event inside tx with snapshot metadata", async () => {
    await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_42",
    });

    expect(mockTx.draftOrderEvent.create).toHaveBeenCalledTimes(1);
    const evData = mockTx.draftOrderEvent.create.mock.calls[0][0].data;
    expect(evData.type).toBe("PRICES_FROZEN");
    expect(evData.actorUserId).toBe("user_42");
    expect(evData.actorSource).toBe("admin_ui");
    expect(evData.metadata.frozenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(evData.metadata.snapshot).toEqual({
      subtotalCents: "10000",
      orderDiscountCents: "0",
      totalTaxCents: "0",
      totalCents: "10000",
    });
  });

  it("emits draft_order.updated platform webhook with changeType=prices_frozen", async () => {
    await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(mockEmit).toHaveBeenCalledTimes(1);
    const call = mockEmit.mock.calls[0][0];
    expect(call.type).toBe("draft_order.updated");
    expect(call.payload.changeType).toBe("prices_frozen");
    expect(call.payload.frozenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(call.payload.totalCents).toBe("10000");
  });

  it("uses the injected tx for calculator reads (not global prisma)", async () => {
    await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    // computeDraftTotals called with 4 args including tx
    expect(mockComputeDraftTotals).toHaveBeenCalledTimes(1);
    const args = mockComputeDraftTotals.mock.calls[0];
    expect(args[0]).toBe("tenant_1"); // tenantId
    expect(args[1]).toBe("draft_1"); // draftOrderId
    expect(args[3]).toBe(mockTx); // tx
  });
});

// ═══════════════════════════════════════════════════════════════
// Idempotency — operator decision: throw, not silent no-op
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — idempotency (ALREADY_FROZEN)", () => {
  it("throws ValidationError when draft is already frozen", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ pricesFrozenAt: new Date() }),
    );

    await expect(
      freezePrices({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
      }),
    ).rejects.toThrow(/already frozen/i);

    // Tx not opened on early rejection
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Empty draft
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — empty draft allowed", () => {
  it("freezes an empty draft (all totals 0n)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ lineItems: [] }),
    );
    mockTx.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ lineItems: [] }),
    );
    mockComputeDraftTotals.mockResolvedValue(
      makeTotals({
        subtotalCents: BigInt(0),
        totalCents: BigInt(0),
        perLine: [],
      }),
    );

    const result = await freezePrices({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    const data = mockTx.draftOrder.update.mock.calls[0][0].data;
    expect(data.subtotalCents).toBe(BigInt(0));
    expect(data.totalCents).toBe(BigInt(0));
    expect(data.pricesFrozenAt).toBeInstanceOf(Date);

    // No per-line updates when there are no lines.
    expect(mockTx.draftLineItem.update).not.toHaveBeenCalled();

    expect(result.totals.totalCents).toBe(BigInt(0));
  });
});

// ═══════════════════════════════════════════════════════════════
// Mutability guards
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — mutability guards", () => {
  it("rejects when draft not found in tenant", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
    await expect(
      freezePrices({
        tenantId: "tenant_1",
        draftOrderId: "ghost",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects non-OPEN statuses (6.5B scope — 6.5D will add APPROVED)", async () => {
    for (const status of [
      "INVOICED",
      "PAID",
      "OVERDUE",
      "COMPLETED",
      "CANCELLED",
      "PENDING_APPROVAL",
      "APPROVED",
      "REJECTED",
    ] as const) {
      mockPrisma.draftOrder.findFirst.mockResolvedValue(
        makeDraft({ status }),
      );
      await expect(
        freezePrices({
          tenantId: "tenant_1",
          draftOrderId: "draft_1",
        }),
      ).rejects.toThrow(/freezable status/i);
    }
  });

  it("rejects Zod-invalid input (missing tenantId)", async () => {
    await expect(
      freezePrices({
        tenantId: "",
        draftOrderId: "draft_1",
      } as never),
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Platform webhook resilience
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — webhook fire-and-forget", () => {
  it("swallows webhook failures (does not throw)", async () => {
    mockEmit.mockRejectedValueOnce(new Error("app down"));
    await expect(
      freezePrices({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
      }),
    ).resolves.toMatchObject({ frozenAt: expect.any(Date) });
  });
});

// ═══════════════════════════════════════════════════════════════
// Race safety — second freeze attempt inside tx
// ═══════════════════════════════════════════════════════════════

describe("freezePrices — tx-internal re-validation", () => {
  it("rejects when draft was frozen by a concurrent request between pre-tx and tx", async () => {
    // Pre-tx read: not frozen
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ pricesFrozenAt: null }),
    );
    // Tx-internal re-read: frozen (race)
    mockTx.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ pricesFrozenAt: new Date() }),
    );

    await expect(
      freezePrices({
        tenantId: "tenant_1",
        draftOrderId: "draft_1",
      }),
    ).rejects.toThrow(/already frozen/i);

    // Calculator NOT called (rejected in pre-write check)
    expect(mockComputeDraftTotals).not.toHaveBeenCalled();
    // No webhook
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
