/**
 * Analytics event schema registry.
 *
 * The single source of truth for which (event_name, schema_version) pairs
 * Bedfront supports. Two layers of validation use the same registry:
 *   - The emitter (app/_lib/analytics/pipeline/emitter.ts) validates the
 *     payload against the registered schema BEFORE writing to outbox.
 *     A buggy operational caller can never persist a malformed event.
 *   - The drainer (Phase 1B) re-validates against the same schema BEFORE
 *     writing from outbox to analytics.event. Defense in depth: even if
 *     the outbox row was somehow stamped with a bad payload (direct SQL,
 *     migration drift), it gets rejected at the second gate.
 *
 * Versioning. A single event_name can have multiple versions live
 * simultaneously during migration windows. Phase 1A starts every event at
 * v0.1.0 — pre-stable, breaking changes allowed until Apelviken go-live.
 * Once an event is referenced by a Phase 5 aggregation in production,
 * version bumps follow semver: PATCH for additive optional fields, MINOR
 * for additive required fields with a default, MAJOR for anything that
 * could break a downstream consumer.
 */

import type { ZodType } from "zod";

import { AccommodationArchivedSchema } from "./accommodation-archived";
import { AccommodationPriceChangedSchema } from "./accommodation-price-changed";
import { AccommodationPublishedSchema } from "./accommodation-published";
import { DiscountCreatedSchema } from "./discount-created";
import { DiscountExpiredSchema } from "./discount-expired";
import { DiscountUsedSchema } from "./discount-used";
import { BookingCancelledSchema } from "./booking-cancelled";
import { BookingCompletedSchema } from "./booking-completed";
import { BookingImportedSchema } from "./booking-imported";
import { BookingModifiedSchema } from "./booking-modified";
import { BookingNoShowSchema } from "./booking-no-show";
import { GuestAccountCreatedSchema } from "./guest-account-created";
import { GuestAccountLinkedSchema } from "./guest-account-linked";
import { GuestAuthenticatedSchema } from "./guest-authenticated";
import { GuestOtpSentSchema } from "./guest-otp-sent";
import { PaymentDisputedSchema } from "./payment-disputed";
import { PaymentFailedSchema } from "./payment-failed";
import { PaymentRefundedSchema } from "./payment-refunded";
import { PaymentSucceededSchema } from "./payment-succeeded";
import { PmsSyncFailedSchema } from "./pms-sync-failed";
import { PmsSyncRecoveredSchema } from "./pms-sync-recovered";

export const ANALYTICS_EVENT_REGISTRY = {
  accommodation_archived: {
    "0.1.0": AccommodationArchivedSchema,
  },
  accommodation_price_changed: {
    "0.1.0": AccommodationPriceChangedSchema,
  },
  accommodation_published: {
    "0.1.0": AccommodationPublishedSchema,
  },
  booking_cancelled: {
    "0.1.0": BookingCancelledSchema,
  },
  booking_completed: {
    "0.1.0": BookingCompletedSchema,
  },
  booking_imported: {
    "0.1.0": BookingImportedSchema,
  },
  booking_modified: {
    "0.1.0": BookingModifiedSchema,
  },
  booking_no_show: {
    "0.1.0": BookingNoShowSchema,
  },
  discount_created: {
    "0.1.0": DiscountCreatedSchema,
  },
  discount_expired: {
    "0.1.0": DiscountExpiredSchema,
  },
  discount_used: {
    "0.1.0": DiscountUsedSchema,
  },
  guest_account_created: {
    "0.1.0": GuestAccountCreatedSchema,
  },
  guest_account_linked: {
    "0.1.0": GuestAccountLinkedSchema,
  },
  guest_authenticated: {
    "0.1.0": GuestAuthenticatedSchema,
  },
  guest_otp_sent: {
    "0.1.0": GuestOtpSentSchema,
  },
  payment_disputed: {
    "0.1.0": PaymentDisputedSchema,
  },
  payment_failed: {
    "0.1.0": PaymentFailedSchema,
  },
  payment_refunded: {
    "0.1.0": PaymentRefundedSchema,
  },
  payment_succeeded: {
    "0.1.0": PaymentSucceededSchema,
  },
  pms_sync_failed: {
    "0.1.0": PmsSyncFailedSchema,
  },
  pms_sync_recovered: {
    "0.1.0": PmsSyncRecoveredSchema,
  },
} as const satisfies Record<string, Record<string, ZodType>>;

export type RegisteredEventName = keyof typeof ANALYTICS_EVENT_REGISTRY;

// ── Errors ────────────────────────────────────────────────────────────────

export class AnalyticsSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsSchemaError";
  }
}

export class AnalyticsSchemaNotRegisteredError extends AnalyticsSchemaError {
  constructor(eventName: string) {
    super(
      `analytics event_name ${JSON.stringify(eventName)} is not registered. ` +
        `Add it to ANALYTICS_EVENT_REGISTRY in schemas/registry.ts.`,
    );
    this.name = "AnalyticsSchemaNotRegisteredError";
  }
}

export class AnalyticsSchemaVersionMissingError extends AnalyticsSchemaError {
  constructor(eventName: string, schemaVersion: string, availableVersions: readonly string[]) {
    super(
      `analytics event ${JSON.stringify(eventName)} has no schema for version ${JSON.stringify(schemaVersion)}. ` +
        `Available versions: ${availableVersions.length === 0 ? "(none)" : availableVersions.join(", ")}.`,
    );
    this.name = "AnalyticsSchemaVersionMissingError";
  }
}

// ── Lookup ────────────────────────────────────────────────────────────────

/**
 * Returns the registered Zod schema for (eventName, schemaVersion).
 *
 * - Throws AnalyticsSchemaNotRegisteredError if eventName is unknown.
 *   This check runs before the version check so callers see "unknown
 *   event_name" rather than a confusing "no version 0.1.0 found" when
 *   the event_name itself is the typo.
 * - Throws AnalyticsSchemaVersionMissingError if eventName is registered
 *   but the requested version is not.
 */
export function getEventSchema(eventName: string, schemaVersion: string): ZodType {
  const versions = (ANALYTICS_EVENT_REGISTRY as Record<string, Record<string, ZodType>>)[eventName];
  if (!versions) {
    throw new AnalyticsSchemaNotRegisteredError(eventName);
  }
  const schema = versions[schemaVersion];
  if (!schema) {
    throw new AnalyticsSchemaVersionMissingError(
      eventName,
      schemaVersion,
      Object.keys(versions),
    );
  }
  return schema;
}
