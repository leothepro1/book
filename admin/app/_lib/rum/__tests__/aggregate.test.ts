import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const { calculateP75 } = await import("../aggregate");

describe("calculateP75", () => {
  it("[1..10] → P75 = 8", () => {
    expect(calculateP75([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(8);
  });

  it("[100,200,300] → null (fewer than 10)", () => {
    expect(calculateP75([100, 200, 300])).toBeNull();
  });

  it("[] → null", () => {
    expect(calculateP75([])).toBeNull();
  });

  it("9 values → null", () => {
    expect(calculateP75([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();
  });

  it("all identical → P75 = that value", () => {
    expect(calculateP75(Array(20).fill(42))).toBe(42);
  });

  it("[1..11] → P75 = 9 (ceil(11*0.75)-1 = 8-1 = index 7… wait)", () => {
    // ceil(11 * 0.75) = ceil(8.25) = 9, minus 1 = 8 → sorted[8] = 9
    expect(calculateP75([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toBe(9);
  });

  it("[1..100] → P75 = 75", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(calculateP75(values)).toBe(75);
  });

  it("unsorted input → same result as sorted", () => {
    expect(calculateP75([10, 1, 9, 2, 8, 3, 7, 4, 6, 5])).toBe(8);
  });

  it("floating point → rounded to 2 decimals", () => {
    const values = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.01);
    // [0.01..0.1], P75 index = ceil(10*0.75)-1 = 7 → 0.08
    expect(calculateP75(values)).toBe(0.08);
  });

  it("exactly 10 values (minimum threshold)", () => {
    expect(calculateP75(Array(10).fill(100))).toBe(100);
  });
});
