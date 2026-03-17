import { randomBytes } from "crypto";

const TOKEN_BYTES = 32;
const EXPIRY_MINUTES = 60 * 24; // 24 hours

/** Generate a cryptographically random URL-safe token. */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Get expiry date (24 hours from now). */
export function getExpiryDate(): Date {
  return new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);
}

/** Human-readable expiry for email templates. */
export const EXPIRY_HUMAN = "24 timmar";
