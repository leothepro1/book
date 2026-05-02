/**
 * Hand-rolled validator for cart_started v0.1.0 — DEPRECATED.
 *
 * Mirrors the legacy Zod schema in `./cart-started-v0.1.0.ts`. Kept so
 * the worker can still validate v0.1.0 events that were emitted before
 * the v0.2.0 migration drained from the outbox.
 *
 * DRIFT GUARD: validator-parity.test.ts runs payloads through both
 * this validator and the legacy Zod schema, asserting agreement on
 * `ok` outcome.
 */

import {
  isNonEmptyString,
  isPlainObject,
  runValidation,
  validateCartTotal,
  type ValidationResult,
} from "../_validators-common";
import { validateStorefrontContext } from "../_storefront-context.validator";

export function validateCartStartedV010Payload(
  payload: unknown,
): ValidationResult {
  return runValidation((issues) => {
    validateStorefrontContext(payload, "", issues);
    if (!isPlainObject(payload)) return;
    if (!isNonEmptyString(payload.cart_id)) {
      issues.push({ path: "cart_id", message: "must be a non-empty string" });
    }
    if (!isNonEmptyString(payload.accommodation_id)) {
      issues.push({
        path: "accommodation_id",
        message: "must be a non-empty string",
      });
    }
    validateCartTotal(payload.cart_total, "cart_total", issues);
  });
}
