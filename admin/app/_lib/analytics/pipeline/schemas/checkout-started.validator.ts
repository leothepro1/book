/**
 * Hand-rolled validator for checkout_started. Mirrors the Zod schema
 * in ./checkout-started.ts.
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
  isIntPositive,
  isNonEmptyString,
  isPlainObject,
  runValidation,
  validateCartTotal,
  type ValidationResult,
} from "./_validators-common";
import { validateStorefrontContext } from "./_storefront-context.validator";

export function validateCheckoutStartedPayload(
  payload: unknown,
): ValidationResult {
  return runValidation((issues) => {
    validateStorefrontContext(payload, "", issues);
    if (!isPlainObject(payload)) return;
    if (!isNonEmptyString(payload.cart_id)) {
      issues.push({ path: "cart_id", message: "must be a non-empty string" });
    }
    // checkout_started requires items_count ≥ 1 — entering checkout
    // with an empty cart is structurally impossible.
    if (!isIntPositive(payload.items_count)) {
      issues.push({
        path: "items_count",
        message: "must be a positive integer",
      });
    }
    if (!isIntPositive(payload.line_items_count)) {
      issues.push({
        path: "line_items_count",
        message: "must be a positive integer",
      });
    }
    validateCartTotal(payload.cart_total, "cart_total", issues);
  });
}
