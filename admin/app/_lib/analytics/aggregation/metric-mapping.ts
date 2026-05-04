/**
 * Phase 5A — declarative event → metric mapping registry.
 *
 * Single source of truth for "which metric does which event contribute
 * to, on which dimension, with what value". The aggregator core
 * (`aggregate-day.ts`) is a pure fold that consumes this registry — it
 * holds no metric-specific logic.
 *
 * Adding a new metric = adding a `MetricContribution` to the relevant
 * `EventMapping`, never editing the aggregator.
 *
 * Aggregator semantics (mechanical spec):
 *
 *   aggregator: "sum"      — value = SUM(valueFrom(e)) over events
 *                            matching (metric, dimension, dimensionValue).
 *   aggregator: "count"    — value = COUNT(*) over matching events.
 *                            valueFrom is ignored.
 *   aggregator: "distinct" — value = COUNT(DISTINCT distinctKey(e)) over
 *                            matching events. valueFrom is ignored;
 *                            distinctKey is required (compile error if
 *                            absent on a distinct contribution).
 *
 * Contribution kinds:
 *
 *   "scalar" — emits exactly one (dimensionValue, value) pair per event.
 *              The default; `kind` may be omitted.
 *   "expand" — emits zero-or-more (dimensionValue, value) pairs per
 *              event by iterating something inside the payload (e.g.
 *              `line_items[]` for REVENUE × PRODUCT). Aggregator-mode
 *              is "sum" only — expanded contributions cannot be
 *              distinct or count, those have no meaningful semantic
 *              when the same event yields multiple keys.
 *
 * Derived metrics are computed AFTER the per-event fold completes:
 * AOV = REVENUE / ORDERS, RETURNING_CUSTOMER_RATE requires an extra DB
 * query for actor_id history. Both are produced by `derivedMetrics()`.
 */

/**
 * Minimal row shape the mapping callbacks receive. Mirrors the columns
 * the aggregator selects from analytics.event — typed loosely on
 * `payload` and `context` because each callback knows its own event's
 * schema and asserts inline.
 */
export interface AnalyticsEventRow {
  tenant_id: string;
  event_name: string;
  schema_version: string;
  occurred_at: Date;
  actor_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  context: Record<string, unknown> | null;
}

interface ScalarContribution {
  /** Default kind — omittable. */
  kind?: "scalar";
  metric: string;
  dimension: string;
  dimensionValueFrom: (event: AnalyticsEventRow) => string;
  valueFrom: (event: AnalyticsEventRow) => number;
  aggregator: "sum" | "count" | "distinct";
  distinctKey?: (event: AnalyticsEventRow) => string;
}

interface ExpandContribution {
  kind: "expand";
  metric: string;
  dimension: string;
  /** Returns one entry per emitted row. Empty array = no contribution. */
  expand: (
    event: AnalyticsEventRow,
  ) => Array<{ dimensionValue: string; value: number }>;
  /** Expanded contributions are sum-only. */
  aggregator: "sum";
}

export type MetricContribution = ScalarContribution | ExpandContribution;

export interface EventMapping {
  eventName: string;
  schemaVersion: string;
  contributions: MetricContribution[];
}

// ── Helpers — defensive payload access ───────────────────────────────────────
//
// Aggregator runs against analytics.event rows that the drainer already
// validated against the Zod registry, so the SHAPE is guaranteed. We still
// guard against missing or unexpected types because:
//   1. A schema-version skew can arrive while the aggregator is mid-run.
//   2. JSON-from-DB always lands as `unknown` at the type level.
//   3. The cost of a defensive guard is one branch; the cost of a thrown
//      mid-run is the whole 48h window losing a tick.

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return 0;
}

function asString(v: unknown, fallback: string): string {
  if (typeof v === "string" && v.length > 0) return v;
  return fallback;
}

