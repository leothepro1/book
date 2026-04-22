import { describe, it, expect } from "vitest";
import { bigintToIntSafe, intToBigint } from "./bigint";
import { ValidationError } from "../errors/service-errors";

// Note: BigInt literals (e.g. `0n`) require ES2020 but tsconfig.target is
// ES2017 for this repo, so we use `BigInt(N)` expressions instead.

describe("bigintToIntSafe", () => {
  it("returns the number for values inside Int32 range", () => {
    expect(bigintToIntSafe(BigInt(0))).toBe(0);
    expect(bigintToIntSafe(BigInt(12345))).toBe(12345);
    expect(bigintToIntSafe(BigInt(-12345))).toBe(-12345);
    expect(bigintToIntSafe(BigInt(2147483647))).toBe(2147483647);
    expect(bigintToIntSafe(BigInt(-2147483648))).toBe(-2147483648);
  });

  it("throws ValidationError when above Int32 max", () => {
    expect(() => bigintToIntSafe(BigInt(2147483648))).toThrow(ValidationError);
  });

  it("throws ValidationError when below Int32 min", () => {
    expect(() => bigintToIntSafe(BigInt(-2147483649))).toThrow(ValidationError);
  });

  it("throws ValidationError for very large B2B amounts", () => {
    // 100 M SEK in ören = 10_000_000_000 — legitimate B2B credit limit.
    expect(() => bigintToIntSafe(BigInt("10000000000"))).toThrow(
      ValidationError,
    );
  });
});

describe("intToBigint", () => {
  it("converts integers to bigint", () => {
    expect(intToBigint(0)).toBe(BigInt(0));
    expect(intToBigint(42)).toBe(BigInt(42));
    expect(intToBigint(-42)).toBe(BigInt(-42));
  });

  it("throws on non-integer", () => {
    expect(() => intToBigint(1.5)).toThrow(ValidationError);
    expect(() => intToBigint(NaN)).toThrow(ValidationError);
    expect(() => intToBigint(Infinity)).toThrow(ValidationError);
  });
});
