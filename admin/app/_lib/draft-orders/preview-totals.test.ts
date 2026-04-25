import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    accommodation: { findMany: vi.fn() },
  },
}));

vi.mock("@/app/_lib/discounts/apply", () => ({
  calculateDiscountImpact: vi.fn(),
}));

vi.mock("./lines", () => ({
  resolveLineForAdd: vi.fn(),
}));

import { prisma } from "@/app/_lib/db/prisma";
import { calculateDiscountImpact } from "@/app/_lib/discounts/apply";
import { resolveLineForAdd } from "./lines";
import { previewDraftTotals } from "./preview-totals";

const findManyMock = prisma.accommodation.findMany as unknown as ReturnType<typeof vi.fn>;
const resolveLineMock = resolveLineForAdd as unknown as ReturnType<typeof vi.fn>;
const discountMock = calculateDiscountImpact as unknown as ReturnType<typeof vi.fn>;

const TENANT = "tenant_t";

function makeAccRow(id: string, taxRate = 1200, currency = "SEK") {
  return { id, taxRate, currency };
}

function makeResolvedAcc(unitPriceOren: number, nights: number) {
  return {
    kind: "ACCOMMODATION" as const,
    unitPriceCents: BigInt(unitPriceOren),
    subtotalCents: BigInt(unitPriceOren * nights),
    currency: "SEK",
    nights,
    title: "Stuga A",
    ratePlanId: "rp_1",
    ratePlanName: "Standard",
    ratePlanCancellationPolicy: null,
    appliedCatalogId: null,
    appliedRule: "LIVE_PMS" as const,
  };
}

function makeLine(accommodationId: string, fromIso: string, toIso: string, guestCount = 2) {
  return {
    accommodationId,
    fromDate: new Date(fromIso),
    toDate: new Date(toIso),
    guestCount,
  };
}

beforeEach(() => {
  findManyMock.mockReset();
  resolveLineMock.mockReset();
  discountMock.mockReset();
});

