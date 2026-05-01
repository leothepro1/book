import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DiscountWithRelations } from "./types";
import type { CalculatedDiscountImpact } from "./apply";

// ── Mocks ────────────────────────────────────────────────────
// Every prisma table/method is a spy so we can assert that
// calculateDiscountImpact does NOT access the DB directly.

const mockPrisma = {
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  discountAllocation: { create: vi.fn() },
  discountUsage: { upsert: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  discountEvent: { create: vi.fn() },
  order: { update: vi.fn() },
  orderLineItem: { update: vi.fn() },
  discountCode: { findUnique: vi.fn() },
  tenant: { findUnique: vi.fn() },
  discount: { findMany: vi.fn(), findUnique: vi.fn() },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockEvaluateDiscountCode = vi.fn();
const mockEvaluateAutomaticDiscount = vi.fn();
vi.mock("./engine", () => ({
  evaluateDiscountCode: (...args: unknown[]) => mockEvaluateDiscountCode(...args),
  evaluateAutomaticDiscount: (...args: unknown[]) => mockEvaluateAutomaticDiscount(...args),
}));

const mockFindDiscountCode = vi.fn();
vi.mock("./codes", () => ({
  findDiscountCode: (...args: unknown[]) => mockFindDiscountCode(...args),
  normalizeCode: (s: string) => s.trim().toUpperCase(),
}));

const mockCreateOrderEventInTx = vi.fn();
vi.mock("@/app/_lib/orders/events", () => ({
  createOrderEventInTx: (...args: unknown[]) => mockCreateOrderEventInTx(...args),
}));

// commitDiscountApplication calls emitAnalyticsEvent (Phase 2 Commit G)
// to record discount_used in the analytics pipeline. The emitter would
// otherwise call $queryRaw / $executeRaw on our mock tx, throwing off
// the spy-counts assertions in this file. Mock it to a no-op — this
// file's contract is the operational discount-mutation sequence, not
// the analytics pipeline (which has its own dedicated tests in
// app/_lib/analytics/pipeline/emitter.test.ts).
const mockEmitAnalyticsEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/analytics/pipeline/emitter", () => ({
  emitAnalyticsEvent: (...args: unknown[]) => mockEmitAnalyticsEvent(...args),
}));

// Import after mocks so the SUT wires to them.
const { calculateDiscountImpact, commitDiscountApplication } = await import("./apply");

// ── Fixtures ─────────────────────────────────────────────────

function makeDiscount(overrides: Partial<DiscountWithRelations> = {}): DiscountWithRelations {
  return {
    id: "disc_1",
    tenantId: "tenant_1",
    title: "Test Discount",
    description: null,
    method: "CODE",
    valueType: "PERCENTAGE",
    value: 1500,
    targetType: "ORDER",
    appliesToAllProducts: true,
    appliesToAllCustomers: true,
    appliesToCompanies: false,
    minimumAmount: null,
    minimumQuantity: null,
    status: "ACTIVE",
    startsAt: new Date("2026-01-01"),
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    combinesWithProductDiscounts: false,
    combinesWithOrderDiscounts: false,
    combinesWithShippingDiscounts: false,
    createdByUserId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    codes: [],
    conditions: [],
    targetedProducts: [],
    targetedCollections: [],
    targetedSegments: [],
    targetedCustomers: [],
    ...overrides,
  };
}

const baseCtx = {
  orderAmount: 100000,
  productIds: ["prod_a"],
  itemCount: 2,
  guestEmail: "guest@test.com",
  guestAccountId: undefined,
  guestSegmentIds: [],
  checkInDate: undefined,
  checkOutDate: undefined,
  nights: 0,
  buyerKind: "GUEST" as const,
};

const baseLineItems = [{ id: "li_1", productId: "prod_a", totalAmount: 100000 }];

function validEngineResult(overrides: Record<string, unknown> = {}) {
  return {
    valid: true,
    discount: makeDiscount(),
    discountAmount: 15000,
    title: "Test Discount",
    description: null,
    ...overrides,
  };
}

type ValidImpact = Extract<CalculatedDiscountImpact, { valid: true }>;

function makeValidImpact(overrides: Partial<ValidImpact> = {}): ValidImpact {
  return {
    valid: true,
    discount: makeDiscount(),
    discountCodeId: "code_1",
    discountCodeValue: "SUMMER",
    discountAmount: 15000,
    allocations: { scope: "ORDER", amount: 15000 },
    title: "Test Discount",
    description: null,
    buyerKind: "GUEST",
    ...overrides,
  };
}

