/**
 * Unit tests for the schema registry and the two Phase 1A event schemas.
 *
 * The verification script (scripts/verify-phase1a.ts) re-runs a subset of
 * these against real Zod parsing as ✓/✗ checks 3-10. Tests here are the
 * complete coverage matrix.
 */

import { describe, expect, it } from "vitest";

import { BookingCancelledSchema } from "./booking-cancelled";
import { BookingCompletedSchema } from "./booking-completed";
import { BookingImportedSchema } from "./booking-imported";
import { BookingModifiedSchema } from "./booking-modified";
import { BookingNoShowSchema } from "./booking-no-show";
import { PaymentSucceededSchema } from "./payment-succeeded";
import {
  ANALYTICS_EVENT_REGISTRY,
  AnalyticsSchemaNotRegisteredError,
  AnalyticsSchemaVersionMissingError,
  getEventSchema,
} from "./registry";

const VALID_ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TENANT = "cverify000000000000000000";

const validBookingEvent = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "booking_completed",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "guest" as const,
  actor_id: "guest-123",
  payload: {
    booking_id: "booking_1",
    accommodation_id: "acc_1",
    guest_id: "email_a3f7b2c1d4e5f6a7",
    check_in_date: "2026-06-01",
    check_out_date: "2026-06-04",
    number_of_nights: 3,
    number_of_guests: 2,
    total_amount: { amount: 12900, currency: "SEK" },
    source_channel: "direct" as const,
    pms_reference: null,
  },
};

const validPaymentEvent = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "payment_succeeded",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "system" as const,
  actor_id: null,
  payload: {
    payment_id: "pi_1",
    booking_id: "booking_1",
    amount: { amount: 12900, currency: "SEK" },
    provider: "stripe" as const,
    payment_instrument: "card" as const,
    provider_reference: "pi_3abc",
    captured_at: new Date(),
  },
};

describe("ANALYTICS_EVENT_REGISTRY", () => {
  it("contains booking_completed at v0.1.0", () => {
    expect(ANALYTICS_EVENT_REGISTRY.booking_completed["0.1.0"]).toBeDefined();
  });

  it("contains payment_succeeded at v0.1.0", () => {
    expect(ANALYTICS_EVENT_REGISTRY.payment_succeeded["0.1.0"]).toBeDefined();
  });

  it("contains booking_imported / booking_modified / booking_cancelled / booking_no_show at v0.1.0", () => {
    expect(ANALYTICS_EVENT_REGISTRY.booking_imported["0.1.0"]).toBeDefined();
    expect(ANALYTICS_EVENT_REGISTRY.booking_modified["0.1.0"]).toBeDefined();
    expect(ANALYTICS_EVENT_REGISTRY.booking_cancelled["0.1.0"]).toBeDefined();
    expect(ANALYTICS_EVENT_REGISTRY.booking_no_show["0.1.0"]).toBeDefined();
  });
});

describe("getEventSchema", () => {
  it("returns the schema for a known (event_name, version)", () => {
    const schema = getEventSchema("booking_completed", "0.1.0");
    expect(schema).toBe(BookingCompletedSchema);
  });

  it("throws AnalyticsSchemaNotRegisteredError on unknown event_name", () => {
    expect(() => getEventSchema("unknown_event", "0.1.0")).toThrow(
      AnalyticsSchemaNotRegisteredError,
    );
  });

  it("throws AnalyticsSchemaVersionMissingError on unknown version", () => {
    expect(() => getEventSchema("booking_completed", "99.0.0")).toThrow(
      AnalyticsSchemaVersionMissingError,
    );
  });

  it("checks event_name before version (so the error names the right typo)", () => {
    // Caller typoed the name — error should say "not registered", not
    // "version missing".
    try {
      getEventSchema("booking_complted", "99.0.0");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AnalyticsSchemaNotRegisteredError);
    }
  });
});

