import { describe, expect, it } from "vitest";

import { createMessageHandler } from "./worker";
import type { WorkerInboundEventMessage } from "./worker-types";

// Canonical storefront context — mirrors scripts/verify-phase3a.ts
// VALID_PAYLOADS so worker tests and end-to-end verification stay
// in lockstep.
const CONTEXT = {
  page_url: "https://apelviken.rutgr.com/stay/svalan",
  page_referrer: "https://apelviken.rutgr.com/",
  user_agent_hash: "ua_a3f7b2c1d4e5f6a7",
  viewport: { width: 1440, height: 900 },
  locale: "sv-SE",
  session_id: "01HZ8WF7Z7Z7Z7Z7Z7Z7Z7Z7ZB",
};

const VALID_PAYLOADS = {
  page_viewed: { ...CONTEXT, page_type: "stay" as const },
  accommodation_viewed: {
    ...CONTEXT,
    accommodation_id: "acc_svalan",
    accommodation_type: "cabin",
  },
  availability_searched: {
    ...CONTEXT,
    check_in_date: "2026-06-01",
    check_out_date: "2026-06-04",
    number_of_guests: 2,
    results_count: 5,
    filters_applied: ["pets_allowed", "wifi"],
  },
  cart_started: {
    ...CONTEXT,
    cart_id: "cart_01",
    // v0.2.0: product_id (Product.id cuid), not accommodation_id.
    product_id: "p_01",
    cart_total: { amount: 12900, currency: "SEK" },
  },
  cart_updated: {
    ...CONTEXT,
    cart_id: "cart_01",
    items_count: 2,
    line_items_count: 1, // v0.2.0
    cart_total: { amount: 25800, currency: "SEK" },
    action: "added" as const,
  },
  cart_abandoned: {
    ...CONTEXT,
    cart_id: "cart_01",
    items_count: 2,
    line_items_count: 1, // v0.2.0
    cart_total: { amount: 25800, currency: "SEK" },
    time_since_last_interaction_ms: 90_000,
  },
  checkout_started: {
    ...CONTEXT,
    cart_id: "cart_01",
    items_count: 2,
    line_items_count: 1, // v0.2.0
    cart_total: { amount: 25800, currency: "SEK" },
  },
};

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function event(eventName: keyof typeof VALID_PAYLOADS): WorkerInboundEventMessage {
  return {
    type: "event",
    tenantId: "tenant_apelviken",
    eventName,
    payload: VALID_PAYLOADS[eventName],
  };
}

describe("createMessageHandler — happy path per event", () => {
  for (const eventName of Object.keys(VALID_PAYLOADS) as Array<
    keyof typeof VALID_PAYLOADS
  >) {
    it(`accepts and emits a valid envelope for ${eventName}`, () => {
      const handle = createMessageHandler();
      const out = handle(event(eventName));

      if (out.type !== "send") {
        throw new Error(
          `expected 'send', got ${out.type}: ${JSON.stringify(out)}`,
        );
      }
      const env = out.envelope;
      expect(env.event_name).toBe(eventName);
      expect(env.schema_version).toBe("0.1.0");
      expect(env.event_id).toMatch(ULID_REGEX);
      expect(env.occurred_at).toMatch(ISO_DATETIME_REGEX);
      expect(env.payload).toEqual(VALID_PAYLOADS[eventName]);
    });
  }
});

describe("createMessageHandler — envelope security", () => {
  it("NEVER copies tenantId into the outbound envelope", () => {
    // The dispatch endpoint resolves tenant from the Host header.
    // tenantId in the worker is internal-only (consistency check) —
    // copying it onto the wire would be a tenancy-bypass surface.
    const handle = createMessageHandler();
    const out = handle({
      type: "event",
      tenantId: "tenant_evil",
      eventName: "page_viewed",
      payload: VALID_PAYLOADS.page_viewed,
    });
    if (out.type !== "send") throw new Error("expected 'send'");
    expect(JSON.stringify(out.envelope)).not.toContain("tenant_evil");
    expect(JSON.stringify(out.envelope)).not.toContain("tenantId");
    expect(JSON.stringify(out.envelope)).not.toContain("tenant_id");
  });

  it("echoes correlationId on the outbound envelope and message wrapper", () => {
    const handle = createMessageHandler();
    const out = handle({
      ...event("page_viewed"),
      correlationId: "cart_01_v3",
    });
    if (out.type !== "send") throw new Error("expected 'send'");
    expect(out.correlationId).toBe("cart_01_v3");
    expect(out.envelope.correlation_id).toBe("cart_01_v3");
  });

  it("omits correlation_id from envelope when not provided", () => {
    const handle = createMessageHandler();
    const out = handle(event("page_viewed"));
    if (out.type !== "send") throw new Error("expected 'send'");
    expect("correlation_id" in out.envelope).toBe(false);
  });

  it("emits unique event_id per call (ULID monotonicity not required, just unique)", () => {
    const handle = createMessageHandler();
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const out = handle(event("page_viewed"));
      if (out.type !== "send") throw new Error("expected 'send'");
      ids.add(out.envelope.event_id);
    }
    expect(ids.size).toBe(10);
  });
});

