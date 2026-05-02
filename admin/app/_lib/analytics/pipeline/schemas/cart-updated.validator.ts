/**
 * Hand-rolled validator for cart_updated. Mirrors the Zod schema in
 * ./cart-updated.ts.
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
  isStringEnum,
  runValidation,
  validateCartTotal,
  type ValidationResult,
} from "./_validators-common";
import { validateStorefrontContext } from "./_storefront-context.validator";

const CART_UPDATE_ACTIONS = ["added", "removed", "quantity_changed"] as const;

export function validateCartUpdatedPayload(
  payload: unknown,
): ValidationResult {
  return runValidation((issues) => {
    validateStorefrontContext(payload, "", issues);
    if (!isPlainObject(payload)) return;
    if (!isNonEmptyString(payload.cart_id)) {
      issues.push({ path: "cart_id", message: "must be a non-empty string" });
    }
    // v0.2.0: items_count tightened from non-negative to positive.
    // cart_updated by definition fires on a cart that already has items;
    // remove-last-item triggers cart_id regeneration, not a count=0 emit.
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
    if (!isStringEnum(payload.action, CART_UPDATE_ACTIONS)) {
      issues.push({
        path: "action",
        message: `must be one of: ${CART_UPDATE_ACTIONS.join(", ")}`,
      });
    }
  });
}