function getNested(payload: unknown, path: string[]): unknown {
  let cur: unknown = payload;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

// ── The registry ─────────────────────────────────────────────────────────────

export const ANALYTICS_METRIC_MAPPINGS: EventMapping[] = [
  // ── payment_succeeded v0.2.0 ───────────────────────────────────────────
  // Source for REVENUE × {TOTAL, CHANNEL, PRODUCT} and ORDERS × {TOTAL,
  // CHANNEL}. Fires once per PAID Order (event-catalog.md:222-224).
  {
    eventName: "payment_succeeded",
    schemaVersion: "0.2.0",
    contributions: [
      {
        metric: "REVENUE",
        dimension: "TOTAL",
        dimensionValueFrom: () => "TOTAL",
        valueFrom: (e) => asNumber(getNested(e.payload, ["amount", "amount"])),
        aggregator: "sum",
      },
      {
        metric: "REVENUE",
        dimension: "CHANNEL",
        dimensionValueFrom: (e) =>
          asString(e.payload.source_channel, "unknown"),
        valueFrom: (e) => asNumber(getNested(e.payload, ["amount", "amount"])),
        aggregator: "sum",
      },
      {
        metric: "ORDERS",
        dimension: "TOTAL",
        dimensionValueFrom: () => "TOTAL",
        valueFrom: () => 1,
        aggregator: "sum",
      },
      {
        metric: "ORDERS",
        dimension: "CHANNEL",
        dimensionValueFrom: (e) =>
          asString(e.payload.source_channel, "unknown"),
        valueFrom: () => 1,
        aggregator: "sum",
      },
      {
        kind: "expand",
        metric: "REVENUE",
        dimension: "PRODUCT",
        expand: (e) => {
          const items = e.payload.line_items;
          if (!Array.isArray(items)) return [];
          const out: Array<{ dimensionValue: string; value: number }> = [];
          for (const item of items) {
            if (item === null || typeof item !== "object") continue;
            const productId = asString(
              (item as Record<string, unknown>).product_id,
              "",
            );
            if (productId.length === 0) continue;
            const amount = asNumber((item as Record<string, unknown>).amount);
            out.push({ dimensionValue: productId, value: amount });
          }
          return out;
        },
        aggregator: "sum",
      },
    ],
  },

  // ── booking_completed v0.1.0 ──────────────────────────────────────────
  // Independent CHANNEL-source for ACCOMMODATION orders. Carries
  // total_amount in the booking domain. Counts as a separate orders/revenue
  // tick, complementing payment_succeeded for cross-validation.
  {
    eventName: "booking_completed",
    schemaVersion: "0.1.0",
    contributions: [
      {
        metric: "REVENUE",
        dimension: "CHANNEL",
        dimensionValueFrom: (e) =>
          asString(e.payload.source_channel, "unknown"),
        valueFrom: (e) =>
          asNumber(getNested(e.payload, ["total_amount", "amount"])),
        aggregator: "sum",
      },
      {
        metric: "ORDERS",
        dimension: "CHANNEL",
        dimensionValueFrom: (e) =>
          asString(e.payload.source_channel, "unknown"),
        valueFrom: () => 1,
        aggregator: "sum",
      },
    ],
  },

  // ── FUNNEL-METRICS — same-day approximation ─────────────────────────────
  //
  // The three funnel events below (cart_started, checkout_started,
  // cart_abandoned) are aggregated into BASE COUNTS per calendar day.
  // Phase 5A's derivedMetrics() then computes three rates from those
  // counts: CART_TO_CHECKOUT_RATE, CART_ABANDONMENT_RATE, and
  // CHECKOUT_COMPLETION_RATE.
  //
  // SAME-DAY APPROXIMATION — important caveat:
  //
  // Rates use events that fired ON each calendar day. A cart_id that
  // started on day N and checked out on day N+1 is counted in DIFFERENT
  // denominators / numerators (cart_started for day N, checkout_started
  // for day N+1). This produces approximately-correct trends per day
  // but does NOT track per-cart-id lifetime conversion.
  //
  // Concrete consequences:
  //   - On a high-traffic day where cross-day carts complete, CART_TO_
  //     CHECKOUT_RATE may exceed 100% (basis points > 10000) for a
  //     single day. The aggregator does NOT clamp — saturating to
  //     10000 would hide cross-day carryover and produce subtly wrong
  //     trends. Phase 5B parity-tolerance accommodates by treating the
  //     funnel rates as a DIFFERENT category from the v1-vs-v2
  //     equality metrics. Dashboards rendering these rates should
  //     either render the raw bp value or clamp at the read layer.
  //   - On a low-traffic day where today's cart_started count is small
  //     vs yesterday's still-active carts, abandonment rate is noisy.
  //     Multi-day rolling windows are a Phase 5B/5C dashboard concern,
  //     not an aggregator-level fix.
  //
  // Exact funnel-tracking (cart_id-lifecycle joins across days)
  // requires a separate data structure — Phase 5C+ territory.
  //
  // distinct-on-cart_id semantics:
  //   We use aggregator: "distinct" with distinctKey: cart_id rather
  //   than "count" because the worker may dispatch duplicate beacons
  //   (network retry, sendBeacon double-fire) for the same cart_id.
  //   Distinct on cart_id gives us ACTUAL distinct carts that took the
  //   step, not the count of beacon receipts.

  // ── cart_started v0.2.0 ─────────────────────────────────────────────────
  // Source for CART_STARTED × TOTAL.
  // Phase 3 PR-B emits this on the FIRST add-to-empty-cart per cart_id.
  {
    eventName: "cart_started",
    schemaVersion: "0.2.0",
    contributions: [
      {
        metric: "CART_STARTED",
        dimension: "TOTAL",
        dimensionValueFrom: () => "TOTAL",
        valueFrom: () => 1,
        aggregator: "distinct",
        distinctKey: (e) => asString(e.payload.cart_id, ""),
      },
    ],
  },

  // ── checkout_started v0.2.0 ─────────────────────────────────────────────
  // Source for CHECKOUT_STARTED × TOTAL.
  // Cart-only scope (per checkout-started.ts:32-46 — non-cart purchase
  // flows use a separate event family).
  {
    eventName: "checkout_started",
    schemaVersion: "0.2.0",
    contributions: [
      {
        metric: "CHECKOUT_STARTED",
        dimension: "TOTAL",
        dimensionValueFrom: () => "TOTAL",
        valueFrom: () => 1,
        aggregator: "distinct",
        distinctKey: (e) => asString(e.payload.cart_id, ""),
      },
    ],
  },

  // ── cart_abandoned v0.2.0 ───────────────────────────────────────────────
  // Source for CART_ABANDONED × TOTAL.
  // Dispatched via navigator.sendBeacon() from the loader's unload
  // handler (cart-abandoned.ts) — duplicate-delivery is the norm here,
  // distinct-on-cart_id is load-bearing for correctness.
  {
    eventName: "cart_abandoned",
    schemaVersion: "0.2.0",
    contributions: [
      {
        metric: "CART_ABANDONED",
        dimension: "TOTAL",
        dimensionValueFrom: () => "TOTAL",
        valueFrom: () => 1,
        aggregator: "distinct",
        distinctKey: (e) => asString(e.payload.cart_id, ""),
      },
    ],
  },

  // ── page_viewed v0.1.0 ─────────────────────────────────────────────────
  // Source for SESSIONS × {TOTAL, DEVICE, CITY} and VISITORS × TOTAL.
  // Tab-scoped session_id (industry-norm — recon §2.8 / §9.3).
  {
    eventName: "page_viewed",
    schemaVersion: "0.1.0",
    contributions: [
      {
        metric: "SESSIONS",
        dimension: "TOTAL",
        dimensionValueFrom: () => "TOTAL",
        valueFrom: () => 1,
        aggregator: "distinct",
        distinctKey: (e) => asString(e.payload.session_id, ""),
      },
      {
        metric: "VISITORS",
        dimension: "TOTAL",
        dimensionValueFrom: () => "TOTAL",
        valueFrom: () => 1,
        aggregator: "distinct",
        // Pre-X2 emits omit visitor_id; map absence to empty so the
        // distinct set treats them as one synthetic "anonymous" visitor.
        // Phase 5B parity-tolerance for VISITORS is 20% (§7.2) which
        // covers the definitions-shift; aggregator should still produce
        // a value, not crash.
        distinctKey: (e) => asString(e.payload.visitor_id, ""),
      },
      {
        metric: "SESSIONS",
        dimension: "DEVICE",
        dimensionValueFrom: (e) => asString(e.payload.device_type, "unknown"),
        valueFrom: () => 1,
        aggregator: "distinct",
        distinctKey: (e) => asString(e.payload.session_id, ""),
      },
      {
        metric: "SESSIONS",
        dimension: "CITY",
        dimensionValueFrom: (e) => {
          const city = getNested(e.context, ["geo", "city"]);
          return asString(city, "unknown");
        },
        valueFrom: () => 1,
        aggregator: "distinct",
        distinctKey: (e) => asString(e.payload.session_id, ""),
      },
    ],
  },
];

/**
 * Look up the mapping for a given (event_name, schema_version). Returns
 * null when no mapping is registered — aggregator skips the event.
 */
export function findMapping(
  eventName: string,
  schemaVersion: string,
): EventMapping | null {
  for (const m of ANALYTICS_METRIC_MAPPINGS) {
    if (m.eventName === eventName && m.schemaVersion === schemaVersion) {
      return m;
    }
  }
  return null;
}

// ── Derived metrics ──────────────────────────────────────────────────────────
//
// Computed after the per-event fold completes. Inputs are the aggregated
// scalar values keyed by (metric, dimension, dimensionValue). The output
// adds new MetricRow-like entries (without persisted IDs) that the runner
// upserts alongside the fold output.
//
// AOV = round(REVENUE_TOTAL / ORDERS_TOTAL).
// RETURNING_CUSTOMER_RATE — separate query, not derivable from the fold
// alone; produced by the runner via an explicit DB call (see B.4).

export interface DerivedMetricRow {
  metric: string;
  dimension: string;
  dimensionValue: string;
  value: bigint;
}

/**
 * Delimiter for accumulator keys. SOH (U+0001) is unreachable in any
 * input we ever feed into the key:
 *  - metric and dimension are platform-internal string constants under
 *    our control (defined in this file), neither contains control chars.
 *  - dimensionValue comes from event payloads, which are JSON-decoded;
 *    the JSON spec forbids literal raw control characters in strings
 *    (they must be escaped as \\u0001), so a JSON-parsed string never
 *    carries a raw SOH byte.
 * Using SOH as the delimiter makes both directions of the round trip
 * (makeAccumulatorKey/parseAccumulatorKey) unambiguous without escaping.
 */
const ACC_DELIM = "\u0001";

/** Internal — accumulator key shape used by aggregateEvents (B.3). */
export function makeAccumulatorKey(
  metric: string,
  dimension: string,
  dimensionValue: string,
): string {
  return `${metric}${ACC_DELIM}${dimension}${ACC_DELIM}${dimensionValue}`;
}

/**
 * Inverse of `makeAccumulatorKey`. Returns null if the key shape is
 * malformed (defense-in-depth — should never happen in production).
 */
export function parseAccumulatorKey(key: string): {
  metric: string;
  dimension: string;
  dimensionValue: string;
} | null {
  const parts = key.split(ACC_DELIM);
  if (parts.length !== 3) return null;
  return {
    metric: parts[0],
    dimension: parts[1],
    dimensionValue: parts[2],
  };
}

/**
 * Compute derived rows that depend only on already-folded base metrics.
 * The input map's values come from BOTH scalar-aggregator counts
 * (REVENUE, ORDERS) and distinct-aggregator counts (CART_STARTED,
 * CHECKOUT_STARTED, CART_ABANDONED) — see aggregate-day.ts where the
 * two source maps are merged before this is called.
 *
 * The runner adds query-derived rows (RETURNING_CUSTOMER_RATE)
 * separately because they require a DB lookup.
 *
 * Funnel-rate semantics — see the FUNNEL-METRICS doc-block in the
 * mapping registry above for the same-day approximation caveat.
 * Rates are emitted in basis points (10000 = 100%) matching Phase 5A's
 * RETURNING_CUSTOMER_RATE convention. Each rate is OMITTED ENTIRELY
 * when its denominator is zero — saving an explicit "NaN" row that
 * would mean nothing to a dashboard. The dashboard treats a missing
 * row as "no data this day", distinct from "0% rate".
 */
export function derivedMetrics(
  folded: Map<string, bigint>,
): DerivedMetricRow[] {
  const out: DerivedMetricRow[] = [];

  // ES2017 target — use BigInt() expressions, never `0n` literals.
  const ZERO = BigInt(0);
  const TWO = BigInt(2);

  // ── AVERAGE_ORDER_VALUE × TOTAL ────────────────────────────────────────
  // AOV = round(REVENUE / ORDERS), zero-guard.

  const revenueTotalKey = makeAccumulatorKey("REVENUE", "TOTAL", "TOTAL");
  const ordersTotalKey = makeAccumulatorKey("ORDERS", "TOTAL", "TOTAL");
  const revenue = folded.get(revenueTotalKey) ?? ZERO;
  const orders = folded.get(ordersTotalKey) ?? ZERO;

  // AOV is integer öre; legacy rounds (Math.round). Bigint division
  // truncates — match legacy by adding (orders/2) to round-half-up, but
  // only when orders > 0 to avoid division-by-zero.
  if (orders > ZERO) {
    const aov = (revenue + orders / TWO) / orders;
    out.push({
      metric: "AVERAGE_ORDER_VALUE",
      dimension: "TOTAL",
      dimensionValue: "TOTAL",
      value: aov,
    });
  } else {
    out.push({
      metric: "AVERAGE_ORDER_VALUE",
      dimension: "TOTAL",
      dimensionValue: "TOTAL",
      value: ZERO,
    });
  }

  // ── Funnel-rate inputs ─────────────────────────────────────────────────

  const cartStarted =
    folded.get(makeAccumulatorKey("CART_STARTED", "TOTAL", "TOTAL")) ?? ZERO;
  const checkoutStarted =
    folded.get(makeAccumulatorKey("CHECKOUT_STARTED", "TOTAL", "TOTAL")) ??
    ZERO;
  const cartAbandoned =
    folded.get(makeAccumulatorKey("CART_ABANDONED", "TOTAL", "TOTAL")) ?? ZERO;

  // ── CART_TO_CHECKOUT_RATE × TOTAL ──────────────────────────────────────
  // checkout_started / cart_started, basis points. Omit when cart_started
  // is zero (no carts means no rate to compute — distinct from a 0% rate,
  // which would imply 100% abandonment but isn't meaningful when there
  // were no carts to begin with).
  if (cartStarted > ZERO) {
    out.push({
      metric: "CART_TO_CHECKOUT_RATE",
      dimension: "TOTAL",
      dimensionValue: "TOTAL",
      value: rateBasisPoints(checkoutStarted, cartStarted),
    });
  }

  // ── CART_ABANDONMENT_RATE × TOTAL ──────────────────────────────────────
  // cart_abandoned / cart_started, basis points. Same omit-when-zero
  // policy as CART_TO_CHECKOUT_RATE.
  if (cartStarted > ZERO) {
    out.push({
      metric: "CART_ABANDONMENT_RATE",
      dimension: "TOTAL",
      dimensionValue: "TOTAL",
      value: rateBasisPoints(cartAbandoned, cartStarted),
    });
  }

  // ── CHECKOUT_COMPLETION_RATE × TOTAL ───────────────────────────────────
  // orders / checkout_started, basis points. Reuses the existing
  // ORDERS × TOTAL count from Phase 5A — no new base metric needed.
  // Omit when checkout_started is zero.
  if (checkoutStarted > ZERO) {
    out.push({
      metric: "CHECKOUT_COMPLETION_RATE",
      dimension: "TOTAL",
      dimensionValue: "TOTAL",
      value: rateBasisPoints(orders, checkoutStarted),
    });
  }

  return out;
}

/**
 * Rate as basis points: round((numerator / denominator) * 10000).
 *
 * Caller is responsible for guarding `denominator > 0`. We use Number
 * arithmetic for the rounding step — the inputs cannot exceed daily
 * cart counts, which fit comfortably in Number's 2^53 safe-integer
 * range even at fleet scale (10k tenants × peak hourly rate).
 *
 * NO clamping at 10000 — see the FUNNEL-METRICS doc-block above on
 * cross-day cart carryover and why saturation would hide trend drift.
 */
function rateBasisPoints(numerator: bigint, denominator: bigint): bigint {
  const num = Number(numerator);
  const denom = Number(denominator);
  return BigInt(Math.round((num / denom) * 10000));
}
