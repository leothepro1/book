/**
 * aggregateEvents() — pure-compute fold tests.
 *
 * Per recon §B.3: 10+ fixtures including:
 * - payment_succeeded (sum REVENUE/ORDERS)
 * - page_viewed (distinct SESSIONS)
 * - booking_completed (sum REVENUE × CHANNEL)
 * - mixed event-stream (interleaved types)
 * - empty input → empty output
 * - unknown event_name → skipped without crash
 * - missing schema_version mapping → skipped without crash
 * - async-generator input (exercises AsyncIterable)
 * - idempotence: same input → same output
 * - large volume: 50,000 events without OOM (smoke)
 */

import { describe, expect, it } from "vitest";

import { aggregateEvents } from "./aggregate-day";
import type { AnalyticsEventRow } from "./metric-mapping";

const TENANT = "ctest1aggregate0000000000";
const DATE = new Date("2026-05-01T00:00:00.000Z");

function event(overrides: Partial<AnalyticsEventRow>): AnalyticsEventRow {
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

function paymentEvent(
  payload: Record<string, unknown>,
  overrides: Partial<AnalyticsEventRow> = {},
): AnalyticsEventRow {
  return event({
    event_name: "payment_succeeded",
    schema_version: "0.2.0",
    payload,
    ...overrides,
  });
}

function bookingEvent(
  payload: Record<string, unknown>,
): AnalyticsEventRow {
  return event({
    event_name: "booking_completed",
    schema_version: "0.1.0",
    payload,
  });
}

function pageEvent(
  payload: Record<string, unknown>,
  context: Record<string, unknown> | null = null,
): AnalyticsEventRow {
  return event({
    event_name: "page_viewed",
    schema_version: "0.1.0",
    payload,
    context,
  });
}

async function* fromArray<T>(arr: T[]): AsyncIterable<T> {
  for (const x of arr) yield x;
}

function findRow(
  rows: Array<{ metric: string; dimension: string; dimensionValue: string; value: bigint }>,
  metric: string,
  dimension: string,
  dimensionValue: string,
) {
  return rows.find(
    (r) =>
      r.metric === metric &&
      r.dimension === dimension &&
      r.dimensionValue === dimensionValue,
  );
}

describe("aggregateEvents — payment_succeeded sum", () => {
  it("Fixture 1 — sums REVENUE and counts ORDERS over a single channel", async () => {
    const events = [
      paymentEvent({
        payment_id: "ord_1",
        amount: { amount: 12_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      }),
      paymentEvent({
        payment_id: "ord_2",
        amount: { amount: 8_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      }),
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE);
    expect(findRow(rows, "REVENUE", "TOTAL", "TOTAL")?.value).toBe(BigInt(20_000));
    expect(findRow(rows, "ORDERS", "TOTAL", "TOTAL")?.value).toBe(BigInt(2));
    expect(findRow(rows, "REVENUE", "CHANNEL", "direct")?.value).toBe(
      BigInt(20_000),
    );
    expect(findRow(rows, "ORDERS", "CHANNEL", "direct")?.value).toBe(BigInt(2));
  });

  it("Fixture 2 — splits REVENUE × CHANNEL across multiple channels", async () => {
    const events = [
      paymentEvent({
        payment_id: "ord_1",
        amount: { amount: 100, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      }),
      paymentEvent({
        payment_id: "ord_2",
        amount: { amount: 200, currency: "SEK" },
        source_channel: "third_party_ota",
        line_items: [],
      }),
      paymentEvent({
        payment_id: "ord_3",
        amount: { amount: 300, currency: "SEK" },
        source_channel: "third_party_ota",
        line_items: [],
      }),
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE);
    expect(findRow(rows, "REVENUE", "CHANNEL", "direct")?.value).toBe(
      BigInt(100),
    );
    expect(findRow(rows, "REVENUE", "CHANNEL", "third_party_ota")?.value).toBe(
      BigInt(500),
    );
    expect(findRow(rows, "ORDERS", "CHANNEL", "third_party_ota")?.value).toBe(
      BigInt(2),
    );
  });

  it("Fixture 3 — REVENUE × PRODUCT expands line_items[]", async () => {
    const events = [
      paymentEvent({
        payment_id: "ord_1",
        amount: { amount: 30_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [
          { product_id: "prod_a", amount: 10_000 },
          { product_id: "prod_b", amount: 20_000 },
        ],
      }),
      paymentEvent({
        payment_id: "ord_2",
        amount: { amount: 5_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [{ product_id: "prod_a", amount: 5_000 }],
      }),
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE);
    expect(findRow(rows, "REVENUE", "PRODUCT", "prod_a")?.value).toBe(
      BigInt(15_000),
    );
    expect(findRow(rows, "REVENUE", "PRODUCT", "prod_b")?.value).toBe(
      BigInt(20_000),
    );
  });
});

describe("aggregateEvents — page_viewed distinct", () => {
  it("Fixture 4 — distinct SESSIONS counts unique session_id", async () => {
    const events = [
      pageEvent({ session_id: "01HZTESTSESSIONONEAAAAAAAA", page_type: "home" }),
      pageEvent({ session_id: "01HZTESTSESSIONONEAAAAAAAA", page_type: "stay" }),
      pageEvent({ session_id: "01HZTESTSESSIONTWOBBBBBBBB", page_type: "home" }),
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE);
    expect(findRow(rows, "SESSIONS", "TOTAL", "TOTAL")?.value).toBe(BigInt(2));
  });

  it("Fixture 5 — distinct SESSIONS × DEVICE buckets sessions per device", async () => {
    const events = [
      pageEvent({
        session_id: "01HZTESTDESKTOPSESSAAAAAAAA",
        device_type: "desktop",
      }),
      pageEvent({
        session_id: "01HZTESTDESKTOPSESSAAAAAAAA",
        device_type: "desktop",
      }),
      pageEvent({
        session_id: "01HZTESTMOBILESESSBBBBBBBBB",
        device_type: "mobile",
      }),
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE);
    expect(findRow(rows, "SESSIONS", "DEVICE", "desktop")?.value).toBe(BigInt(1));
    expect(findRow(rows, "SESSIONS", "DEVICE", "mobile")?.value).toBe(BigInt(1));
  });

  it("Fixture 6 — distinct SESSIONS × CITY reads context.geo.city", async () => {
    const events = [
      pageEvent(
        { session_id: "01HZTESTSTHLMSESSAAAAAAAAAA" },
        { geo: { country: "SE", city: "Stockholm" } },
      ),
      pageEvent(
        { session_id: "01HZTESTGBGSESSBBBBBBBBBBBB" },
        { geo: { country: "SE", city: "Göteborg" } },
      ),
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE);
    expect(findRow(rows, "SESSIONS", "CITY", "Stockholm")?.value).toBe(
      BigInt(1),
    );
    expect(findRow(rows, "SESSIONS", "CITY", "Göteborg")?.value).toBe(
      BigInt(1),
    );
  });

  it("Fixture 7 — VISITORS distinct on visitor_id, ignores empty/missing", async () => {
    const events = [
      pageEvent({
        session_id: "01HZTESTVISIT1SESSAAAAAAAAA",
        visitor_id: "01HZVST1VISITORONEAAAAAAAA",
      }),
      pageEvent({
        session_id: "01HZTESTVISIT2SESSBBBBBBBBB",
        visitor_id: "01HZVST1VISITORONEAAAAAAAA",
      }),
      pageEvent({
        session_id: "01HZTESTVISIT3SESSCCCCCCCCC",
        visitor_id: "01HZVST2VISITORTWOBBBBBBBB",
      }),
      pageEvent({ session_id: "01HZTESTVISIT4SESSDDDDDDDDD" }), // no visitor_id
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE);
    // Two distinct visitor_ids; row without visitor_id is excluded.
    expect(findRow(rows, "VISITORS", "TOTAL", "TOTAL")?.value).toBe(BigInt(2));
  });
});

describe("aggregateEvents — booking_completed", () => {
  it("Fixture 8 — REVENUE × CHANNEL accumulates booking total_amount", async () => {
    const events = [
      bookingEvent({
        booking_id: "bk_1",
        total_amount: { amount: 100_000, currency: "SEK" },
        source_channel: "direct",
      }),
      bookingEvent({
        booking_id: "bk_2",
        total_amount: { amount: 50_000, currency: "SEK" },
        source_channel: "pms_import",
      }),
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE);
    expect(findRow(rows, "REVENUE", "CHANNEL", "direct")?.value).toBe(
      BigInt(100_000),
    );
    expect(findRow(rows, "REVENUE", "CHANNEL", "pms_import")?.value).toBe(
      BigInt(50_000),
    );
    expect(findRow(rows, "ORDERS", "CHANNEL", "direct")?.value).toBe(BigInt(1));
    expect(findRow(rows, "ORDERS", "CHANNEL", "pms_import")?.value).toBe(
      BigInt(1),
    );
  });
});

describe("aggregateEvents — mixed and edge cases", () => {
  it("Fixture 9 — mixed event-stream with all three event types interleaved", async () => {
    const events = [
      paymentEvent({
        payment_id: "ord_1",
        amount: { amount: 10_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      }),
      pageEvent({ session_id: "01HZTESTMIXSESS1AAAAAAAAAAA" }),
      bookingEvent({
        booking_id: "bk_1",
        total_amount: { amount: 5_000, currency: "SEK" },
        source_channel: "direct",
      }),
      pageEvent({ session_id: "01HZTESTMIXSESS2BBBBBBBBBBB" }),
      paymentEvent({
        payment_id: "ord_2",
        amount: { amount: 20_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      }),
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE);
    expect(findRow(rows, "REVENUE", "TOTAL", "TOTAL")?.value).toBe(
      BigInt(30_000),
    );
    expect(findRow(rows, "ORDERS", "TOTAL", "TOTAL")?.value).toBe(BigInt(2));
    expect(findRow(rows, "SESSIONS", "TOTAL", "TOTAL")?.value).toBe(BigInt(2));
    // booking + payment both contribute to CHANNEL — payment_succeeded
    // adds 30_000 (10k + 20k), booking_completed adds 5_000.
    expect(findRow(rows, "REVENUE", "CHANNEL", "direct")?.value).toBe(
      BigInt(35_000),
    );
  });

  it("Fixture 10 — empty input produces empty output (just AOV=0)", async () => {
    const rows = await aggregateEvents(fromArray([]), TENANT, DATE);
    // AOV is always emitted (0 when no orders). Other rows absent.
    expect(rows.length).toBe(1);
    expect(findRow(rows, "AVERAGE_ORDER_VALUE", "TOTAL", "TOTAL")?.value).toBe(
      BigInt(0),
    );
  });

  it("Fixture 11 — unknown event_name skipped, callback fires once", async () => {
    const seen: Array<{ eventName: string; schemaVersion: string }> = [];
    const events = [
      event({
        event_name: "future_unknown_event",
        schema_version: "0.1.0",
        payload: {},
      }),
      event({
        event_name: "future_unknown_event",
        schema_version: "0.1.0",
        payload: {},
      }),
      paymentEvent({
        payment_id: "ord_1",
        amount: { amount: 100, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      }),
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE, {
      onUnmapped: (info) => seen.push(info),
    });
    expect(seen).toEqual([
      { eventName: "future_unknown_event", schemaVersion: "0.1.0" },
    ]); // dedup'd
    expect(findRow(rows, "REVENUE", "TOTAL", "TOTAL")?.value).toBe(BigInt(100));
  });

  it("Fixture 12 — known event_name with unmapped schema_version skipped", async () => {
    const seen: Array<{ eventName: string; schemaVersion: string }> = [];
    const events = [
      event({
        event_name: "payment_succeeded",
        schema_version: "0.1.0", // legacy version — registry only has 0.2.0
        payload: {
          amount: { amount: 999, currency: "SEK" },
        },
      }),
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE, {
      onUnmapped: (info) => seen.push(info),
    });
    expect(seen).toEqual([
      { eventName: "payment_succeeded", schemaVersion: "0.1.0" },
    ]);
    // No REVENUE rows produced — only AOV=0.
    expect(findRow(rows, "REVENUE", "TOTAL", "TOTAL")).toBeUndefined();
  });

  it("Fixture 13 — AOV is derived from REVENUE/ORDERS post-fold", async () => {
    const events = [
      paymentEvent({
        payment_id: "ord_1",
        amount: { amount: 30_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      }),
      paymentEvent({
        payment_id: "ord_2",
        amount: { amount: 70_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      }),
    ];
    const rows = await aggregateEvents(fromArray(events), TENANT, DATE);
    // 100_000 / 2 = 50_000.
    expect(findRow(rows, "AVERAGE_ORDER_VALUE", "TOTAL", "TOTAL")?.value).toBe(
      BigInt(50_000),
    );
  });
});

describe("aggregateEvents — idempotence", () => {
  it("Fixture 14 — same input produces deterministic output (idempotency)", async () => {
    // Recon §6.7: pure-function step produces deterministic same rows
    // for the same input. The runner's upsert layer applies them.
    // Asserts row-set equality after sorting by composite key.
    const events = [
      paymentEvent({
        payment_id: "ord_1",
        amount: { amount: 12_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [{ product_id: "prod_x", amount: 12_000 }],
      }),
      pageEvent({
        session_id: "01HZIDEMPSESSAAAAAAAAAAAAAA",
        device_type: "mobile",
      }),
      bookingEvent({
        booking_id: "bk_1",
        total_amount: { amount: 5_000, currency: "SEK" },
        source_channel: "direct",
      }),
    ];

    const norm = (
      r: Array<{
        metric: string;
        dimension: string;
        dimensionValue: string;
        value: bigint;
      }>,
    ) =>
      r
        .map((x) => ({
          metric: x.metric,
          dimension: x.dimension,
          dimensionValue: x.dimensionValue,
          value: x.value.toString(),
        }))
        .sort((a, b) =>
          (a.metric + a.dimension + a.dimensionValue).localeCompare(
            b.metric + b.dimension + b.dimensionValue,
          ),
        );

    const a = await aggregateEvents(fromArray(events), TENANT, DATE);
    const b = await aggregateEvents(fromArray(events), TENANT, DATE);
    expect(norm(a)).toEqual(norm(b));
  });
});

describe("aggregateEvents — async streaming", () => {
  it("Fixture 15 — async-generator with delays still aggregates correctly", async () => {
    async function* lazy(): AsyncIterable<AnalyticsEventRow> {
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 0));
        yield paymentEvent({
          payment_id: `ord_${i}`,
          amount: { amount: 1_000, currency: "SEK" },
          source_channel: "direct",
          line_items: [],
        });
      }
    }
    const rows = await aggregateEvents(lazy(), TENANT, DATE);
    expect(findRow(rows, "REVENUE", "TOTAL", "TOTAL")?.value).toBe(BigInt(5_000));
    expect(findRow(rows, "ORDERS", "TOTAL", "TOTAL")?.value).toBe(BigInt(5));
  });

  it("Fixture 16 — large volume (50k events) folds without OOM and stays correct", async () => {
    // Smoke-test for the streaming / fold-pattern claim (recon §3.3,
    // memory-budget under 50 MB regardless of input volume). 50k is
    // 1/24 of the worst-case daily per-tenant volume — large enough
    // to catch O(N²) regressions but fast enough for unit tests.
    async function* big(): AsyncIterable<AnalyticsEventRow> {
      for (let i = 0; i < 50_000; i++) {
        yield paymentEvent({
          payment_id: `ord_${i}`,
          amount: { amount: 100, currency: "SEK" },
          source_channel: i % 2 === 0 ? "direct" : "third_party_ota",
          line_items: [],
        });
      }
    }
    const rows = await aggregateEvents(big(), TENANT, DATE);
    expect(findRow(rows, "REVENUE", "TOTAL", "TOTAL")?.value).toBe(
      BigInt(5_000_000),
    );
    expect(findRow(rows, "ORDERS", "TOTAL", "TOTAL")?.value).toBe(
      BigInt(50_000),
    );
    expect(findRow(rows, "REVENUE", "CHANNEL", "direct")?.value).toBe(
      BigInt(2_500_000),
    );
  });
});
