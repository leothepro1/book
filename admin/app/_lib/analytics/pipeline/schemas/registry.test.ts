/**
 * Unit tests for the schema registry and the two Phase 1A event schemas.
 *
 * The verification script (scripts/verify-phase1a.ts) re-runs a subset of
 * these against real Zod parsing as ✓/✗ checks 3-10. Tests here are the
 * complete coverage matrix.
 */

import { describe, expect, it } from "vitest";

import { DiscountCreatedSchema } from "./discount-created";
import { DiscountExpiredSchema } from "./discount-expired";
import { DiscountUsedSchema } from "./discount-used";
import { AccommodationArchivedSchema } from "./accommodation-archived";
import { AccommodationPriceChangedSchema } from "./accommodation-price-changed";
import { AccommodationPublishedSchema } from "./accommodation-published";
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

// ── Phase 2 Commit B — payment lifecycle ────────────────────────────────

const validPaymentFailedEvent = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "payment_failed",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "system" as const,
  actor_id: null,
  payload: {
    order_id: "co_failed",
    payment_intent_id: "pi_failed",
    amount: { amount: 12900, currency: "SEK" },
    decline_code: "insufficient_funds",
    error_code: "card_declined",
    error_message: "Otillräckligt saldo",
    attempted_at: new Date(),
    provider: "stripe" as const,
  },
};

describe("PaymentFailedSchema", () => {
  it("accepts a valid event", () => {
    expect(PaymentFailedSchema.safeParse(validPaymentFailedEvent).success).toBe(true);
  });
  it("accepts null decline_code / error_code / error_message", () => {
    const r = PaymentFailedSchema.safeParse({
      ...validPaymentFailedEvent,
      payload: {
        ...validPaymentFailedEvent.payload,
        decline_code: null,
        error_code: null,
        error_message: null,
      },
    });
    expect(r.success).toBe(true);
  });
  it("rejects empty payment_intent_id", () => {
    expect(
      PaymentFailedSchema.safeParse({
        ...validPaymentFailedEvent,
        payload: { ...validPaymentFailedEvent.payload, payment_intent_id: "" },
      }).success,
    ).toBe(false);
  });
  it("rejects unknown provider", () => {
    expect(
      PaymentFailedSchema.safeParse({
        ...validPaymentFailedEvent,
        payload: { ...validPaymentFailedEvent.payload, provider: "made_up" },
      }).success,
    ).toBe(false);
  });
});

const validPaymentRefundedEvent = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "payment_refunded",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "system" as const,
  actor_id: null,
  payload: {
    order_id: "co_refund",
    charge_id: "ch_xxx",
    refund_amount: { amount: 5000, currency: "SEK" },
    refund_reason: "requested_by_customer" as const,
    refunded_at: new Date(),
    provider: "stripe" as const,
  },
};

describe("PaymentRefundedSchema", () => {
  it("accepts a valid event", () => {
    expect(PaymentRefundedSchema.safeParse(validPaymentRefundedEvent).success).toBe(true);
  });
  it("rejects unknown refund_reason", () => {
    expect(
      PaymentRefundedSchema.safeParse({
        ...validPaymentRefundedEvent,
        payload: { ...validPaymentRefundedEvent.payload, refund_reason: "made_up" },
      }).success,
    ).toBe(false);
  });
  it("accepts 'unknown' refund_reason (defensive fallback)", () => {
    expect(
      PaymentRefundedSchema.safeParse({
        ...validPaymentRefundedEvent,
        payload: { ...validPaymentRefundedEvent.payload, refund_reason: "unknown" },
      }).success,
    ).toBe(true);
  });
  it("rejects empty charge_id", () => {
    expect(
      PaymentRefundedSchema.safeParse({
        ...validPaymentRefundedEvent,
        payload: { ...validPaymentRefundedEvent.payload, charge_id: "" },
      }).success,
    ).toBe(false);
  });
});

const validPaymentDisputedEvent = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "payment_disputed",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "system" as const,
  actor_id: null,
  payload: {
    order_id: "co_dispute",
    charge_id: "ch_xxx",
    dispute_id: "dp_xxx",
    disputed_amount: { amount: 12900, currency: "SEK" },
    dispute_reason: "fraudulent" as const,
    dispute_status: "needs_response" as const,
    created_at: new Date(),
    provider: "stripe" as const,
  },
};

describe("PaymentDisputedSchema", () => {
  it("accepts a valid event", () => {
    expect(PaymentDisputedSchema.safeParse(validPaymentDisputedEvent).success).toBe(true);
  });
  it("rejects unknown dispute_reason", () => {
    expect(
      PaymentDisputedSchema.safeParse({
        ...validPaymentDisputedEvent,
        payload: { ...validPaymentDisputedEvent.payload, dispute_reason: "made_up" },
      }).success,
    ).toBe(false);
  });
  it("rejects unknown dispute_status", () => {
    expect(
      PaymentDisputedSchema.safeParse({
        ...validPaymentDisputedEvent,
        payload: { ...validPaymentDisputedEvent.payload, dispute_status: "made_up" },
      }).success,
    ).toBe(false);
  });
  it("rejects empty dispute_id", () => {
    expect(
      PaymentDisputedSchema.safeParse({
        ...validPaymentDisputedEvent,
        payload: { ...validPaymentDisputedEvent.payload, dispute_id: "" },
      }).success,
    ).toBe(false);
  });
});

