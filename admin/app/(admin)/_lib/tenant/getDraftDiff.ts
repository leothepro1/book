"use server";

import { getCurrentTenant } from "./getCurrentTenant";

/**
 * Recursive deep equality check — key-order independent.
 * Handles objects, arrays, primitives, and null.
 *
 * JSON.stringify is key-order dependent and fails when deepmerge
 * produces objects with different key ordering than the original.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(key => deepEqual(aObj[key], bObj[key]));
}

/**
 * Returns true if draftSettings is meaningfully different from settings.
 * Uses recursive deep equality — key-order independent.
 *
 * This is the single source of truth for "are there unpublished changes?"
 * The publish bar reads from this, not from client-side operation counting.
 */
export async function hasDraftChanges(): Promise<boolean> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return false;

  const { tenant } = tenantData;
  if (!tenant.draftSettings) return false;

  return !deepEqual(tenant.draftSettings, tenant.settings);
}
