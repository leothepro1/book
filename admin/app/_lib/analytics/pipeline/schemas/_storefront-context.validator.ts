/**
 * Hand-rolled validator for the StorefrontContext fragment. Mirrors
 * the Zod schema in ./_storefront-context.ts.
 *
 * WHY HAND-ROLLED: bundling Zod 4 into the Web Worker overshoots the
 * 30 KB gzipped budget by 2× due to non-tree-shakeable locale and
 * JSON-Schema modules. Phase 3 PR-B Commit E measured this explicitly.
 *
 * DRIFT GUARD: validator-parity.test.ts runs every test payload
 * through BOTH this validator AND the Zod schema, asserting agreement.
 * If you change one, you MUST change the other or the test will fail.
 *
 * DELETION CONDITION: if Zod 4.x in the future tree-shakes cleanly to
 * ≤25KB gzipped, this file can be deleted and the worker can import
 * the Zod schema directly. Verify with `npm run
 * build:analytics-runtime` after upgrading Zod.
 */

import {
  isIntNonNegative,
  isNonEmptyString,
  isPlainObject,
  isString,
  isStringEnum,
  isStringMinLength,
  type Issue,
} from "./_validators-common";

const DEVICE_TYPES = ["desktop", "mobile", "tablet", "unknown"] as const;

/**
 * Mutates `issues` in place. Caller passes a path prefix (`""` if the
 * payload IS the storefront context, `"foo."` if it's nested under
 * a parent field — currently always `""` because every storefront
 * event payload extends StorefrontContextSchema at the top level via
 * `.and(...)`).
 */
export function validateStorefrontContext(
  payload: unknown,
  prefix: string,
  issues: Issue[],
): void {
  if (!isPlainObject(payload)) {
    issues.push({ path: prefix.replace(/\.$/, ""), message: "must be an object" });
    return;
  }
  if (!isNonEmptyString(payload.page_url)) {
    issues.push({
      path: `${prefix}page_url`,
      message: "must be a non-empty string",
    });
  }
  if (!isString(payload.page_referrer)) {
    issues.push({
      path: `${prefix}page_referrer`,
      message: "must be a string (use empty string for direct visits)",
    });
  }
  if (!isNonEmptyString(payload.user_agent_hash)) {
    issues.push({
      path: `${prefix}user_agent_hash`,
      message: "must be a non-empty string",
    });
  }
  if (!isPlainObject(payload.viewport)) {
    issues.push({
      path: `${prefix}viewport`,
      message: "must be an object with width and height",
    });
  } else {
    if (!isIntNonNegative(payload.viewport.width)) {
      issues.push({
        path: `${prefix}viewport.width`,
        message: "must be a non-negative integer",
      });
    }
    if (!isIntNonNegative(payload.viewport.height)) {
      issues.push({
        path: `${prefix}viewport.height`,
        message: "must be a non-negative integer",
      });
    }
  }
  if (!isStringMinLength(payload.locale, 2)) {
    issues.push({
      path: `${prefix}locale`,
      message: "must be a string of length ≥ 2",
    });
  }
  if (!isNonEmptyString(payload.session_id)) {
    issues.push({
      path: `${prefix}session_id`,
      message: "must be a non-empty string",
    });
  }
  // Optional device_type — present means valid enum member; absent
  // means pre-X2 emit (or post-X2 SSR-context with no navigator).
  if (payload.device_type !== undefined) {
    if (!isStringEnum(payload.device_type, DEVICE_TYPES)) {
      issues.push({
        path: `${prefix}device_type`,
        message: `must be one of: ${DEVICE_TYPES.join(", ")}`,
      });
    }
  }
  // Optional visitor_id — present means non-empty string.
  if (payload.visitor_id !== undefined) {
    if (!isNonEmptyString(payload.visitor_id)) {
      issues.push({
        path: `${prefix}visitor_id`,
        message: "must be a non-empty string",
      });
    }
  }
}
