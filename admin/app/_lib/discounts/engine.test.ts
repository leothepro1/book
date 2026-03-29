import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DiscountCondition } from "@prisma/client";
import type { DiscountWithRelations } from "./types";

// ── Mock prisma ─────────────────────────────────────────────

const mockPrisma = {
  tenant: { findUnique: vi.fn() },
  discount: { findMany: vi.fn() },
  discountUsage: { findFirst: vi.fn() },
  guestAccount: { findFirst: vi.fn() },
  productCollectionItem: { findMany: vi.fn() },
};

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

// ── Mock findDiscountCode ───────────────────────────────────

const mockFindDiscountCode = vi.fn();

vi.mock("./codes", () => ({
  findDiscountCode: (...args: unknown[]) => mockFindDiscountCode(...args),
  normalizeCode: (s: string) => s.trim().toUpperCase(),
}));

// ── Mock logger ─────────────────────────────────────────────

vi.mock("@/app/_lib/logger", () => ({
  log: vi.fn(),
}));

// ── Import after mocks ──────────────────────────────────────

const { evaluateDiscountCode, evaluateAutomaticDiscount } = await import("./engine");

// ── Helpers ─────────────────────────────────────────────────

function makeDiscount(overrides: Partial<DiscountWithRelations> = {}): DiscountWithRelations {
  return {
    id: "disc_1",
    tenantId: "tenant_1",
    title: "Test Discount",
    description: null,
    method: "CODE",
    valueType: "PERCENTAGE",
    value: 1500, // 15%
    targetType: "ORDER",
    appliesToAllProducts: true,
    appliesToAllCustomers: true,
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

function makeCodeRecord(discount: DiscountWithRelations) {
  return {
    id: "code_1",
    discountId: discount.id,
    tenantId: "tenant_1",
    code: "SUMMER",
    usageLimit: null,
    usageCount: 0,
    isActive: true,
    createdAt: new Date(),
    discount,
  };
}

const baseInput = {
  tenantId: "tenant_1",
  code: "SUMMER",
  orderAmount: 100000,
  productIds: ["prod_a"],
  itemCount: 2,
  guestEmail: "guest@test.com",
};

// ── Reset mocks ─────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.tenant.findUnique.mockResolvedValue({ discountsEnabled: true });
  mockPrisma.discountUsage.findFirst.mockResolvedValue(null);
  mockPrisma.guestAccount.findFirst.mockResolvedValue(null);
  mockPrisma.productCollectionItem.findMany.mockResolvedValue([]);
});

// ── evaluateDiscountCode — tenant checks ────────────────────

describe("evaluateDiscountCode — tenant checks", () => {
  it("returns TENANT_DISCOUNTS_DISABLED when discountsEnabled is false", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ discountsEnabled: false });
    const result = await evaluateDiscountCode(baseInput);
    expect(result).toEqual({ valid: false, error: "TENANT_DISCOUNTS_DISABLED" });
  });

  it("returns DISCOUNT_NOT_FOUND when code does not exist", async () => {
    mockFindDiscountCode.mockResolvedValue(null);
    const result = await evaluateDiscountCode(baseInput);
    expect(result).toEqual({ valid: false, error: "DISCOUNT_NOT_FOUND" });
  });
});

// ── evaluateDiscountCode — status checks ────────────────────

describe("evaluateDiscountCode — status checks", () => {
  it("returns DISCOUNT_DISABLED when status is DISABLED", async () => {
    const discount = makeDiscount({ status: "DISABLED" });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode(baseInput);
    expect(result).toEqual({ valid: false, error: "DISCOUNT_DISABLED" });
  });

  it("returns DISCOUNT_NOT_STARTED when startsAt is in the future", async () => {
    const discount = makeDiscount({ startsAt: new Date("2099-01-01") });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode(baseInput);
    expect(result).toEqual({ valid: false, error: "DISCOUNT_NOT_STARTED" });
  });

  it("returns DISCOUNT_EXPIRED when endsAt is in the past", async () => {
    const discount = makeDiscount({ endsAt: new Date("2020-01-01") });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode(baseInput);
    expect(result).toEqual({ valid: false, error: "DISCOUNT_EXPIRED" });
  });
});