// ── Phase 2 Commit C — guest lifecycle ──────────────────────────────────

const validGuestAccountCreated = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "guest_account_created",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "guest" as const,
  actor_id: "cguest123",
  payload: {
    guest_id: "cguest123",
    email_hash: "email_a3f7b2c1d4e5f6a7",
    source: "checkout" as const,
    created_at: new Date(),
  },
};

describe("GuestAccountCreatedSchema", () => {
  it("accepts a valid event", () => {
    expect(GuestAccountCreatedSchema.safeParse(validGuestAccountCreated).success).toBe(true);
  });
  it("rejects unknown source", () => {
    expect(
      GuestAccountCreatedSchema.safeParse({
        ...validGuestAccountCreated,
        payload: { ...validGuestAccountCreated.payload, source: "made_up" },
      }).success,
    ).toBe(false);
  });
  it("rejects empty guest_id", () => {
    expect(
      GuestAccountCreatedSchema.safeParse({
        ...validGuestAccountCreated,
        payload: { ...validGuestAccountCreated.payload, guest_id: "" },
      }).success,
    ).toBe(false);
  });
});

const validGuestOtpSent = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "guest_otp_sent",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "anonymous" as const,
  actor_id: null,
  payload: {
    email_hash: "email_a3f7b2c1d4e5f6a7",
    token_id: "abcdef0123456789",
    expires_at: new Date(),
    sent_at: new Date(),
  },
};

describe("GuestOtpSentSchema", () => {
  it("accepts a valid event", () => {
    expect(GuestOtpSentSchema.safeParse(validGuestOtpSent).success).toBe(true);
  });
  it("rejects empty token_id", () => {
    expect(
      GuestOtpSentSchema.safeParse({
        ...validGuestOtpSent,
        payload: { ...validGuestOtpSent.payload, token_id: "" },
      }).success,
    ).toBe(false);
  });
});

const validGuestAuthenticated = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "guest_authenticated",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "guest" as const,
  actor_id: "cguest123",
  payload: {
    guest_id: "cguest123",
    email_hash: "email_a3f7b2c1d4e5f6a7",
    token_id: "abcdef0123456789",
    authenticated_at: new Date(),
  },
};

describe("GuestAuthenticatedSchema", () => {
  it("accepts a valid event", () => {
    expect(GuestAuthenticatedSchema.safeParse(validGuestAuthenticated).success).toBe(true);
  });
  it("accepts null guest_id (auth-then-create flow)", () => {
    const r = GuestAuthenticatedSchema.safeParse({
      ...validGuestAuthenticated,
      actor_type: "anonymous",
      actor_id: null,
      payload: { ...validGuestAuthenticated.payload, guest_id: null },
    });
    expect(r.success).toBe(true);
  });
  it("rejects empty token_id", () => {
    expect(
      GuestAuthenticatedSchema.safeParse({
        ...validGuestAuthenticated,
        payload: { ...validGuestAuthenticated.payload, token_id: "" },
      }).success,
    ).toBe(false);
  });
});

const validGuestAccountLinked = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "guest_account_linked",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "guest" as const,
  actor_id: "cguest123",
  payload: {
    guest_id: "cguest123",
    email_hash: "email_a3f7b2c1d4e5f6a7",
    linked_resource_type: "order" as const,
    linked_resource_id: "co_abc",
    link_method: "auto_via_email_match" as const,
    linked_at: new Date(),
  },
};

describe("GuestAccountLinkedSchema", () => {
  it("accepts a valid event", () => {
    expect(GuestAccountLinkedSchema.safeParse(validGuestAccountLinked).success).toBe(true);
  });
  it("rejects unknown linked_resource_type", () => {
    expect(
      GuestAccountLinkedSchema.safeParse({
        ...validGuestAccountLinked,
        payload: { ...validGuestAccountLinked.payload, linked_resource_type: "made_up" },
      }).success,
    ).toBe(false);
  });
  it("rejects unknown link_method", () => {
    expect(
      GuestAccountLinkedSchema.safeParse({
        ...validGuestAccountLinked,
        payload: { ...validGuestAccountLinked.payload, link_method: "made_up" },
      }).success,
    ).toBe(false);
  });
});

// ── Phase 2 Commit D — accommodation lifecycle (deferred-CDC) ───────────

const validAccommodationPublished = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "accommodation_published",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "merchant" as const,
  actor_id: "cmerchant1",
  payload: {
    accommodation_id: "acc_1",
    accommodation_type: "cabin" as const,
    display_name: "Lakeside Cabin #4",
    base_price: { amount: 90000, currency: "SEK" },
    status_transition: { from: "inactive" as const, to: "active" as const },
    published_at: new Date(),
  },
};

