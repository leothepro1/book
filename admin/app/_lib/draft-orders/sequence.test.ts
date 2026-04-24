import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = { $queryRaw: vi.fn() };

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));

const { nextDraftDisplayNumber } = await import("./sequence");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("nextDraftDisplayNumber — format", () => {
  it("formats as D-YYYY-NNNN with 4-digit zero padding", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ lastNumber: 1001 }]);
    const out = await nextDraftDisplayNumber("tenant_1");
    const year = new Date().getUTCFullYear();
    expect(out).toBe(`D-${year}-1001`);
  });

  it("pads single-digit counter to 4 digits", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ lastNumber: 7 }]);
    const out = await nextDraftDisplayNumber("tenant_1");
    expect(out).toMatch(/^D-\d{4}-0007$/);
  });

  it("keeps 5-digit counter unchanged (padStart is non-destructive)", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ lastNumber: 12345 }]);
    const out = await nextDraftDisplayNumber("tenant_1");
    expect(out).toMatch(/^D-\d{4}-12345$/);
  });
});

describe("nextDraftDisplayNumber — distinct results on rapid calls", () => {
  it("returns distinct numbers when DB returns incremented values", async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ lastNumber: 1001 }])
      .mockResolvedValueOnce([{ lastNumber: 1002 }])
      .mockResolvedValueOnce([{ lastNumber: 1003 }]);

    const results = await Promise.all([
      nextDraftDisplayNumber("t"),
      nextDraftDisplayNumber("t"),
      nextDraftDisplayNumber("t"),
    ]);
    const year = new Date().getUTCFullYear();
    expect(results).toEqual([
      `D-${year}-1001`,
      `D-${year}-1002`,
      `D-${year}-1003`,
    ]);
  });
});

describe("nextDraftDisplayNumber — tx injection", () => {
  it("uses the provided tx client when passed", async () => {
    const mockTx = { $queryRaw: vi.fn().mockResolvedValue([{ lastNumber: 1001 }]) };
    const out = await nextDraftDisplayNumber("t", mockTx as never);

    expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(out).toMatch(/^D-\d{4}-1001$/);
  });

  it("falls back to global prisma when tx is omitted", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ lastNumber: 1001 }]);
    await nextDraftDisplayNumber("t");
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
