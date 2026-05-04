/**
 * Phase 5A — aggregator core (pure compute, no DB).
 *
 * `aggregateEvents()` is the fold engine. Given an `AsyncIterable` of
 * event rows for a (tenantId, date) pair, it produces the
 * `MetricRow[]` that the runner (B.4) upserts to
 * `analytics.daily_metric`.
 *
 * Design constraints (per recon §3.3 — minne-budget):
 *
 * - Input is `AsyncIterable<AnalyticsEventRow>`, not `Array`. The runner
 *   wraps a Postgres cursor as an async generator and streams rows one
 *   at a time. The aggregator never holds raw events in memory.
 * - Accumulator state is two `Map`s only:
 *     `Map<key, bigint>`              for sum / count contributions.
 *     `Map<key, Set<string>>`         for distinct contributions.
 *   Both grow with the number of distinct (metric, dimension,
 *   dimensionValue) tuples — bounded by the registry shape, not the
 *   event volume. 1.2M events/day at the worst-case tenant produces
 *   the same ~75-150 keys as 1k events/day at a small tenant.
 * - Pure: no DB, no Sentry, no logger. The runner adds those wrappings.
 *
 * Idempotence: the same input AsyncIterable produces the same
 * MetricRow[] up to ordering. Composite-unique upsert at the runner
 * level applies output deterministically.
 *
 * Unmapped-event handling (per recon §6.1): events whose
 * (event_name, schema_version) has no registry entry are skipped.
 * `aggregateEvents` accepts an optional `onUnmapped` callback so the
 * runner can emit a structured `analytics.aggregator.unmapped_event`
 * log. The callback default is a no-op so unit tests stay pure.
 */

import type { AnalyticsEventRow, EventMapping } from "./metric-mapping";
import {
  derivedMetrics,
  findMapping,
  makeAccumulatorKey,
  parseAccumulatorKey,
} from "./metric-mapping";

const ZERO = BigInt(0);
const ONE = BigInt(1);

export interface MetricRow {
  tenantId: string;
  date: Date;
  metric: string;
  dimension: string;
  dimensionValue: string;
  value: bigint;
}

export interface AggregateOptions {
  onUnmapped?: (info: {
    eventName: string;
    schemaVersion: string;
  }) => void;
}

/**
 * Fold an event stream into pre-aggregated metric rows.
 *
 * The output `date` field is the caller-supplied UTC day-start —
 * aggregator does NOT re-derive it from event.occurred_at because the
 * runner is responsible for selecting events into the correct window
 * per recon §3.4 sliding-48h.
 */
