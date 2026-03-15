/**
 * PMS Credential Encryption
 *
 * AES-256-GCM encryption for per-tenant PMS credentials.
 * Uses Node.js built-in crypto — no new dependencies.
 *
 * Credentials are encrypted before storage and decrypted only
 * at call time. Never logged, never returned to the client,
 * never stored in TenantConfig.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/app/_lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits, recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Derive a 32-byte key from the env var.
 * Uses the first 32 bytes of the key string (UTF-8).
 * For production, consider using a proper KDF like HKDF.
 */
function getKey(): Buffer {
  const raw = env.INTEGRATION_ENCRYPTION_KEY;
  return Buffer.from(raw.slice(0, 32), "utf-8");
}

/**
 * Encrypt a credentials object to a binary blob + IV.
 * The auth tag is appended to the encrypted data.
 */
export function encryptCredentials(
  plaintext: Record<string, string>
): { encrypted: Buffer; iv: Buffer } {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const json = JSON.stringify(plaintext);
  const encrypted = Buffer.concat([
    cipher.update(json, "utf-8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  return { encrypted, iv };
}

/**
 * Decrypt a binary blob + IV back to a credentials object.
 * Extracts the auth tag from the end of the encrypted data.
 */
export function decryptCredentials(
  encrypted: Buffer,
  iv: Buffer
): Record<string, string> {
  const key = getKey();

  // Auth tag is the last 16 bytes
  const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(0, encrypted.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf-8")) as Record<string, string>;
}
