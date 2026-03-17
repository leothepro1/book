/**
 * Unsubscribe Token
 * ═════════════════
 *
 * HMAC-SHA256 tokens for email unsubscribe links.
 * Prevents unauthorized unsubscription of arbitrary addresses.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/app/_lib/env";

/**
 * Generate an HMAC-SHA256 token for an unsubscribe link.
 * Deterministic: same inputs always produce the same token.
 */
export function generateUnsubscribeToken(
  tenantId: string,
  email: string,
): string {
  return createHmac("sha256", env.UNSUBSCRIBE_SECRET)
    .update(`${tenantId}:${email}`)
    .digest("hex");
}

/**
 * Verify an unsubscribe token using constant-time comparison.
 * Returns false for any invalid, tampered, or malformed token.
 */
export function verifyUnsubscribeToken(
  tenantId: string,
  email: string,
  token: string,
): boolean {
  const expected = generateUnsubscribeToken(tenantId, email);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(token, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