describe("previewDraftTotals — empty + single line", () => {
  it("T1 — empty lines → all-zero totals + SEK default", async () => {
    const result = await previewDraftTotals({ tenantId: TENANT, lines: [] });
    expect(result.subtotal).toBe(BigInt(0));
    expect(result.total).toBe(BigInt(0));
    expect(result.currency).toBe("SEK");
    expect(result.lineBreakdown).toHaveLength(0);
    expect(result.discountApplicable).toBe(false);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("T2 — single line no discount → subtotal = unitPrice × nights", async () => {
    findManyMock.mockResolvedValueOnce([makeAccRow("acc_1")]);
    resolveLineMock.mockResolvedValueOnce(makeResolvedAcc(50000, 3)); // 500 kr × 3 nights = 1500 kr
    const result = await previewDraftTotals({
      tenantId: TENANT,
      lines: [makeLine("acc_1", "2026-05-01", "2026-05-04")],
    });
    expect(result.subtotal).toBe(BigInt(150000));
    expect(result.lineBreakdown[0].nights).toBe(3);
    expect(result.lineBreakdown[0].pricePerNight).toBe(BigInt(50000));
    expect(result.lineBreakdown[0].lineSubtotal).toBe(BigInt(150000));
  });
});

describe("previewDraftTotals — multi-line + parallelism", () => {
  it("T3 — 3 lines via Promise.all (all started concurrently)", async () => {
    findManyMock.mockResolvedValueOnce([
      makeAccRow("acc_1"),
      makeAccRow("acc_2"),
      makeAccRow("acc_3"),
    ]);
    let concurrentInFlight = 0;
    let maxConcurrent = 0;
    resolveLineMock.mockImplementation(async () => {
      concurrentInFlight++;
      maxConcurrent = Math.max(maxConcurrent, concurrentInFlight);
      await new Promise((r) => setTimeout(r, 5));
      concurrentInFlight--;
      return makeResolvedAcc(40000, 2);
    });
    const result = await previewDraftTotals({
      tenantId: TENANT,
      lines: [
        makeLine("acc_1", "2026-05-01", "2026-05-03"),
        makeLine("acc_2", "2026-05-01", "2026-05-03"),
        makeLine("acc_3", "2026-05-01", "2026-05-03"),
      ],
    });
    expect(maxConcurrent).toBe(3); // All three started before any resolved
    expect(result.subtotal).toBe(BigInt(40000 * 2 * 3));
    expect(result.lineBreakdown).toHaveLength(3);
  });
});

describe("previewDraftTotals — discount handling", () => {
  it("T4 — valid discount → discountApplicable: true + amount > 0", async () => {
    findManyMock.mockResolvedValueOnce([makeAccRow("acc_1")]);
    resolveLineMock.mockResolvedValueOnce(makeResolvedAcc(100000, 2));
    discountMock.mockResolvedValueOnce({
      valid: true,
      discount: { id: "d1", valueType: "PERCENTAGE", value: 10 },
      discountCodeId: "dc1",
      discountCodeValue: "SUMMER10",
      discountAmount: 20000,
      allocations: { scope: "ORDER", amount: 20000 },
      title: "Summer 10%",
      description: null,
      buyerKind: "GUEST",
    });
    const result = await previewDraftTotals({
      tenantId: TENANT,
      lines: [makeLine("acc_1", "2026-05-01", "2026-05-03")],
      discountCode: "SUMMER10",
    });
    expect(result.discountApplicable).toBe(true);
    expect(result.discountAmount).toBeGreaterThan(BigInt(0));
  });

  it("T5 — invalid discount → discountApplicable: false + error message", async () => {
    findManyMock.mockResolvedValueOnce([makeAccRow("acc_1")]);
    resolveLineMock.mockResolvedValueOnce(makeResolvedAcc(50000, 2));
    discountMock.mockResolvedValueOnce({
      valid: false,
      error: "Code expired",
    });
    const result = await previewDraftTotals({
      tenantId: TENANT,
      lines: [makeLine("acc_1", "2026-05-01", "2026-05-03")],
      discountCode: "EXPIRED",
    });
    expect(result.discountApplicable).toBe(false);
    expect(result.discountError).toBe("Code expired");
    // Total uses no discount.
    expect(result.discountAmount).toBe(BigInt(0));
  });
});

describe("previewDraftTotals — tenant + line failures", () => {
  it("T6 — cross-tenant accommodation → empty result (fail closed)", async () => {
    // Request 2 accommodations but findMany only returns 1 (other belongs to another tenant).
    findManyMock.mockResolvedValueOnce([makeAccRow("acc_1")]);
    const result = await previewDraftTotals({
      tenantId: TENANT,
      lines: [
        makeLine("acc_1", "2026-05-01", "2026-05-03"),
        makeLine("acc_other", "2026-05-01", "2026-05-03"),
      ],
    });
    expect(result.subtotal).toBe(BigInt(0));
    expect(result.lineBreakdown).toHaveLength(0);
    expect(resolveLineMock).not.toHaveBeenCalled();
  });

  it("T7 — single line resolveLineForAdd fails → marked unavailable, others sum", async () => {
    findManyMock.mockResolvedValueOnce([
      makeAccRow("acc_1"),
      makeAccRow("acc_2"),
      makeAccRow("acc_3"),
    ]);
    resolveLineMock
      .mockResolvedValueOnce(makeResolvedAcc(30000, 2))
      .mockRejectedValueOnce(new Error("PMS error: not bookable"))
      .mockResolvedValueOnce(makeResolvedAcc(50000, 2));
    const result = await previewDraftTotals({
      tenantId: TENANT,
      lines: [
        makeLine("acc_1", "2026-05-01", "2026-05-03"),
        makeLine("acc_2", "2026-05-01", "2026-05-03"),
        makeLine("acc_3", "2026-05-01", "2026-05-03"),
      ],
    });
    expect(result.lineBreakdown).toHaveLength(3);
    expect(result.lineBreakdown[1].unavailable).toBe(true);
    expect(result.lineBreakdown[1].unavailableReason).toContain("PMS error");
    // Subtotal should sum line 0 (60000) + line 2 (100000) = 160000, exclude line 1.
    expect(result.subtotal).toBe(BigInt(160000));
  });
});

describe("previewDraftTotals — currency", () => {
  it("T8 — currency default 'SEK' when not specified + no accommodations either", async () => {
    const result = await previewDraftTotals({ tenantId: TENANT, lines: [] });
    expect(result.currency).toBe("SEK");
  });

  it("T9 — explicit currency override respected", async () => {
    findManyMock.mockResolvedValueOnce([makeAccRow("acc_1", 1200, "EUR")]);
    resolveLineMock.mockResolvedValueOnce({
      ...makeResolvedAcc(40000, 2),
      currency: "EUR",
    });
    const result = await previewDraftTotals({
      tenantId: TENANT,
      lines: [makeLine("acc_1", "2026-05-01", "2026-05-03")],
      currency: "NOK",
    });
    expect(result.currency).toBe("NOK"); // Explicit param wins.
  });
});

describe("previewDraftTotals — breakdown shape", () => {
  it("T10 — addons echoed in breakdown with zero cost (preview-only)", async () => {
    findManyMock.mockResolvedValueOnce([makeAccRow("acc_1")]);
    resolveLineMock.mockResolvedValueOnce(makeResolvedAcc(50000, 1));
    const result = await previewDraftTotals({
      tenantId: TENANT,
      lines: [
        {
          accommodationId: "acc_1",
          fromDate: new Date("2026-05-01"),
          toDate: new Date("2026-05-02"),
          guestCount: 2,
          addons: [{ id: "addon_1", quantity: 2 }],
        },
      ],
    });
    expect(result.lineBreakdown[0].addonsTotal).toBe(BigInt(0));
  });

  it("T11 — breakdown order matches input.lines order (index-stable)", async () => {
    findManyMock.mockResolvedValueOnce([
      makeAccRow("acc_a"),
      makeAccRow("acc_b"),
      makeAccRow("acc_c"),
    ]);
    // Resolve in REVERSE order via timing — last finishes first.
    let count = 0;
    resolveLineMock.mockImplementation(async () => {
      const my = count++;
      await new Promise((r) => setTimeout(r, (3 - my) * 5));
      return makeResolvedAcc(10000 * (my + 1), 1);
    });
    const result = await previewDraftTotals({
      tenantId: TENANT,
      lines: [
        makeLine("acc_a", "2026-05-01", "2026-05-02"),
        makeLine("acc_b", "2026-05-01", "2026-05-02"),
        makeLine("acc_c", "2026-05-01", "2026-05-02"),
      ],
    });
    expect(result.lineBreakdown[0].accommodationId).toBe("acc_a");
    expect(result.lineBreakdown[1].accommodationId).toBe("acc_b");
    expect(result.lineBreakdown[2].accommodationId).toBe("acc_c");
  });

  it("T12 — totals use BigInt throughout, never number", async () => {
    findManyMock.mockResolvedValueOnce([makeAccRow("acc_1")]);
    resolveLineMock.mockResolvedValueOnce(makeResolvedAcc(99999, 7));
    const result = await previewDraftTotals({
      tenantId: TENANT,
      lines: [makeLine("acc_1", "2026-05-01", "2026-05-08")],
    });
    expect(typeof result.subtotal).toBe("bigint");
    expect(typeof result.total).toBe("bigint");
    expect(typeof result.discountAmount).toBe("bigint");
    expect(typeof result.taxAmount).toBe("bigint");
    expect(typeof result.lineBreakdown[0].pricePerNight).toBe("bigint");
    expect(typeof result.lineBreakdown[0].lineSubtotal).toBe("bigint");
  });
});
