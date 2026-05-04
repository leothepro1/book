/**
 * Mapping-registry unit tests.
 *
 * Per recon §B.2: at least 3 fixtures per event-type, asserting
 * dimensionValue + value extraction for each contribution. Aggregator
 * fold semantics (sum/count/distinct) are tested in aggregate-day.test.ts.
 */

import { describe, expect, it } from "vitest";

import type { AnalyticsEventRow } from "./metric-mapping";
import {
  ANALYTICS_METRIC_MAPPINGS,
  derivedMetrics,
  findMapping,
  makeAccumulatorKey,
} from "./metric-mapping";

const TENANT = "ctest1mapping00000000000";

function row(overrides: Partial<AnalyticsEventRow>): AnalyticsEventRow {
  return {
    tenant_id: TENANT,
    event_name: "payment_succeeded",
    schema_version: "0.2.0",
    occurred_at: new Date("2026-05-01T12:00:00.000Z"),
    actor_type: "system",
    actor_id: null,
    payload: {},
    context: null,
    ...overrides,
  };
}

describe("ANALYTICS_METRIC_MAPPINGS — registry", () => {
  it("registers exactly the Phase 5A scope mappings", () => {
    const ids = ANALYTICS_METRIC_MAPPINGS.map(
      (m) => `${m.eventName}@${m.schemaVersion}`,
    );
    expect(ids).toEqual([
      "payment_succeeded@0.2.0",
      "booking_completed@0.1.0",
      "page_viewed@0.1.0",
    ]);
  });

  it("findMapping returns null for unmapped events", () => {
    expect(findMapping("nope_event", "0.1.0")).toBeNull();
    expect(findMapping("payment_succeeded", "0.1.0")).toBeNull();
  });

  it("findMapping returns the registered mapping for a known pair", () => {
    const m = findMapping("payment_succeeded", "0.2.0");
    expect(m).not.toBeNull();
    expect(m?.contributions.length).toBeGreaterThan(0);
  });

  it("every distinct contribution declares a distinctKey extractor", () => {
    for (const mapping of ANALYTICS_METRIC_MAPPINGS) {
      for (const c of mapping.contributions) {
        if (c.kind === "expand") continue;
        if (c.aggregator === "distinct") {
          expect(c.distinctKey).toBeDefined();
        }
      }
    }
  });
});

describe("payment_succeeded@0.2.0 mapping", () => {
  const mapping = findMapping("payment_succeeded", "0.2.0")!;

  function paymentEvent(
    payload: Record<string, unknown>,
  ): AnalyticsEventRow {
    return row({ event_name: "payment_succeeded", schema_version: "0.2.0", payload });
  }

  // Helper: look up a contribution by (metric, dimension) and assert it
  // is the scalar variant. Lets each fixture grab the exact contribution
  // it wants to exercise without hard-coding array indices.
  function scalar(metric: string, dimension: string) {
    const c = mapping.contributions.find(
      (x) =>
        x.metric === metric && x.dimension === dimension && x.kind !== "expand",
    );
    if (!c || c.kind === "expand") {
      throw new Error(`no scalar contribution for ${metric}/${dimension}`);
    }
    return c;
  }

  it("Fixture 1 — REVENUE × TOTAL extracts amount.amount", () => {
    const e = paymentEvent({
      payment_id: "ord_1",
      amount: { amount: 12_900, currency: "SEK" },
      source_channel: "direct",
      line_items: [],
    });
    const c = scalar("REVENUE", "TOTAL");
    expect(c.dimensionValueFrom(e)).toBe("TOTAL");
    expect(c.valueFrom(e)).toBe(12_900);
    expect(c.aggregator).toBe("sum");
  });

  it("Fixture 2 — REVENUE × CHANNEL reads source_channel", () => {
    const e = paymentEvent({
      payment_id: "ord_2",
      amount: { amount: 50_000, currency: "SEK" },
      source_channel: "third_party_ota",
      line_items: [],
    });
    const c = scalar("REVENUE", "CHANNEL");
    expect(c.dimensionValueFrom(e)).toBe("third_party_ota");
    expect(c.valueFrom(e)).toBe(50_000);
  });

  it("Fixture 3 — ORDERS × TOTAL is the constant 1", () => {
    const e = paymentEvent({
      payment_id: "ord_3",
      amount: { amount: 999, currency: "SEK" },
      source_channel: "admin_draft",
      line_items: [],
    });
    const c = scalar("ORDERS", "TOTAL");
    expect(c.valueFrom(e)).toBe(1);
    expect(c.dimensionValueFrom(e)).toBe("TOTAL");
  });

  it("Fixture 4 — ORDERS × CHANNEL inherits the channel string", () => {
    const e = paymentEvent({
      payment_id: "ord_4",
      amount: { amount: 1_000, currency: "SEK" },
      source_channel: "pms_import",
      line_items: [],
    });
    const c = scalar("ORDERS", "CHANNEL");
    expect(c.dimensionValueFrom(e)).toBe("pms_import");
    expect(c.valueFrom(e)).toBe(1);
  });

  it("Fixture 5 — REVENUE × PRODUCT expand iterates line_items", () => {
    const e = paymentEvent({
      payment_id: "ord_5",
      amount: { amount: 30_000, currency: "SEK" },
      source_channel: "direct",
      line_items: [
        { product_id: "prod_a", amount: 10_000 },
        { product_id: "prod_b", amount: 20_000 },
      ],
    });
    const c = mapping.contributions.find(
      (x) => x.metric === "REVENUE" && x.dimension === "PRODUCT",
    );
    if (!c || c.kind !== "expand") throw new Error("expand contribution missing");
    const out = c.expand(e);
    expect(out).toEqual([
      { dimensionValue: "prod_a", value: 10_000 },
      { dimensionValue: "prod_b", value: 20_000 },
    ]);
  });

  it("Fixture 6 — REVENUE × PRODUCT skips malformed line items", () => {
    const e = paymentEvent({
      payment_id: "ord_6",
      amount: { amount: 30_000, currency: "SEK" },
      source_channel: "direct",
      line_items: [
        { product_id: "", amount: 10_000 }, // empty id
        { product_id: "prod_c", amount: 5_000 },
        null,
        { amount: 999 }, // missing product_id
      ],
    });
    const c = mapping.contributions.find(
      (x) => x.metric === "REVENUE" && x.dimension === "PRODUCT",
    );
    if (!c || c.kind !== "expand") throw new Error("expand contribution missing");
    expect(c.expand(e)).toEqual([
      { dimensionValue: "prod_c", value: 5_000 },
    ]);
  });

  it("Fixture 7 — empty line_items produces empty expansion", () => {
    const e = paymentEvent({
      payment_id: "ord_7",
      amount: { amount: 100, currency: "SEK" },
      source_channel: "direct",
      line_items: [],
    });
    const c = mapping.contributions.find(
      (x) => x.metric === "REVENUE" && x.dimension === "PRODUCT",
    );
    if (!c || c.kind !== "expand") throw new Error("expand contribution missing");
    expect(c.expand(e)).toEqual([]);
  });
});