function makeTx() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([
      { usageCount: 0, usageLimit: null, appliesToCompanies: false },
    ]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    discountAllocation: { create: vi.fn().mockResolvedValue({}) },
    order: {
      update: vi.fn().mockResolvedValue({}),
      // commitDiscountApplication reads the order back via
      // findUniqueOrThrow to capture totals for the order event
      // payload. Default returns a minimal shape sufficient for
      // the assertions in this file.
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "order_1",
        totalAmount: 10000,
        discountAmount: 0,
        currency: "SEK",
      }),
    },
    orderLineItem: { update: vi.fn().mockResolvedValue({}) },
    discountUsage: { upsert: vi.fn().mockResolvedValue({}) },
    discountEvent: { create: vi.fn().mockResolvedValue({}) },
    discountCode: { findUnique: vi.fn().mockResolvedValue({ code: "SUMMER" }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Part A: calculateDiscountImpact — purity ─────────────────

describe("calculateDiscountImpact — purity (no side effects)", () => {
  it("does not call prisma.$executeRaw for usageCount updates", async () => {
    mockEvaluateDiscountCode.mockResolvedValue(validEngineResult());
    mockFindDiscountCode.mockResolvedValue({ id: "code_1", code: "SUMMER" });

    const result = await calculateDiscountImpact({
      tenantId: "tenant_1",
      ctx: baseCtx,
      code: "SUMMER",
      lineItems: baseLineItems,
    });

    expect(result.valid).toBe(true);
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("does not write DiscountUsage, DiscountAllocation, OrderEvent, or DiscountEvent", async () => {
    mockEvaluateDiscountCode.mockResolvedValue(validEngineResult());
    mockFindDiscountCode.mockResolvedValue({ id: "code_1", code: "SUMMER" });

    await calculateDiscountImpact({
      tenantId: "tenant_1",
      ctx: baseCtx,
      code: "SUMMER",
      lineItems: baseLineItems,
    });

    expect(mockPrisma.discountUsage.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.discountUsage.create).not.toHaveBeenCalled();
    expect(mockPrisma.discountAllocation.create).not.toHaveBeenCalled();
    expect(mockPrisma.discountEvent.create).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
    expect(mockPrisma.orderLineItem.update).not.toHaveBeenCalled();
    expect(mockCreateOrderEventInTx).not.toHaveBeenCalled();
  });

  it("is idempotent — identical input produces identical output across repeated calls", async () => {
    mockEvaluateDiscountCode.mockResolvedValue(validEngineResult());
    mockFindDiscountCode.mockResolvedValue({ id: "code_1", code: "SUMMER" });

    const params = {
      tenantId: "tenant_1",
      ctx: baseCtx,
      code: "SUMMER",
      lineItems: baseLineItems,
    };

    const first = await calculateDiscountImpact(params);
    const second = await calculateDiscountImpact(params);

    expect(first).toEqual(second);
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    expect(mockPrisma.discountUsage.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.discountAllocation.create).not.toHaveBeenCalled();
  });

  it("returns { valid: false } when engine rejects the code", async () => {
    mockEvaluateDiscountCode.mockResolvedValue({ valid: false, error: "DISCOUNT_EXPIRED" });

    const result = await calculateDiscountImpact({
      tenantId: "tenant_1",
      ctx: baseCtx,
      code: "EXPIRED",
      lineItems: baseLineItems,
    });

    expect(result).toEqual({ valid: false, error: "DISCOUNT_EXPIRED" });
    expect(mockFindDiscountCode).not.toHaveBeenCalled(); // Short-circuits before code lookup
  });

  it("snapshots ctx.buyerKind into the returned impact (for commit's defense-in-depth check)", async () => {
    mockEvaluateDiscountCode.mockResolvedValue(validEngineResult());
    mockFindDiscountCode.mockResolvedValue({ id: "code_1", code: "SUMMER" });

    const companyResult = await calculateDiscountImpact({
      tenantId: "tenant_1",
      ctx: { ...baseCtx, buyerKind: "COMPANY" },
      code: "SUMMER",
      lineItems: baseLineItems,
    });

    if (!companyResult.valid) throw new Error("expected valid result");
    expect(companyResult.buyerKind).toBe("COMPANY");
  });
});

// ── Part B: commitDiscountApplication — mutations ───────────

describe("commitDiscountApplication — mutations", () => {
  it("performs the full mutation sequence for an order-level code discount", async () => {
    const tx = makeTx();

    await commitDiscountApplication(tx as never, {
      orderId: "ord_1",
      tenantId: "tenant_1",
      guestEmail: "guest@test.com",
      guestAccountId: undefined,
      impact: makeValidImpact(),
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);                 // FOR UPDATE lock
    expect(tx.discountAllocation.create).toHaveBeenCalledTimes(1); // Order-level allocation
    expect(tx.order.update).toHaveBeenCalledTimes(1);              // discountAmount + discountCode
    expect(tx.orderLineItem.update).not.toHaveBeenCalled();        // Order-level skips line-item writes
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);               // Discount + DiscountCode usageCount
    expect(tx.discountUsage.upsert).toHaveBeenCalledTimes(1);
    expect(mockCreateOrderEventInTx).toHaveBeenCalledTimes(1);
    expect(tx.discountEvent.create).toHaveBeenCalledTimes(1);
  });

  it("emits DISCOUNT_CODE_REDEEMED for CODE-method discounts and DISCOUNT_APPLIED for AUTOMATIC", async () => {
    const tx = makeTx();

    await commitDiscountApplication(tx as never, {
      orderId: "ord_1",
      tenantId: "tenant_1",
      guestEmail: "guest@test.com",
      guestAccountId: undefined,
      impact: makeValidImpact({
        discountCodeId: undefined,
        discountCodeValue: undefined,
        discount: makeDiscount({ method: "AUTOMATIC" }),
      }),
    });

    const call = mockCreateOrderEventInTx.mock.calls[0][1] as { type: string };
    expect(call.type).toBe("DISCOUNT_APPLIED");
    // AUTOMATIC has no DiscountCode → only Discount usageCount UPDATE fires.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("writes per-line allocations for LINE-scope impacts", async () => {
    const tx = makeTx();

    await commitDiscountApplication(tx as never, {
      orderId: "ord_1",
      tenantId: "tenant_1",
      guestEmail: "guest@test.com",
      guestAccountId: undefined,
      impact: makeValidImpact({
        allocations: {
          scope: "LINE",
          perLine: [
            { lineItemId: "li_a", amount: 5000 },
            { lineItemId: "li_b", amount: 10000 },
          ],
        },
      }),
    });

    expect(tx.discountAllocation.create).toHaveBeenCalledTimes(2);
    expect(tx.orderLineItem.update).toHaveBeenCalledTimes(2);
  });

  it("throws USAGE_LIMIT_REACHED when the locked row exceeds its limit (TOCTOU gate)", async () => {
    const tx = makeTx();
    tx.$queryRaw = vi.fn().mockResolvedValue([
      { usageCount: 10, usageLimit: 10, appliesToCompanies: false },
    ]);

    await expect(
      commitDiscountApplication(tx as never, {
        orderId: "ord_1",
        tenantId: "tenant_1",
        guestEmail: "guest@test.com",
        guestAccountId: undefined,
        impact: makeValidImpact(),
      }),
    ).rejects.toThrow("USAGE_LIMIT_REACHED");

    // Nothing downstream of the gate should have fired.
    expect(tx.discountAllocation.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("throws NOT_ELIGIBLE_FOR_COMPANIES when COMPANY buyer locks a discount with appliesToCompanies=false", async () => {
    const tx = makeTx();
    tx.$queryRaw = vi.fn().mockResolvedValue([
      { usageCount: 0, usageLimit: null, appliesToCompanies: false },
    ]);

    await expect(
      commitDiscountApplication(tx as never, {
        orderId: "ord_1",
        tenantId: "tenant_1",
        guestEmail: "guest@test.com",
        guestAccountId: undefined,
        impact: makeValidImpact({ buyerKind: "COMPANY" }),
      }),
    ).rejects.toThrow("NOT_ELIGIBLE_FOR_COMPANIES");

    expect(tx.discountAllocation.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("allows COMPANY buyer when the locked row has appliesToCompanies=true", async () => {
    const tx = makeTx();
    tx.$queryRaw = vi.fn().mockResolvedValue([
      { usageCount: 0, usageLimit: null, appliesToCompanies: true },
    ]);

    await expect(
      commitDiscountApplication(tx as never, {
        orderId: "ord_1",
        tenantId: "tenant_1",
        guestEmail: "guest@test.com",
        guestAccountId: undefined,
        impact: makeValidImpact({ buyerKind: "COMPANY" }),
      }),
    ).resolves.toBeUndefined();

    expect(tx.discountAllocation.create).toHaveBeenCalledTimes(1);
  });
});
