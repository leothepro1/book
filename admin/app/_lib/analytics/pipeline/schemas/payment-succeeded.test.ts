/**
 * payment_succeeded schema tests — covers v0.2.0 (current) and v0.1.0
 * (legacy, kept registered for outbox-drain backward-compat).
 *
 * v0.2.0 adds two REQUIRED fields over v0.1.0: `source_channel` (an
 * enum) and `line_items` (an array). The accept-path establishes the
 * canonical shape; the reject-path covers one rejection per required
 * field, plus the new fields' boundary cases (negative amount, empty
 * product_id, invalid enum member).
 */

import { describe, expect, it } from "vitest";

import {
  PaymentSucceededPayloadSchema,
  PaymentSucceededSchema,
} from "./payment-succeeded";
import {
  PaymentSucceededV010PayloadSchema,
  PaymentSucceededV010Schema,
} from "./legacy/payment-succeeded-v0.1.0";

const baseV020Payload = {
  payment_id: "ord_test_1",
  booking_id: "bkn_test_1",
  amount: { amount: 12900, currency: "SEK" },
  provider: "stripe" as const,
  payment_instrument: "card" as const,
  provider_reference: "pi_test_abc",
  captured_at: "2026-05-03T12:00:00.000Z",
  source_channel: "direct" as const,
  line_items: [{ product_id: "prd_test_1", amount: 12900 }],
};

const baseV020Event = {
  event_id: "01HZZZ0000000000000000ABCD",
  tenant_id: "tnt_test_1",
  event_name: "payment_succeeded" as const,
  schema_version: "0.2.0" as const,
  occurred_at: "2026-05-03T12:00:00.000Z",
  correlation_id: null,
  actor_type: "guest" as const,
  actor_id: "gst_test_1",
  payload: baseV020Payload,
};

describe("PaymentSucceededPayloadSchema (v0.2.0) — accept", () => {
  it("accepts a canonical valid payload", () => {
    expect(() => PaymentSucceededPayloadSchema.parse(baseV020Payload)).not.toThrow();
  });

  it("accepts an empty line_items array (orders without OrderLineItem rows)", () => {
    expect(() =>
      PaymentSucceededPayloadSchema.parse({ ...baseV020Payload, line_items: [] }),
    ).not.toThrow();
  });

  it.each([
    "direct",
    "admin_draft",
    "pms_import",
    "third_party_ota",
    "unknown",
  ] as const)("accepts source_channel=%s", (channel) => {
    expect(() =>
      PaymentSucceededPayloadSchema.parse({ ...baseV020Payload, source_channel: channel }),
    ).not.toThrow();
  });

  it("accepts a null booking_id (non-accommodation orders)", () => {
    expect(() =>
      PaymentSucceededPayloadSchema.parse({ ...baseV020Payload, booking_id: null }),
    ).not.toThrow();
  });

  it("accepts multiple line_items entries", () => {
    expect(() =>
      PaymentSucceededPayloadSchema.parse({
        ...baseV020Payload,
        line_items: [
          { product_id: "prd_a", amount: 5000 },
          { product_id: "prd_b", amount: 7900 },
        ],
      }),
    ).not.toThrow();
  });
});

describe("PaymentSucceededPayloadSchema (v0.2.0) — reject", () => {
  it("rejects a missing source_channel", () => {
    const { source_channel: _, ...rest } = baseV020Payload;
    void _;
    expect(() => PaymentSucceededPayloadSchema.parse(rest)).toThrow();
  });

  it("rejects an invalid source_channel enum member", () => {
    expect(() =>
      PaymentSucceededPayloadSchema.parse({
        ...baseV020Payload,
        source_channel: "booking_com",
      }),
    ).toThrow();
  });

  it("rejects a missing line_items field", () => {
    const { line_items: _, ...rest } = baseV020Payload;
    void _;
    expect(() => PaymentSucceededPayloadSchema.parse(rest)).toThrow();
  });

  it("rejects line_items with a negative amount", () => {
    expect(() =>
      PaymentSucceededPayloadSchema.parse({
        ...baseV020Payload,
        line_items: [{ product_id: "prd_a", amount: -100 }],
      }),
    ).toThrow();
  });

  it("rejects line_items with an empty product_id", () => {
    expect(() =>
      PaymentSucceededPayloadSchema.parse({
        ...baseV020Payload,
        line_items: [{ product_id: "", amount: 1000 }],
      }),
    ).toThrow();
  });

  it("rejects line_items with a non-integer amount", () => {
    expect(() =>
      PaymentSucceededPayloadSchema.parse({
        ...baseV020Payload,
        line_items: [{ product_id: "prd_a", amount: 12.5 }],
      }),
    ).toThrow();
  });
});

describe("PaymentSucceededSchema (v0.2.0) — full event", () => {
  it("accepts a canonical full event with schema_version 0.2.0", () => {
    expect(() => PaymentSucceededSchema.parse(baseV020Event)).not.toThrow();
  });

  it("rejects an event with schema_version 0.1.0 (gates registry routing)", () => {
    expect(() =>
      PaymentSucceededSchema.parse({ ...baseV020Event, schema_version: "0.1.0" }),
    ).toThrow();
  });
});

// ── Legacy v0.1.0 — must still validate so the registry can drain
//    pre-cutover outbox rows ─────────────────────────────────────────

const baseV010Payload = {
  payment_id: "ord_legacy_1",
  booking_id: "bkn_legacy_1",
  amount: { amount: 12900, currency: "SEK" },
  provider: "stripe" as const,
  payment_instrument: "card" as const,
  provider_reference: "pi_legacy_xyz",
  captured_at: "2026-04-01T12:00:00.000Z",
};

const baseV010Event = {
  event_id: "01HZZZ00000000000000000DEF",
  tenant_id: "tnt_test_1",
  event_name: "payment_succeeded" as const,
  schema_version: "0.1.0" as const,
  occurred_at: "2026-04-01T12:00:00.000Z",
  correlation_id: null,
  actor_type: "guest" as const,
  actor_id: "gst_test_1",
  payload: baseV010Payload,
};

describe("PaymentSucceededV010Schema (legacy) — must keep validating", () => {
  it("accepts a v0.1.0 payload (no source_channel, no line_items)", () => {
    expect(() => PaymentSucceededV010PayloadSchema.parse(baseV010Payload)).not.toThrow();
  });

  it("accepts a full v0.1.0 event", () => {
    expect(() => PaymentSucceededV010Schema.parse(baseV010Event)).not.toThrow();
  });

  it("rejects an event with schema_version 0.2.0 (registry routes by version)", () => {
    expect(() =>
      PaymentSucceededV010Schema.parse({ ...baseV010Event, schema_version: "0.2.0" }),
    ).toThrow();
  });
});
