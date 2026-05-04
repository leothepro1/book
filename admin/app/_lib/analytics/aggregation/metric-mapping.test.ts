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
      "cart_started@0.2.0",
      "checkout_started@0.2.0",
      "cart_abandoned@0.2.0",
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

describe("cart_started@0.2.0 mapping", () => {
  const mapping = findMapping("cart_started", "0.2.0")!;

  function cartEvent(payload: Record<string, unknown>): AnalyticsEventRow {
    return row({
      event_name: "cart_started",
      schema_version: "0.2.0",
      payload,
    });
  }

  it("Fixture 1 — CART_STARTED × TOTAL distinct on cart_id", () => {
    const e = cartEvent({
      cart_id: "01HZCART1AAAAAAAAAAAAAAAAA",
      product_id: "prod_x",
      cart_total: { amount: 12_000, currency: "SEK" },
    });
    const c = mapping.contributions[0];
    if (c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.metric).toBe("CART_STARTED");
    expect(c.dimension).toBe("TOTAL");
    expect(c.dimensionValueFrom(e)).toBe("TOTAL");
    expect(c.aggregator).toBe("distinct");
    expect(c.distinctKey?.(e)).toBe("01HZCART1AAAAAAAAAAAAAAAAA");
  });

  it("Fixture 2 — distinct on cart_id when same id appears twice", () => {
    const c = mapping.contributions[0];
    if (c.kind === "expand") throw new Error("expected scalar contribution");
    const e1 = cartEvent({
      cart_id: "01HZCART2BBBBBBBBBBBBBBBBB",
      product_id: "prod_x",
      cart_total: { amount: 100, currency: "SEK" },
    });
    const e2 = cartEvent({
      cart_id: "01HZCART2BBBBBBBBBBBBBBBBB",
      product_id: "prod_y",
      cart_total: { amount: 200, currency: "SEK" },
    });
    expect(c.distinctKey?.(e1)).toBe(c.distinctKey?.(e2));
  });

  it("Fixture 3 — different cart_id produces different distinct keys", () => {
    const c = mapping.contributions[0];
    if (c.kind === "expand") throw new Error("expected scalar contribution");
    const e1 = cartEvent({
      cart_id: "01HZCART3CCCCCCCCCCCCCCCCC",
      product_id: "prod_x",
      cart_total: { amount: 100, currency: "SEK" },
    });
    const e2 = cartEvent({
      cart_id: "01HZCART3DDDDDDDDDDDDDDDDD",
      product_id: "prod_x",
      cart_total: { amount: 100, currency: "SEK" },
    });
    expect(c.distinctKey?.(e1)).not.toBe(c.distinctKey?.(e2));
  });
});

describe("checkout_started@0.2.0 mapping", () => {
  const mapping = findMapping("checkout_started", "0.2.0")!;

  function checkoutEvent(payload: Record<string, unknown>): AnalyticsEventRow {
    return row({
      event_name: "checkout_started",
      schema_version: "0.2.0",
      payload,
    });
  }

  it("Fixture 1 — CHECKOUT_STARTED × TOTAL distinct on cart_id", () => {
    const e = checkoutEvent({
      cart_id: "01HZCHKO1AAAAAAAAAAAAAAAAA",
      items_count: 3,
      line_items_count: 2,
      cart_total: { amount: 30_000, currency: "SEK" },
    });
    const c = mapping.contributions[0];
    if (c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.metric).toBe("CHECKOUT_STARTED");
    expect(c.dimension).toBe("TOTAL");
    expect(c.dimensionValueFrom(e)).toBe("TOTAL");
    expect(c.aggregator).toBe("distinct");
    expect(c.distinctKey?.(e)).toBe("01HZCHKO1AAAAAAAAAAAAAAAAA");
  });

  it("Fixture 2 — distinct on cart_id when worker double-fires beacon", () => {
    const c = mapping.contributions[0];
    if (c.kind === "expand") throw new Error("expected scalar contribution");
    const payload = {
      cart_id: "01HZCHKO2BBBBBBBBBBBBBBBBB",
      items_count: 1,
      line_items_count: 1,
      cart_total: { amount: 100, currency: "SEK" },
    };
    expect(c.distinctKey?.(checkoutEvent(payload))).toBe(
      c.distinctKey?.(checkoutEvent(payload)),
    );
  });

  it("Fixture 3 — different cart_id distinct keys do not collide", () => {
    const c = mapping.contributions[0];
    if (c.kind === "expand") throw new Error("expected scalar contribution");
    const e1 = checkoutEvent({
      cart_id: "01HZCHKO3CCCCCCCCCCCCCCCCC",
      items_count: 1,
      line_items_count: 1,
      cart_total: { amount: 100, currency: "SEK" },
    });
    const e2 = checkoutEvent({
      cart_id: "01HZCHKO3DDDDDDDDDDDDDDDDD",
      items_count: 1,
      line_items_count: 1,
      cart_total: { amount: 100, currency: "SEK" },
    });
    expect(c.distinctKey?.(e1)).not.toBe(c.distinctKey?.(e2));
  });
});