describe("createMessageHandler — tenant_id consistency (refinement #2)", () => {
  it("locks to first call's tenantId", () => {
    const handle = createMessageHandler();
    const first = handle({ ...event("page_viewed"), tenantId: "tenant_a" });
    expect(first.type).toBe("send");
    const second = handle({ ...event("cart_started"), tenantId: "tenant_a" });
    expect(second.type).toBe("send");
  });

  it("rejects a different tenantId on the second call with tenant_id_mismatch", () => {
    const handle = createMessageHandler();
    const first = handle({ ...event("page_viewed"), tenantId: "tenant_a" });
    expect(first.type).toBe("send");

    const second = handle({ ...event("page_viewed"), tenantId: "tenant_b" });
    expect(second.type).toBe("error");
    if (second.type !== "error") throw new Error("unreachable");
    expect(second.code).toBe("tenant_id_mismatch");
    expect(second.message).toContain("tenant_a");
    expect(second.message).toContain("tenant_b");
    expect(second.details).toEqual({
      expected: "tenant_a",
      actual: "tenant_b",
    });
  });

  it("propagates correlationId on tenant_id_mismatch errors", () => {
    const handle = createMessageHandler();
    handle({ ...event("page_viewed"), tenantId: "tenant_a" });
    const out = handle({
      ...event("page_viewed"),
      tenantId: "tenant_b",
      correlationId: "abc123",
    });
    if (out.type !== "error") throw new Error("expected 'error'");
    expect(out.correlationId).toBe("abc123");
  });

  it("rejects empty/missing tenantId with validation_failed", () => {
    const handle = createMessageHandler();
    const out = handle({
      type: "event",
      tenantId: "",
      eventName: "page_viewed",
      payload: VALID_PAYLOADS.page_viewed,
    });
    expect(out.type).toBe("error");
    if (out.type !== "error") throw new Error("unreachable");
    expect(out.code).toBe("validation_failed");
  });

  it("two fresh handlers do NOT share tenant lock state", () => {
    // Worker instances are per-tab. Tests must not leak state.
    const a = createMessageHandler();
    const b = createMessageHandler();
    a({ ...event("page_viewed"), tenantId: "tenant_a" });
    const out = b({ ...event("page_viewed"), tenantId: "tenant_b" });
    expect(out.type).toBe("send");
  });
});

describe("createMessageHandler — payload validation", () => {
  it("rejects empty payload with validation_failed + Zod issues", () => {
    const handle = createMessageHandler();
    const out = handle({
      type: "event",
      tenantId: "tenant_a",
      eventName: "page_viewed",
      payload: {},
    });
    if (out.type !== "error") throw new Error("expected 'error'");
    expect(out.code).toBe("validation_failed");
    expect(out.details).toBeDefined();
    expect((out.details as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
  });

  it("rejects payload missing storefront-context fields", () => {
    const handle = createMessageHandler();
    const out = handle({
      type: "event",
      tenantId: "tenant_a",
      eventName: "page_viewed",
      payload: { page_type: "stay" }, // missing all context fields
    });
    expect(out.type).toBe("error");
  });

  it("rejects page_viewed with invalid page_type enum", () => {
    const handle = createMessageHandler();
    const out = handle({
      type: "event",
      tenantId: "tenant_a",
      eventName: "page_viewed",
      payload: { ...CONTEXT, page_type: "not-in-enum" },
    });
    expect(out.type).toBe("error");
  });
});

describe("createMessageHandler — boundary errors", () => {
  it("rejects unknown event name with unknown_event", () => {
    const handle = createMessageHandler();
    const out = handle({
      type: "event",
      tenantId: "tenant_a",
      eventName: "booking_completed", // server-only
      payload: {},
    });
    if (out.type !== "error") throw new Error("expected 'error'");
    expect(out.code).toBe("unknown_event");
  });

  it("rejects null with unknown_message", () => {
    const handle = createMessageHandler();
    const out = handle(null);
    if (out.type !== "error") throw new Error("expected 'error'");
    expect(out.code).toBe("unknown_message");
  });

  it("rejects message with missing type field", () => {
    const handle = createMessageHandler();
    const out = handle({ tenantId: "tenant_a", eventName: "page_viewed" });
    if (out.type !== "error") throw new Error("expected 'error'");
    expect(out.code).toBe("unknown_message");
  });

  it("rejects message with non-event type", () => {
    const handle = createMessageHandler();
    const out = handle({ type: "ping" });
    if (out.type !== "error") throw new Error("expected 'error'");
    expect(out.code).toBe("unknown_message");
  });

  it("rejects non-object payload", () => {
    const handle = createMessageHandler();
    const out = handle({
      type: "event",
      tenantId: "tenant_a",
      eventName: "page_viewed",
      payload: "not an object",
    });
    if (out.type !== "error") throw new Error("expected 'error'");
    expect(out.code).toBe("validation_failed");
  });
});
