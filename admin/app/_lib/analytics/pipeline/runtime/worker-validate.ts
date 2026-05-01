/**
 * Phase 3 PR-B — Worker-side payload validation.
 *
 * The worker bundles the 7 storefront event PayloadSchemas (and their
 * shared StorefrontContextSchema, pulled in transitively) directly
 * from leaf schema files. Importing through `schemas/registry.ts` would
 * pull in every server-only event (booking_completed, payment_*, etc.)
 * via the registry constant — esbuild can't tree-shake those because
 * the registry is one big object literal. Direct leaf imports keep the
 * worker bundle to the storefront subset.
 *
 * Schema-as-contract: the worker validates BEFORE building the
 * envelope, so a bug in the main-thread bridge that ships malformed
 * payloads never reaches the network. The dispatch endpoint also
 * re-validates server-side (defense in depth).
 *
 * Schema versions are hardcoded here. Bumping any storefront event to
 * 0.2.0 requires editing `STOREFRONT_SCHEMA_VERSIONS` in this file.
 * That is intentional — the version is part of the worker's outbound
 * envelope contract and a silent drift would produce events the
 * registry doesn't know how to read.
 */

import type { ZodType } from "zod";

import { AccommodationViewedPayloadSchema } from "../schemas/accommodation-viewed";
import { AvailabilitySearchedPayloadSchema } from "../schemas/availability-searched";
import { CartAbandonedPayloadSchema } from "../schemas/cart-abandoned";
import { CartStartedPayloadSchema } from "../schemas/cart-started";
import { CartUpdatedPayloadSchema } from "../schemas/cart-updated";
import { CheckoutStartedPayloadSchema } from "../schemas/checkout-started";
import { PageViewedPayloadSchema } from "../schemas/page-viewed";

import type { StorefrontEventName } from "./worker-types";

const STOREFRONT_PAYLOAD_SCHEMAS: Record<StorefrontEventName, ZodType> = {
  page_viewed: PageViewedPayloadSchema,
  accommodation_viewed: AccommodationViewedPayloadSchema,
  availability_searched: AvailabilitySearchedPayloadSchema,
  cart_started: CartStartedPayloadSchema,
  cart_updated: CartUpdatedPayloadSchema,
  cart_abandoned: CartAbandonedPayloadSchema,
  checkout_started: CheckoutStartedPayloadSchema,
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
 * Validate a payload against the registered schema for the given
 * storefront event. Returns a flat issue list on failure. Worker-side
 * validation NEVER throws — all failure paths are returned values.
 */
export function validatePayload(
  eventName: StorefrontEventName,
  payload: unknown,
): ValidationResult {
  const schema = STOREFRONT_PAYLOAD_SCHEMAS[eventName];
  const result = schema.safeParse(payload);
  if (result.success) return { ok: true };
  return {
    ok: false,
    issues: result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}

/**
 * True iff `name` is one of the 7 storefront event names. Narrows the
 * type so callers can use `name` as a `StorefrontEventName` afterwards.
 */
export function isStorefrontEventName(name: string): name is StorefrontEventName {
  return name in STOREFRONT_PAYLOAD_SCHEMAS;
}