describe("cart_abandoned@0.2.0 mapping", () => {
  const mapping = findMapping("cart_abandoned", "0.2.0")!;

  function abandonedEvent(payload: Record<string, unknown>): AnalyticsEventRow {
    return row({
      event_name: "cart_abandoned",
      schema_version: "0.2.0",
      payload,
    });
  }

  it("Fixture 1 — CART_ABANDONED × TOTAL distinct on cart_id", () => {
    const e = abandonedEvent({
      cart_id: "01HZABND1AAAAAAAAAAAAAAAAA",
      items_count: 2,
      line_items_count: 2,
      cart_total: { amount: 5_000, currency: "SEK" },
      time_since_last_interaction_ms: 60_000,
    });
    const c = mapping.contributions[0];
    if (c.kind === "expand") throw new Error("expected scalar contribution");
    expect(c.metric).toBe("CART_ABANDONED");
    expect(c.dimension).toBe("TOTAL");
    expect(c.dimensionValueFrom(e)).toBe("TOTAL");
    expect(c.aggregator).toBe("distinct");
    expect(c.distinctKey?.(e)).toBe("01HZABND1AAAAAAAAAAAAAAAAA");
  });

  it("Fixture 2 — sendBeacon double-fire collapses to one distinct cart_id", () => {
    const c = mapping.contributions[0];
    if (c.kind === "expand") throw new Error("expected scalar contribution");
    const payload = {
      cart_id: "01HZABND2BBBBBBBBBBBBBBBBB",
      items_count: 1,
      line_items_count: 1,
      cart_total: { amount: 100, currency: "SEK" },
      time_since_last_interaction_ms: 30_000,
    };
    expect(c.distinctKey?.(abandonedEvent(payload))).toBe(
      c.distinctKey?.(abandonedEvent(payload)),
    );
  });

  it("Fixture 3 — different abandoned carts produce different distinct keys", () => {
    const c = mapping.contributions[0];
    if (c.kind === "expand") throw new Error("expected scalar contribution");
    const e1 = abandonedEvent({
      cart_id: "01HZABND3CCCCCCCCCCCCCCCCC",
      items_count: 1,
      line_items_count: 1,
      cart_total: { amount: 100, currency: "SEK" },
      time_since_last_interaction_ms: 10_000,
    });
    const e2 = abandonedEvent({
      cart_id: "01HZABND3DDDDDDDDDDDDDDDDD",
      items_count: 1,
      line_items_count: 1,
      cart_total: { amount: 100, currency: "SEK" },
      time_since_last_interaction_ms: 10_000,
    });
    expect(c.distinctKey?.(e1)).not.toBe(c.distinctKey?.(e2));
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

describe("derivedMetrics — funnel rates", () => {
  // Helper — builds a folded Map populated with the funnel base counts
  // (and optional ORDERS for completion rate). All other AOV-related
  // keys are left empty unless the test sets them.
  function foldedWith(counts: {
    cartStarted?: number;
    checkoutStarted?: number;
    cartAbandoned?: number;
    orders?: number;
  }): Map<string, bigint> {
    const folded = new Map<string, bigint>();
    if (counts.cartStarted !== undefined) {
      folded.set(
        makeAccumulatorKey("CART_STARTED", "TOTAL", "TOTAL"),
        BigInt(counts.cartStarted),
      );
    }
    if (counts.checkoutStarted !== undefined) {
      folded.set(
        makeAccumulatorKey("CHECKOUT_STARTED", "TOTAL", "TOTAL"),
        BigInt(counts.checkoutStarted),
      );
    }
    if (counts.cartAbandoned !== undefined) {
      folded.set(
        makeAccumulatorKey("CART_ABANDONED", "TOTAL", "TOTAL"),
        BigInt(counts.cartAbandoned),
      );
    }
    if (counts.orders !== undefined) {
      folded.set(
        makeAccumulatorKey("ORDERS", "TOTAL", "TOTAL"),
        BigInt(counts.orders),
      );
    }
    return folded;
  }

  it("CART_TO_CHECKOUT_RATE — 30/100 = 30% (3000 bp)", () => {
    const rows = derivedMetrics(
      foldedWith({ cartStarted: 100, checkoutStarted: 30 }),
    );
    const r = rows.find((x) => x.metric === "CART_TO_CHECKOUT_RATE");
    expect(r?.value).toBe(BigInt(3000));
  });

  it("CART_ABANDONMENT_RATE — 70/100 = 70% (7000 bp)", () => {
    const rows = derivedMetrics(
      foldedWith({ cartStarted: 100, cartAbandoned: 70 }),
    );
    const r = rows.find((x) => x.metric === "CART_ABANDONMENT_RATE");
    expect(r?.value).toBe(BigInt(7000));
  });

  it("CHECKOUT_COMPLETION_RATE — 25/30 ≈ 83.33% (8333 bp)", () => {
    const rows = derivedMetrics(
      foldedWith({ checkoutStarted: 30, orders: 25 }),
    );
    const r = rows.find((x) => x.metric === "CHECKOUT_COMPLETION_RATE");
    expect(r?.value).toBe(BigInt(8333));
  });

  it("zero-divide guard — cart_started=0 omits CART_TO_CHECKOUT_RATE", () => {
    const rows = derivedMetrics(foldedWith({ cartStarted: 0, checkoutStarted: 5 }));
    expect(
      rows.find((x) => x.metric === "CART_TO_CHECKOUT_RATE"),
    ).toBeUndefined();
  });

  it("zero-divide guard — cart_started=0 omits CART_ABANDONMENT_RATE", () => {
    const rows = derivedMetrics(foldedWith({ cartStarted: 0, cartAbandoned: 5 }));
    expect(
      rows.find((x) => x.metric === "CART_ABANDONMENT_RATE"),
    ).toBeUndefined();
  });

  it("zero-divide guard — checkout_started=0 omits CHECKOUT_COMPLETION_RATE", () => {
    const rows = derivedMetrics(foldedWith({ checkoutStarted: 0, orders: 5 }));
    expect(
      rows.find((x) => x.metric === "CHECKOUT_COMPLETION_RATE"),
    ).toBeUndefined();
  });

  it("all-zero scenario — no funnel-rate rows emitted", () => {
    const rows = derivedMetrics(new Map());
    expect(rows.find((x) => x.metric === "CART_TO_CHECKOUT_RATE")).toBeUndefined();
    expect(rows.find((x) => x.metric === "CART_ABANDONMENT_RATE")).toBeUndefined();
    expect(
      rows.find((x) => x.metric === "CHECKOUT_COMPLETION_RATE"),
    ).toBeUndefined();
    // AOV is still emitted as 0 (Phase 5A's existing behaviour).
    expect(rows.find((x) => x.metric === "AVERAGE_ORDER_VALUE")?.value).toBe(
      BigInt(0),
    );
  });

  it("missing keys treated as 0 — partial input doesn't crash", () => {
    // Only cart_started present; checkout/abandoned/orders all missing.
    const rows = derivedMetrics(foldedWith({ cartStarted: 50 }));
    // CART_TO_CHECKOUT_RATE = 0 / 50 = 0 bp (rate emitted, value 0).
    expect(rows.find((x) => x.metric === "CART_TO_CHECKOUT_RATE")?.value).toBe(
      BigInt(0),
    );
    // CART_ABANDONMENT_RATE = 0 / 50 = 0 bp.
    expect(rows.find((x) => x.metric === "CART_ABANDONMENT_RATE")?.value).toBe(
      BigInt(0),
    );
    // CHECKOUT_COMPLETION_RATE — denominator 0, omitted.
    expect(
      rows.find((x) => x.metric === "CHECKOUT_COMPLETION_RATE"),
    ).toBeUndefined();
  });

  it("cross-day carryover — checkout_started > cart_started yields rate > 100%", () => {
    // Documented behaviour: same-day approximation means a cart that
    // started yesterday and checked out today inflates today's
    // CART_TO_CHECKOUT_RATE above 10000 bp. Aggregator does NOT clamp.
    const rows = derivedMetrics(
      foldedWith({ cartStarted: 10, checkoutStarted: 15 }),
    );
    const r = rows.find((x) => x.metric === "CART_TO_CHECKOUT_RATE");
    expect(r?.value).toBe(BigInt(15_000));
  });

  it("rounds half-up to nearest basis point", () => {
    // 1 / 3 = 0.3333... → 3333 bp (Math.round half-up; 3333.33 → 3333)
    expect(
      derivedMetrics(
        foldedWith({ cartStarted: 3, checkoutStarted: 1 }),
      ).find((x) => x.metric === "CART_TO_CHECKOUT_RATE")?.value,
    ).toBe(BigInt(3333));

    // 2 / 3 = 0.6666... → 6667 bp (Math.round half-up; 6666.67 → 6667)
    expect(
      derivedMetrics(
        foldedWith({ cartStarted: 3, checkoutStarted: 2 }),
      ).find((x) => x.metric === "CART_TO_CHECKOUT_RATE")?.value,
    ).toBe(BigInt(6667));
  });
});
