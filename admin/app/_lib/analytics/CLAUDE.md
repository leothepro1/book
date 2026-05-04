# Analytics

Three subsystems share this directory:

| Subsystem | Path | Purpose |
|---|---|---|
| **Server emit + ingest** | `emit.ts`, root | Server-side commerce events → AnalyticsEvent table |
| **Live counters** | `live/` | Per-tenant near-live visitor + sampling caches |
| **Daily aggregation** | `aggregation/` | Streaming fold from raw events → `daily_metric` |
| **Storefront pixel** | `pipeline/` | Web pixel runtime + worker validators (see `pipeline/CLAUDE.md`) |
| **Parity tooling** | `parity/` | Diff helpers used by validator-parity tests |

> **Pixel-runtime worker rules** are in `pipeline/CLAUDE.md`. This file
> covers the rest.

---

## Server emit (commerce events)

`emitAnalyticsEvent(params)` in `emit.ts` is the SINGLE function for
server-side analytics emission. Used exclusively for commerce events:
ORDER_CREATED, ORDER_PAID, ORDER_CANCELLED, ORDER_REFUNDED.

Hard rules:
- **Never throws.** Always fire-and-forget (try/catch wraps the create).
- **Never called inside a `$transaction` block** — analytics writes don't gate commerce.
- **Never called from frontend code** — the storefront pixel uses `client.ts`.
- If it fails, the calling commerce operation is unaffected. Log only.

This isolation is why an AnalyticsEvent insert outage cannot take down checkout.

---

## Live counters (near-live UI)

`live/visitors.ts` + `live/cache.ts` — per-tenant visitor count refreshed
from a Redis-backed sliding window. `live/sampling.ts` decides which events
get persisted vs. aggregated-only at high volumes (per-tenant rate-limit aware).

Used by the admin "Besökare nu" widget. NOT a billing or product-decision
input — eventual consistency is acceptable; outage = widget shows last-known.

---

## Daily aggregation (streaming fold)

`aggregation/aggregate-day.ts` is the pure-compute aggregator core.
`aggregation/aggregate-day-runner.ts` is the cron orchestrator that wraps
a Postgres cursor as an async generator and streams events one row at a time.

Memory model (per recon §3.3):
- Input is `AsyncIterable<AnalyticsEventRow>` — never `Array`.
- Accumulator state: two `Map`s (sum/count + distinct sets) keyed by
  (metric, dimension, dimensionValue).
- Bounded by registry shape, not event volume — 1.2M events/day produces
  the same ~75–150 keys as 1k events/day.

Idempotent: same input AsyncIterable → same MetricRow[] up to ordering.
Composite-unique upsert at the runner level applies output deterministically
to `daily_metric`.

**Unmapped events**: events whose `(event_name, schema_version)` has no
registry entry are silently skipped, with an optional `onUnmapped`
callback for the runner to log `analytics.aggregator.unmapped_event`.

---

## Metric registry

`aggregation/metric-mapping.ts` is the single source of truth for which
events produce which metrics. Adding a new metric = adding a registry
entry — no aggregator code change. Deriving metrics (ratios) live in
`derivedMetrics`.

Coverage status: see `docs/analytics/metric-coverage.md` (recent commits
expanded coverage from 12 → 106 metrics).

---

## Pipeline schema parity (worker bundle budget)

The 30 KB gzipped storefront-pixel worker bundle cannot afford Zod 4.
Each storefront event has a paired hand-rolled `.validator.ts` that runs
in lockstep with the Zod schema. **See `pipeline/CLAUDE.md`** for the
full parity contract.

---

## Key files

- Server emit: `app/_lib/analytics/emit.ts`
- Storefront client (browser): `app/_lib/analytics/client.ts`
- Geo + device: `app/_lib/analytics/geo.ts`, `device.ts`
- Live cache + visitors: `app/_lib/analytics/live/`
- Daily aggregation core: `app/_lib/analytics/aggregation/aggregate-day.ts`
- Metric registry: `app/_lib/analytics/aggregation/metric-mapping.ts`
- Aggregation cron: `app/api/cron/aggregate-analytics-day/`
- Parity diff helper: `app/_lib/analytics/parity/diff.ts`

---

## Analytics invariants — never violate

1. `emitAnalyticsEvent` never throws — fire-and-forget, always
2. Never call emit inside a `$transaction` — runs after commit
3. Never call server emit from client code — use `track()` from `client.ts`
4. Aggregation aggregator is pure — no DB, no Sentry, no logger calls
5. Aggregator input is AsyncIterable — never load full day into memory
6. Adding a metric = adding a registry entry — no aggregator code change
7. Worker bundle ≤30 KB gzipped — Zod cannot be imported into pipeline runtime
8. Storefront events have a Zod schema AND a paired hand-rolled validator (see `pipeline/CLAUDE.md`)
