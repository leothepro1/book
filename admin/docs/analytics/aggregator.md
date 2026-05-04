# Phase 5A — analytics aggregator (write side)

> Status: shipped 2026-05-04. Phase 5B (parity-validation, dashboard
> cutover) and Phase 5C (drop legacy `AnalyticsDailyMetric`) are
> separate PRs. See `admin/_audit/analytics-phase5a-aggregator-recon.md`
> for the canonical specification.

## Architecture

The Phase 5A aggregator reads from the new `analytics.event` outbox
(Phase 1+) and writes pre-aggregated rows to a new
`analytics.daily_metric` table. It runs in parallel to the legacy
`app/_lib/analytics/aggregation.ts` aggregator for ≥30 days while
Phase 5B parity-validates v2 against v1. Legacy is untouched.

```
                         every 15 min
   Inngest cron ─────► scan-analytics-aggregate
                         │
                         │  step.sendEvent (per active tenant)
                         ▼
                       analytics.aggregate.fanout  (one event/tenant)
                         │
                         │  concurrency.key = tenant_id (limit 1)
                         ▼
                       run-analytics-aggregate-day
                         │
                         │  for day in [today, today-1, today-2]:
                         ▼
                       runAggregateDay (per day)
                         │
                         ├── stream analytics.event (cursor, 5k chunks)
                         ├── aggregateEvents (pure fold)
                         ├── computeReturningCustomerRate (extra query)
                         └── batched upsert → analytics.daily_metric
```

### Why an Inngest function (not a Vercel cron route)

The drainer (`drain-analytics-outbox`) and scanner
(`scan-analytics-outbox`) already run on Inngest with retry budgets,
Sentry-instrumentation via `withSentry`, and breadcrumbs via
`analyticsBreadcrumb`. Adding a parallel Vercel cron route would
duplicate infrastructure without benefit. Phase 5A matches the
established pattern.

### 48h sliding window (per recon §3.4)

Every 15-min tick re-aggregates today + yesterday + day-before-
yesterday for each active tenant. Late events arriving after
yesterday's first re-aggregation are caught by the next tick that
still has yesterday in its window. Idempotent upsert at the
composite unique index `(tenant_id, date, metric, dimension,
dimension_value)` makes 96 reruns/day cheap.

### Memory budget (recon §3.3)

Worst-case per tenant: 1.2M events/day. The aggregator NEVER holds
raw events in memory:

* Input is `AsyncIterable<AnalyticsEventRow>` — Postgres cursor
  streamed in 5k chunks.
* Accumulator state is `Map<key, bigint>` (sum/count) and
  `Map<key, Set<string>>` (distinct). Both grow with the **number of
  distinct (metric, dimension, dimensionValue) tuples**, not with
  event volume — bounded at ~75-150 keys per tenant per day.

Throughput at 10k tenants × 96 ticks/day × 12.5k events/tick avg ≈
12B events/day fleet-wide. Far below Inngest's per-run step-throughput
budget; plan-level concurrency cap (default 1000) is the bottleneck,
not aggregator code.

## Operational procedures

### Trigger an immediate scan

The scan function has a dual trigger (cron + event). Send the event
manually from the Inngest dev UI (or, in production, the Inngest
dashboard's "send event" form):

```
Event name:  analytics.aggregate.scan
Data:        {}
```

This dispatches one fanout per active tenant (every tenant with
events in the last 48h) without waiting up to 15 min for the next
tick.

### Trigger a single tenant

Send the per-tenant fanout directly:

```
Event name:  analytics.aggregate.fanout
Data:        { "tenant_id": "tnt_abc123…" }
```

The runner will aggregate that tenant for the 48h window. Useful
for backfilling a stuck tenant after a deploy.

### Inspect output

```sql
SELECT * FROM analytics.daily_metric
WHERE tenant_id = 'tnt_abc123…'
  AND date >= '2026-05-01'
ORDER BY date DESC, metric, dimension, dimension_value;
```

The composite unique on `(tenant_id, date, metric, dimension,
dimension_value)` means at most one row per (metric, dimension,
dimension_value) per (tenant, date).

### Compare against legacy

Phase 5B will ship a full parity-diff command. For ad-hoc
inspection during the cutover window:

```sql
-- Same conceptual row in v1 vs v2
SELECT 'v1' AS pipeline, value FROM "AnalyticsDailyMetric"
  WHERE tenantId = 'tnt_abc123…' AND date = '2026-05-01'
    AND metric = 'REVENUE' AND dimension = 'TOTAL'
UNION ALL
SELECT 'v2' AS pipeline, value::text FROM analytics.daily_metric
  WHERE tenant_id = 'tnt_abc123…' AND date = '2026-05-01'
    AND metric = 'REVENUE' AND dimension = 'TOTAL';
```

### Stop aggregator for a single tenant

Phase 5A does not include a per-tenant kill switch — the aggregator
runs for every tenant with recent events. To stop processing for a
specific tenant temporarily, the operational lever is to delete the
tenant's `analytics.event` rows for the day (which will exclude them
from the next scan). That is a heavy intervention reserved for
incident response. A proper kill switch is Phase 5C territory once
parity is established.

