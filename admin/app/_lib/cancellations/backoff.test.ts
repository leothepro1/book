import { describe, it, expect } from "vitest";
import { computeBackoffMs, computeNextAttemptAt } from "./backoff";

/** Deterministic RNG factory — returns a function that always yields `value`. */
const constRng = (value: number) => () => value;

describe("computeBackoffMs", () => {
  it("attempt 1 → ~1 min (with ±20% jitter)", () => {
    const mid = computeBackoffMs(1, constRng(0.5)); // no jitter
    expect(mid).toBe(60_000);

    const low = computeBackoffMs(1, constRng(0))!; // −20%
    expect(low).toBe(60_000 - 12_000);

    const high = computeBackoffMs(1, constRng(1))!; // +20%
    expect(high).toBe(60_000 + 12_000);
  });

  it("attempt 2 → ~5 min, attempt 3 → ~30 min, attempt 4 → ~2 h", () => {
    expect(computeBackoffMs(2, constRng(0.5))).toBe(5 * 60_000);
    expect(computeBackoffMs(3, constRng(0.5))).toBe(30 * 60_000);
    expect(computeBackoffMs(4, constRng(0.5))).toBe(2 * 60 * 60_000);
  });

  it("attempt 5 and beyond → null (cap reached, caller must escalate)", () => {
    expect(computeBackoffMs(5)).toBe(null);
    expect(computeBackoffMs(6)).toBe(null);
    expect(computeBackoffMs(100)).toBe(null);
  });

  it("rejects non-positive or non-finite inputs", () => {
    expect(computeBackoffMs(0)).toBe(null);
    expect(computeBackoffMs(-1)).toBe(null);
    expect(computeBackoffMs(NaN)).toBe(null);
    expect(computeBackoffMs(Infinity)).toBe(null);
  });

  it("never returns a negative delay even with extreme jitter", () => {
    // Extreme negative jitter is clamped to 0.
    const result = computeBackoffMs(1, constRng(-10));
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

describe("computeNextAttemptAt", () => {
  it("returns `now + delay` when under cap", () => {
    const now = new Date("2026-04-22T12:00:00Z");
    const next = computeNextAttemptAt(1, now, constRng(0.5));
    expect(next).not.toBeNull();
    expect(next!.getTime() - now.getTime()).toBe(60_000);
  });

  it("returns null when cap is reached", () => {
    expect(computeNextAttemptAt(5)).toBe(null);
  });
});
