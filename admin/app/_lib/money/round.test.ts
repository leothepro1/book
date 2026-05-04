import { describe, it, expect } from "vitest";
import { roundHalfToEven, roundTaxAmount } from "./round";

describe("roundHalfToEven — exact halfway values (banker's rounding)", () => {
  it("0.5 → 0 (round to even)", () => {
    expect(roundHalfToEven(0.5)).toBe(0);
  });

  it("1.5 → 2 (round to even)", () => {
    expect(roundHalfToEven(1.5)).toBe(2);
  });

  it("2.5 → 2 (round to even, NOT 3 like JS Math.round)", () => {
    expect(roundHalfToEven(2.5)).toBe(2);
    // Sanity: JS default differs.
    expect(Math.round(2.5)).toBe(3);
  });

  it("3.5 → 4 (round to even)", () => {
    expect(roundHalfToEven(3.5)).toBe(4);
  });

  it("4.5 → 4 (round to even)", () => {
    expect(roundHalfToEven(4.5)).toBe(4);
  });

  it("100.5 → 100 (round to even)", () => {
    expect(roundHalfToEven(100.5)).toBe(100);
  });
});

describe("roundHalfToEven — negative halfway values", () => {
  it("-0.5 → 0 (normalized, not -0)", () => {
    const result = roundHalfToEven(-0.5);
    expect(result).toBe(0);
    expect(Object.is(result, 0)).toBe(true);
  });

  it("-1.5 → -2 (round to even)", () => {
    expect(roundHalfToEven(-1.5)).toBe(-2);
  });

  it("-2.5 → -2 (round to even)", () => {
    expect(roundHalfToEven(-2.5)).toBe(-2);
  });

  it("-3.5 → -4 (round to even)", () => {
    expect(roundHalfToEven(-3.5)).toBe(-4);
  });
});

describe("roundHalfToEven — non-halfway values (normal round)", () => {
  it("2.49 → 2", () => {
    expect(roundHalfToEven(2.49)).toBe(2);
  });

  it("2.51 → 3", () => {
    expect(roundHalfToEven(2.51)).toBe(3);
  });

  it("2.4999 → 2", () => {
    expect(roundHalfToEven(2.4999)).toBe(2);
  });

  it("2.5001 → 3", () => {
    expect(roundHalfToEven(2.5001)).toBe(3);
  });

  it("-2.49 → -2", () => {
    expect(roundHalfToEven(-2.49)).toBe(-2);
  });

  it("-2.51 → -3", () => {
    expect(roundHalfToEven(-2.51)).toBe(-3);
  });
});

describe("roundHalfToEven — zero and very small values", () => {
  it("0 → 0", () => {
    expect(roundHalfToEven(0)).toBe(0);
  });

  it("0.0001 → 0", () => {
    expect(roundHalfToEven(0.0001)).toBe(0);
  });

  it("-0.0001 → 0 (normalized)", () => {
    expect(roundHalfToEven(-0.0001)).toBe(0);
  });
});

describe("roundHalfToEven — large values", () => {
  it("Number.MAX_SAFE_INTEGER passes through", () => {
    expect(roundHalfToEven(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("1_000_000.5 → 1_000_000 (even)", () => {
    expect(roundHalfToEven(1_000_000.5)).toBe(1_000_000);
  });

  it("1_000_001.5 → 1_000_002 (even)", () => {
    expect(roundHalfToEven(1_000_001.5)).toBe(1_000_002);
  });
});

describe("roundHalfToEven — invalid inputs throw", () => {
  it("NaN throws", () => {
    expect(() => roundHalfToEven(Number.NaN)).toThrow(/finite/);
  });

  it("Infinity throws", () => {
    expect(() => roundHalfToEven(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });

  it("-Infinity throws", () => {
    expect(() => roundHalfToEven(Number.NEGATIVE_INFINITY)).toThrow(/finite/);
  });
});

describe("Shopify rounding parity fixtures (recon §D Q10)", () => {
  // Per recon: Shopify rounds at the cents-amount post-multiply.
  // 2.685 SEK * 100 = 268.5 öre → banker's rounding → 268 öre.
  // 2.6982 SEK * 100 ≈ 269.82 öre → not halfway → 270 öre.

  it("268.5 öre → 268 (matches 2.685 SEK fixture)", () => {
    expect(roundHalfToEven(268.5)).toBe(268);
  });

  it("269.82 öre → 270 (matches 2.6982 SEK fixture)", () => {
    expect(roundHalfToEven(269.82)).toBe(270);
  });

  it("contrasts JS Math.round on the same fixtures", () => {
    // JS Math.round(268.5) = 269 — half-away-from-zero, biased upward.
    expect(Math.round(268.5)).toBe(269);
    // Confirms why we need the helper: Math.round drifts upward at scale.
  });
});

describe("roundTaxAmount — wrapper", () => {
  it("delegates to roundHalfToEven", () => {
    expect(roundTaxAmount(2.5)).toBe(2);
    expect(roundTaxAmount(3.5)).toBe(4);
    expect(roundTaxAmount(268.5)).toBe(268);
  });
});