describe("BookingCompletedSchema", () => {
  it("accepts a valid event", () => {
    const r = BookingCompletedSchema.safeParse(validBookingEvent);
    expect(r.success).toBe(true);
  });

  it("rejects payload with missing booking_id", () => {
    const r = BookingCompletedSchema.safeParse({
      ...validBookingEvent,
      payload: { ...validBookingEvent.payload, booking_id: undefined },
    });
    expect(r.success).toBe(false);
  });

  it("rejects payload with empty booking_id", () => {
    const r = BookingCompletedSchema.safeParse({
      ...validBookingEvent,
      payload: { ...validBookingEvent.payload, booking_id: "" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-ISO check_in_date", () => {
    const r = BookingCompletedSchema.safeParse({
      ...validBookingEvent,
      payload: { ...validBookingEvent.payload, check_in_date: "2026/06/01" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-positive number_of_nights", () => {
    const r = BookingCompletedSchema.safeParse({
      ...validBookingEvent,
      payload: { ...validBookingEvent.payload, number_of_nights: 0 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown source_channel value", () => {
    const r = BookingCompletedSchema.safeParse({
      ...validBookingEvent,
      payload: { ...validBookingEvent.payload, source_channel: "made_up" },
    });
    expect(r.success).toBe(false);
  });

  it("accepts pms_reference: null", () => {
    const r = BookingCompletedSchema.safeParse(validBookingEvent);
    expect(r.success).toBe(true);
  });

  it("rejects mismatched event_name literal", () => {
    const r = BookingCompletedSchema.safeParse({
      ...validBookingEvent,
      event_name: "payment_succeeded",
    });
    expect(r.success).toBe(false);
  });
});

describe("PaymentSucceededSchema", () => {
  it("accepts a valid event", () => {
    const r = PaymentSucceededSchema.safeParse(validPaymentEvent);
    expect(r.success).toBe(true);
  });

  it("accepts booking_id: null (non-accommodation order)", () => {
    const r = PaymentSucceededSchema.safeParse({
      ...validPaymentEvent,
      payload: { ...validPaymentEvent.payload, booking_id: null },
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown provider", () => {
    const r = PaymentSucceededSchema.safeParse({
      ...validPaymentEvent,
      payload: { ...validPaymentEvent.payload, provider: "made_up" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown payment_instrument", () => {
    const r = PaymentSucceededSchema.safeParse({
      ...validPaymentEvent,
      payload: { ...validPaymentEvent.payload, payment_instrument: "crypto" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty provider_reference", () => {
    const r = PaymentSucceededSchema.safeParse({
      ...validPaymentEvent,
      payload: { ...validPaymentEvent.payload, provider_reference: "" },
    });
    expect(r.success).toBe(false);
  });
});

// ── Phase 2 Commit A — booking lifecycle ────────────────────────────────

const validImportedEvent = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "booking_imported",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "system" as const,
  actor_id: null,
  payload: {
    booking_id: "booking_pms_1",
    pms_provider: "mews" as const,
    pms_reference: "ext-1",
    check_in_date: "2026-06-01",
    check_out_date: "2026-06-04",
    number_of_nights: 3,
    number_of_guests: 2,
    accommodation_id: null,
    guest_email_hash: "email_a3f7b2c1d4e5f6a7",
  },
};

describe("BookingImportedSchema", () => {
  it("accepts a valid event", () => {
    expect(BookingImportedSchema.safeParse(validImportedEvent).success).toBe(true);
  });
  it("accepts nullable accommodation_id and number_of_guests (PMS imports often missing these)", () => {
    const r = BookingImportedSchema.safeParse({
      ...validImportedEvent,
      payload: {
        ...validImportedEvent.payload,
        accommodation_id: null,
        number_of_guests: null,
      },
    });
    expect(r.success).toBe(true);
  });
  it("rejects empty booking_id", () => {
    expect(
      BookingImportedSchema.safeParse({
        ...validImportedEvent,
        payload: { ...validImportedEvent.payload, booking_id: "" },
      }).success,
    ).toBe(false);
  });
  it("rejects empty pms_reference (PMS imports always have an external id)", () => {
    expect(
      BookingImportedSchema.safeParse({
        ...validImportedEvent,
        payload: { ...validImportedEvent.payload, pms_reference: "" },
      }).success,
    ).toBe(false);
  });
  it("rejects unknown pms_provider", () => {
    expect(
      BookingImportedSchema.safeParse({
        ...validImportedEvent,
        payload: { ...validImportedEvent.payload, pms_provider: "newpms" },
      }).success,
    ).toBe(false);
  });
});

const validModifiedEvent = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "booking_modified",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "system" as const,
  actor_id: null,
  payload: {
    booking_id: "booking_pms_2",
    pms_provider: "mews" as const,
    pms_reference: "ext-2",
    check_in_date: "2026-06-01",
    check_out_date: "2026-06-04",
    number_of_nights: 3,
    number_of_guests: 2,
    accommodation_id: "acc_1",
    source_channel: "pms_import" as const,
    provider_updated_at: new Date(),
  },
};

describe("BookingModifiedSchema", () => {
  it("accepts a valid event", () => {
    expect(BookingModifiedSchema.safeParse(validModifiedEvent).success).toBe(true);
  });
  it("rejects unknown source_channel", () => {
    expect(
      BookingModifiedSchema.safeParse({
        ...validModifiedEvent,
        payload: { ...validModifiedEvent.payload, source_channel: "made_up" },
      }).success,
    ).toBe(false);
  });
  it("rejects non-ISO check_in_date", () => {
    expect(
      BookingModifiedSchema.safeParse({
        ...validModifiedEvent,
        payload: { ...validModifiedEvent.payload, check_in_date: "01-06-2026" },
      }).success,
    ).toBe(false);
  });
});

const validCancelledEvent = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "booking_cancelled",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "system" as const,
  actor_id: null,
  payload: {
    booking_id: "booking_pms_3",
    pms_provider: "mews" as const,
    pms_reference: "ext-3",
    check_in_date: "2026-06-01",
    check_out_date: "2026-06-04",
    number_of_nights: 3,
    number_of_guests: 2,
    accommodation_id: "acc_1",
    source_channel: "pms_import" as const,
    cancelled_at: new Date(),
  },
};

describe("BookingCancelledSchema", () => {
  it("accepts a valid event", () => {
    expect(BookingCancelledSchema.safeParse(validCancelledEvent).success).toBe(true);
  });
  it("rejects missing cancelled_at", () => {
    expect(
      BookingCancelledSchema.safeParse({
        ...validCancelledEvent,
        payload: { ...validCancelledEvent.payload, cancelled_at: undefined },
      }).success,
    ).toBe(false);
  });
});

const validNoShowEvent = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "booking_no_show",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "system" as const,
  actor_id: null,
  payload: {
    booking_id: "booking_pms_4",
    pms_provider: "mews" as const,
    pms_reference: "ext-4",
    expected_check_in_date: "2026-06-01",
    accommodation_id: "acc_1",
    number_of_guests: 2,
    detection_source: "internal" as const,
    detected_at: new Date(),
  },
};

describe("BookingNoShowSchema (registered, emit deferred to Phase 2.x)", () => {
  it("accepts a valid event", () => {
    expect(BookingNoShowSchema.safeParse(validNoShowEvent).success).toBe(true);
  });
  it("rejects unknown detection_source", () => {
    expect(
      BookingNoShowSchema.safeParse({
        ...validNoShowEvent,
        payload: { ...validNoShowEvent.payload, detection_source: "made_up" },
      }).success,
    ).toBe(false);
  });
});
