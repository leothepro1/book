import { randomBytes } from "crypto";

/**
 * Generate a URL-safe token for stable guest portal URLs.
 * 24 random bytes → 32-char base64url string.
 * Generated once per booking on creation, never changes.
 */
export function generatePortalToken(): string {
  return randomBytes(24).toString("base64url");
}