describe("AccommodationPublishedSchema", () => {
  it("accepts a valid event", () => {
    expect(AccommodationPublishedSchema.safeParse(validAccommodationPublished).success).toBe(true);
  });
  it("rejects unknown accommodation_type", () => {
    expect(
      AccommodationPublishedSchema.safeParse({
        ...validAccommodationPublished,
        payload: { ...validAccommodationPublished.payload, accommodation_type: "boat" },
      }).success,
    ).toBe(false);
  });
});

const validAccommodationArchived = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "accommodation_archived",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "merchant" as const,
  actor_id: "cmerchant1",
  payload: {
    accommodation_id: "acc_1",
    accommodation_type: "cabin" as const,
    display_name: "Lakeside Cabin #4",
    archived_at: new Date(),
    archived_by_actor_id: "cmerchant1",
  },
};

describe("AccommodationArchivedSchema", () => {
  it("accepts a valid event", () => {
    expect(AccommodationArchivedSchema.safeParse(validAccommodationArchived).success).toBe(true);
  });
  it("accepts null archived_by_actor_id", () => {
    const r = AccommodationArchivedSchema.safeParse({
      ...validAccommodationArchived,
      payload: { ...validAccommodationArchived.payload, archived_by_actor_id: null },
    });
    expect(r.success).toBe(true);
  });
});

const validAccommodationPriceChanged = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "accommodation_price_changed",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "merchant" as const,
  actor_id: "cmerchant1",
  payload: {
    accommodation_id: "acc_1",
    accommodation_type: "cabin" as const,
    previous_price: { amount: 90000, currency: "SEK" },
    new_price: { amount: 95000, currency: "SEK" },
    change_pct: 5.56,
    changed_at: new Date(),
    changed_by_actor_id: "cmerchant1",
  },
};

describe("AccommodationPriceChangedSchema", () => {
  it("accepts a valid event", () => {
    expect(AccommodationPriceChangedSchema.safeParse(validAccommodationPriceChanged).success).toBe(true);
  });
  it("accepts null change_pct (when previous was zero)", () => {
    expect(
      AccommodationPriceChangedSchema.safeParse({
        ...validAccommodationPriceChanged,
        payload: { ...validAccommodationPriceChanged.payload, change_pct: null },
      }).success,
    ).toBe(true);
  });
});

// ── Phase 2 Commit E — discount lifecycle ───────────────────────────────

const validDiscountCreated = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "discount_created",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "merchant" as const,
  actor_id: "cmerchant1",
  payload: {
    discount_id: "cdisc_1",
    title: "Summer 2026",
    method: "code" as const,
    value_type: "percentage" as const,
    value: 1500,
    currency: null,
    starts_at: new Date(),
    ends_at: null,
    usage_limit: null,
    created_at: new Date(),
    created_by_actor_id: "cmerchant1",
  },
};

describe("DiscountCreatedSchema", () => {
  it("accepts a valid event", () => {
    expect(DiscountCreatedSchema.safeParse(validDiscountCreated).success).toBe(true);
  });
  it("rejects unknown method", () => {
    expect(
      DiscountCreatedSchema.safeParse({
        ...validDiscountCreated,
        payload: { ...validDiscountCreated.payload, method: "made_up" },
      }).success,
    ).toBe(false);
  });
  it("rejects unknown value_type", () => {
    expect(
      DiscountCreatedSchema.safeParse({
        ...validDiscountCreated,
        payload: { ...validDiscountCreated.payload, value_type: "made_up" },
      }).success,
    ).toBe(false);
  });
});

const validDiscountUsed = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "discount_used",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "guest" as const,
  actor_id: "cguest1",
  payload: {
    discount_id: "cdisc_1",
    discount_code: "SUMMER2026",
    order_id: "co_1",
    discount_amount: { amount: 5000, currency: "SEK" },
    order_total: { amount: 25000, currency: "SEK" },
    used_at: new Date(),
  },
};

describe("DiscountUsedSchema", () => {
  it("accepts a valid event", () => {
    expect(DiscountUsedSchema.safeParse(validDiscountUsed).success).toBe(true);
  });
  it("accepts null discount_code (AUTOMATIC discount)", () => {
    expect(
      DiscountUsedSchema.safeParse({
        ...validDiscountUsed,
        payload: { ...validDiscountUsed.payload, discount_code: null },
      }).success,
    ).toBe(true);
  });
});

const validDiscountExpired = {
  event_id: VALID_ULID,
  tenant_id: TENANT,
  event_name: "discount_expired",
  schema_version: "0.1.0",
  occurred_at: new Date(),
  actor_type: "system" as const,
  actor_id: null,
  payload: {
    discount_id: "cdisc_1",
    title: "Summer 2026",
    ends_at: new Date(),
    expired_at: new Date(),
    total_uses: 12,
  },
};

describe("DiscountExpiredSchema", () => {
  it("accepts a valid event", () => {
    expect(DiscountExpiredSchema.safeParse(validDiscountExpired).success).toBe(true);
  });
  it("rejects negative total_uses", () => {
    expect(
      DiscountExpiredSchema.safeParse({
        ...validDiscountExpired,
        payload: { ...validDiscountExpired.payload, total_uses: -1 },
      }).success,
    ).toBe(false);
  });
});