export async function aggregateEvents(
  events: AsyncIterable<AnalyticsEventRow>,
  tenantId: string,
  date: Date,
  options: AggregateOptions = {},
): Promise<MetricRow[]> {
  const onUnmapped = options.onUnmapped ?? (() => {});

  // Two accumulators. Their keys are made via `makeAccumulatorKey` so a
  // stray `metric/dimension/dimensionValue` cannot collide between
  // sum-mode and distinct-mode.
  const scalarSum = new Map<string, bigint>();
  const distinctSets = new Map<string, Set<string>>();

  // Cache mapping lookups by (eventName, schemaVersion) so the inner
  // loop doesn't scan the registry on every event.
  const mappingCache = new Map<string, EventMapping | null>();
  const cacheKey = (e: AnalyticsEventRow) =>
    `${e.event_name}@${e.schema_version}`;

  // Cache the unmapped-callback dedup so we don't fire the callback
  // for every single unmapped event of a given type — once per
  // (event_name, schema_version) is plenty for diagnostic logs.
  const unmappedReported = new Set<string>();

  for await (const event of events) {
    const key = cacheKey(event);
    let mapping = mappingCache.get(key);
    if (mapping === undefined) {
      mapping = findMapping(event.event_name, event.schema_version);
      mappingCache.set(key, mapping);
    }

    if (mapping === null) {
      if (!unmappedReported.has(key)) {
        unmappedReported.add(key);
        onUnmapped({
          eventName: event.event_name,
          schemaVersion: event.schema_version,
        });
      }
      continue;
    }

    for (const contribution of mapping.contributions) {
      if (contribution.kind === "expand") {
        const expansion = contribution.expand(event);
        for (const { dimensionValue, value } of expansion) {
          const accKey = makeAccumulatorKey(
            contribution.metric,
            contribution.dimension,
            dimensionValue,
          );
          const prev = scalarSum.get(accKey) ?? ZERO;
          scalarSum.set(accKey, prev + numberToBigInt(value));
        }
        continue;
      }

      // Scalar
      const dv = contribution.dimensionValueFrom(event);
      const accKey = makeAccumulatorKey(
        contribution.metric,
        contribution.dimension,
        dv,
      );

      switch (contribution.aggregator) {
        case "sum": {
          const v = numberToBigInt(contribution.valueFrom(event));
          scalarSum.set(accKey, (scalarSum.get(accKey) ?? ZERO) + v);
          break;
        }
        case "count": {
          scalarSum.set(accKey, (scalarSum.get(accKey) ?? ZERO) + ONE);
          break;
        }
        case "distinct": {
          // distinctKey is required by the type for distinct
          // contributions; defensive-guard against runtime registry
          // drift just in case.
          if (!contribution.distinctKey) break;
          const dkey = contribution.distinctKey(event);
          if (dkey.length === 0) break;
          let set = distinctSets.get(accKey);
          if (!set) {
            set = new Set<string>();
            distinctSets.set(accKey, set);
          }
          set.add(dkey);
          break;
        }
      }
    }
  }

  // ── Materialise scalar/sum and distinct accumulators into MetricRows.

  const rows: MetricRow[] = [];

  for (const [accKey, value] of scalarSum) {
    const parsed = parseAccumulatorKey(accKey);
    if (!parsed) continue;
    rows.push({
      tenantId,
      date,
      metric: parsed.metric,
      dimension: parsed.dimension,
      dimensionValue: parsed.dimensionValue,
      value,
    });
  }

  for (const [accKey, set] of distinctSets) {
    const parsed = parseAccumulatorKey(accKey);
    if (!parsed) continue;
    rows.push({
      tenantId,
      date,
      metric: parsed.metric,
      dimension: parsed.dimension,
      dimensionValue: parsed.dimensionValue,
      value: BigInt(set.size),
    });
  }

  // ── Derived rows (AOV + funnel-rates) — computed from a unified map.
  //
  // derivedMetrics needs to look up BOTH sum-aggregator counts (REVENUE,
  // ORDERS) AND distinct-aggregator counts (CART_STARTED, CHECKOUT_STARTED,
  // CART_ABANDONED). We merge distinct sizes into the input map so
  // derivedMetrics is a single Map<key, bigint> lookup regardless of how
  // the underlying count was produced.
  //
  // Merge is non-destructive — scalarSum keys never collide with distinct
  // keys at the registry level (same metric+dimension never declared
  // both ways), so the merged map's contents are the union of the two.
  //
  // RETURNING_CUSTOMER_RATE is NOT computed here — it needs a DB query
  // for actor_id history; the runner emits it separately in B.4.

  const foldedAllCounts = new Map<string, bigint>(scalarSum);
  for (const [accKey, set] of distinctSets) {
    foldedAllCounts.set(accKey, BigInt(set.size));
  }

  for (const d of derivedMetrics(foldedAllCounts)) {
    rows.push({
      tenantId,
      date,
      metric: d.metric,
      dimension: d.dimension,
      dimensionValue: d.dimensionValue,
      value: d.value,
    });
  }

  return rows;
}

// ── BigInt coercion ──────────────────────────────────────────────────────────
//
// Every monetary amount in payloads is `number` (Zod
// `z.number().int().nonnegative()`). The aggregator stores them as
// BigInt to avoid 2^53 / 2^31 overflow at the daily-metric row level.
// Coercion path: number → string → BigInt avoids `BigInt()` on a
// non-integer number throwing.

function numberToBigInt(n: number): bigint {
  if (!Number.isFinite(n)) return ZERO;
  if (Number.isInteger(n)) return BigInt(n);
  // Defensive — registry valueFrom callbacks always return integers
  // for monetary amounts. Fractional values would be a registry bug.
  return BigInt(Math.trunc(n));
}
