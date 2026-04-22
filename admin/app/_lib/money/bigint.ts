/**
 * BigInt ↔ Int conversions for the B2B / Order boundary.
 *
 * Existing Order money fields (subtotalAmount, taxAmount, totalAmount, …) are
 * stored as Postgres `integer` and therefore fit in 32 bits.
 *
 * The new B2B tables use `BigInt` to accommodate large credit limits and
 * store-credit balances that legitimately exceed Int32 (> ~21 M SEK in ören).
 *
 * Anywhere a B2B `bigint` is about to be written into an Int column (or vice
 * versa) these helpers are the ONLY acceptable bridge. Silent coercion via
 * `Number(x)` hides overflow; these functions throw.
 */

import { ValidationError } from "../errors/service-errors";

const INT32_MAX = 2147483647; // 2^31 - 1
const INT32_MIN = -2147483648; // -(2^31)

/**
 * Convert a `bigint` (typically a B2B amount in ören) to a JS `number`
 * safely. Throws `ValidationError` if the value does not fit in a signed
 * 32-bit integer — never silently truncates.
 */
export function bigintToIntSafe(b: bigint): number {
  if (b > BigInt(INT32_MAX)) {
    throw new ValidationError(
      `BigInt value exceeds Int32 max (${INT32_MAX})`,
      { value: b.toString(), limit: INT32_MAX },
    );
  }
  if (b < BigInt(INT32_MIN)) {
    throw new ValidationError(
      `BigInt value below Int32 min (${INT32_MIN})`,
      { value: b.toString(), limit: INT32_MIN },
    );
  }
  return Number(b);
}

/**
 * Convert a JS `number` (existing Int-typed amount) to a `bigint` for
 * persistence on a B2B column. Rejects non-integers and non-finite values.
 */
export function intToBigint(n: number): bigint {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ValidationError(
      "Cannot convert non-integer to bigint",
      { value: String(n) },
    );
  }
  return BigInt(n);
}
