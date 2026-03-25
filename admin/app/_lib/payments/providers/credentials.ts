/**
 * Payment Provider Credentials — Encryption
 * ═══════════════════════════════════════════
 *
 * Wraps the existing AES-256-GCM encryption from _lib/integrations/crypto.ts.
 * Credentials are stored as a single base64 string (iv:encrypted) in the DB.
 * Never logged, never returned to client.
 */

import { encryptCredentials, decryptCredentials } from "@/app/_lib/integrations/crypto";

/**
 * Encrypt provider credentials to a base64 string for DB storage.
 * Format: base64(iv):base64(encrypted+authTag)
 */
export function encryptProviderCredentials(
  credentials: Record<string, string>,
): string {
  const { encrypted, iv } = encryptCredentials(credentials);
  return `${iv.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt a stored credential string back to key-value pairs.
 */
export function decryptProviderCredentials(
  stored: string,
): Record<string, string> {
  const [ivB64, encB64] = stored.split(":");
  if (!ivB64 || !encB64) throw new Error("Invalid encrypted credentials format");
  const iv = Buffer.from(ivB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  return decryptCredentials(encrypted, iv);
}
