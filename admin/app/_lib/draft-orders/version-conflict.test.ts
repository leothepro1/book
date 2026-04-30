/**
 * Phase D — VERSION_CONFLICT regression tests.
 *
 * The new version-CAS infrastructure has two surfaces:
 *
 *   1. `computeAndPersistDraftTotalsInTx` — the leverage point that
 *      propagates CAS to 5 mutations (addLineItem, updateLineItem,
 *      removeLineItem, applyDiscountCode, removeDiscountCode).
 *      Tested at the helper level here — driving the full mutation
 *      pipeline just to trigger CAS would require mocking the entire
 *      pricing/discount surface, which buys nothing over a direct
 *      helper test.
 *
 *   2. `tx.draftOrder.updateMany` direct CAS in `updateDraftCustomer`
 *      and `updateDraftMeta`. Tested through the public mutation
 *      because the path is short and the Result-shape return matters.
 *
 * The two surfaces share `VersionConflictError` (code "VERSION_CONFLICT")
 * via `service-errors.ts`. Narrowing via `isServiceError` works for both.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  VersionConflictError,
  isServiceError,
} from "@/app/_lib/errors/service-errors";
import { DRAFT_ERRORS } from "./errors";

// ── Mock surface ────────────────────────────────────────────────

const mockTx = {
  draftOrder: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  draftLineItem: { update: vi.fn() },
  draftCheckoutSession: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  draftReservation: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  draftOrderEvent: { create: vi.fn() },
};

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  guestAccount: { findFirst: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("./unlink-side-effects", () => ({
  runUnlinkSideEffects: vi.fn().mockResolvedValue({
    holdReleaseAttempted: 0,
    holdReleaseErrors: [],
    stripePaymentIntentCancelAttempted: false,
    stripePaymentIntentCancelError: null,
  }),
}));

const { computeAndPersistDraftTotalsInTx } = await import(
  "./calculator/orchestrator"
);
const { updateDraftCustomer } = await import("./update-customer");
const { updateDraftMeta } = await import("./update-meta");

// ── Helpers ─────────────────────────────────────────────────────

function makeRawDraft(over: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "OPEN",
    buyerKind: "GUEST" as const,
    companyLocationId: null,
    contactEmail: "x@y.z",
    guestAccountId: null,
    currency: "SEK",
    taxesIncluded: true,
    shippingCents: BigInt(0),
    version: 5,
    appliedDiscountCode: null,
    subtotalCents: BigInt(0),
    orderDiscountCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(0),
    lineItems: [],
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx),
  );
  // Defaults — overridden per-test as needed.
  mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });
  mockTx.draftCheckoutSession.findFirst.mockResolvedValue(null);
  mockTx.draftReservation.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════
// Calculator helper — covers 5 of the 7 mutations transitively
// ═══════════════════════════════════════════════════════════════

describe("computeAndPersistDraftTotalsInTx — version-CAS", () => {
  it("throws VersionConflictError when expectedVersion no longer matches", async () => {
    // The orchestrator first reads the draft (computeDraftTotals →
    // findFirst). Return a draft so the pure calculator runs.
    mockTx.draftOrder.findFirst.mockResolvedValue(makeRawDraft());

    // The persist updateMany returns count=0 — the row's version was
    // incremented by another writer between our read and our write.
    mockTx.draftOrder.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      computeAndPersistDraftTotalsInTx(
        // @ts-expect-error — mockTx is a structurally-compatible subset
        mockTx,
        "tenant_1",
        "draft_1",
        // expectedVersion = 5 (same as the read), but updateMany count=0
        // means the row in DB no longer has version=5.
        5,
      ),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("does NOT throw when expectedVersion matches (count=1)", async () => {
    mockTx.draftOrder.findFirst.mockResolvedValue(makeRawDraft());
    mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      computeAndPersistDraftTotalsInTx(
        // @ts-expect-error
        mockTx,
        "tenant_1",
        "draft_1",
        5,
      ),
    ).resolves.toMatchObject({ source: "COMPUTED" });
  });

  it("filters updateMany by tenantId + version (CAS contract)", async () => {
    mockTx.draftOrder.findFirst.mockResolvedValue(makeRawDraft());
    mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });

    await computeAndPersistDraftTotalsInTx(
      // @ts-expect-error
      mockTx,
      "tenant_1",
      "draft_1",
      5,
    );

    const call = mockTx.draftOrder.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      id: "draft_1",
      tenantId: "tenant_1",
      version: 5,
    });
    expect(call.data.version).toEqual({ increment: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════
// updateDraftCustomer — direct CAS via updateMany
// ═══════════════════════════════════════════════════════════════

describe("updateDraftCustomer — version-CAS", () => {
  it("returns Result-shape error on stale version", async () => {
    mockPrisma.guestAccount.findFirst.mockResolvedValue({ id: "g_new" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue({
      id: "draft_1",
      tenantId: "tenant_1",
      status: "OPEN",
      guestAccountId: null,
      version: 5,
    });
    mockTx.draftOrder.findFirst.mockResolvedValue({
      status: "OPEN",
      version: 5,
    });
    mockTx.draftOrder.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateDraftCustomer(
      "draft_1",
      "tenant_1",
      { guestAccountId: "g_new" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(DRAFT_ERRORS.VERSION_CONFLICT);
    }
  });

  it("uses version-CAS in the where filter (not just where:{id})", async () => {
    mockPrisma.guestAccount.findFirst.mockResolvedValue({ id: "g_new" });
    mockPrisma.draftOrder.findFirst.mockResolvedValue({
      id: "draft_1",
      tenantId: "tenant_1",
      status: "OPEN",
      guestAccountId: null,
      version: 5,
    });
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce({ status: "OPEN", version: 5 })
      .mockResolvedValueOnce({ id: "draft_1", version: 6 });
    mockTx.draftOrder.updateMany.mockResolvedValue({ count: 1 });

    await updateDraftCustomer(
      "draft_1",
      "tenant_1",
      { guestAccountId: "g_new" },
      { source: "admin_ui" },
    );

    expect(mockTx.draftOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 5 }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// updateDraftMeta — direct CAS via updateMany
// ═══════════════════════════════════════════════════════════════

describe("updateDraftMeta — version-CAS", () => {
  it("returns Result-shape error on stale version", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue({
      id: "draft_1",
      tenantId: "tenant_1",
      status: "OPEN",
      expiresAt: new Date(),
      internalNote: null,
      tags: [] as string[],
      version: 5,
    });
    mockTx.draftOrder.findFirst.mockResolvedValue({
      status: "OPEN",
      version: 5,
    });
    mockTx.draftOrder.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateDraftMeta(
      "draft_1",
      "tenant_1",
      { internalNote: "new" },
      { source: "admin_ui" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(DRAFT_ERRORS.VERSION_CONFLICT);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// VersionConflictError shape
// ═══════════════════════════════════════════════════════════════

describe("VersionConflictError — error shape", () => {
  it("isServiceError narrows correctly", () => {
    const err = new VersionConflictError("test");
    expect(isServiceError(err)).toBe(true);
    expect(err.code).toBe("VERSION_CONFLICT");
    expect(err.name).toBe("VersionConflictError");
  });

  it("carries optional context", () => {
    const err = new VersionConflictError("test", {
      draftOrderId: "d_1",
      expectedVersion: 5,
    });
    expect(err.context?.draftOrderId).toBe("d_1");
    expect(err.context?.expectedVersion).toBe(5);
  });
});
