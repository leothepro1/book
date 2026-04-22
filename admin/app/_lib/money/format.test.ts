import { describe, it, expect } from "vitest";
import { formatSek } from "./format";

describe("formatSek", () => {
  it("returns em-dash for null / undefined", () => {
    expect(formatSek(null)).toBe("—");
    expect(formatSek(undefined)).toBe("—");
  });

  it("formats zero without decimals", () => {
    expect(formatSek(0)).toBe("0 kr");
    expect(formatSek(BigInt(0))).toBe("0 kr");
  });

  it("formats round amounts without decimals (Int input)", () => {
    expect(formatSek(12900)).toBe("129 kr");
    expect(formatSek(1)).toBe("0,01 kr"); // 1 öre
  });

  it("formats fractional amounts with two decimals", () => {
    expect(formatSek(12950)).toBe("129,50 kr");
    expect(formatSek(100_01)).toBe("100,01 kr");
  });

  it("Swedish thin-space grouping at thousand boundaries", () => {
    // sv-SE Intl uses   (no-break space) between digit groups.
    const out = formatSek(1_234_567_89); // 1 234 567,89 kr
    expect(out).toMatch(/^1.234.567,89 kr$/);
  });

  it("BigInt above Number.MAX_SAFE_INTEGER preserves precision", () => {
    // 1 × 10^18 ören ≈ 10^16 SEK — way past Int32; precision must hold.
    const huge = BigInt("1000000000000000000");
    const out = formatSek(huge);
    // Should be "10 000 000 000 000 000 kr" (10 quadrillion SEK), no decimals.
    expect(out.endsWith(" kr")).toBe(true);
    expect(out).not.toContain(",");
    // Digit count: 17 digits of "1" followed by 16 zeros = one 1 and 16 zeros
    const digits = out.replace(/\s/g, "").replace(" kr", "");
    expect(digits.replace(/\D/g, "")).toBe("10000000000000000");
  });

  it("negative amounts show a minus sign", () => {
    expect(formatSek(-50_00)).toBe("-50 kr");
    expect(formatSek(BigInt(-12345))).toBe("-123,45 kr");
  });

  it("showDecimals=false drops minor units entirely", () => {
    expect(formatSek(12950, { showDecimals: false })).toBe("129 kr");
    expect(formatSek(12999, { showDecimals: false })).toBe("129 kr");
  });

  it("currency override swaps the suffix", () => {
    expect(formatSek(12900, { currency: "EUR" })).toBe("129 EUR");
  });

  it("accepts Int inputs identically to BigInt", () => {
    expect(formatSek(42_00)).toBe(formatSek(BigInt(4200)));
  });
});
