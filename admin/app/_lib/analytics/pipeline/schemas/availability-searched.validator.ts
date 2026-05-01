/**
 * Hand-rolled validator for availability_searched. Mirrors the Zod
 * schema in ./availability-searched.ts.
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
  isArrayOfNonEmptyStrings,
  isIntNonNegative,
  isIntPositive,
  isIsoDate,
  isPlainObject,
  runValidation,
  type ValidationResult,
} from "./_validators-common";
import { validateStorefrontContext } from "./_storefront-context.validator";

export function validateAvailabilitySearchedPayload(
  payload: unknown,
): ValidationResult {
  return runValidation((issues) => {
    validateStorefrontContext(payload, "", issues);
    if (!isPlainObject(payload)) return;
    if (!isIsoDate(payload.check_in_date)) {
      issues.push({
        path: "check_in_date",
        message: "must be YYYY-MM-DD",
      });
    }
    if (!isIsoDate(payload.check_out_date)) {
      issues.push({
        path: "check_out_date",
        message: "must be YYYY-MM-DD",
      });
    }
    if (!isIntPositive(payload.number_of_guests)) {
      issues.push({
        path: "number_of_guests",
        message: "must be a positive integer",
      });
    }
    if (!isIntNonNegative(payload.results_count)) {
      issues.push({
        path: "results_count",
        message: "must be a non-negative integer",
      });
    }
    if (!isArrayOfNonEmptyStrings(payload.filters_applied)) {
      issues.push({
        path: "filters_applied",
        message: "must be an array of non-empty strings",
      });
    }
  });
}
