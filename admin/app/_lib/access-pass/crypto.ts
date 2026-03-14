/**
 * Cryptographic utilities for AccessPass tokens.
 *
 * Design decisions:
 *  - Tokens are 32 bytes of cryptographically secure randomness, base64url-encoded.
 *  - Storage uses HMAC-SHA256(token, pepper) — HMAC is the correct primitive
 *    for keyed hashing. Unlike naive SHA-256(token + pepper), HMAC is immune
 *    to length extension attacks and is the industry standard (RFC 2104).
 *  - tokenRaw is returned exactly once at issuance, then discarded.
 *  - tokenLast4 is stored for support identification only.
 *  - Serial is a globally unique, URL-safe identifier.
 */

import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32; // 256 bits of entropy

// ── Pepper — validated once at module load, not per call ────────────

import { env } from "@/app/_lib/env";

function getPepper(): string {
  return env.ACCESS_PASS_PEPPER;
}

// ── Token generation ────────────────────────────────────────────────

/**
 * Generate a cryptographically secure token.
 * Returns base64url-encoded string (no padding), 43 chars.
 */
export function generateTokenRaw(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

// ── Token hashing ───────────────────────────────────────────────────

/**
 * Hash a token using HMAC-SHA256 with the server-side pepper as key.
 *
 * Why HMAC and not SHA-256(token + pepper)?
 *  - HMAC provides a proper PRF (pseudorandom function) with formal security proofs.
 *  - SHA-256(msg || key) is vulnerable to length extension attacks.
 *  - HMAC is the industry standard for keyed hashing (used by AWS, Stripe, etc.).
 */
export function hashToken(tokenRaw: string): string {
  return createHmac("sha256", getPepper())
    .update(tokenRaw)
    .digest("hex");
}

// ── Token utilities ─────────────────────────────────────────────────

/**
 * Extract the last 4 characters of a raw token for support identification.
 */
export function tokenLast4(tokenRaw: string): string {
  return tokenRaw.slice(-4);
}

/**
 * Constant-time comparison of two hex hash strings.
 * Prevents timing side-channel attacks on token validation.
 *
 * Uses Node.js timingSafeEqual which is guaranteed constant-time
 * by the OpenSSL implementation underneath.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return timingSafeEqual(bufA, bufB);
}

// ── Serial generation ───────────────────────────────────────────────

/**
 * Generate a globally unique serial for an access pass.
 * Format: AP-<22 chars base64url> (128 bits of randomness).
 *
 * Collision probability: negligible (~2^-64 birthday bound at 2^32 serials).
 * Safe to expose in URLs, QR codes, and support conversations.
 */
export function generateSerial(): string {
  const id = randomBytes(16).toString("base64url");
  return `AP-${id}`;
}
