import { describe, it, expect } from "vitest";
import { evaluateCondition, evaluateAllConditions, type ConditionContext } from "./eligibility";
import type { DiscountCondition, DiscountConditionType } from "@prisma/client";

// ── Helpers ──────────────────────────────────────────────────

function cond(type: DiscountConditionType, overrides: Partial<DiscountCondition> = {}): DiscountCondition {
  return {
    id: "cond_test",
    discountId: "disc_test",
    type,
    intValue: null,
    stringValue: null,
    jsonValue: null,
    ...overrides,
  };
}

const baseCtx: ConditionContext = {
  orderAmount: 100000,       // 1000 SEK
  productIds: ["prod_a", "prod_b"],
  itemCount: 2,
  guestEmail: "guest@test.com",
  guestAccountId: "acc_123",
  guestSegmentIds: ["seg_vip"],
  checkInDate: new Date("2026-06-01"),
  checkOutDate: new Date("2026-06-04"),
  nights: 3,
  now: new Date("2026-04-01"),
  buyerKind: "GUEST",
};

function ctx(overrides: Partial<ConditionContext> = {}): ConditionContext {
  return { ...baseCtx, ...overrides };
}

// ── MIN_NIGHTS ──────────────────────────────────────────────

describe("evaluateCondition — MIN_NIGHTS", () => {
  it("passes when nights equals intValue (boundary)", () => {
    expect(evaluateCondition(cond("MIN_NIGHTS", { intValue: 3 }), ctx())).toBe(true);
  });

  it("passes when nights exceeds intValue", () => {
    expect(evaluateCondition(cond("MIN_NIGHTS", { intValue: 2 }), ctx())).toBe(true);
  });

  it("fails when nights is below intValue", () => {
    expect(evaluateCondition(cond("MIN_NIGHTS", { intValue: 5 }), ctx())).toBe(false);
  });

  it("fails when intValue is null", () => {
    expect(evaluateCondition(cond("MIN_NIGHTS", { intValue: null }), ctx())).toBe(false);
  });

  it("fails when nights is 0", () => {
    expect(evaluateCondition(cond("MIN_NIGHTS", { intValue: 1 }), ctx({ nights: 0 }))).toBe(false);
  });
});

// ── DAYS_IN_ADVANCE ─────────────────────────────────────────

describe("evaluateCondition — DAYS_IN_ADVANCE", () => {
  it("passes when booking is exactly intValue days ahead (boundary)", () => {
    expect(evaluateCondition(cond("DAYS_IN_ADVANCE", { intValue: 61 }), ctx())).toBe(true);
  });

  it("passes when booking is more than intValue days ahead", () => {
    expect(evaluateCondition(cond("DAYS_IN_ADVANCE", { intValue: 30 }), ctx())).toBe(true);
  });

  it("fails when booking is less than intValue days ahead", () => {
    expect(evaluateCondition(cond("DAYS_IN_ADVANCE", { intValue: 90 }), ctx())).toBe(false);
  });

  it("fails when checkInDate is undefined", () => {
    expect(evaluateCondition(cond("DAYS_IN_ADVANCE", { intValue: 10 }), ctx({ checkInDate: undefined }))).toBe(false);
  });

  it("fails when intValue is null", () => {
    expect(evaluateCondition(cond("DAYS_IN_ADVANCE", { intValue: null }), ctx())).toBe(false);
  });
});

// ── ARRIVAL_WINDOW ──────────────────────────────────────────

