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

import { BookingCancelledSchema } from "./booking-cancelled";
import { BookingCompletedSchema } from "./booking-completed";
import { BookingImportedSchema } from "./booking-imported";
import { BookingModifiedSchema } from "./booking-modified";
import { BookingNoShowSchema } from "./booking-no-show";
import { PaymentSucceededSchema } from "./payment-succeeded";

export const ANALYTICS_EVENT_REGISTRY = {
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
  payment_succeeded: {
    "0.1.0": PaymentSucceededSchema,
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
