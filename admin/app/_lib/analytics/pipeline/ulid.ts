/**
 * ULID generation for analytics-pipeline events.
 *
 * Two flavours:
 *   - `randomULID()`  — non-deterministic, for events without an idempotency
 *                       key. Same as ulidx's `ulid()`.
 *   - `deterministicULIDFromKey(seed)` — same seed always produces the same
 *                       ULID. Used by the emitter when the caller passes
 *                       `idempotencyKey`, so re-emit on retry collapses to
 *                       the existing outbox row via the
 *                       UNIQUE (tenant_id, event_id) constraint.
 *
 * ── Algorithm for deterministicULIDFromKey ─────────────────────────────────
 *
 * A ULID is a 26-char Crockford Base32 string: the first 10 chars encode a
 * 48-bit timestamp (ms), the last 16 chars encode 80 bits of randomness.
 *
 *   1. hash = SHA-256(seed)                  → 32 bytes
 *   2. tsBytes = hash[0..6]                  → 6 bytes (48 bits) interpreted
 *                                              as an unsigned big-endian int
 *   3. randBytes = hash[6..16]               → 10 bytes (80 bits)
 *   4. timePart = encodeTime(tsBytes, 10)    → 10 chars (Crockford Base32)
 *   5. randPart = encodeRandomBytes(randBytes) → 16 chars (Crockford Base32)
 *   6. return timePart + randPart
 *
 * Both halves of the ULID depend only on `seed`, so the output is
 * deterministic. The "timestamp" portion is NOT a real timestamp — it's an
 * arbitrary 48-bit number derived from the hash. Don't decode it as a date.
 * Real timestamps live on the event row's `occurred_at` / `received_at`
 * columns.
 *
 * Caller's responsibility: build `seed` so it includes every dimension the
 * idempotency key should scope by. The emitter uses
 * `${tenantId}:${eventName}:${idempotencyKey}` so that:
 *   - same key for the same (tenant, event_name) → same ULID (intended)
 *   - same key across different tenants          → different ULIDs (isolation)
 *   - same key across different event_names      → different ULIDs (no
 *                                                  cross-event collision)
 */

import { createHash } from "node:crypto";

import { encodeTime, ulid as ulidxUlid } from "ulidx";

const B32_CHARACTERS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford

export function randomULID(): string {
  return ulidxUlid();
}

export function deterministicULIDFromKey(seed: string): string {
  const hash = createHash("sha256").update(seed).digest();
  // First 6 bytes → 48-bit unsigned big-endian integer.
  // Number.MAX_SAFE_INTEGER is 2^53 − 1, so 48 bits fits with room to spare.
  const tsMs =
    hash[0] * 0x10000000000 +
    hash[1] * 0x100000000 +
    hash[2] * 0x1000000 +
    hash[3] * 0x10000 +
    hash[4] * 0x100 +
    hash[5];
  const timePart = encodeTime(tsMs, 10);
  const randPart = encode10BytesToCrockford(hash.subarray(6, 16));
  return timePart + randPart;
}

/**
 * Encodes exactly 10 bytes (80 bits) as 16 Crockford-Base32 characters.
 *
 * Each output char represents 5 bits. 16 * 5 = 80 bits = 10 bytes — clean
 * mapping with no padding. Most-significant bits first to match the ULID
 * spec's randomness encoding.
 */
function encode10BytesToCrockford(bytes: Uint8Array): string {
  if (bytes.length !== 10) {
    throw new Error(
      `encode10BytesToCrockford: expected 10 bytes, got ${bytes.length}`,
    );
  }
  // 80 bits → 16 5-bit chunks. BigInt avoids precision loss at the high end.
  // Constructor calls (BigInt(0)) instead of literal `0n` because tsconfig
  // target = ES2017; the project's broader compile target predates BigInt
  // literal syntax.
  const ZERO = BigInt(0);
  const EIGHT = BigInt(8);
  const MASK_5 = BigInt(0x1f);
  let bits = ZERO;
  for (let i = 0; i < 10; i++) bits = (bits << EIGHT) | BigInt(bytes[i]);
  let out = "";
  for (let i = 0; i < 16; i++) {
    const shift = BigInt(75 - i * 5);
    const chunk = Number((bits >> shift) & MASK_5);
    out += B32_CHARACTERS[chunk];
  }
  return out;
}
