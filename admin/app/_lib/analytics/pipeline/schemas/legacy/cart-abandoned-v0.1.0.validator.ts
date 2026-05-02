/**
 * Hand-rolled validator for cart_abandoned v0.1.0 — DEPRECATED.
 *
 * Mirrors the legacy Zod schema in `./cart-abandoned-v0.1.0.ts`. Kept
 * so the worker can still validate v0.1.0 events that were emitted
 * before the v0.2.0 migration drained from the outbox.
 *
 * DRIFT GUARD: validator-parity.test.ts runs payloads through both
 * this validator and the legacy Zod schema, asserting agreement.
 */

import {
  isIntNonNegative,
  isIntPositive,
  isNonEmptyString,
  isPlainObject,
  runValidation,
  validateCartTotal,
  type ValidationResult,
} from "../_validators-common";
import { validateStorefrontContext } from "../_storefront-context.validator";

export function validateCartAbandonedV010Payload(
  payload: unknown,
): ValidationResult {
  return runValidation((issues) => {
    validateStorefrontContext(payload, "", issues);
    if (!isPlainObject(payload)) return;
    if (!isNonEmptyString(payload.cart_id)) {
      issues.push({ path: "cart_id", message: "must be a non-empty string" });
    }
    if (!isIntPositive(payload.items_count)) {
      issues.push({
        path: "items_count",
        message: "must be a positive integer",
      });
    }
    validateCartTotal(payload.cart_total, "cart_total", issues);
    if (!isIntNonNegative(payload.time_since_last_interaction_ms)) {
      issues.push({
        path: "time_since_last_interaction_ms",
        message: "must be a non-negative integer",
      });
    }
  });
}
