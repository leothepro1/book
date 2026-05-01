/**
 * Hand-rolled validator for page_viewed. Mirrors the Zod schema in
 * ./page-viewed.ts.
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
  isPlainObject,
  isStringEnum,
  runValidation,
  type ValidationResult,
} from "./_validators-common";
import { validateStorefrontContext } from "./_storefront-context.validator";

const PAGE_TYPES = [
  "home",
  "stay",
  "checkout",
  "account",
  "support",
  "policy",
  "other",
] as const;

export function validatePageViewedPayload(payload: unknown): ValidationResult {
  return runValidation((issues) => {
    validateStorefrontContext(payload, "", issues);
    if (!isPlainObject(payload)) return; // already flagged
    if (!isStringEnum(payload.page_type, PAGE_TYPES)) {
      issues.push({
        path: "page_type",
        message: `must be one of: ${PAGE_TYPES.join(", ")}`,
      });
    }
  });
}
