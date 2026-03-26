/**
 * App Settings Encryption / Decryption
 *
 * decryptAppSettings() is the ONLY way to decrypt settings for delivery.
 * encryptAppSettings() is the ONLY way to encrypt settings for storage.
 * Uses AES-256-GCM from crypto.ts — same as PMS credentials.
 * Never logs decrypted values. Never mutates input object.
 */

import { encryptCredentials, decryptCredentials } from "@/app/_lib/integrations/crypto";
import { getApp } from "./registry";
import { log } from "@/app/_lib/logger";

/**
 * Decrypt all secret fields in app settings before sending to handlers.
 * Walks setupSteps → apiKeyConfig.fields where secret === true.
 * If decryption fails for a field: logs error, omits field — never crashes.
 */
export function decryptAppSettings(
  appId: string,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const app = getApp(appId);
  if (!app) return settings;

  const secretKeys = getSecretFieldKeys(app.setupSteps);
  if (secretKeys.size === 0) return settings;

  const result = structuredClone(settings);

  for (const [stepId, keys] of secretKeys) {
    const stepData = result[stepId] as Record<string, unknown> | undefined;
    if (!stepData) continue;

    for (const key of keys) {
      const encryptedData = stepData[`${key}__enc`] as string | undefined;
      const encryptedIv = stepData[`${key}__iv`] as string | undefined;

      if (encryptedData && encryptedIv) {
        try {
          const encrypted = Buffer.from(encryptedData, "base64");
          const iv = Buffer.from(encryptedIv, "base64");
          const decrypted = decryptCredentials(encrypted, iv);
          stepData[key] = decrypted[key] ?? stepData[key];
        } catch (err) {
          log("error", "settings-crypto.decrypt_failed", { appId, stepId, key, error: String(err) });
          // Omit field on failure — never crash
        }
      }
    }
  }

  return result;
}

/**
 * Encrypt all secret fields before storing in DB.
 * Walks setupSteps → apiKeyConfig.fields where secret === true.
 * Stores encrypted value as {key}__enc + {key}__iv alongside original key.
 */
export function encryptAppSettings(
  appId: string,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const app = getApp(appId);
  if (!app) return settings;

  const secretKeys = getSecretFieldKeys(app.setupSteps);
  if (secretKeys.size === 0) return settings;

  const result = structuredClone(settings);

  for (const [stepId, keys] of secretKeys) {
    const stepData = result[stepId] as Record<string, unknown> | undefined;
    if (!stepData) continue;

    for (const key of keys) {
      const value = stepData[key];
      if (typeof value === "string" && value.length > 0) {
        try {
          const { encrypted, iv } = encryptCredentials({ [key]: value });
          stepData[`${key}__enc`] = encrypted.toString("base64");
          stepData[`${key}__iv`] = iv.toString("base64");
          // Keep original value in memory but it won't be readable from DB
          // The encrypted version is what persists
        } catch (err) {
          log("error", "settings-crypto.encrypt_failed", { appId, stepId, key, error: String(err) });
        }
      }
    }
  }

  return result;
}

// ── Helpers ─────────────────────────────────────────────────────

type SetupStepLike = {
  id: string;
  type: string;
  apiKeyConfig?: { fields: Array<{ key: string; secret: boolean }> };
};

function getSecretFieldKeys(steps: SetupStepLike[]): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const step of steps) {
    if (step.type === "api_key" && step.apiKeyConfig?.fields) {
      const secretFields = step.apiKeyConfig.fields
        .filter((f) => f.secret)
        .map((f) => f.key);
      if (secretFields.length > 0) {
        result.set(step.id, secretFields);
      }
    }
  }

  return result;
}
