/**
 * runAggregateDay — DB I/O tests.
 *
 * Mocks `_unguardedAnalyticsPipelineClient` at the Prisma layer (same
 * pattern as `inngest/functions/drain-analytics-outbox.test.ts`).
 *
 * Includes the "idempotency" smoke (test-name marker that B.6's
 * verify-phase5a-aggregator.ts greps for in check #6). The marker
 * proves the test exists statically; this file's runtime assertions
 * verify the actual behaviour.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "ctest1runneraggregator0000";

// ── Mock state — captures all DB interactions for assertions. ────────────

interface MockEvent {
  tenant_id: string;
  event_name: string;
  schema_version: string;
  occurred_at: Date;
  actor_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  context: Record<string, unknown> | null;
  event_id: string;
}

interface UpsertRecord {
  tenantId: string;
  date: string; // ISO
  metric: string;
  dimension: string;
  dimensionValue: string;
  value: string; // bigint stringified
}

const mockEvents: MockEvent[] = [];
const upsertCalls: UpsertRecord[] = [];
// dailyMetricStore mirrors the analytics.daily_metric table state — keyed
// by composite unique. We rebuild from this on the second run to verify
// idempotence via final-state snapshot.
const dailyMetricStore = new Map<string, UpsertRecord>();

function dailyMetricKey(r: {
  tenantId: string;
  date: string;
  metric: string;
  dimension: string;
  dimensionValue: string;
}): string {
  return `${r.tenantId}|${r.date}|${r.metric}|${r.dimension}|${r.dimensionValue}`;
}

vi.mock("@/app/_lib/db/prisma", () => {
  const mockClient = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      // streamEvents — initial page
      if (sql.includes("FROM analytics.event") && sql.includes("ORDER BY occurred_at ASC, event_id ASC") && !sql.includes("AND (")) {
        const tenantId = values[0] as string;
        const dayStart = values[1] as Date;
        const dayEnd = values[2] as Date;
        return mockEvents
          .filter(
            (e) =>
              e.tenant_id === tenantId &&
              e.occurred_at >= dayStart &&
              e.occurred_at <= dayEnd,
          )
          .sort(
            (a, b) =>
              a.occurred_at.getTime() - b.occurred_at.getTime() ||
              a.event_id.localeCompare(b.event_id),
          );
      }
      // streamEvents — cursor page (we return [] to terminate)
      if (sql.includes("FROM analytics.event") && sql.includes("AND (")) {
        return [];
      }
      // computeReturningCustomerRate — today's actor_ids
      if (sql.includes("payment_succeeded") && sql.includes("actor_id IS NOT NULL")) {
        const tenantId = values[0] as string;
        const dayStart = values[1] as Date;
        const dayEnd = values[2] as Date;
        const actors = new Set(
          mockEvents
            .filter(
              (e) =>
                e.tenant_id === tenantId &&
                e.event_name === "payment_succeeded" &&
                e.occurred_at >= dayStart &&
                e.occurred_at <= dayEnd &&
                e.actor_id !== null,
            )
            .map((e) => e.actor_id as string),
        );
        return Array.from(actors).map((actor_id) => ({ actor_id }));
      }
      // computeReturningCustomerRate — earlier events for these actors
      if (sql.includes("occurred_at <") && sql.includes("actor_id = ANY")) {
        const tenantId = values[0] as string;
        const dayStart = values[1] as Date;
        const actorIds = values[2] as string[];
        const returning = new Set(
          mockEvents
            .filter(
              (e) =>
                e.tenant_id === tenantId &&
                e.occurred_at < dayStart &&
                e.actor_id !== null &&
                actorIds.includes(e.actor_id),
            )
            .map((e) => e.actor_id as string),
        );
        return Array.from(returning).map((actor_id) => ({ actor_id }));
      }
      return [];
    }),
    analyticsDailyMetricV2: {
      upsert: vi.fn(
        async (args: {
          where: {
            tenantId_date_metric_dimension_dimensionValue: {
              tenantId: string;
              date: Date;
              metric: string;
              dimension: string;
              dimensionValue: string;
            };
          };
          create: {
            tenantId: string;
            date: Date;
            metric: string;
            dimension: string;
            dimensionValue: string;
            value: bigint;
          };
          update: { value: bigint };
        }) => {
          const w = args.where.tenantId_date_metric_dimension_dimensionValue;
          const record: UpsertRecord = {
            tenantId: w.tenantId,
            date: w.date.toISOString(),
            metric: w.metric,
            dimension: w.dimension,
            dimensionValue: w.dimensionValue,
            value: args.create.value.toString(),
          };
          upsertCalls.push(record);
          dailyMetricStore.set(dailyMetricKey(record), record);
          return record;
        },
      ),
    },
  };
  return {
    _unguardedAnalyticsPipelineClient: mockClient,
    prisma: mockClient,
  };
});

// Lazy import — vi.mock must register before the SUT loads.
const { runAggregateDay } = await import("./aggregate-day-runner");

describe("runAggregateDay", () => {
  beforeEach(() => {
    mockEvents.length = 0;
    upsertCalls.length = 0;
    dailyMetricStore.clear();
  });

  it("happy path — folds events and writes daily_metric rows", async () => {
    const day = new Date("2026-05-01T00:00:00.000Z");
    mockEvents.push({
      tenant_id: TENANT,
      event_name: "payment_succeeded",
      schema_version: "0.2.0",
      occurred_at: new Date("2026-05-01T12:00:00Z"),
      actor_type: "guest",
      actor_id: "guest_1",
      payload: {
        amount: { amount: 50_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      },
      context: null,
      event_id: "01HZ5RUNNER000000000000001",
    });
    mockEvents.push({
      tenant_id: TENANT,
      event_name: "payment_succeeded",
      schema_version: "0.2.0",
      occurred_at: new Date("2026-05-01T15:00:00Z"),
      actor_type: "guest",
      actor_id: "guest_2",
      payload: {
        amount: { amount: 30_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      },
      context: null,
      event_id: "01HZ5RUNNER000000000000002",
    });

    const result = await runAggregateDay(TENANT, day);
    expect(result.errors).toEqual([]);
    expect(result.eventsRead).toBe(2);
    expect(result.rowsWritten).toBeGreaterThan(0);

    const revenueTotal = upsertCalls.find(
      (u) =>
        u.metric === "REVENUE" &&
        u.dimension === "TOTAL" &&
        u.dimensionValue === "TOTAL",
    );
    expect(revenueTotal?.value).toBe("80000");
  });

  it("idempotency — running twice produces identical final DB state", async () => {
    const day = new Date("2026-05-02T00:00:00.000Z");
    mockEvents.push({
      tenant_id: TENANT,
      event_name: "payment_succeeded",
      schema_version: "0.2.0",
      occurred_at: new Date("2026-05-02T10:00:00Z"),
      actor_type: "guest",
      actor_id: "guest_idem_1",
      payload: {
        amount: { amount: 12_345, currency: "SEK" },
        source_channel: "third_party_ota",
        line_items: [{ product_id: "prod_x", amount: 12_345 }],
      },
      context: null,
      event_id: "01HZ5IDEMP000000000000001",
    });

    // ── Run #1
    const r1 = await runAggregateDay(TENANT, day);
    expect(r1.errors).toEqual([]);
    const snapshot1 = new Map(dailyMetricStore);

    // ── Run #2 (mock store carries forward — simulates real DB)
    upsertCalls.length = 0;
    const r2 = await runAggregateDay(TENANT, day);
    expect(r2.errors).toEqual([]);
    const snapshot2 = new Map(dailyMetricStore);

    // Same set of keys.
    expect(Array.from(snapshot1.keys()).sort()).toEqual(
      Array.from(snapshot2.keys()).sort(),
    );
    // Same value at every key.
    for (const k of snapshot1.keys()) {
      expect(snapshot2.get(k)?.value).toBe(snapshot1.get(k)?.value);
    }
  });

  it("returns 0 events with no errors when no events exist for the day", async () => {
    const day = new Date("2026-05-03T00:00:00.000Z");
    const result = await runAggregateDay(TENANT, day);
    expect(result.errors).toEqual([]);
    expect(result.eventsRead).toBe(0);
    // AOV=0 + RETURNING_CUSTOMER_RATE=0 are still emitted.
    expect(result.rowsWritten).toBeGreaterThanOrEqual(2);
  });

  it("scopes events strictly to (tenantId, day-range)", async () => {
    // Insert: matching event, wrong tenant, wrong day. Only the
    // matching event must contribute.
    const day = new Date("2026-05-04T00:00:00.000Z");
    mockEvents.push({
      tenant_id: TENANT,
      event_name: "payment_succeeded",
      schema_version: "0.2.0",
      occurred_at: new Date("2026-05-04T12:00:00Z"),
      actor_type: "guest",
      actor_id: "g_a",
      payload: {
        amount: { amount: 1_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      },
      context: null,
      event_id: "01HZSCOPE000000000000000A",
    });
    mockEvents.push({
      tenant_id: "OTHER_TENANT",
      event_name: "payment_succeeded",
      schema_version: "0.2.0",
      occurred_at: new Date("2026-05-04T12:00:00Z"),
      actor_type: "guest",
      actor_id: "g_b",
      payload: {
        amount: { amount: 9_999_999, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      },
      context: null,
      event_id: "01HZSCOPE000000000000000B",
    });
    mockEvents.push({
      tenant_id: TENANT,
      event_name: "payment_succeeded",
      schema_version: "0.2.0",
      occurred_at: new Date("2026-05-03T23:00:00Z"), // previous day
      actor_type: "guest",
      actor_id: "g_c",
      payload: {
        amount: { amount: 8_888_888, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      },
      context: null,
      event_id: "01HZSCOPE000000000000000C",
    });

    const result = await runAggregateDay(TENANT, day);
    expect(result.errors).toEqual([]);
    expect(result.eventsRead).toBe(1);
    const revenueTotal = upsertCalls.find(
      (u) =>
        u.metric === "REVENUE" &&
        u.dimension === "TOTAL" &&
        u.dimensionValue === "TOTAL",
    );
    expect(revenueTotal?.value).toBe("1000");
  });

  it("computes RETURNING_CUSTOMER_RATE basis points (returning over today)", async () => {
    const day = new Date("2026-05-05T00:00:00.000Z");
    // guest_old: paid yesterday AND today — counts as returning
    mockEvents.push({
      tenant_id: TENANT,
      event_name: "page_viewed",
      schema_version: "0.1.0",
      occurred_at: new Date("2026-05-04T12:00:00Z"),
      actor_type: "guest",
      actor_id: "guest_old",
      payload: { session_id: "01HZRET000SESSAAAAAAAAAA01" },
      context: null,
      event_id: "01HZRET000000000000000001",
    });
    mockEvents.push({
      tenant_id: TENANT,
      event_name: "payment_succeeded",
      schema_version: "0.2.0",
      occurred_at: new Date("2026-05-05T12:00:00Z"),
      actor_type: "guest",
      actor_id: "guest_old",
      payload: {
        amount: { amount: 1_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      },
      context: null,
      event_id: "01HZRET000000000000000002",
    });
    // guest_new: only today — counts as new (denom + 1, num + 0)
    mockEvents.push({
      tenant_id: TENANT,
      event_name: "payment_succeeded",
      schema_version: "0.2.0",
      occurred_at: new Date("2026-05-05T13:00:00Z"),
      actor_type: "guest",
      actor_id: "guest_new",
      payload: {
        amount: { amount: 2_000, currency: "SEK" },
        source_channel: "direct",
        line_items: [],
      },
      context: null,
      event_id: "01HZRET000000000000000003",
    });

    const result = await runAggregateDay(TENANT, day);
    expect(result.errors).toEqual([]);
    const rcr = upsertCalls.find((u) => u.metric === "RETURNING_CUSTOMER_RATE");
    // 1 returning out of 2 today = 50% = 5000 basis points.
    expect(rcr?.value).toBe("5000");
  });
});