// ── evaluateDiscountCode — usage limit checks ───────────────

describe("evaluateDiscountCode — usage limit checks", () => {
  it("returns USAGE_LIMIT_REACHED when usageCount >= usageLimit", async () => {
    const discount = makeDiscount({ usageLimit: 10, usageCount: 10 });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode(baseInput);
    expect(result).toEqual({ valid: false, error: "USAGE_LIMIT_REACHED" });
  });

  it("passes when usageCount < usageLimit", async () => {
    const discount = makeDiscount({ usageLimit: 10, usageCount: 5 });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode(baseInput);
    expect(result.valid).toBe(true);
  });

  it("passes when usageLimit is null (unlimited)", async () => {
    const discount = makeDiscount({ usageLimit: null, usageCount: 999 });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode(baseInput);
    expect(result.valid).toBe(true);
  });

  it("returns CODE_USAGE_LIMIT_REACHED when code.usageLimit exceeded", async () => {
    const discount = makeDiscount();
    const code = { ...makeCodeRecord(discount), usageLimit: 5 as number | null, usageCount: 5 };
    mockFindDiscountCode.mockResolvedValue(code);
    const result = await evaluateDiscountCode(baseInput);
    expect(result).toEqual({ valid: false, error: "CODE_USAGE_LIMIT_REACHED" });
  });
});

// ── evaluateDiscountCode — once per customer ────────────────

describe("evaluateDiscountCode — once per customer", () => {
  it("returns CONDITION_NOT_MET when guestEmail absent and ONCE_PER_CUSTOMER present", async () => {
    const discount = makeDiscount({
      conditions: [{ id: "c1", discountId: "disc_1", type: "ONCE_PER_CUSTOMER", intValue: null, stringValue: null, jsonValue: null }],
    });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode({ ...baseInput, guestEmail: undefined });
    expect(result).toEqual({ valid: false, error: "CONDITION_NOT_MET" });
  });

  it("returns ONCE_PER_CUSTOMER_VIOLATED when customer has already used discount", async () => {
    const discount = makeDiscount({
      conditions: [{ id: "c1", discountId: "disc_1", type: "ONCE_PER_CUSTOMER", intValue: null, stringValue: null, jsonValue: null }],
    });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    mockPrisma.discountUsage.findFirst.mockResolvedValue({ id: "usage_1" });
    const result = await evaluateDiscountCode(baseInput);
    expect(result).toEqual({ valid: false, error: "ONCE_PER_CUSTOMER_VIOLATED" });
  });

  it("passes when guestEmail provided and no prior usage found", async () => {
    const discount = makeDiscount({
      conditions: [{ id: "c1", discountId: "disc_1", type: "ONCE_PER_CUSTOMER", intValue: null, stringValue: null, jsonValue: null }],
    });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    mockPrisma.discountUsage.findFirst.mockResolvedValue(null);
    const result = await evaluateDiscountCode(baseInput);
    expect(result.valid).toBe(true);
  });
});

// ── evaluateDiscountCode — amount calculation ───────────────

describe("evaluateDiscountCode — amount calculation", () => {
  it("PERCENTAGE: calculates Math.floor(orderAmount * value / 10000)", async () => {
    const discount = makeDiscount({ valueType: "PERCENTAGE", value: 1500 }); // 15%
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode({ ...baseInput, orderAmount: 100000 });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(15000);
  });

  it("PERCENTAGE: uses floor not round (never rounds up)", async () => {
    const discount = makeDiscount({ valueType: "PERCENTAGE", value: 3333 }); // 33.33%
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode({ ...baseInput, orderAmount: 10000 });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(3333); // floor(10000 * 3333 / 10000) = 3333
  });

  it("FIXED_AMOUNT: returns value when less than orderAmount", async () => {
    const discount = makeDiscount({ valueType: "FIXED_AMOUNT", value: 5000 });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode({ ...baseInput, orderAmount: 100000 });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(5000);
  });

  it("FIXED_AMOUNT: never returns more than orderAmount", async () => {
    const discount = makeDiscount({ valueType: "FIXED_AMOUNT", value: 200000 });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode({ ...baseInput, orderAmount: 100000 });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(100000);
  });
});

