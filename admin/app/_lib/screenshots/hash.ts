/**
 * Content-hash for tenant settings.
 *
 * SHA-256 of deterministically serialized JSON.
 * Same settings → same hash → no unnecessary screenshot regeneration.
 * Keys are sorted before stringify to guarantee deterministic output
 * regardless of object key order in the database.
 */

import { createHash } from "crypto";

function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

export function computeSettingsHash(settings: unknown): string {
  const serialized = JSON.stringify(sortKeys(settings));
  return createHash("sha256").update(serialized).digest("hex");
}
