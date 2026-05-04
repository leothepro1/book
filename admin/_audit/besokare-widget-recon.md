# Besökare-widget — Recon (Track 3)

**Datum:** 2026-05-04
**Författare:** Web Claude (Architect role per `admin/CLAUDE.md`)
**Status:** RECON ONLY — no code lands in this PR. Implementation
prompt skapas separat efter Leo har godkänt §5 Q-decisions.

**Track:** 3 (efter Track 1 external research, Track 2 codebase audit).
"Besökare just nu" är den FÖRSTA near-live-ytan på top of Phase 5A:s
daily-batch aggregator — alla 106 övriga metrics är dagliga batch.

**Standard:** *"Skulle Shopifys Platform-team merge:a en read-path
som queryar `analytics.event` direkt från en dashboard-widget polled
var 5:e min av tusentals tenants?"*. Det styr cache-strategi,
index-design, query-shape och rate-limiting i denna recon.

---

## 1. Baseline (locked)

```
HEAD                345a269  docs(analytics): external research — Shopify-grade reference (#42)
Branch              feat/besokare-widget-recon (från origin/main)
tsc errors          3        (alla pre-existing M6.4 SEO-baseline; same as Phase 5A baseline)
```

**Pre-existing tsc-errors (oförändrade):**

- `app/(admin)/accommodations/actions.test.ts:145` TS2352 null→{seo}
- `app/(admin)/accommodations/actions.test.ts:313` TS2352 null→{seo}
- `app/(admin)/accommodations/actions.test.ts:364` TS2352 null→{seo}

**Test pass rate:** Phase 5A baseline (37 failed pre-existing, 3,847
passed at PR #36 merge time). Not re-run in recon — recon doesn't
touch test fixtures.

**Relevant prior PRs:**

- #36 — Phase 5A aggregator (write-side; produces `analytics.daily_metric`)
- #39 — Funnel-metrics (cart→checkout conversion)
- #42 — External research (Track 1 reference for §B-citations below)
- #44 — Shopify-grade architectural audit (open at recon-time; not a
  blocker for this recon — Track 3 is independent of audit-driven
  Tier 1 fixes)

**Tier classification per `docs/analytics/tiers.md:30-44`:**

The widget is a **Tier 2** read-path service (analytics dashboards),
near-live but not real-time. SLO budget per the task brief:

- Uptime: 99.9% (Tier 2 default)
- Freshness: ≤ 60s (cached); up to 5 min stale window from polling
  cadence is acceptable
- Latency: p95 < 200ms (cache hit) / p95 < 800ms (cache miss)
- Correctness: divergence vs ground-truth query < 1% acceptable

Phase 5A's drainer freshness target is also 60s (per
`inngest/functions/scan-analytics-outbox.ts:18-21` — *"Worst-case
latency for the fallback path: ≤ 60 seconds + drain time."*). The
widget cache TTL must therefore not be smaller than the drainer
freshness floor — 60s is correct.

---

## 2. Pattern-recon (med exakta filvägar:radnummer)

### 2.1 Existing read-path API pattern

**Reference:** `app/api/analytics/dashboard/route.ts:1-90`

Pattern verified:

- Module-level `export const dynamic = "force-dynamic"`
  (`route.ts:1`).
- Auth: `getAuth()` from `@/app/(admin)/_lib/auth/devAuth` —
  returns `{ userId, orgId }`. `userId === null` → 401.
- Tenant resolution: `getCurrentTenant()` from
  `@/app/(admin)/_lib/tenant/getCurrentTenant.ts:15-37`. Returns
  `{ tenant, clerkUserId, clerkOrgId } | null`. `null` → 404.
  **Tenant id NEVER from query/body.**
- Body/query parse: `z.object({...}).safeParse(...)`, return 400 on
  failure with structured log.
- Error handling: try/catch around the full handler; failures →
  `log("error", "analytics.<route>.failed", { error })` + 500.