describe("booking_completed@0.1.0 mapping", () => {
  const mapping = findMapping("booking_completed", "0.1.0")!;

  function bookingEvent(payload: Record<string, unknown>) {
    return row({
      event_name: "booking_completed",
      schema_version: "0.1.0",
      payload,
    });
  }

  it("Fixture 1 — REVENUE × CHANNEL extracts total_amount.amount", () => {
    const e = bookingEvent({
      booking_id: "bk_1",
      total_amount: { amount: 80_000, currency: "SEK" },
      source_channel: "direct",
    });
    const c = mapping.contributions.find(
      (x) => x.metric === "REVENUE" && x.dimension === "CHANNEL",
    );
    if (!c || c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.dimensionValueFrom(e)).toBe("direct");
    expect(c.valueFrom(e)).toBe(80_000);
  });

  it("Fixture 2 — ORDERS × CHANNEL reads channel", () => {
    const e = bookingEvent({
      booking_id: "bk_2",
      total_amount: { amount: 999, currency: "SEK" },
      source_channel: "third_party_ota",
    });
    const c = mapping.contributions.find(
      (x) => x.metric === "ORDERS" && x.dimension === "CHANNEL",
    );
    if (!c || c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.dimensionValueFrom(e)).toBe("third_party_ota");
    expect(c.valueFrom(e)).toBe(1);
  });

  it("Fixture 3 — missing source_channel falls back to 'unknown'", () => {
    const e = bookingEvent({
      booking_id: "bk_3",
      total_amount: { amount: 1_000, currency: "SEK" },
      // source_channel intentionally absent
    });
    const c = mapping.contributions.find(
      (x) => x.metric === "REVENUE" && x.dimension === "CHANNEL",
    );
    if (!c || c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.dimensionValueFrom(e)).toBe("unknown");
  });
});

