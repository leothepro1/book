# Besökare just nu — runbook

> **Status:** shipped 2026-05-04 as Track 3 of the analytics roadmap.
> Recon source: `admin/_audit/besokare-widget-recon.md`.

## What it shows

A single big-number primary metric on `/analytics`:

> **Besökare just nu**
> _N_
> uppdaterad för X sek sedan

`N` = the count of distinct active session_ids over the last
**5 minutes** for the current authenticated tenant.

**This is the only near-live yta in the analytics stack.** All 105
other metrics are daily batch (Phase 5A aggregator output in
`analytics.daily_metric`). The widget reads directly from
`analytics.event` (the new pipeline), is cached 60s in Upstash, and
polled every 5 minutes from the admin browser.

## What "besökare" means here

The number counts **distinct `payload->>'session_id'` values** in
the 5-min window — *not* distinct humans. Per
`app/_lib/analytics/pipeline/runtime/loader-context.ts:34-38` and
recon §2.5:

- `session_id` is a tab-scoped ULID stored in `sessionStorage`.
- A human with **3 open tabs counts as 3** — industry norm
  (matches Shopify Live View, Plausible, Fathom).
- A human refreshing within the same tab in the 5-min window
  counts as **1**.
- A human who is idle for >30 min and returns gets a new
  `session_id` and counts as a **new** besökare.
- Bots that bypass the consent gate AND emit a session_id appear
  in the count. Per recon §5.2 RESOLVED, we do NOT filter via a
  bot deny-list — the inflation is a signal of a misconfigured
  consent gate, which is what we want operators to notice.

## How to read "0"

We render literal `0` per recon §5.4 RESOLVED. That can mean:

- No active visitors right now (genuine).
- Every visitor declined consent (consent banner is doing its job).
- The Phase 3 storefront loader hasn't fired any events yet (newly
  onboarded tenant).

The widget does NOT distinguish these cases in v1. If a tenant
reports "I have visitors but the widget shows 0", check (in order):

1. Are events arriving at `/api/analytics/collect`? (`SELECT
   COUNT(*) FROM analytics.event WHERE tenant_id = '<id>' AND
   occurred_at > NOW() - INTERVAL '5 minutes'`).
2. Do those events have `payload->'session_id'` set? (Server-emitted
   events don't — they're filtered out, which is correct.)