// ── evaluateDiscountCode — product scope ────────────────────

describe("evaluateDiscountCode — product scope", () => {
  it("returns CONDITION_NOT_MET when appliesToAllProducts is false and no cart product matches", async () => {
    const discount = makeDiscount({
      appliesToAllProducts: false,
      targetedProducts: [{ id: "tp1", discountId: "disc_1", productId: "prod_x", tenantId: "tenant_1" }],
      targetedCollections: [],
    });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode({ ...baseInput, productIds: ["prod_a"] });
    expect(result).toEqual({ valid: false, error: "CONDITION_NOT_MET" });
  });

  it("passes when appliesToAllProducts is false and cart contains a targeted product", async () => {
    const discount = makeDiscount({
      appliesToAllProducts: false,
      targetedProducts: [{ id: "tp1", discountId: "disc_1", productId: "prod_a", tenantId: "tenant_1" }],
      targetedCollections: [],
    });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode({ ...baseInput, productIds: ["prod_a"] });
    expect(result.valid).toBe(true);
  });
});

// ── evaluateDiscountCode — customer scope ───────────────────

describe("evaluateDiscountCode — customer scope", () => {
  it("returns CONDITION_NOT_MET when appliesToAllCustomers is false and no segment matches", async () => {
    const discount = makeDiscount({
      appliesToAllCustomers: false,
      targetedSegments: [{ id: "ts1", discountId: "disc_1", segmentId: "seg_gold", tenantId: "tenant_1" }],
      targetedCustomers: [],
    });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    mockPrisma.guestAccount.findFirst.mockResolvedValue({
      id: "acc_1",
      segmentMemberships: [{ segmentId: "seg_silver" }],
    });
    const result = await evaluateDiscountCode(baseInput);
    expect(result).toEqual({ valid: false, error: "CONDITION_NOT_MET" });
  });

  it("passes when appliesToAllCustomers is false and guest is in targeted segment", async () => {
    const discount = makeDiscount({
      appliesToAllCustomers: false,
      targetedSegments: [{ id: "ts1", discountId: "disc_1", segmentId: "seg_vip", tenantId: "tenant_1" }],
      targetedCustomers: [],
    });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    mockPrisma.guestAccount.findFirst
      .mockResolvedValueOnce({ id: "acc_1", segmentMemberships: [{ segmentId: "seg_vip" }] })
      .mockResolvedValueOnce({ id: "acc_1" });
    const result = await evaluateDiscountCode(baseInput);
    expect(result.valid).toBe(true);
  });
});

// ── evaluateDiscountCode — minimum requirements ─────────────

describe("evaluateDiscountCode — minimum requirements", () => {
  it("returns CONDITION_NOT_MET when orderAmount < minimumAmount", async () => {
    const discount = makeDiscount({ minimumAmount: 200000 });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode({ ...baseInput, orderAmount: 100000 });
    expect(result).toEqual({ valid: false, error: "CONDITION_NOT_MET" });
  });

  it("returns CONDITION_NOT_MET when itemCount < minimumQuantity", async () => {
    const discount = makeDiscount({ minimumQuantity: 5 });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode({ ...baseInput, itemCount: 2 });
    expect(result).toEqual({ valid: false, error: "CONDITION_NOT_MET" });
  });

  it("passes when minimumAmount is null", async () => {
    const discount = makeDiscount({ minimumAmount: null });
    mockFindDiscountCode.mockResolvedValue(makeCodeRecord(discount));
    const result = await evaluateDiscountCode(baseInput);
    expect(result.valid).toBe(true);
  });
});
