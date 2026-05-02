/**
 * Hand-rolled validator for cart_updated v0.1.0 — DEPRECATED.
 *
 * Mirrors the legacy Zod schema in `./cart-updated-v0.1.0.ts`. Kept
 * so the worker can still validate v0.1.0 events that were emitted
 * before the v0.2.0 migration drained from the outbox.
 *
 * DRIFT GUARD: validator-parity.test.ts runs payloads through both
 * this validator and the legacy Zod schema, asserting agreement.
 */

import {
  isIntNonNegative,
  isNonEmptyString,
  isPlainObject,
  isStringEnum,
  runValidation,
  validateCartTotal,
  type ValidationResult,
} from "../_validators-common";
import { validateStorefrontContext } from "../_storefront-context.validator";

const CART_UPDATE_ACTIONS_V010 = ["added", "removed", "quantity_changed"] as const;

export function validateCartUpdatedV010Payload(
  payload: unknown,
): ValidationResult {
  return runValidation((issues) => {
    validateStorefrontContext(payload, "", issues);
    if (!isPlainObject(payload)) return;
    if (!isNonEmptyString(payload.cart_id)) {
      issues.push({ path: "cart_id", message: "must be a non-empty string" });
    }
    // v0.1.0 allowed items_count = 0; v0.2.0 tightened to positive.
    if (!isIntNonNegative(payload.items_count)) {
      issues.push({
        path: "items_count",
        message: "must be a non-negative integer",
      });
    }
    validateCartTotal(payload.cart_total, "cart_total", issues);
    if (!isStringEnum(payload.action, CART_UPDATE_ACTIONS_V010)) {
      issues.push({
        path: "action",
        message: `must be one of: ${CART_UPDATE_ACTIONS_V010.join(", ")}`,
      });
    }
  });
}