describe("page_viewed@0.1.0 mapping", () => {
  const mapping = findMapping("page_viewed", "0.1.0")!;

  function pageEvent(
    payload: Record<string, unknown>,
    context: Record<string, unknown> | null = null,
  ) {
    return row({
      event_name: "page_viewed",
      schema_version: "0.1.0",
      payload,
      context,
    });
  }

  it("Fixture 1 — SESSIONS × TOTAL distinct on session_id", () => {
    const e = pageEvent({
      session_id: "01HZQ8X9TESTSESSIONIDONE",
      page_type: "home",
    });
    const c = mapping.contributions.find(
      (x) => x.metric === "SESSIONS" && x.dimension === "TOTAL",
    );
    if (!c || c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.aggregator).toBe("distinct");
    expect(c.distinctKey?.(e)).toBe("01HZQ8X9TESTSESSIONIDONE");
    expect(c.dimensionValueFrom(e)).toBe("TOTAL");
  });

  it("Fixture 2 — SESSIONS × DEVICE reads device_type", () => {
    const e = pageEvent({
      session_id: "01HZQ8X9TESTSESSIONIDTWO",
      device_type: "mobile",
    });
    const c = mapping.contributions.find(
      (x) => x.metric === "SESSIONS" && x.dimension === "DEVICE",
    );
    if (!c || c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.dimensionValueFrom(e)).toBe("mobile");
    expect(c.distinctKey?.(e)).toBe("01HZQ8X9TESTSESSIONIDTWO");
  });

  it("Fixture 3 — SESSIONS × CITY reads context.geo.city", () => {
    const e = pageEvent(
      { session_id: "01HZQ8X9TESTSESSIONIDTRE" },
      { geo: { country: "SE", city: "Stockholm" } },
    );
    const c = mapping.contributions.find(
      (x) => x.metric === "SESSIONS" && x.dimension === "CITY",
    );
    if (!c || c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.dimensionValueFrom(e)).toBe("Stockholm");
    expect(c.distinctKey?.(e)).toBe("01HZQ8X9TESTSESSIONIDTRE");
  });

  it("Fixture 4 — VISITORS × TOTAL distinct on visitor_id", () => {
    const e = pageEvent({
      session_id: "01HZQ8X9TESTSESSIONIDFOR",
      visitor_id: "01HZVST9TESTVISITORIDABCD",
    });
    const c = mapping.contributions.find(
      (x) => x.metric === "VISITORS" && x.dimension === "TOTAL",
    );
    if (!c || c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.distinctKey?.(e)).toBe("01HZVST9TESTVISITORIDABCD");
  });

  it("Fixture 5 — missing device_type falls back to 'unknown'", () => {
    const e = pageEvent({ session_id: "01HZQ8X9TESTSESSIONIDFIV" });
    const c = mapping.contributions.find(
      (x) => x.metric === "SESSIONS" && x.dimension === "DEVICE",
    );
    if (!c || c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.dimensionValueFrom(e)).toBe("unknown");
  });

  it("Fixture 6 — missing context.geo falls back to 'unknown'", () => {
    const e = pageEvent({ session_id: "01HZQ8X9TESTSESSIONIDSIX" }, null);
    const c = mapping.contributions.find(
      (x) => x.metric === "SESSIONS" && x.dimension === "CITY",
    );
    if (!c || c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.dimensionValueFrom(e)).toBe("unknown");
  });
});

describe("derivedMetrics", () => {
  it("emits AOV = REVENUE/ORDERS when orders > 0", () => {
    const folded = new Map<string, bigint>();
    folded.set(makeAccumulatorKey("REVENUE", "TOTAL", "TOTAL"), BigInt(100_000));
    folded.set(makeAccumulatorKey("ORDERS", "TOTAL", "TOTAL"), BigInt(4));
    const rows = derivedMetrics(folded);
    const aov = rows.find((r) => r.metric === "AVERAGE_ORDER_VALUE");
    expect(aov).toBeDefined();
    expect(aov?.value).toBe(BigInt(25_000));
  });

  it("emits AOV = 0 when no orders (no division-by-zero)", () => {
    const rows = derivedMetrics(new Map());
    const aov = rows.find((r) => r.metric === "AVERAGE_ORDER_VALUE");
    expect(aov?.value).toBe(BigInt(0));
  });

  it("rounds half-up for AOV", () => {
    const folded = new Map<string, bigint>();
    // 100 / 3 = 33.333... → 33 with truncation, 33 with round-half-up too.
    folded.set(makeAccumulatorKey("REVENUE", "TOTAL", "TOTAL"), BigInt(100));
    folded.set(makeAccumulatorKey("ORDERS", "TOTAL", "TOTAL"), BigInt(3));
    const rows1 = derivedMetrics(folded);
    expect(rows1.find((r) => r.metric === "AVERAGE_ORDER_VALUE")?.value).toBe(
      BigInt(33),
    );

    // 5 / 2 = 2.5 → 3 with round-half-up.
    folded.set(makeAccumulatorKey("REVENUE", "TOTAL", "TOTAL"), BigInt(5));
    folded.set(makeAccumulatorKey("ORDERS", "TOTAL", "TOTAL"), BigInt(2));
    const rows2 = derivedMetrics(folded);
    expect(rows2.find((r) => r.metric === "AVERAGE_ORDER_VALUE")?.value).toBe(
      BigInt(3),
    );
  });
});
