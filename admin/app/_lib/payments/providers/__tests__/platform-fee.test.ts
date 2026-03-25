import { describe, it, expect } from "vitest";
import {
  getPlatformFeeBps,
  calculateApplicationFee,
  formatFeeBps,
} from "../../platform-fee";

describe("getPlatformFeeBps", () => {
  it("returns plan default when no override", () => {
    expect(getPlatformFeeBps("BASIC")).toBe(500);
    expect(getPlatformFeeBps("GROW")).toBe(400);
    expect(getPlatformFeeBps("PRO")).toBe(350);
  });

  it("returns override when provided", () => {
    expect(getPlatformFeeBps("BASIC", 250)).toBe(250);
    expect(getPlatformFeeBps("PRO", 600)).toBe(600);
  });

  it("returns plan default when override is null", () => {
    expect(getPlatformFeeBps("GROW", null)).toBe(400);
  });
});

describe("calculateApplicationFee", () => {
  it("50000 öre at 500 bps = 2500 öre (5%)", () => {
    expect(calculateApplicationFee(50000, 500)).toBe(2500);
  });

  it("50000 öre at 350 bps = 1750 öre (3.5%)", () => {
    expect(calculateApplicationFee(50000, 350)).toBe(1750);
  });

  it("rounds DOWN — never overcharges", () => {
    // 333 * 500 / 10000 = 16.65 → floor = 16
    expect(calculateApplicationFee(333, 500)).toBe(16);
    // 1 * 500 / 10000 = 0.05 → floor = 0
    expect(calculateApplicationFee(1, 500)).toBe(0);
  });

  it("100000 öre at 400 bps = 4000 öre (4%)", () => {
    expect(calculateApplicationFee(100000, 400)).toBe(4000);
  });
});

describe("formatFeeBps", () => {
  it("500 → 5.0%", () => {
    expect(formatFeeBps(500)).toBe("5.0%");
  });

  it("350 → 3.5%", () => {
    expect(formatFeeBps(350)).toBe("3.5%");
  });

  it("400 → 4.0%", () => {
    expect(formatFeeBps(400)).toBe("4.0%");
  });

  it("250 → 2.5%", () => {
    expect(formatFeeBps(250)).toBe("2.5%");
  });
});