describe("evaluateCondition — ARRIVAL_WINDOW", () => {
  const window = { startsAt: "2026-05-01", endsAt: "2026-07-01" };

  it("passes when checkInDate is exactly on startsAt (inclusive)", () => {
    expect(evaluateCondition(
      cond("ARRIVAL_WINDOW", { jsonValue: window }),
      ctx({ checkInDate: new Date("2026-05-01") }),
    )).toBe(true);
  });

  it("passes when checkInDate is exactly on endsAt (inclusive)", () => {
    expect(evaluateCondition(
      cond("ARRIVAL_WINDOW", { jsonValue: window }),
      ctx({ checkInDate: new Date("2026-07-01") }),
    )).toBe(true);
  });

  it("passes when checkInDate is within the window", () => {
    expect(evaluateCondition(
      cond("ARRIVAL_WINDOW", { jsonValue: window }),
      ctx(),
    )).toBe(true);
  });

  it("fails when checkInDate is before startsAt", () => {
    expect(evaluateCondition(
      cond("ARRIVAL_WINDOW", { jsonValue: window }),
      ctx({ checkInDate: new Date("2026-04-30") }),
    )).toBe(false);
  });

  it("fails when checkInDate is after endsAt", () => {
    expect(evaluateCondition(
      cond("ARRIVAL_WINDOW", { jsonValue: window }),
      ctx({ checkInDate: new Date("2026-07-02") }),
    )).toBe(false);
  });

  it("fails when checkInDate is undefined", () => {
    expect(evaluateCondition(
      cond("ARRIVAL_WINDOW", { jsonValue: window }),
      ctx({ checkInDate: undefined }),
    )).toBe(false);
  });

  it("fails when jsonValue is null", () => {
    expect(evaluateCondition(
      cond("ARRIVAL_WINDOW", { jsonValue: null }),
      ctx(),
    )).toBe(false);
  });

  it("fails when jsonValue is malformed (not an object)", () => {
    expect(evaluateCondition(
      cond("ARRIVAL_WINDOW", { jsonValue: "invalid" }),
      ctx(),
    )).toBe(false);
  });

  it("fails when jsonValue is missing startsAt", () => {
    expect(evaluateCondition(
      cond("ARRIVAL_WINDOW", { jsonValue: { endsAt: "2026-07-01" } }),
      ctx(),
    )).toBe(false);
  });

  it("fails when jsonValue is missing endsAt", () => {
    expect(evaluateCondition(
      cond("ARRIVAL_WINDOW", { jsonValue: { startsAt: "2026-05-01" } }),
      ctx(),
    )).toBe(false);
  });
});

// ── MIN_ORDER_AMOUNT ────────────────────────────────────────

describe("evaluateCondition — MIN_ORDER_AMOUNT", () => {
  it("passes at exactly the minimum (boundary)", () => {
    expect(evaluateCondition(cond("MIN_ORDER_AMOUNT", { intValue: 100000 }), ctx())).toBe(true);
  });

  it("passes above the minimum", () => {
    expect(evaluateCondition(cond("MIN_ORDER_AMOUNT", { intValue: 50000 }), ctx())).toBe(true);
  });

  it("fails below the minimum", () => {
    expect(evaluateCondition(cond("MIN_ORDER_AMOUNT", { intValue: 200000 }), ctx())).toBe(false);
  });

  it("fails when intValue is null", () => {
    expect(evaluateCondition(cond("MIN_ORDER_AMOUNT", { intValue: null }), ctx())).toBe(false);
  });
});

// ── MIN_ITEMS ───────────────────────────────────────────────

describe("evaluateCondition — MIN_ITEMS", () => {
  it("passes at exactly the minimum (boundary)", () => {
    expect(evaluateCondition(cond("MIN_ITEMS", { intValue: 2 }), ctx())).toBe(true);
  });

  it("passes above the minimum", () => {
    expect(evaluateCondition(cond("MIN_ITEMS", { intValue: 1 }), ctx())).toBe(true);
  });

  it("fails below the minimum", () => {
    expect(evaluateCondition(cond("MIN_ITEMS", { intValue: 5 }), ctx())).toBe(false);
  });

  it("fails when intValue is null", () => {
    expect(evaluateCondition(cond("MIN_ITEMS", { intValue: null }), ctx())).toBe(false);
  });
});

// ── SPECIFIC_PRODUCTS ───────────────────────────────────────

