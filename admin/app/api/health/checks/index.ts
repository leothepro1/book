/**
 * Readiness-check registry.
 *
 * To add a new check:
 *   1. Create ./your-check.ts exporting a Check
 *   2. Import it here
 *   3. Add it to the `checks` array
 *
 * The array order determines the order in the public readiness response.
 * Put the cheapest / most-likely-to-fail first so a fast path can short-
 * circuit if we ever add sequential execution (we run in parallel today).
 */

import type { Check } from "./_types";
import { dbPooledCheck, dbDirectCheck } from "./db";
import { redisCheck } from "./redis";

export const checks: readonly Check[] = [
  dbPooledCheck,
  dbDirectCheck,
  redisCheck,
];

/** Look up a check by name. Returns undefined if not registered. */
export function getCheck(name: string): Check | undefined {
  return checks.find((c) => c.name === name);
}

/** List all registered check names — used by ?check=list debug endpoint. */
export function listCheckNames(): string[] {
  return checks.map((c) => c.name);
}

export type { Check, CheckResult, CheckStatus } from "./_types";