## FAQ

### Why a new table instead of a column on `AnalyticsDailyMetric`?

Recon §4.1 / §9.7 RESOLVED. Two reasons:

1. **Multi-schema convention.** `analytics.event`, `analytics.outbox`,
   `analytics.tenant_config` already live in the `analytics` schema
   per Phase 0. Pre-aggregated rows belong there too.
2. **Parity is two clean queries.** `SELECT FROM
   AnalyticsDailyMetric` vs `SELECT FROM analytics.daily_metric` —
   no version filter, no risk of cross-version row contamination.

### What happens if Inngest is down?

The next 15-min tick after recovery picks up where the previous one
left off. The 48h sliding window is what makes this work — even if
Inngest was down for 24h, the tick after recovery still re-aggregates
that period.

There is no separate cursor table in 5A (recon §3.5). Inngest's
step-checkpoint memoization is the per-day resumption mechanism;
within a single fanout, each day is its own `step.run` (via
`withSentry`), so a crash mid-window resumes only the unfinished
days on retry.

### What about late-arriving events bursting beyond 48h?

5C territory. If production-mésätningar visa late-event-svans bortom
48h, the window expands. For now, 48h matches recon §3.4 and
Apelviken's expected event-arrival distribution.

### What is the storage footprint?

Per-tenant per-day: ~75-150 rows (recon §6.6). At 10k tenants × 365
days × 100 rows × 150 bytes/row inkl. index ≈ **55 GB/year fleet-
wide.** Worst-case for tenants with large product sortiment may push
this higher; partitioning the table on `date` is 5C territory if
production measurement shows >1B rows in sight.

### How does this differ from legacy `aggregation.ts`?

* Reads from `analytics.event` (new pipeline) instead of
  `AnalyticsEvent` + `Order` (legacy direct-table reads).
* Streams events via cursor instead of `findMany({...})` —
  bounded memory at any tenant volume.
* Writes to `analytics.daily_metric` (new) instead of
  `AnalyticsDailyMetric` (legacy). Legacy is left untouched until
  Phase 5C.
* `value` column is `BIGINT` instead of `INT` — no overflow at
  enterprise revenue scale.
* `metric` and `dimension` are `String`, not `enum` — adding a new
  metric does not require a schema migration.

## Failure modes

Per recon §6:

| Failure mode | Detection | Recovery |
|---|---|---|
| Unmapped event_name in registry | `analytics.aggregator.unmapped_event` log (info-level, deduped per type) | Add mapping to `metric-mapping.ts`, redeploy |
| Schema-version skew | drainer pre-validates; aggregator skips unmapped versions | Add new mapping version to registry |
| Cross-tenant scope leak | `verify:phase5a` static check #10 catches missing `tenant_id =` literal in WHERE | Block PR merge until fixed |
| Memory blowup at large volume | `app/_lib/analytics/aggregation/aggregate-day.test.ts` 50k-event smoke test | Investigate accumulator-key shape, registry contributions |
| Inngest mid-batch crash | step.run checkpoint resumes only unfinished days | Automatic on retry budget |
| Idempotency violation | composite unique upsert; runner test "idempotency" marker | Will not occur unless registry mapping is non-deterministic |

## Parity-diff (Phase 5B)

`npm run analytics:parity-diff` is reserved as an npm script name; the
implementation is Phase 5B. Running it now exits 1 with a pointer to
the recon spec (§7).

## Key files

* Migration: `prisma/migrations/<timestamp>_analytics_phase5a_aggregator/`
* Mapping registry: `app/_lib/analytics/aggregation/metric-mapping.ts`
* Fold engine: `app/_lib/analytics/aggregation/aggregate-day.ts`
* DB runner: `app/_lib/analytics/aggregation/aggregate-day-runner.ts`
* Inngest scanner: `inngest/functions/scan-analytics-aggregate.ts`
* Inngest runner: `inngest/functions/run-analytics-aggregate-day.ts`
* Verifier: `scripts/verify-phase5a-aggregator.ts`
* Recon spec: `_audit/analytics-phase5a-aggregator-recon.md`