describe("evaluateCondition — SPECIFIC_PRODUCTS", () => {
  it("passes when cart contains at least one matching productId", () => {
    expect(evaluateCondition(
      cond("SPECIFIC_PRODUCTS", { jsonValue: ["prod_a", "prod_c"] }),
      ctx(),
    )).toBe(true);
  });

  it("passes when cart contains multiple matching productIds", () => {
    expect(evaluateCondition(
      cond("SPECIFIC_PRODUCTS", { jsonValue: ["prod_a", "prod_b"] }),
      ctx(),
    )).toBe(true);
  });

  it("fails when cart contains no matching productIds", () => {
    expect(evaluateCondition(
      cond("SPECIFIC_PRODUCTS", { jsonValue: ["prod_x", "prod_y"] }),
      ctx(),
    )).toBe(false);
  });

  it("fails when jsonValue is null", () => {
    expect(evaluateCondition(
      cond("SPECIFIC_PRODUCTS", { jsonValue: null }),
      ctx(),
    )).toBe(false);
  });

  it("fails when jsonValue is empty array", () => {
    expect(evaluateCondition(
      cond("SPECIFIC_PRODUCTS", { jsonValue: [] }),
      ctx(),
    )).toBe(false);
  });

  it("fails when jsonValue is not an array (malformed)", () => {
    expect(evaluateCondition(
      cond("SPECIFIC_PRODUCTS", { jsonValue: { ids: ["prod_a"] } }),
      ctx(),
    )).toBe(false);
  });
});

// ── CUSTOMER_SEGMENT ────────────────────────────────────────

describe("evaluateCondition — CUSTOMER_SEGMENT", () => {
  it("passes when guestSegmentIds contains the segment", () => {
    expect(evaluateCondition(
      cond("CUSTOMER_SEGMENT", { stringValue: "seg_vip" }),
      ctx(),
    )).toBe(true);
  });

  it("fails when guestSegmentIds is empty", () => {
    expect(evaluateCondition(
      cond("CUSTOMER_SEGMENT", { stringValue: "seg_vip" }),
      ctx({ guestSegmentIds: [] }),
    )).toBe(false);
  });

  it("fails when guestSegmentIds does not contain the segment", () => {
    expect(evaluateCondition(
      cond("CUSTOMER_SEGMENT", { stringValue: "seg_other" }),
      ctx(),
    )).toBe(false);
  });

  it("fails when stringValue is null", () => {
    expect(evaluateCondition(
      cond("CUSTOMER_SEGMENT", { stringValue: null }),
      ctx(),
    )).toBe(false);
  });
});

// ── ONCE_PER_CUSTOMER ───────────────────────────────────────

describe("evaluateCondition — ONCE_PER_CUSTOMER", () => {
  it("always returns true (DB check is in engine)", () => {
    expect(evaluateCondition(cond("ONCE_PER_CUSTOMER"), ctx())).toBe(true);
  });
});

// ── Unknown condition type ──────────────────────────────────

describe("evaluateCondition — unknown type", () => {
  it("returns false (fail closed)", () => {
    expect(evaluateCondition(cond("UNKNOWN_TYPE" as DiscountConditionType), ctx())).toBe(false);
  });
});

// ── evaluateAllConditions ───────────────────────────────────

describe("evaluateAllConditions", () => {
  it("returns true when all conditions pass", () => {
    expect(evaluateAllConditions([
      cond("MIN_NIGHTS", { intValue: 2 }),
      cond("MIN_ORDER_AMOUNT", { intValue: 50000 }),
    ], ctx())).toBe(true);
  });

  it("returns false when any condition fails", () => {
    expect(evaluateAllConditions([
      cond("MIN_NIGHTS", { intValue: 2 }),
      cond("MIN_ORDER_AMOUNT", { intValue: 999999 }),
    ], ctx())).toBe(false);
  });

  it("returns true for empty conditions array", () => {
    expect(evaluateAllConditions([], ctx())).toBe(true);
  });

  it("returns false when first condition fails regardless of second", () => {
    expect(evaluateAllConditions([
      cond("MIN_NIGHTS", { intValue: 999 }),
      cond("ONCE_PER_CUSTOMER"),
    ], ctx())).toBe(false);
  });
});
