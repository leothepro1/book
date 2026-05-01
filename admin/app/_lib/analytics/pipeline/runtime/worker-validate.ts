/**
 * Phase 3 PR-B — Worker-side payload validation (hand-rolled path).
 *
 * The worker bundle uses hand-rolled validators (one per storefront
 * event, paired with each Zod schema as `<event>.validator.ts`).
 * Bundling Zod into the worker overshoots the locked 30 KB gzipped
 * budget by 2× because of non-tree-shakeable locale and JSON-Schema
 * modules — see PR-B Commit E for the measured numbers.
 *
 * Drift is mechanically prevented by `schemas/validator-parity.test.ts`
 * which runs every test fixture through BOTH the Zod schema and the
 * paired validator and asserts agreement. CI blocks merge if either
 * side drifts.
 *
 * Schema versions are hardcoded in `STOREFRONT_SCHEMA_VERSIONS`.
 * Bumping any storefront event to 0.2.0 requires editing this constant
 * — the version is part of the worker's outbound envelope contract
 * and a silent drift would produce events the registry doesn't know
 * how to read.
 */

import { validateAccommodationViewedPayload } from "../schemas/accommodation-viewed.validator";
import { validateAvailabilitySearchedPayload } from "../schemas/availability-searched.validator";
import { validateCartAbandonedPayload } from "../schemas/cart-abandoned.validator";
import { validateCartStartedPayload } from "../schemas/cart-started.validator";
import { validateCartUpdatedPayload } from "../schemas/cart-updated.validator";
import { validateCheckoutStartedPayload } from "../schemas/checkout-started.validator";
import { validatePageViewedPayload } from "../schemas/page-viewed.validator";
import type { ValidationResult as RawValidationResult } from "../schemas/_validators-common";

import type { StorefrontEventName } from "./worker-types";

const STOREFRONT_VALIDATORS: Record<
  StorefrontEventName,
  (payload: unknown) => RawValidationResult
> = {
  page_viewed: validatePageViewedPayload,
  accommodation_viewed: validateAccommodationViewedPayload,
  availability_searched: validateAvailabilitySearchedPayload,
  cart_started: validateCartStartedPayload,
  cart_updated: validateCartUpdatedPayload,
  cart_abandoned: validateCartAbandonedPayload,
  checkout_started: validateCheckoutStartedPayload,
};

export const STOREFRONT_SCHEMA_VERSIONS: Record<StorefrontEventName, string> = {
  page_viewed: "0.1.0",
  accommodation_viewed: "0.1.0",
  availability_searched: "0.1.0",
  cart_started: "0.1.0",
  cart_updated: "0.1.0",
  cart_abandoned: "0.1.0",
  checkout_started: "0.1.0",
};

export interface ValidationOk {
  ok: true;
}

export interface ValidationErr {
  ok: false;
  issues: Array<{ path: string; message: string }>;
}

export type ValidationResult = ValidationOk | ValidationErr;

/**
 * Validate a payload against the registered validator for the given
 * storefront event. Returns a flat issue list on failure. Worker-side
 * validation NEVER throws — all failure paths are returned values.
 */
export function validatePayload(
  eventName: StorefrontEventName,
  payload: unknown,
): ValidationResult {
  return STOREFRONT_VALIDATORS[eventName](payload);
}

/**
 * True iff `name` is one of the 7 storefront event names. Narrows the
 * type so callers can use `name` as a `StorefrontEventName` afterwards.
 */
export function isStorefrontEventName(name: string): name is StorefrontEventName {
  return name in STOREFRONT_VALIDATORS;
}
