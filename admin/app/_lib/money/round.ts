/**
 * IEEE 754 round-half-to-even (banker's rounding).
 *
 * JavaScript's Math.round uses round-half-away-from-zero, which
 * compounds upward bias at scale. Tax engines (Shopify, Avalara,
 * Vertex) use banker's rounding to minimize aggregate bias.
 *
 * Examples:
 *   roundHalfToEven(0.5)  === 0  (0 is even)
 *   roundHalfToEven(1.5)  === 2  (2 is even)
 *   roundHalfToEven(2.5)  === 2  (2 is even)
 *   roundHalfToEven(3.5)  === 4  (4 is even)
 *   roundHalfToEven(-0.5) === 0
 *   roundHalfToEven(-1.5) === -2
 *   roundHalfToEven(-2.5) === -2
 *   roundHalfToEven(2.49) === 2  (not halfway, normal round)
 *   roundHalfToEven(2.51) === 3
 *
 * Note on JS Math.round semantics: it rounds half-toward-+Infinity, so
 * Math.round(0.5) === 1 and Math.round(-1.5) === -1. For exact-halfway
 * values the JS result is always odd when the banker's-rounding result
 * should be even (and vice-versa), so the correction is uniformly
 * `rounded - 1` whenever the halfway round produced an odd integer.
 */
export function roundHalfToEven(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("roundHalfToEven: value must be finite");
  }
  const rounded = Math.round(value);
  const diff = Math.abs(value - Math.trunc(value));
  let result: number;
  if (diff !== 0.5) {
    result = rounded;
  } else {
    result = rounded % 2 === 0 ? rounded : rounded - 1;
  }
  // Normalize -0 → 0 so callers (and `toBe(0)` assertions) stay portable.
  return result === 0 ? 0 : result;
}

/**
 * Apply banker's rounding to a tax calculation result.
 * Wrapper for clarity at call-sites that operate on integer ören.
 */
export function roundTaxAmount(amountInOren: number): number {
  return roundHalfToEven(amountInOren);
}