3. Is the consent banner accepting `analytics: true`? (Check
   `bf_consent` cookie in the visitor's browser.)

## How to read >100% rates

The widget shows a single absolute number. Doesn't apply.

## Architecture

```
  Browser polls every 5 min
  ↓
  GET /api/analytics/live/visitors
  ↓ auth (Clerk admin session via getCurrentTenant)
  ↓ rate-limit (60 req/min per tenant via Upstash Ratelimit)
  ↓ Sentry span "widget.visitors_now" (analyticsSpan wrapper)
  ↓ withRedisCache(key, 60s, fetcher) — read-through
    ↓ cache hit  → return cached scalar (sub-ms)
    ↓ cache miss → fetcher runs:
        getVisitorsNow(tenantId)
        ↓ _unguardedAnalyticsPipelineClient.$queryRaw
        ↓ SELECT COUNT(DISTINCT payload->>'session_id')::int
            FROM analytics.event
            WHERE tenant_id = ${tenantId}
              AND occurred_at > NOW() - INTERVAL '5 minutes'
              AND payload ? 'session_id'
        ↓ ~65ms p95 at worst-case 4170 rows in window (B.6 measured)
      cache set — TTL 60s
  ↓ JSON response { visitorsNow, updatedAt, source }
  ↓ Cache-Control: private, max-age=60 (browser-side throttle)
```

### Key files

- Route: `app/api/analytics/live/visitors/route.ts`
- SQL: `app/_lib/analytics/live/visitors.ts`
- Cache wrapper: `app/_lib/analytics/live/cache.ts`
- Rate limiter: `app/_lib/analytics/live/rate-limit.ts`
- Sampling helper: `app/_lib/analytics/live/sampling.ts`
- Widget: `app/(admin)/analytics/components/VisitorsLiveCard.tsx`
- Dashboard mount: `app/(admin)/analytics/AnalyticsDashboard.tsx`
- Daily card relabel: `app/(admin)/analytics/components/SummaryCards.tsx`
  ("Besökare" → "Besökare (period)" so live card takes the
  unqualified name)

### SLO

| Metric | Budget | Source |
|---|---|---|
| Uptime | 99.9% | `docs/analytics/tiers.md:30-44` (Tier 2) |
| Freshness | ≤ 60s | recon §1 + cache TTL |
| Latency p95 cache-hit | < 200 ms | recon §1 |
| Latency p95 cache-miss | < 800 ms | recon §1 |
| Correctness | < 1% drift vs ground-truth | recon §1 |

Measured (B.6, Neon EU dev DB, 2026-05-04):

| Metric | p50 | p95 | p99 |
|---|---|---|---|
| DB query (worst-case 4170 rows) | 53 ms | 65 ms | 100 ms |

Full request adds ~50ms HTTP+cache overhead — comfortably within
budget.

## Operational procedures

### Inspect the cache for a tenant

```
upstash-cli get bedfront:cache:analytics:live:visitors:<tenantId>
```

The value is a JSON-stringified scalar (the visitor count). TTL via
`upstash-cli ttl <key>`.

### Force a cache refresh for a tenant

Delete the key — next poll fills from DB:

```
upstash-cli del bedfront:cache:analytics:live:visitors:<tenantId>
```

### Trace a "stuck" widget

Symptom: tenant reports "siffran rör sig inte".

1. **Check cache TTL.** Is the key stuck at a stale value?
   `upstash-cli ttl bedfront:cache:analytics:live:visitors:<tenantId>`.
   TTL > 0 with stale value = cache hit returning stale; del the
   key.
2. **Check rate limit.** A tenant being 429'd by their own
   misbehaving tab returns no fresh data. Look for
   `analytics.live_visitors.rate_limited` log lines.
3. **Check fresh-fetch errors.** Look for
   `analytics.live_visitors.failed` log lines.
4. **Check upstream pipeline health.** If `analytics.event` rows
   are delayed at the drainer, the widget shows stale even with
   correct cache. Phase 5A's drainer cron picks up within 60s; check
   `analytics.outbox` backlog:
   ```sql
   SELECT COUNT(*) FROM analytics.outbox
   WHERE tenant_id = '<id>' AND published_at IS NULL;
   ```

### Cache-hit-rate observability

Cache hits are logged at 1% sample rate via `shouldSample()` in
`app/_lib/analytics/live/sampling.ts`. Cache misses are logged at
100%. Aggregate hit-rate:

```
log_event = "analytics.live_visitors.served"
hit_rate = count(source = "cache") * 100 /
           [count(source = "cache") + count(source = "fresh")]
```

In steady state at 10K tenants × 100 active dashboards × 1 poll/5min
= ~33 RPS, cache TTL 60s. Expected hit rate after warmup: ~92%.
Below 80% sustained = Redis degradation; investigate.

## Failure modes

| Failure | Detection | Recovery |
|---|---|---|
| Redis down | `analytics.live_cache.{get,set}_failed` log spike | Helper falls through to direct DB; widget continues to serve fresh values, just at higher latency |
| DB query times out | `analytics.live_visitors.failed` 500 spike | Investigate Phase 5A pipeline / Neon health; widget shows error state (Försök igen retry button) |
| Rate-limit fires for legitimate user | `analytics.live_visitors.rate_limited` warns | Limit is 60/min/tenant — investigate misbehaving client (devtools loop, automation) |
| Cross-tenant leak | Phase 5A verifier check #10 + #18 catch missing `tenant_id =` literal in WHERE | Block PR merge; this is Tier 0 |
| Stale cache after manual data correction | TTL ≤ 60s self-heals | Or `upstash-cli del` to force immediate refresh |
| Bot inflation | Hit rate plus visitor count baseline drift | Investigate consent gate at `/api/analytics/collect` — bots bypassing consent are the upstream bug |

## Out of scope (per recon §6)

- Multi-widget live dashboard (top pages, top locations,
  funnel-realtime)
- Server-Sent Events / WebSockets — sub-second freshness
- Materialized view for the 5-min window
- Stale-while-revalidate
- Bot deny-list (recon §5.2 RESOLVED: NO)
- Onboarding empty-state CTA distinguishing "no data ever yet"
  from "0 right now"
- Porting the rest of the legacy `/api/analytics/live` route to
  the Phase 5A pipeline
- Per-event-name breakdown ("X på checkout, Y på home")
- Historical besökare-serie (line chart over 24h)
