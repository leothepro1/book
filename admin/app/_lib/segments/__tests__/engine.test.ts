import { describe, it, expect, vi } from "vitest";

// Mock prisma before importing engine
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    guestAccount: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

const { parseSegmentQuery, compileSegmentQuery, SegmentQueryError } = await import("../engine");

describe("parseSegmentQuery", () => {
  it("parses number_of_orders >= 1", () => {
    const ast = parseSegmentQuery("number_of_orders >= 1");
    expect(ast).toEqual({
      kind: "comparison",
      attribute: "number_of_orders",
      operator: ">=",
      value: "1",
    });
  });

  it("parses last_order_date < -90d", () => {
    const ast = parseSegmentQuery("last_order_date < -90d");
    expect(ast).toEqual({
      kind: "comparison",
      attribute: "last_order_date",
      operator: "<",
      value: "-90d",
    });
  });

  it("parses customer_tags CONTAINS 'VIP'", () => {
    const ast = parseSegmentQuery("customer_tags CONTAINS 'VIP'");
    expect(ast).toEqual({
      kind: "comparison",
      attribute: "customer_tags",
      operator: "CONTAINS",
      value: "VIP",
    });
  });

  it("parses AND connector", () => {
    const ast = parseSegmentQuery("number_of_orders >= 1 AND marketing_consent = true");
    expect(ast).toEqual({
      kind: "connector",
      type: "AND",
      left: { kind: "comparison", attribute: "number_of_orders", operator: ">=", value: "1" },
      right: { kind: "comparison", attribute: "marketing_consent", operator: "=", value: "true" },
    });
  });

  it("parses OR connector", () => {
    const ast = parseSegmentQuery("number_of_orders = 0 OR last_order_date < -365d");
    expect(ast).toEqual({
      kind: "connector",
      type: "OR",
      left: { kind: "comparison", attribute: "number_of_orders", operator: "=", value: "0" },
      right: { kind: "comparison", attribute: "last_order_date", operator: "<", value: "-365d" },
    });
  });

  it("parses BETWEEN...AND", () => {
    const ast = parseSegmentQuery("last_order_date BETWEEN 2024-01-01 AND 2024-12-31");
    expect(ast).toEqual({
      kind: "comparison",
      attribute: "last_order_date",
      operator: "BETWEEN",
      value: "2024-01-01",
      valueTo: "2024-12-31",
    });
  });

  it("parses has_booking = true", () => {
    const ast = parseSegmentQuery("has_booking = true");
    expect(ast).toEqual({
      kind: "comparison",
      attribute: "has_booking",
      operator: "=",
      value: "true",
    });
  });

  it("parses amount_spent > 1000", () => {
    const ast = parseSegmentQuery("amount_spent > 1000");
    expect(ast).toEqual({
      kind: "comparison",
      attribute: "amount_spent",
      operator: ">",
      value: "1000",
    });
  });

  it("throws SegmentQueryError on unknown attribute", () => {
    expect(() => parseSegmentQuery("unknown_attribute = 1")).toThrow(SegmentQueryError);
  });

  it("throws SegmentQueryError on empty string", () => {
    expect(() => parseSegmentQuery("")).toThrow(SegmentQueryError);
  });

  it("throws SegmentQueryError on incomplete expression", () => {
    expect(() => parseSegmentQuery("number_of_orders >=")).toThrow(SegmentQueryError);
  });
});

describe("compileSegmentQuery", () => {
  const tenantId = "test-tenant-id";

  it("compiles marketing_consent = true", () => {
    const ast = parseSegmentQuery("marketing_consent = true");
    const where = compileSegmentQuery(ast, tenantId);
    expect(where).toEqual({
      tenantId,
      emailMarketingState: "SUBSCRIBED",
    });
  });

  it("compiles customer_tags CONTAINS 'VIP'", () => {
    const ast = parseSegmentQuery("customer_tags CONTAINS 'VIP'");
    const where = compileSegmentQuery(ast, tenantId);
    expect(where).toEqual({
      tenantId,
      tags: { some: { tag: "vip" } },
    });
  });

  it("compiles customer_added_date > -30d with date offset", () => {
    const ast = parseSegmentQuery("customer_added_date > -30d");
    const where = compileSegmentQuery(ast, tenantId);
    expect(where.tenantId).toBe(tenantId);
    expect(where.createdAt).toBeDefined();
    const filter = where.createdAt as { gt: Date };
    expect(filter.gt).toBeInstanceOf(Date);
    const diffDays = (Date.now() - filter.gt.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(31);
  });

  it("compiles AND connector", () => {
    const ast = parseSegmentQuery("marketing_consent = true AND customer_tags CONTAINS 'vip'");
    const where = compileSegmentQuery(ast, tenantId);
    expect(where).toEqual({
      tenantId,
      AND: [
        { emailMarketingState: "SUBSCRIBED" },
        { tags: { some: { tag: "vip" } } },
      ],
    });
  });

  it("compiles has_booking = true", () => {
    const ast = parseSegmentQuery("has_booking = true");
    const where = compileSegmentQuery(ast, tenantId);
    expect(where.tenantId).toBe(tenantId);
    expect(where.orders).toEqual({
      some: {
        tenantId,
        financialStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] },
        orderType: "ACCOMMODATION",
      },
    });
  });

  it("compiles number_of_orders >= 1 using Prisma relation filter", () => {
    const ast = parseSegmentQuery("number_of_orders >= 1");
    const where = compileSegmentQuery(ast, tenantId);
    expect(where.tenantId).toBe(tenantId);
    expect(where.orders).toEqual({
      some: {
        tenantId,
        financialStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      },
    });
  });

  it("compiles number_of_orders = 0 using Prisma relation filter", () => {
    const ast = parseSegmentQuery("number_of_orders = 0");
    const where = compileSegmentQuery(ast, tenantId);
    expect(where.tenantId).toBe(tenantId);
    expect(where.orders).toEqual({
      none: {
        tenantId,
        financialStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      },
    });
  });

  it("compiles number_of_orders >= 0 as match-all", () => {
    const ast = parseSegmentQuery("number_of_orders >= 0");
    const where = compileSegmentQuery(ast, tenantId);
    expect(where).toEqual({ tenantId });
  });
});