- Cache header: existing dashboard returns NO explicit
  `Cache-Control` (defaults to Next's `force-dynamic`). For our
  widget we want explicit `Cache-Control: private, max-age=60` on
  successful responses so browsers throttle re-polls if the user
  has multiple tabs.

The legacy `/api/analytics/live/route.ts:23-25` uses
`Cache-Control: no-store` and reads `prisma.analyticsEvent`
(legacy `public.AnalyticsEvent`, NOT the new `analytics.event`).
Our widget reads from the new pipeline and is the first
near-live consumer of `analytics.event`.

### 2.2 Existing dashboard widget conventions

**Reference:** `app/(admin)/analytics/page.tsx:1-27` +
`app/(admin)/analytics/AnalyticsDashboard.tsx:1-100` +
`app/(admin)/analytics/components/SummaryCards.tsx:1-65`.

Pattern verified:

- Page is server component: `export const dynamic = "force-dynamic"`,
  fetches tenant via `getCurrentTenant()`, passes tenant id to a
  client dashboard.
- Dashboard is `"use client"` with `useState/useEffect/useCallback`.
  No SWR / no React Query — verified absent from `package.json`.
- Polling pattern uses `setInterval` + `useRef` cleanup. Live
  exemplar: `app/(admin)/_components/ScreenshotPreview/ScreenshotPreview.tsx`
  (uses `useRef<ReturnType<typeof setInterval> | null>`,
  cleanup in `useEffect` return).
- Card UI uses `analytics-summary-card` BEM (label, value,
  skeleton-on-loading). **The existing daily "Besökare" card on
  line 34 shows daily visitor count — we must disambiguate naming
  for the new live widget (see §5 Q4).**

### 2.3 Existing Upstash usage

**Reference:** `app/_lib/redis/client.ts:1-23` (singleton);
`app/_lib/redis/lock.ts:71-94` (lock-acquire pattern with `nx + ex`
TTL); `app/_lib/analytics/pipeline/rate-limit.ts:30-53` (Ratelimit
client cache + namespacing).

Pattern verified:

- Singleton import: `import { redis } from "@/app/_lib/redis/client"`.
  **Never instantiate Redis directly** (per `admin/CLAUDE.md`
  Enterprise infra rule).
- Dev / no-credential mode: returns a Proxy that resolves all calls
  to `null` (`client.ts:14-23`). Caching becomes a no-op in dev,
  which means we must tolerate a `null` return from `redis.get` as
  "cache miss" not "cache empty".
- Key namespace convention: `bedfront:<domain>:<purpose>:<...>`,
  verified at `rate-limit.ts:43`
  (`prefix: "bedfront:ratelimit:..."`). The widget cache should
  follow `bedfront:cache:analytics:live:visitors:<tenantId>` —
  domain `cache`, purpose `analytics:live:visitors`, scope
  `<tenantId>`.
- TTL pattern: `redis.set(key, value, { ex: 60 })` for 60s TTL,
  no `nx` (we want overwrite-on-refresh, not lock semantics).
- No existing `withRedisCache(key, ttl, fn)` helper — the lock
  helper is the closest analog. **Track 3 is the first consumer
  that needs this shape; we add a small helper as part of B.2.**

### 2.4 Existing analytics.event query patterns

**Reference:** `app/_lib/analytics/aggregation/aggregate-day-runner.ts:88-135`.

Pattern verified:

- Read uses `_unguardedAnalyticsPipelineClient` from
  `@/app/_lib/db/prisma:148`. The default `prisma` symbol is
  dev-guarded for `analyticsPipelineEvent / Outbox / TenantConfig`
  models (per `app/_lib/db/prisma.ts:108-140`); raw SQL through the
  unguarded client is the only sanctioned path for analytics-schema
  queries.
- `$queryRaw` with template-tag interpolation gives parameter
  binding. `WHERE tenant_id = ${tenantId}` is the static-checked
  pattern Phase 5A enforces (`scripts/verify-phase5a-aggregator.ts`
  check #10 — *"every analytics.event query in aggregator code has
  tenant_id = literal in WHERE"*). The widget MUST follow the same
  pattern; verifier extension may be appropriate (see §4 B.7).
- Time-window queries use `occurred_at >= ${start}` /
  `occurred_at <= ${end}`. Phase 5A uses both bounds for clarity;
  for the widget a single `occurred_at > NOW() - INTERVAL '5 minutes'`
  is sufficient and partition-prunes correctly because the bound is
  always today.
- Indexes available on `analytics.event` per
  `prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql:113-117`:
  - `event_tenant_id_occurred_at_idx` on `(tenant_id, occurred_at DESC)`
    — **this is what our query uses.**
  - `event_tenant_id_event_name_occurred_at_idx` on
    `(tenant_id, event_name, occurred_at DESC)` — covers a future
    event-name-filtered variant if Q1 lands on a specific event-name.
  - Both are non-unique and propagate to all named partitions
    automatically (Postgres 11+ partitioned-index attachment).
  - **No GIN/btree index exists on `payload->>'session_id'`.** The
    query extracts it from JSONB at scan time. At expected row
    counts (see §3.3 below) this is acceptable.

### 2.5 session_id lifecycle

**Reference:** `app/_lib/analytics/pipeline/runtime/loader-context.ts:13-18, 34-38, 277-310`
+ `app/_lib/analytics/pipeline/schemas/_storefront-context.ts:85-105`.

Pattern verified — `session_id` is:

- Client-generated ULID (`ulidx` package).
- Stored in `sessionStorage` under key `bf_sid`.
- Tab-scoped: each open tab gets its own. Multi-tab from the same
  browser produces N distinct session_ids — **this is industry norm,
  documented at `_storefront-context.ts:97-100`**.
- Rotated on:
  1. 30-min idle since last emit (constant `SESSION_IDLE_MS = 30 * 60 *
     1000` at `loader-context.ts:38`).
  2. Consent revoke + regrant (single-source path:
     `consent-banner.ts:105`).
  3. Tab close + reopen (sessionStorage browser semantics).
- Falls back to in-memory cache when `sessionStorage` is
  unavailable (private browsing). `loader-context.ts:271-274`.

**Implication for widget semantics:** "Besökare just nu" =
COUNT(DISTINCT session_id) over 5 min ≠ count of *humans* currently
on site:

- A human with 3 open tabs counts as 3.
- A human refreshing in 1 tab within 5 min counts as 1.
- A human returning after 30+ min idle gets a new session_id (new
  besökare).
- Bots that emit events without a stable session_id (spoofing or
  consent-bypass) inflate the count.

This matches Shopify Live View's "active visitors" semantic — see
§5 Q1 for the explicit decision to keep it.

### 2.6 Helpers confirmed available

- `log()` — `app/_lib/logger.ts:12`. Structured JSON logging. Only
  sanctioned logger.
- `resilientFetch()` — `app/_lib/http/fetch.ts:9`. Not needed by the
  widget (no external HTTP); listed here only because the task
  invariant mentions it.
- `analyticsBreadcrumb()` / `analyticsSpan()` —
  `app/_lib/analytics/pipeline/observability.ts:49-128`. Both
  available. `analyticsSpan` wraps an async function in a Sentry
  span tagged with `tenant_id` + `pipeline_step`; failures get
  fingerprinted as `["analytics", pipeline_step,
  error.constructor.name]` so similar widget errors group across
  tenants.
- `setSentryTenantContext()` — `app/_lib/observability/sentry.ts`.
  Already called inside `getCurrentTenant()` at line 27, so the
  widget's API route inherits tenant context automatically.

---

## 3. Komponentplan (LOC-estimat per komponent)

### 3.1 API route — `app/api/analytics/live/visitors/route.ts` (~140 LOC)

`GET /api/analytics/live/visitors` returning
`{ visitorsNow: number, updatedAt: string, source: "cache" | "fresh" }`.

Auth, tenant-resolution, error-shape mirror
`app/api/analytics/dashboard/route.ts:25-50`. Hard requirements:

- `getAuth()` → 401 on unauth.
- `getCurrentTenant()` → 404 on missing.
- No body / no query params (the widget is "current-tenant, last
  5min" — period). If we ever parameterize, do it via path
  segments not query strings, to keep the cache key shape stable.
- `Cache-Control: private, max-age=60` on 200 — browsers and
  intermediate proxies throttle.
- 500 on internal error with `log("error", "analytics.live_visitors.failed",
  { tenantId, error })`.

The route delegates to a `getVisitorsNow(tenantId)` function in
`app/_lib/analytics/live/visitors.ts` (kept separate so it's
unit-testable without the route handler). The function calls the
cache wrapper (§3.2), which calls the SQL function (§3.3) on miss.

### 3.2 Cache wrapper — `app/_lib/analytics/live/cache.ts` (~80 LOC)

A small `withRedisCache<T>(key, ttlSeconds, fetcher)` helper. **First
consumer of this pattern in the codebase** — we add it minimally
here and let future callers extend if needed.

Contract:

```ts
async function withRedisCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<{ value: T; source: "cache" | "fresh" }>
```

Behavior:

- `redis.get<T>(key)` → if non-null and JSON-parseable, return
  `{ value, source: "cache" }`.
- On miss: `await fetcher()`, then `redis.set(key, JSON.stringify(value),
  { ex: ttlSeconds })`. Return `{ value, source: "fresh" }`.
- Redis errors during `get` or `set` are NEVER fatal — they fall
  through to `fetcher()` and we still serve fresh data. Each error
  emits `log("warn", "analytics.live_cache.<phase>_failed", {key, error})`.
- Dev mode (no Upstash credentials): the redis Proxy returns `null`
  for `get` and resolves `set` to `null` — the helper effectively
  becomes pass-through, which is what we want in dev. Tests don't
  need to mock anything.

Key shape for the widget: `bedfront:cache:analytics:live:visitors:<tenantId>`,
TTL 60s. Per §2.3 namespace convention.

### 3.3 SQL query — `app/_lib/analytics/live/visitors.ts` (~60 LOC)

The SQL shape:

```sql
SELECT COUNT(DISTINCT payload->>'session_id')::int AS visitors_now
FROM analytics.event
WHERE tenant_id = $1
  AND occurred_at > NOW() - INTERVAL '5 minutes'
  AND payload ? 'session_id'
```

Notes on the shape:

- `payload->>'session_id'` extracts as text. NULL when key missing
  (the `payload ? 'session_id'` predicate filters that).
- Cast to `::int` so the JS side gets a Number, not a string (Postgres
  COUNT returns BIGINT which Prisma surfaces as `BigInt`).
- `tenant_id = $1` is the partition-prune-friendly literal Phase 5A
  verifier check #10 enforces. **MUST be a parameter, never
  string-interpolated.** Phase 5A pattern is template-tag
  parameter-binding via `$queryRaw` —
  `aggregate-day-runner.ts:94-106`.
- The 5-min window is tighter than the partition boundary (1 month);
  Postgres prunes to the current partition automatically because
  `occurred_at > NOW() - INTERVAL '5 minutes'` is always within
  today.

Index usage: `event_tenant_id_occurred_at_idx` on
`(tenant_id, occurred_at DESC)`, propagated to all monthly partitions
per `migration.sql:113-114`. The query plan should be
`Index Scan` on the current partition + `Aggregate` on the
extracted JSONB key. **B.1 must verify with EXPLAIN ANALYZE
against fixture data** (see §4).

Worst-case row count over the 5-min window:

- Phase 5A recon §6.5 cites worst-case 1.2M events/day/tenant peak.
- 5 min / 24h × 1.2M ≈ **4170 rows** in the window for the busiest
  tenant in the worst case.
- Average tenant (~10K events/day at steady state per Track 1 §B.12
  inferred): ~35 rows in the 5-min window.
- 4170 rows * extracting a JSONB string per row + DISTINCT in a hash
  set ≈ sub-100ms on warm cache, comfortably under the 800ms
  cache-miss budget. Verify in B.1 + B.6.

### 3.4 Widget component — `app/(admin)/analytics/components/VisitorsLiveCard.tsx` (~90 LOC)

`"use client"` component. Polls `/api/analytics/live/visitors` every
5 minutes, mirroring the `setInterval`/`useRef` pattern in
`app/(admin)/_components/ScreenshotPreview/ScreenshotPreview.tsx`.

States rendered:

- Initial load: skeleton (reuse `analytics-summary-card__skeleton` from
  `SummaryCards.tsx:58`).
- Empty (tenant has 0 events ever): "Inga besökare just nu" — we
  render the 0 explicitly, since "no data" vs "zero" disambiguation
  is Q4 (see §5).
- Steady state: big number + label "Besökare just nu" + small
  subtitle "uppdaterad för X sek sedan" computed from `updatedAt`.
- Error: "Kunde inte ladda besökare" + retry button. Same copy
  shape as `AnalyticsDashboard.tsx:60` (*"Kunde inte ladda
  analysdata"*).

Polling cadence: `setInterval` at 5 minutes (`5 * 60 * 1000` ms).
Cleanup on unmount. **No SWR / React Query** — mirrors existing
codebase convention.

The component is rendered alongside the existing daily
`SummaryCards`. Suggested label disambiguation: rename the daily
card "Besökare" → "Besökare (period)" so the live card can take
the unqualified "Besökare just nu" label. **Decision pending in
§5 Q4.**

### 3.5 Observability instrumentation (~20 LOC, inline in the route)

- Wrap the SQL fetcher in `analyticsSpan("widget.visitors_now",
  { tenant_id, pipeline_step: "widget.visitors_now" }, fetcher)`.
- On cache miss: `analyticsBreadcrumb("widget", "cache_miss",
  { tenant_id, key })`.
- On cache hit: no breadcrumb (would be too noisy at 5-min × 10K
  tenants = 33 cache hits/sec across the fleet).
- On Redis error: already covered by the cache wrapper's `log("warn",
  ...)`.
- Structured success log: `log("info", "analytics.live_visitors.served",
  { tenantId, visitorsNow, source, durationMs })` — kept at info
  level, sampled to 1% in production via the `log()` helper if it
  acquires a sampling argument later (out of scope here).

### 3.6 Total LOC estimate

| Component | LOC |
|---|---|
| API route | ~140 |
| Cache wrapper helper | ~80 |
| SQL function | ~60 |
| Widget component | ~90 |
| Observability inline | ~20 |
| Tests (B.1, B.2, B.3, B.5) | ~280 |
| Verifier extension | ~30 |
| Runbook (B.7) | ~120 |
| **Total** | **~820 LOC** |

Comfortably below the Phase 5A B-step budgets (each step there
typically 100-280 LOC).

---

## 4. Sub-step-plan (B.1 → B.7)

Each step lands as one commit. Acceptance criteria + checkpoint
command listed per step. tsc baseline = 3 pre-existing throughout.

### B.1 — SQL function + integration test mot Postgres-fixture (~140 LOC)

**Filer:**

- `app/_lib/analytics/live/visitors.ts` (+60)
- `app/_lib/analytics/live/visitors.test.ts` (+80)

**Innehåll:**

- `getVisitorsNow(tenantId): Promise<number>` — issues the
  `$queryRaw` against `_unguardedAnalyticsPipelineClient`.
- Test seeds `analytics.event` with 10 events across 4 distinct
  session_ids in the last 5 min for tenant A, 2 events for tenant B
  in the same window, and 5 events for tenant A older than 5 min.
- Assertions: tenant A returns 4. Tenant B returns 1. Cross-tenant
  isolation verified.
- EXPLAIN ANALYZE the query manually during B.1 development and
  paste the plan into the commit message; the plan must show
  `Index Scan` (not `Seq Scan`) on at least the current partition.
  If it shows seq-scan, STOP and revisit index choice.

**Acceptance:**

- `npx vitest run app/_lib/analytics/live/visitors.test.ts` → all green.
- `npx tsc --noEmit` → 3 pre-existing.
- EXPLAIN ANALYZE confirms index usage.

**Commit:** `feat(analytics): besokare B.1 — getVisitorsNow + integration test`

### B.2 — Cache wrapper + cache-hit/miss test (~120 LOC)

**Filer:**

- `app/_lib/analytics/live/cache.ts` (+80)
- `app/_lib/analytics/live/cache.test.ts` (+40)

**Innehåll:**

- `withRedisCache<T>(key, ttlSeconds, fetcher)` per §3.2 contract.
- Test mocks `redis.get`/`redis.set` and verifies:
  1. Miss → calls fetcher, calls `set`, returns `{ value, source:
     "fresh" }`.
  2. Hit → does NOT call fetcher, returns `{ value, source: "cache" }`.
  3. `get` throws → logs warn, calls fetcher, returns fresh.
  4. `set` throws (after fetcher succeeded) → logs warn, returns
     fresh value anyway.
  5. Dev mode (Proxy returns null on `get`) → fetcher is called,
     value is returned as fresh, no error.

**Acceptance:**

- All cache-test cases green.
- tsc 3.

**Commit:** `feat(analytics): besokare B.2 — withRedisCache helper + tests`

### B.3 — API route + tenant-scoping + observability (~180 LOC)

**Filer:**

- `app/api/analytics/live/visitors/route.ts` (+140)
- `app/api/analytics/live/visitors/route.test.ts` (+40)

**Innehåll:**

- Route per §3.1 contract.
- Composes B.1 + B.2 via
  `getVisitorsNow(tenantId)` → wrapped in
  `withRedisCache(\`bedfront:cache:analytics:live:visitors:${tenantId}\`, 60, …)`
  → wrapped in `analyticsSpan(...)`.
- Tests:
  1. Unauthenticated request → 401.
  2. Authenticated but no tenant → 404.
  3. Authenticated tenant, mocked cache miss → 200 with
     `{ visitorsNow, source: "fresh" }` and Cache-Control header.
  4. Authenticated tenant, mocked cache hit → 200 with
     `{ visitorsNow, source: "cache" }`.
  5. Tenant A's cache key never returns Tenant B's value (verified
     by mocked redis seeing different keys per tenant).

**Acceptance:**

- All route tests green.
- tsc 3.

**Commit:** `feat(analytics): besokare B.3 — /api/analytics/live/visitors endpoint`

### B.4 — Widget component + polling + states (~140 LOC)

**Filer:**

- `app/(admin)/analytics/components/VisitorsLiveCard.tsx` (+90)
- Update `app/(admin)/analytics/AnalyticsDashboard.tsx` (+10) to
  render `<VisitorsLiveCard />` above the existing summary cards.
- Update `app/(admin)/analytics/components/SummaryCards.tsx` (+5)
  to relabel the daily "Besökare" → "Besökare (period)" per §5 Q4
  decision (PENDING).
- `app/(admin)/analytics/components/VisitorsLiveCard.test.tsx` (+35).

**Innehåll:**

- Component per §3.4. `useEffect` + `setInterval(5 * 60 * 1000)` +
  cleanup. AbortController to cancel in-flight fetch on unmount.
- Tests with React Testing Library:
  1. Initial render shows skeleton.
  2. After fetch resolves with `{ visitorsNow: 12 }` → renders "12".
  3. After fetch fails → renders error state with retry button.
  4. Polling timer is cleared on unmount.

**Acceptance:**

- Widget tests green.
- `npm run dev` and visit `/analytics` — widget renders, polls,
  recovers from manual network drop.
- tsc 3.

**Commit:** `feat(analytics): besokare B.4 — VisitorsLiveCard with 5-min polling`

### B.5 — End-to-end test (~60 LOC)

**Filer:**

- `app/_lib/analytics/live/e2e.test.ts` (+60)

**Innehåll:**

- Seeds `analytics.event` with N events at fixed `session_id`s.
- Performs HTTP GET to `/api/analytics/live/visitors` via Next's
  test server (mock auth + tenant).
- Asserts the returned `visitorsNow` matches the expected distinct
  count.
- Issues a second GET within 60s and asserts `source === "cache"`
  AND the returned value matches the first response (cache stable).
- Issues a third GET after 60s elapsed (test-time advance via
  vi.useFakeTimers if Redis mocked, or real wait if Redis live in
  the test environment) and asserts `source === "fresh"`.

**Acceptance:**

- E2E test green.
- tsc 3.

**Commit:** `test(analytics): besokare B.5 — end-to-end seed→poll→cache`

### B.6 — Load test + p95 validation (~50 LOC)

**Filer:**

- `scripts/load-test-besokare.ts` (+50)

**Innehåll:**

- Script polls `/api/analytics/live/visitors` against a seeded dev
  DB at the production-equivalent rate: 10K tenants × 1 poll / 5
  min ≈ 33 RPS. We simulate at 100 RPS for headroom.
- Run for 60s. Capture latency distribution. Assert:
  - p95 < 200ms (cache hit) — with cache warm via 30-second prior
    warmup.
  - p95 < 800ms (cache miss) — first 60s of fresh polling.
- If either fails → stop and revisit (e.g. payload->>'session_id'
  index, or pre-warm cache via cron).

**Acceptance:**

- Load test passes p95 budget.
- Latency distribution captured and committed under
  `_audit/besokare-load-test-<date>.txt` for posterity.

**Commit:** `test(analytics): besokare B.6 — load test + p95 validation`

### B.7 — Runbook + verifier extension + dashboard label (~150 LOC)

**Filer:**

- `docs/analytics/besokare-widget.md` (+120) — runbook covering
  what the widget shows, what its semantics mean (the §2.5
  multi-tab caveat), how to debug a "stuck" widget (cache key,
  Redis inspection).
- `scripts/verify-phase5a-aggregator.ts` (+30) — extend with two
  checks specific to live-widget:
  1. `/api/analytics/live/visitors/route.ts` exists and uses
     `_unguardedAnalyticsPipelineClient` (singleton).
  2. The route's SQL has `tenant_id = ${...}` literal in WHERE
     (extends check #10 to cover the new file path).

**Acceptance:**

- Runbook published.
- `npm run verify:phase5a` → 19/19 (was 17/17).
- tsc 3.

**Commit:** `docs(analytics): besokare B.7 — runbook + verifier extension`

---

## 5. Q-decisions

Status legend: **LOCKED** (decided in code/doc, citation provided),
**RESOLVED** (recon-side decision, motivated), **OPEN** (needs Leo's
input — implementation cannot start until resolved).

### 5.1 (RESOLVED) Session_id-definition — what counts as "pågående session"?

**Question:** Should we count any event in the 5-min window, or only
specific event types (page_viewed, cta_click, etc.)?

**Decision: count any event with a non-empty `payload->>'session_id'`.**

**Rationale:** Per `_storefront-context.ts:85-105` the `session_id`
field is only present on storefront-emitted events (page_viewed,
cart_started, cart_updated, cart_abandoned, checkout_started,
accommodation_viewed, availability_searched). Server-emitted events
(payment_succeeded, booking_completed, etc.) do NOT carry session_id
in their payload. The `payload ? 'session_id'` predicate naturally
filters to storefront events.

The `event_name`-filtered alternative (e.g. `WHERE event_name =
'page_viewed'`) would be marginally faster (uses
`event_tenant_id_event_name_occurred_at_idx`) but discards signal —
a guest who hasn't loaded a new page in 5 min but is filling out a
checkout form (firing cart_updated events) would be lost from the
count. The "any storefront event" rule keeps the metric honest.

**Source:** `app/_lib/analytics/pipeline/schemas/_storefront-context.ts:85-105`
(session_id is on storefront events only) +
`app/_lib/analytics/pipeline/schemas/registry.ts:96-111` (storefront
events declared in registry).

### 5.2 (OPEN) Bot-filtering

**Question:** Should we exclude events whose `user_agent_hash`
matches a known-bot deny-list?

**Two readings:**

- **(a) No filtering, expose what we measure.** Simpler. The widget
  reflects "events that arrived through the consent gate", which
  includes any bot that bypasses consent (rare — TCF gate is at the
  loader, before emit). Most bots either don't execute JS or are
  blocked by the consent gate; the residual is small.
- **(b) Filter known bots.** We have `analyticsSalt` per tenant
  (`Tenant.settings.analyticsSalt`, mintat vid create), so we can
  produce `sha256(salt + ":" + uaString).slice(0,16)` to compare
  against a deny-list. Problem: we'd need the raw UA string in our
  hand at deny-list-build time, AND we'd need to maintain the
  list (Selenium, Playwright, ChatGPT-crawler, etc.). Mantenance
  burden + always-stale list.

**Implication for trust:** If a tenant's consent banner is mis-wired
and bots get through, the widget will inflate. That's a consent-gate
bug, not a widget bug — and we'd want it visible (alarm signal),
not silently suppressed.

**Recommendation:** (a) ship without filtering; revisit if production
shows >1% bot inflation.

**This is OPEN because the recommendation could be wrong — Leo
may have brand/perception reasons to want a clean number out of the
gate.**

### 5.3 (OPEN) Cache-strategi — read-through vs write-around

**Question:** Two flavors of caching:

- **Read-through (proposed in §3.2):** cache miss triggers fetch.
  Cold cache at start-of-day = 10K tenants × 1 fetch each in the
  first 60s = ~167 RPS burst against `analytics.event`.
- **Write-around (alternative):** Inngest cron every 5 min iterates
  all tenants with recent activity, computes their visitorsNow,
  writes to Redis. Widget always reads cache — never queries DB.
  Steady-state: 33 fetches/sec from cron, predictable. BUT requires
  enumerating tenants on every cron tick (which Phase 5A's
  `scan-analytics-aggregate` already does).

**Trade-offs:**

- Read-through is simpler, scales with USAGE not tenant count. If
  only 100 admins are looking at their dashboards at once, only 100
  cache fetches happen. At 10K tenants but 100 active dashboards,
  read-through = 100 fetches/5min ≈ 0.3 RPS. Much cheaper.
- Write-around is constant-cost regardless of dashboard usage. At
  10K tenants × 1 cron / 5min = 33 RPS regardless of viewers. But
  the cost is paid even when nobody is looking. Wasteful.
- Read-through is a Shopify-grade pattern for low-cardinality
  reads — "compute on demand, cache aggressively, expire
  conservatively". Per Track 1 §B.6 (Cloudflare ClickHouse case),
  precomputation is reserved for queries that hit at high QPS —
  the besökare widget at 5-min cadence is firmly in
  read-through territory.

**Recommendation:** read-through (per §3.2).

**This is OPEN because:**

1. There's an argument for write-around if we expect to add more
   live widgets (top pages, top locations, funnel-realtime — all
   listed as out-of-scope in §6). Those live alongside the besökare
   widget on the same dashboard. If 5+ widgets each do their own
   read-through, a single dashboard load triggers 5 cache misses
   in parallel (still cheap, but the case for shared write-around
   strengthens).
2. Write-around fits Phase 5A's existing
   `scan-analytics-aggregate.ts` pattern more naturally — same
   cron, same tenant enumeration, same Inngest concurrency.

**Leo to decide.** If "yes to a future multi-widget live
dashboard" is in the cards within 3 months, write-around may be
the right shape from day one.

### 5.4 (OPEN) Empty-state — "0 besökare" vs "ingen data ännu"

**Question:** When a tenant returns 0, do we render the literal "0"
or do we distinguish "no data ever yet" (e.g. a freshly onboarded
tenant whose Phase 3 loader hasn't fired any storefront events)?

**Three readings:**

- **(a) Always render the number.** "0" means "no active visitors
  in the last 5 min" — simple, Shopify Live View pattern.
- **(b) Distinguish "no data" via a separate signal.** Query
  `analytics.event` for any row in the last 24h: if zero, render
  "Inga besökare ännu" instead of "0 besökare". Adds an extra
  query per cache miss; complicates the response shape.
- **(c) Distinguish at the loader-init level.** If the tenant has
  no Phase 3 loader installed at all (verified at install time),
  show an onboarding CTA instead. **Out of scope — that's an
  install-flow concern.**

**Implication:** If we go with (a), a brand-new tenant who hasn't
yet wired up their loader sees "0 besökare" forever. They might
think the widget is broken.

**Recommendation:** (a) for v1, with the runbook (§4 B.7) explaining
the semantics. Promote to (b) in a follow-up if Leo's testers
report confusion.

**This is OPEN — Leo's brand/onboarding judgment.**

Also affects label disambiguation: the widget label "Besökare just
nu" vs the existing daily summary card "Besökare". Currently the
daily card sits at `SummaryCards.tsx:34`. **B.4 proposes relabeling
the daily card → "Besökare (period)"** — flagged in §3.4.
Confirmation needed.

### 5.5 (RESOLVED) GDPR — k-anonymity threshold for low counts?

**Question:** Should we hide counts below a k-anonymity threshold
(e.g. show "<5" if distinct sessions < 5) to avoid singling out
individuals?

**Decision: NO threshold. Show the literal count, including 1 and
0.**

**Rationale:**

1. Per Track 1 (`_audit/analytics-external-research.md` §B.8 / GDPR
   Recital 26), the data is already pseudonymized (tab-scoped ULID,
   not a PII identifier). The widget displays a count, not a
   per-session record.
2. A merchant viewing their OWN tenant's analytics has a legitimate
   interest in the actual number — they're the data controller.
   k-anonymity is a defense for cross-tenant or aggregated public
   analytics, not for tenant-internal dashboards.
3. Shopify Live View shows the literal "1 visitor" / "0 visitors"
   without thresholding. Industry-standard pattern.
4. No PII / no payload contents reach the widget — only a scalar
   count. Cross-correlation to identify a specific person from "1
   active session" is impossible from the widget alone (you'd need
   server logs + browser fingerprint cross-correlation, which is
   not the widget's surface).

**Source:** `_audit/analytics-external-research.md` §B.8 (GDPR
Recital 26 verbatim quote on aggregated data).

### 5.6 (LOCKED) Index — `(tenant_id, occurred_at DESC)` is sufficient

**Question:** Do we need a new index on `(tenant_id, (payload->>'session_id'))`
or is the existing `(tenant_id, occurred_at DESC)` enough?

**Decision: existing index is sufficient. No new index in this PR.**

**Rationale:**

1. Existing index `event_tenant_id_occurred_at_idx` is exactly what
   our query uses — verified at
   `prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql:113-114`.
2. Worst-case row scan over the 5-min window is ~4170 rows (§3.3
   computation). Extracting `payload->>'session_id'` from 4170 rows
   in memory and DISTINCT-counting is sub-100ms.
3. A new index on `(tenant_id, (payload->>'session_id'))` would
   speed nothing at this row count and would impose write-time cost
   on every emit. Not worth it.
4. Phase 5A's Inngest aggregator at 1.2M events/day reads these
   same rows daily without complaint
   (`aggregate-day-runner.ts:88-135`). 5-min slices through the same
   data are 1/288th the load.
5. EXPLAIN ANALYZE in B.1 will confirm or refute. If it surprises,
   re-decide.

**Source:** `prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql:113-114`
+ Phase 5A recon §6.5 (worst-case volume).

**Locked — no DDL change in scope.**

### 5.7 (RESOLVED) Polling-mekanism — native setInterval

**Question:** SWR? React Query? setInterval? Server-Sent Events?

**Decision: native `setInterval` + `useEffect` cleanup.**

**Rationale:**

- Verified absent from `package.json`: SWR, React Query — not
  installed. Adding either to the bundle for one widget is
  disproportionate.
- Verified existing precedent:
  `app/(admin)/_components/ScreenshotPreview/ScreenshotPreview.tsx`
  uses `setInterval` + `useRef` cleanup. Same pattern.
- 5-min cadence makes timer drift negligible (1s drift over 5 min =
  0.3% — irrelevant for a near-live widget).
- Server-Sent Events would be the right pattern at sub-second
  freshness (Shopify Live View uses WebSocket-equivalent push).
  Out of scope — listed in §6 as future work.

**Source:** `app/(admin)/_components/ScreenshotPreview/ScreenshotPreview.tsx`
(in-house exemplar) + `package.json` (SWR/React-Query absence
confirmed via grep).

### 5.8 (LOCKED) Singleton clients

Per `admin/CLAUDE.md` "Enterprise infrastructure":

- `_unguardedAnalyticsPipelineClient` from `app/_lib/db/prisma.ts:148`
  for analytics-schema reads. Never `new PrismaClient()`.
- `redis` from `app/_lib/redis/client.ts:14` for cache. Never
  `new Redis()`.

Both are non-negotiable. Locked.

### 5.9 (LOCKED) Tenant-isolation invariant

Every analytics.event query MUST contain `tenant_id = ${tenantId}`
literal in WHERE. Phase 5A verifier check #10 enforces this for
existing files; B.7 extends the verifier to cover the new
widget route file. **Cross-tenant scope leak is a Tier 0 incident.**

Source: `scripts/verify-phase5a-aggregator.ts` check #10.

### Q-summa

| ID | Klass | Sammanfattning |
|---|---|---|
| 5.1 | RESOLVED | Any storefront event with session_id counts |
| 5.2 | **OPEN** | Bot filtering — recommended NO; Leo confirms |
| 5.3 | **OPEN** | Read-through vs write-around — recommended read-through; depends on multi-widget roadmap |
| 5.4 | **OPEN** | Empty-state — "0" vs "no data yet"; affects label too |
| 5.5 | RESOLVED | No k-anonymity threshold (industry-standard) |
| 5.6 | LOCKED | Existing index sufficient (no new DDL) |
| 5.7 | RESOLVED | Native setInterval (precedent + bundle weight) |
| 5.8 | LOCKED | Singleton clients (CLAUDE.md invariant) |
| 5.9 | LOCKED | Tenant-isolation invariant (verifier #10) |

**3 OPEN.** Implementation cannot start until §5.2, §5.3, §5.4 have
RESOLVED-besked from Leo. None has a tyst default — each blocks
implementation in different ways:

- §5.2 affects whether B.1 needs a deny-list helper.
- §5.3 affects whether B.2 / B.3 are read-through or whether we
  need a new Inngest function (write-around).
- §5.4 affects B.4 widget rendering AND naming of the existing
  daily card.

---

## 6. INTE I DENNA PR (scope-cap)

Explicit out of scope — must NOT creep in:

- **Multi-widget live dashboard** — top pages, top locations,
  funnel-realtime, conversion-realtime. Each is a separate
  "Besökare-shaped" widget. The cache-strategy decision in §5.3
  affects whether to plan ahead for these or not, but the widgets
  themselves are future PRs.
- **Server-Sent Events / WebSockets** — sub-second freshness.
  Mental model: Shopify Live View. Out of scope; we start with
  5-min polling.
- **Materialized view for the 5-min window** — only if B.6 load
  test shows direct query can't hold p95. Track in §6 as a
  fallback, not a v1 deliverable.
- **Stale-while-revalidate** — Cloudflare-pattern where stale cache
  is served while a background fetch refreshes. Adds complexity for
  little gain at 60s TTL + 5-min polling. Future optimization.
- **Bot deny-list infrastructure** — depends on §5.2 OPEN.
- **Onboarding empty-state CTA** — depends on §5.4 OPEN, but the
  install-flow concern (option (c) in §5.4) is a different surface.
- **Porting the rest of the legacy `/api/analytics/live` route**
  (globe, funnel, today's revenue) to Phase 5A's `analytics.event`.
  That's a separate cutover effort; this PR ships ONLY the besökare
  count.
- **Per-event-name breakdown** ("X gäster på checkout, Y på
  homepage") — a follow-up widget; out of scope.
- **Historical "besökare" series** (line chart of visitorsNow over
  the last 24h) — separate aggregator job; not a live read.
- **Phase 5B parity validation** of the live-visitors path against
  the legacy `/api/analytics/live` route — semantics differ
  (legacy uses `visitorId`, new uses `session_id`); cannot match
  by definition.

---

## 7. Quality gate (self-assessment)

### Per-section read-through

**§1 Baseline** — ✅ Green. tsc baseline locked; HEAD SHA cited;
prior PRs listed. Tier classification grounded in
`docs/analytics/tiers.md`.

**§2 Pattern-recon** — ✅ Green. Every claim has a file:line
citation. Critical findings:

- The legacy `/api/analytics/live/route.ts` (5s polling, no cache,
  reads legacy `AnalyticsEvent`) is NOT what we're extending — we
  ship a new endpoint sourced from `analytics.event`.
- No SWR / React Query in repo (verified via package.json grep).
- No GIN/btree on `payload->>'session_id'` (verified via migration
  grep).
- Existing `(tenant_id, occurred_at DESC)` index is sufficient
  (§5.6 LOCKED).

**§3 Komponentplan** — ✅ Green. LOC estimates conservative based on
Phase 5A B-step sizes. p95 budget realistic given worst-case row
counts (§3.3 math).

**§4 Sub-step-plan** — ✅ Green. Each B-step has explicit
acceptance + commit message. B.6 load test is a hard gate before
B.7.

**§5 Q-decisions** — ⚠️ Yellow. **3 OPEN questions block
implementation:** §5.2 (bot filtering), §5.3 (cache strategy), §5.4
(empty state + label). Each is a real decision, not a guess
masquerading as a question — recommendations are explicit, but
Leo's call carries product/brand judgment that the recon cannot
substitute.

**§6 Out of scope** — ✅ Green. 9 items explicitly excluded with
reasoning. Cross-references §5.3's read-through vs write-around
trade-off.

**§7 (this section)** — ✅ Green.

### Skulle Shopifys Platform-team merge:a denna recon?

**Ja, med tre kvarstående beslut.** The architecture is conservative
and proven (read-through cache, native polling, existing indexes,
tenant-scoped queries verified by static check). The OPEN questions
in §5 are honest decisions that need Leo's product judgment — they
are not engineering uncertainty.

The Shopify-grade test:

- ✅ Tenant isolation enforced by static check (#10 extension in B.7).
- ✅ Singleton client used (`_unguardedAnalyticsPipelineClient`).
- ✅ No in-memory cross-instance state (Upstash Redis only).
- ✅ Partition-prune-friendly query (5-min window always in current
  partition).
- ✅ p95 budget motivated by row-count math, not optimism.
- ✅ Observability tied into existing analyticsSpan/analyticsBreadcrumb.
- ✅ Idempotent / re-runnable (read-only endpoint; cache misses
  fetch, no side effects).
- ✅ Failure-mode honesty (Redis errors don't break the route;
  fall through to fresh fetch).
- ✅ All 4 invariants from the task brief covered (no `as any`,
  no `console.*`, no direct fetch, no in-memory cross-instance,
  tenant-scoping via resolver, no `if tenantId === '...'` paths).
- ⚠️ Bot filtering judgment call (§5.2).
- ⚠️ Cache strategy depends on multi-widget roadmap (§5.3).
- ⚠️ Empty-state UX call (§5.4).

### Implementation readiness check

Before terminal-Claude can be handed an implementation prompt:

- [ ] Leo answers §5.2 (bot filtering)
- [ ] Leo answers §5.3 (cache strategy — read-through confirmed, or
      write-around required?)
- [ ] Leo answers §5.4 (empty-state UX + daily-card relabel)
- [ ] PR #44 (Shopify-grade audit) is merged OR Leo confirms
      Track 3 can proceed independently (recommended: independent
      — audit doesn't block this work)
- [ ] This recon PR is merged

Implementation prompt cannot be drafted until §5.2-§5.4 are RESOLVED.

---

**End of recon document.**

Following sections of the Phase 5A recon (parity-strategy,
observability detail, dashboard-route citations) are intentionally
omitted because Track 3 is read-only (no parity-validation needed),
single-route (observability inline), and the dashboard route is
covered in §2.1 by reference.
