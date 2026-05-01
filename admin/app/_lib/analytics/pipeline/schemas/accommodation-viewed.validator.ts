/**
 * Hand-rolled validator for accommodation_viewed. Mirrors the Zod
 * schema in ./accommodation-viewed.ts.
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
  isNonEmptyString,
  isPlainObject,
  isStringEnum,
  runValidation,
  type ValidationResult,
} from "./_validators-common";
import { validateStorefrontContext } from "./_storefront-context.validator";

const ACCOMMODATION_TYPES = [
  "hotel",
  "cabin",
  "camping",
  "apartment",
  "pitch",
] as const;

export function validateAccommodationViewedPayload(
  payload: unknown,
): ValidationResult {
  return runValidation((issues) => {
    validateStorefrontContext(payload, "", issues);
    if (!isPlainObject(payload)) return;
    if (!isNonEmptyString(payload.accommodation_id)) {
      issues.push({
        path: "accommodation_id",
        message: "must be a non-empty string",
      });
    }
    if (!isStringEnum(payload.accommodation_type, ACCOMMODATION_TYPES)) {
      issues.push({
        path: "accommodation_type",
        message: `must be one of: ${ACCOMMODATION_TYPES.join(", ")}`,
      });
    }
  });
}
