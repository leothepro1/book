# Phase 5A — Analytics aggregator (write side) RECON

**Datum:** 2026-05-03
**Branch:** `feature/analytics-phase5a-aggregator` (skapad denna session från
`feature/analytics-loader-hardening` HEAD)
**HEAD:** `f80f729 docs(analytics): Loader hardening B4 — runbook + Phase 2 status`
**Författare:** Claude (auto)
**Status:** RECON COMPLETE — implementation pending Leo-godkännande av §9
Q-decisions (5 OPEN, 4 RESOLVED, 3 LOCKED).

Detta är en recon-leverans. Ingen kod, ingen migration, inga tester landar
i denna PR — bara detta dokument.

---

## 1. Baseline (locked)

```
HEAD                f80f729  docs(analytics): Loader hardening B4 …
tsc errors          3        (alla pre-existing M6.4 SEO-baseline)
test failures       37       (i 11 filer; alla pre-existing — samma som
                              feature/analytics-loader-hardening parent)
test passes         3450     (4 skipped, 3491 total)
prisma migrate      up to date  (27 migrations on disk; lokal dev-DB har
                                 leftover Tenant.environment-kolumn från
                                 cherry-pick som rebase-:ades bort i Phase 2 —
                                 dokumenterat i Phase 2 push-rapport, inte
                                 blocker för Phase 5A)
```

**Pre-existing tsc-errors (oförändrade — får inte regressas):**
- `app/(admin)/accommodations/actions.test.ts:145` TS2352 null→{seo}
- `app/(admin)/accommodations/actions.test.ts:313` TS2352 null→{seo}
- `app/(admin)/accommodations/actions.test.ts:364` TS2352 null→{seo}

**Pre-existing test failure-clusters (oförändrade):**
- `app/_lib/payments/providers/__tests__/webhook.test.ts`
- `app/_lib/discounts/apply.test.ts` (4 tester)
- `app/_lib/guest-auth/account.test.ts` (4 tester)
- `app/(admin)/accommodation-categories/_components/AccommodationCategoryForm.seo.test.tsx`
- `app/(admin)/accommodations/[id]/AccommodationForm.test.tsx`
- `app/(admin)/collections/_components/CollectionForm.seo.test.tsx`
- `app/(admin)/products/_components/ProductForm.seo.test.tsx`
- `app/api/admin/pms-reliability/health/route.test.ts`

**Checkpoint per sub-step under implementation:**
`npx tsc --noEmit` ⇒ exakt 3 (samma rader). `npm test -- --run` ⇒ 37
failed / ≥3450 passed / 4 skipped i de existerande klustren; nya filer
endast 0 failures.

**Tier-klassificering** (per `docs/analytics/tiers.md:13-28` Tier 1 +
`:31-44` Tier 2):
- Aggregator skriv-väg: **Tier 1-adjacent**. Drainer-skrivning till
  `analytics.event` är redan Tier 1; aggregator läser därifrån + skriver
  pre-aggregerad output. Ingen guest-blockerande väg, men dashboard
  freshness är merchant-facing.
- Dashboard läs-väg: **Tier 2** (uttryckligt nämnd i tiers.md:41 som
  "analytics dashboards").
- SLO-budget: 99.9% uptime, freshness 15 min, latens p95 < 500 ms.

---

## 2. Dimension gap-analys (kritisk sektion)

Varje (metric, dimension)-par dashboarden visar idag, källa i v1, och vad
som krävs i v2. v1-radnummer refererar `app/_lib/analytics/aggregation.ts`.

### 2.1 REVENUE × TOTAL — COVERED

- **v1:** `aggregation.ts:65` totalRevenue = sum(paidOrders.totalAmount)
- **v2:** sum(`payment_succeeded`.payload.amount.amount) WHERE
  `event_name = "payment_succeeded"`. Skickas oberoende av `orderType` per
  `event-catalog.md:222-224`.
- **Status:** COVERED. payment_succeeded fyrar för **varje** PAID Order.

### 2.2 REVENUE × CHANNEL — HYBRID (gap för PURCHASE-orders)

- **v1:** `aggregation.ts:104-110` revenueByChannel grupperar paidOrders på
  `Order.sourceChannel ?? "direct"`. `sourceChannel` är String? med
  värden enligt `prisma/schema.prisma:2856` ("direct" | "booking_com" |
  "expedia" | app-handle).
- **v2:** ACCOMMODATION-orders → join `payment_succeeded.payload.booking_id`
  mot `booking_completed.payload.source_channel` (event-catalog.md:85).
  PURCHASE-orders → `payment_succeeded` saknar `source_channel`-fält
  (verifierat i `event-catalog.md:233-254` — endast
  payment_id, booking_id, amount, provider, payment_instrument,
  provider_reference, captured_at).
- **Status:** HYBRID. Gap för PURCHASE.
- **Föreslagen åtgärd:** v0.2.0-bump på `payment_succeeded` som lägger
  till optional `source_channel` (ärver Order.sourceChannel server-side
  vid emit). Phase 5A kan börja med två-källig läsning (booking_completed
  för ACCOMMODATION, "direct" som fallback för PURCHASE) och tighta i
  uppföljnings-PR. **OPEN Q-decision §9.1.**

### 2.3 REVENUE × PRODUCT — GAP (för PURCHASE) / COVERED (för ACCOMMODATION via accommodation_id)

- **v1:** `aggregation.ts:113-118` revenueByProduct grupperar
  OrderLineItem.productId × OrderLineItem.totalAmount.
- **v2:** Inget event har en line-item-utveckling. `payment_succeeded`
  ger Order-totalt, inte per-line. `cart_updated` har items_count men
  inga product_id eller per-product belopp.
- **Status:** GAP. ACCOMMODATION fångas indirekt via
  `booking_completed.payload.accommodation_id` × Order.totalAmount, men
  cart-baserade PURCHASE-orders förlorar produkt-uppdelning.
- **Föreslagen åtgärd:** v0.2.0-bump på `payment_succeeded` att inkludera
  `line_items: [{ product_id, amount }]`. Alternativt: nytt event
  `order_line_completed` per line-item. **OPEN Q-decision §9.2.**

### 2.4 ORDERS × TOTAL — COVERED

- **v1:** `aggregation.ts:66` totalOrders = paidOrders.length
- **v2:** count(`payment_succeeded`). En event per PAID Order
  (event-catalog.md:222-224). 1:1 med v1.
- **Status:** COVERED.

### 2.5 ORDERS × CHANNEL — HYBRID (samma gap som §2.2)

- **v1:** `aggregation.ts:108-110` ordersByChannel
- **v2:** Samma hybrid-strategi som REVENUE×CHANNEL. **OPEN Q-decision §9.1.**
- **Status:** HYBRID.

### 2.6 AVERAGE_ORDER_VALUE × TOTAL — COVERED (derived)

- **v1:** `aggregation.ts:67` aov = round(totalRevenue / totalOrders)
- **v2:** Beräknas server-side i aggregator från §2.1 + §2.4. Kräver inget
  nytt event.
- **Status:** COVERED. Aggregator-derived.

### 2.7 RETURNING_CUSTOMER_RATE × TOTAL — COVERED (med en extra DB-touch)

- **v1:** `aggregation.ts:69-101` joinar paidOrders.guestAccountId mot
  prior PAID orders via `prisma.order.groupBy` på guestAccountId med
  `paidAt < dayStart`.
- **v2:** `payment_succeeded.actor_id` (per `integrations.ts:71-80`,
  GuestAccount.id eller `email_<sha256-16hex>`-pseudonym) — kan
  joinas mot tidigare events med samma actor_id i analytics.event.
- **Status:** COVERED. Phase 5A aggregator gör en extra
  `analytics.event`-query för "fanns event från denna actor_id före
  dayStart". Index `[tenantId, occurredAt(sort: Desc)]` (schema:5620)
  täcker, men för actor_id-filtreringen behöver vi en ny index — se §6.

### 2.8 SESSIONS × TOTAL — COVERED (men semantik flyttar)

- **v1:** `aggregation.ts:122-127` läser AnalyticsEvent där
  eventType IN (SESSION_STARTED, PAGE_VIEWED). `aggregation.ts:136`
  uniqueSessionIds = distinct sessionId.
- **v2:** distinct `payload.session_id` från `page_viewed` (alla nuvarande
  storefront-events bär StorefrontContext, men page_viewed är
  garanterat per route-load per `event-catalog.md:622-634`).
- **Status:** COVERED. Definitionsskifte: v1-session = legacy klient-
  cookie-stabil id; v2-session = ULID i sessionStorage som **roterar**
  vid 30 min idle, consent deny→grant, och tab close (per
  `_storefront-context.ts:85-105`). Detta är **avsedd** beteendeändring
  — pre-Phase-2 cross-tab-sessioner räknades som 1, post-Phase-2 räknas
  varje tab som distinct. Phase 5B parity-tolerance måste tillåta drift
  på detta. **RESOLVED Q-decision §9.3.**

### 2.9 SESSIONS × DEVICE — GAP

- **v1:** `aggregation.ts:131` `deviceType` från
  AnalyticsEvent.deviceType (enum DESKTOP/MOBILE/TABLET, prisma:3970).
  Sätts på server-side emit (emit.ts:38) som hardkodad "DESKTOP" — de
  riktiga värdena kommer från frontend-track via `track()` i
  `app/_lib/analytics/client.ts`.
- **v2:** StorefrontContext har **ingen** device_type. Den har viewport
  (width, height) + user_agent_hash. UA är hashad innan den når pipelinen
  (`loader-context.ts:81-86`) — den raw UA-strängen finns aldrig i
  payload.
- **Status:** GAP.
- **Föreslagen åtgärd (en av tre):**
  1. **Viewport-heuristik i aggregator** (≤768px = MOBILE, ≤1024 = TABLET,
     else DESKTOP). **Avrådes** — viewport är ostabil input
     (window-resize, DPR-skalning, mobile portrait/landscape, iPad
     split-view). Heuristiken låser in dålig data permanent. Cost-saving
     är skenbar: vi får aldrig korrekt device-fördelning, och en senare
     migration till alt (2) kräver historisk-data-reklassificering. Inte
     ett Shopify-grade alternativ.
  2. **v0.2.0 StorefrontContext + worker UA-parse**: lägg till
     `device_type: "desktop" | "mobile" | "tablet"` som worker härleder
     **innan** UA hashas. UA stannar i workern (privacy intact). Pro:
     korrekt över alla edge-cases. Con: schema-bump, parser-LOC i
     workern (~150 LOC, måste tree-shake under 30 KB-budget).
  3. **Acceptera dimension-förlust** i Phase 5A; lös i Phase 5C.
  **OPEN Q-decision §9.4.**

### 2.10 SESSIONS × CITY — GAP

- **v1:** `aggregation.ts:132` joins `AnalyticsLocation.city` via FK
  (locationId). AnalyticsLocation har country (ISO 3166-1) + city + lat/lng
  per `prisma:3980-3993`. Skrivs av legacy emit-vägen
  (`/api/analytics/events/route.ts` — IP→geo via MaxMind).
- **v2:** StorefrontContext har **ingen** geo. `/api/analytics/collect`
  (Phase 3 PR-A) har klientens IP via request-headers men kör inte geo-
  lookup. MaxMind är redan vendored (`prebuild`-script
  `download-geolite2.sh` per package.json:8).
- **Status:** GAP.
- **Föreslagen åtgärd:** kör geo-lookup vid `/api/analytics/collect` och
  berika event med `context.geo: { country, city }` (analytics.event.context
  är redan `Json?` per schema:5616 — additivt). Aggregator läser från
  context.geo. Privacy: stadens centroid används aldrig — exact lat/lng
  matas inte in. **OPEN Q-decision §9.5.**

### 2.11 VISITORS × TOTAL — GAP (semantik-skifte)

- **v1:** `aggregation.ts:137-138` distinct visitorId med filter
  `visitorId !== "server"`. visitorId är klient-genererad
  (förmodligen localStorage, längre livstid än session_id).
- **v2:** Inget motsvarande långt-livat klient-id. user_agent_hash är
  16-char hex per StorefrontContext, stabil per (tenant, browser, salt) —
  kan användas som visitor-proxy. Bryts av salt-rotation (per
  `_storefront-context.ts:60` — operator-handling som "wipe my history").
- **Status:** GAP (semantik) — räknad annorlunda.
- **Föreslagen åtgärd:** redefiniera "visitor" = distinct
  `user_agent_hash` per dag. Salt-rotation = mätningsavbrott (avsedd
  konsekvens). Alternativ: lägg till `visitor_id` (browser-localStorage
  ULID) som ny StorefrontContext v0.2.0-fält. **OPEN Q-decision §9.6.**

### 2.12 Sammanfattning gap-analys

| Metric × Dimension | Status | Block-nivå |
|---|---|---|
| REVENUE × TOTAL | COVERED | — |
| REVENUE × CHANNEL | HYBRID | OPEN §9.1 |
| REVENUE × PRODUCT | GAP | OPEN §9.2 |
| ORDERS × TOTAL | COVERED | — |
| ORDERS × CHANNEL | HYBRID | OPEN §9.1 |
| AOV × TOTAL | COVERED (derived) | — |
| RETURNING_CUSTOMER_RATE × TOTAL | COVERED | — |
| SESSIONS × TOTAL | COVERED (semantik-skifte) | RESOLVED §9.3 |
| SESSIONS × DEVICE | GAP | OPEN §9.4 |
| SESSIONS × CITY | GAP | OPEN §9.5 |
| VISITORS × TOTAL | GAP (semantik-skifte) | OPEN §9.6 |

**Inga av §9.1–9.6 är blockers för Phase 5A's RAM-arbete:** aggregatorn
kan landa med dagens covered-set (REVENUE/ORDERS/AOV/RETURNING/SESSIONS×TOTAL).
Phase 5B parity-arbetet är vad som tvingar Q-besluten — utan dem är
parity inte mätbart för de gappade dimensionerna.

---

## 3. Aggregator-arkitektur

### 3.1 Inngest function vs cron-route — RESOLVED för Inngest

Phase 1B-drainern (`drain-analytics-outbox`) och scannern
(`scan-analytics-outbox`) är båda Inngest-funktioner per
`inngest/functions/drain-analytics-outbox.ts:84-93` och
`scan-analytics-outbox.ts:40-52`. Aggregatorn matchar mönstret:

- **`scan-analytics-aggregate`** — var 15:e minut (`*/15 * * * *`),
  matcher Tier 2 freshness-SLO på 15 min per `tiers.md:38`. Selectar
  tenants med events i de senaste 48h och dispatchar
  `analytics.aggregate.fanout`-event per tenant. 15-min-frekvensen
  ligger i samma cron-band som befintlig `reconcile-payments`
  (`vercel.json` `*/15 * * * *`) och `sync-discount-statuses`.
- **`run-analytics-aggregate-day`** — triggas av
  `analytics.aggregate.fanout`. Per-tenant. Aggregerar (tenantId, date)
  idempotent. Concurrency `key: "event.data.tenant_id"`, limit 1 (samma
  pattern som drainer:88-91).

**Motivering:** Inngest håller redan retry-budget (5 attempts per
drain), Sentry-integration via `withSentry`-wrapparen, breadcrumbs via
`analyticsBreadcrumb`. Att uppfinna en parallell cron-route vore
duplicerat infrastrukturansvar. Phase 5A följer mönstret rakt av.

### 3.2 Per-tenant fanout vid 10k tenants

Skanner-strategi vid 10k tenants:

- `scan-analytics-aggregate` läser DISTINCT `tenant_id` från
  `analytics.event` WHERE `occurred_at` i 48h-fönstret (per §3.4).
  LIMIT 10000 (matchar `MAX_TENANTS_PER_SCAN = 1000` i
  scan-analytics-outbox.ts:38; vid 10k tenants ökar vi till 10000 —
  RESOLVED).
- `step.sendEvent` dispatchar **alla** events i en batch (matchar
  scan-analytics-outbox.ts:78-84). Inngest serialiserar internt.
- Per-tenant concurrency-key partitionerar fan-outet — samma pattern som
  drainern. Cross-tenant parallelism är obegränsad förutom Inngest plan-
  cap (default 1000 parallel runs).

**Round-robin behövs inte** här (till skillnad från PMS reliability där
vi har en fix worker-pool som måste fördelas mellan tenants). Inngest's
egen scheduler är round-robin per concurrency-key.

### 3.3 Batch-size, concurrency, budget

- **Concurrency:** 1 per tenant (Inngest concurrency-key = tenantId)
- **Cross-tenant parallelism:** Inngest plan default (start: 1000 runs)
- **Per-tenant query-batch:** streaming via Postgres cursor på
  `(tenant_id, occurred_at)`. Vid 10k guests/h × 24h × 5 events/session
  ≈ 1.2M events/dag/tenant värsta-fall.
- **Minne-budget enforcerad via chunked-mode:** events_count > 50_000
  ⇒ obligatorisk streaming, chunk_size = 25_000. Aggregator API
  accepterar `AsyncIterable<EventRow>`, inte `EventRow[]` — fold-pattern
  över MetricRow-accumulator (`Map<string, number | Set<string>>`),
  inga del-resultat hålls i Array. Håller minne under 50 MB per worker
  oavsett input-volym.
- **Budget per tenant:** 60 sekunder soft-cap (Inngest step timeout
  default). Vid budget-overrun: `step.run` yieldar via Inngest's
  inbyggda step-throttling (per `drain-analytics-outbox.ts:88-91`-pattern
  med concurrency-key). Per-tenant cursor-persistence är out-of-scope
  för 5A; läggs till i 5C om production-mätning visar
  single-step-budget regelbundet otillräcklig.

### 3.4 Late-arriving events

Outboxen är inte garanterat "drain inom 60 s" — drainern kan ligga efter
om Inngest var nere. Phase 5A:s aggregator MÅSTE re-aggregera ett
fönster för att fånga late events.

**RESOLVED-strategi: 48-timmars sliding window per run.** Varje
15-min-tick aggregerar de senaste 48 timmarna per tenant (today
partial + yesterday full + day-before-yesterday full). Detta ger:

- **Dashboard-freshness inom 15 min** för dagens data (Tier 2 SLO).
- **Late-event-fångst för dygnsbyten:** events som anlände efter
  dygnsbytets re-aggregering fångas av nästa 15-min-tick som
  fortfarande har "yesterday" inom fönstret.
- **24h-buffer för late events bortom dygnsbyten:** day-before-yesterday
  re-aggregeras tills den glider ut ur fönstret.

Idempotent re-aggregation: composite unique upsert per §6.7 gör 96
daily reruns per (tenant, date) säkra och billiga (upsert no-op vid
oförändrat värde — Postgres `ON CONFLICT DO UPDATE` skriver inte ny
WAL-rad om värde är oförändrat på modern Postgres). Phase 5C kan
utöka fönstret till 7 dagar om production-mätning visar längre
late-event-svans.

### 3.5 Crash-safety / cursor / resume

- Inngest's `step.run` är atomic-checkpoint-baserat: en step som
  kraschat retryas, en step som lyckats hoppas över vid retry.
- Aggregatorn delas i steps:
  1. `select-events` — streaming via Postgres cursor över
     (tenantId, occurred_at) range. events_count > 50_000 ⇒
     chunked-mode automatiskt (per §3.3). Aggregator håller endast
     accumulator-state i minnet, inte raw events.
  2. `compute-rows` — pure function, fold över event-iterator till
     accumulator-state (`Map<string, number | Set<string>>`)
  3. `upsert-rows` — batch om 50 (samma som v1 aggregation.ts:213-232),
     idempotent
- Vid crash mellan step 2 och 3: nästa run gör om hela kedjan
  idempotent — pure-function step 2 producerar samma rader, upsert step
  3 ger samma slutläge.
- Ingen separat cursor-tabell behövs i Phase 5A. Lägg till om
  per-tenant-volym växer förbi single-step-budget i Phase 5C.

---

## 4. Storage-design

### 4.1 Samma tabell + version-kolumn vs ny tabell — OPEN

Två alternativ:

**A) Samma `AnalyticsDailyMetric` + ny `pipelineVersion` String-kolumn**
- Pro: en tabell, dashboard byter via `where: { pipelineVersion: "v2" }`-
  filter. Rollback = ändra filter till "v1".
- Con: alla nya rows ärver befintlig composite unique
  `[tenantId, date, metric, dimension, dimensionValue]` — version måste
  in i constraint, vilket är en tabell-recompose. Upserts utan version i
  filter blir tvetydiga. Befintliga (gamla) rows måste backfillas med
  version="v1" eller läsas via `pipelineVersion IS NULL`-skydd.
- Schema-impact: 1 column add + composite unique reshape (drop+create).

**B) Ny `analytics.daily_metric`-tabell i analytics-schemat**
- Pro: ren separation, parity-jämförelse är två rena queries, ingen risk
  för cross-version-läckage. Matcher multi-schema-mönstret som redan är
  etablerat (analytics.event, analytics.outbox, analytics.tenant_config
  per schema:5623, :5648, :5664). Ingen mutation på legacy-tabellen.
- Con: två tabeller måste underhållas under cutover-fönstret (~30 dagar).
  Dashboard-router måste välja källa.
- Schema-impact: nytt CREATE TABLE i `analytics`-schemat, additivt.

**Min RESOLVED-rekommendation under §9.7:** Alt B. Etablerad
multi-schema-pattern är dokumenterad infrastrukturkonvention; det är där
nya analytics-tabeller hör hemma. Parity-jämförelse i Phase 5B blir
enkel — samma form, två källor. Rollback = sluta skriva v2, läs v1.

### 4.2 Föreslagen Prisma-modell (alt B)

```prisma
model AnalyticsDailyMetricV2 {
  id             String   @id @default(cuid())
  tenantId       String   @map("tenant_id")
  date           DateTime
  metric         String                     // string-typed för forward-compat
  dimension      String
  dimensionValue String   @map("dimension_value")
  value          BigInt                     // bigint för cents/öre revenue ≥ 2^31
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@unique([tenantId, date, metric, dimension, dimensionValue])
  @@index([tenantId, date])
  @@index([tenantId, metric, date])
  @@index([tenantId, dimension, date])

  @@map("daily_metric")
  @@schema("analytics")
}
```

Tre val avviker från legacy `AnalyticsDailyMetric` (schema:4036):

1. **`metric` + `dimension` String, ej enum.** Phase 5A vill kunna
   införa nya metrics utan migration (t.ex. `CART_STARTED_COUNT` för
   funnel-arbete i 5C). Enum-tightening kan ske i 5C när uppsättningen
   stabiliserats.
2. **`value` är BigInt.** Legacy har `Int` (schema:4043) — överskrider
   2^31 öre = 21.4M kr daglig revenue per tenant. Vid 10k tenants × Apelviken-
   skala är 21M kr per tenant per dag inom räckhåll under sommarhögsäsong.
   Bigint kostar inget i lagring (8 bytes vs 4) men eliminerar overflow.
3. **`createdAt`/`updatedAt` audit-kolumner.** Legacy saknar dessa.
   Användbart för parity-debugging — när skrevs raden vs när hände
   eventet.

### 4.3 Index-strategi (utöver composite unique)

Tre composite-index matchar de tre dashboard-läs-mönstren:
- `[tenantId, date]` — date-range scan utan metric-filter
- `[tenantId, metric, date]` — single-metric time-series
- `[tenantId, dimension, date]` — single-dimension breakdown

Identiskt med legacy schema:4048-4050 (verifierat). Extra index för Phase 5A:
- `[tenantId, date, metric]` — täcker `getRows(metric, dimension)` i
  `dashboard/route.ts:63-64` så vi inte gör table-scan när legacy v1
  tas bort i 5C.

### 4.4 Schema-migration plan (zero-downtime, Shopify-grade)

Three-phase migration över 30+ dagars cutover-fönster:

- **5A (denna PR):** CREATE TABLE `analytics.daily_metric` + index.
  Inget på `AnalyticsDailyMetric`. Ingen cursor-tabell (per §3.3 yieldar
  Inngest-step:n via inbyggd throttling). Aggregator skriver dual:
  legacy v1 fortsätter via befintlig path, v2 körs parallellt.
- **5B (separat PR):** Parity-validering. Dashboard läser v1
  fortfarande. Inga skema-ändringar.
- **5C (separat PR, ~30 dagar efter 5A):** Dashboard route flippar till
  v2-källa. Legacy v1-aggregator stoppas. Tabellen `AnalyticsDailyMetric`
  drop:as i en senare migration efter en backup-snapshot.

Inga DROP eller NOT-NULL-ändringar i 5A. Allt additivt.

---

## 5. Event → metric mapping-registry

### 5.1 Deklarativ struktur

Föreslagen form (kommer landas i `app/_lib/analytics/aggregation/metric-mapping.ts`):

```ts
type MetricContribution = {
  metric: string;                       // "REVENUE" | "ORDERS" | …
  dimension: string;                    // "TOTAL" | "CHANNEL" | …
  dimensionValueFrom: (event: AnalyticsEventRow) => string;
  valueFrom: (event: AnalyticsEventRow) => number;
  // Optional: aggregeras som count vs sum
  aggregator: "sum" | "count" | "distinct";
  // Optional: distinct-värde-extraktor (för session distinct count)
  distinctKey?: (event: AnalyticsEventRow) => string;
};

type EventMapping = {
  eventName: string;
  schemaVersion: string;
  contributions: MetricContribution[];
};

export const ANALYTICS_METRIC_MAPPINGS: EventMapping[] = [
  // … (se exempel i §5.2)
];
```

**Aggregator-semantik (mekanisk specifikation):**

```
aggregator: "sum"      — value = SUM(valueFrom(e)) över alla events
                         som matchar (metric, dimension, dimensionValue).

aggregator: "count"    — value = COUNT(*) över matchande events.
                         valueFrom ignoreras helt.

aggregator: "distinct" — value = COUNT(DISTINCT distinctKey(e)) över
                         matchande events. valueFrom ignoreras helt;
                         distinctKey är obligatorisk (tsc-error om
                         saknas).
```

**Aggregator-API tar `AsyncIterable<AnalyticsEventRow>`, inte
`AnalyticsEventRow[]`** (per §3.3 minne-budget). Implementationen är ett
fold-pattern: per-event uppdaterar accumulator-state
(`Map<string, number>` för sum/count, `Map<string, Set<string>>` för
distinct), inga del-resultat hålls i Array.

### 5.2 Exempel-rader (Phase 5A scope)

```ts
{
  eventName: "payment_succeeded",
  schemaVersion: "0.1.0",
  contributions: [
    { metric: "REVENUE", dimension: "TOTAL",
      dimensionValueFrom: () => "TOTAL",
      valueFrom: (e) => e.payload.amount.amount,
      aggregator: "sum" },
    { metric: "ORDERS", dimension: "TOTAL",
      dimensionValueFrom: () => "TOTAL",
      valueFrom: () => 1,
      aggregator: "sum" },
    // CHANNEL-bidrag aktiveras endast efter §9.1 RESOLVE
  ],
},
{
  eventName: "booking_completed",
  schemaVersion: "0.1.0",
  contributions: [
    { metric: "REVENUE", dimension: "CHANNEL",
      dimensionValueFrom: (e) => e.payload.source_channel,
      valueFrom: (e) => e.payload.total_amount.amount,
      aggregator: "sum" },
    { metric: "ORDERS", dimension: "CHANNEL",
      dimensionValueFrom: (e) => e.payload.source_channel,
      valueFrom: () => 1,
      aggregator: "sum" },
  ],
},
{
  eventName: "page_viewed",
  schemaVersion: "0.1.0",
  contributions: [
    { metric: "SESSIONS", dimension: "TOTAL",
      dimensionValueFrom: () => "TOTAL",
      // valueFrom ignoreras vid aggregator: "distinct" — distinctKey
      // bestämmer vad som räknas. Behålls här som tsc-friendly stub.
      valueFrom: () => 1,
      aggregator: "distinct",
      distinctKey: (e) => e.payload.session_id },
    // VISITORS-bidrag väntar på §9.6 RESOLVE
    // DEVICE/CITY-bidrag väntar på §9.4/§9.5 RESOLVE
  ],
},
```

### 5.3 Funnel-metrics (cart_started/cart_abandoned/checkout_started) — out of scope för 5A

Storefront-cart-events bär `cart_id` (per `event-catalog.md:668`) och
gör pa-funnel-conversion möjlig:

- `cart_started_count` (count distinct `cart_id`)
- `checkout_started_count` (count distinct `cart_id` med checkout_started)
- `cart_to_checkout_rate` (derived)
- `cart_abandoned_rate` (derived)

Dessa metrics finns inte i dashboard idag och introducerar ny dashboard-
yta. **Spara till uppföljnings-PR** (Phase 5B.x eller 6). Dokumentera i
`§10 Out of scope`.

### 5.4 Schema_version-evolution

Mapping-registry hanterar version-skew genom att deklarera en mapping per
(eventName, schemaVersion). När `cart_started v0.2.0` deprecerar `v0.1.0`:
- Båda mappingen finns kvar i registry under cutover-fönstret
- Drainer fortsätter validera båda (registry redan stöder, se
  `schemas/registry.ts:99-101`)
- Aggregator dispatchar per-event mot rätt mapping baserat på
  `schemaVersion`-fält i analytics.event-raden
- När outboxen är tom på v0.1.0-events och alla v0.1.0-events i
  analytics.event är äldre än read-window: ta bort v0.1.0-mapping

Identiskt mönster med befintlig schema-registry. Inga nya invariants.

---

## 6. Failure modes + invariants

### 6.1 Outbox-rad utan registered metric mapping — RESOLVED

**Failure:** ny event-typ (t.ex. `availability_searched`) finns i
analytics.event men ingen mapping i `ANALYTICS_METRIC_MAPPINGS`.

**Hantering:** ignorera event tyst (det är inte en metric-bidragare).
Strukturerad log-emit `analytics.aggregator.unmapped_event` på
DEBUG-nivå (inte WARN — många events har inget metric-bidrag, det är
designat). Phase 5C kan flagga om unmapped-andelen blir hög för
specifik event-typ.

### 6.2 Schema-version skew — LOCKED av drainern

Drainern validerar mot `(eventName, schemaVersion)` — events i
analytics.event är garanterat schema-konforma. Aggregator behöver
inte revalidera. Per `drain-analytics-outbox.ts:188-201`.

### 6.3 Cross-tenant scope — INVARIANT

Varje query MÅSTE filtrera på `tenant_id`. Aggregator-funktionens
signatur är `aggregate(tenantId, date)`. **Förbjudet att ha cross-tenant
queries någonstans i aggregatorn**, även för debug. Verifier-script
(§8 B.6) greppar efter `analytics.event` queries utan `tenant_id` =
litteral i WHERE.

### 6.4 Sessionsgrupp-correctness — RESOLVED

`page_viewed.session_id` är klient-ULID per tab. v1-`SESSION_STARTED` finns
inte i v2-eventströmmen. Definition: "session" = distinct `session_id`
för dagen. Multi-tab räknas som distinct sessioner — detta matchar
StorefrontContext-kontraktet (`_storefront-context.ts:97-100`) som
explicit säger "each open tab maintains its own session_id".

### 6.5 Stora outbox-volymer — RESOLVED via §3.3

Worst-case platform-volym: 1.2M events/dag/tenant × 10k tenants =
**12B events/dag = ~138K events/sek peak**. Aggregator-throughput-behov:
~140K events/sek aggregat över alla 1000 parallel runs (Inngest default
plan-cap) = ~140 events/sek/run. Per-run-budget är väl inom Inngest
step-throughput.

Vid 15-min-frekvens (§3.4) körs aggregatorn 96 gånger per dag per
tenant. Total events-volym sprids över 96 körningar × 10k tenants =
960k körningar/dag globalt. Per körning återstår ~12.5k events i
genomsnitt över hela flottan (peak-tenants högre, long-tail lägre).
Aggregator-arkitekturen är inte bottleneck; Inngest plan-cap (1000
parallel runs default) är.

Per-tenant chunking (25 000 events/chunk via streaming, §3.3) håller
minne under 50 MB oavsett input-volym.

### 6.6 Disk-tillväxt på `analytics.daily_metric` — uppskattning

Per (tenant, dag): 6 metrics × dimensions:
- TOTAL: 6 rader (REVENUE/ORDERS/AOV/RETURNING/SESSIONS/VISITORS)
- CHANNEL: ~5 rader (REVENUE+ORDERS × ~3 distinct channels: direct,
  booking_com, expedia, app-handle)
- CITY: ~50 rader (SESSIONS × top-50 städer/dag/tenant)
- DEVICE: 3 rader (SESSIONS × DESKTOP/MOBILE/TABLET)
- PRODUCT: ~20 rader (REVENUE × top-20 produkter; värsta-fall
  obegränsat — 100 vid stort sortiment)

Konservativ uppskattning per tenant per dag: **~75-150 rader**.

10k tenants × 365 dagar × 100 rader = **365 miljoner rader/år**
gemensamt. Vid Postgres ~150 bytes/rad inkl index: ~55 GB/år.

**Worst-case-not för PRODUCT:** En tenant med stort sortiment (t.ex.
spa-resort med 10k aktiva SKU:er) kan ge 10k+ PRODUCT-rader/dag. Vid
10k tenants där 1% är stora = 100 stora tenants × 10k rader × 365 dagar
= **365M extra-rader/år bara på PRODUCT-dimensionen**. Disk-uppskattningen
ovan (~55 GB/år) förutsätter genomsnittstenanten. Om mer än 5% av
flottan är stora ⇒ RANGE-partitioning på date krävs i 5C tidigare än
annars. Övervaka via 5C-readiness-check: "top-tenant PRODUCT-rad-count
per dag".

**Hanterbart utan partitioning första 2 åren.** Phase 5C eller senare
introducerar RANGE-partitioning på date (matchar pattern på
`analytics.event` per `prisma/schema.prisma:5618-5623`). Inte i scope för 5A.

### 6.7 Idempotens — INVARIANT

Aggregator för (tenantId, date) MÅSTE kunna köras N gånger utan
dubbletter eller felaktiga värden. Kontrakt:
- Composite unique `[tenantId, date, metric, dimension, dimensionValue]`
  (§4.2) gör upsert säker.
- Pure-function compute step (§3.5 step 2) producerar deterministiskt
  samma rader för samma input.
- Late events som droppat in mellan körning N och N+1 fångas av
  re-aggregeringen — N+1 producerar uppdaterade värden, upsert
  applicerar dem.

Verifier-script (§8 B.6) kör aggregator två gånger mot samma
(tenantId, date) i en seedad test-DB och asserterar identisk output.

### 6.8 Singleton clients — INVARIANT

Per `admin/CLAUDE.md` "Enterprise infrastructure":
- Ingen ny `new PrismaClient()` — alltid `prisma` från
  `app/_lib/db/prisma.ts`. För analytics-schema-queries: använd den
  befintliga `_unguardedAnalyticsPipelineClient` per
  `drain-analytics-outbox.ts:33-35`.
- Ingen ny `new Redis()` om delad state behövs — använd `redis` från
  `app/_lib/redis/client.ts`.

### 6.9 Strukturerad loggning — INVARIANT

Aggregator-state-transitions loggas via `log()` från
`app/_lib/logger.ts`. Förbjudet `console.*`. Specifika events:
- `analytics.aggregator.run_start` (info)
- `analytics.aggregator.run_complete` (info; rowsWritten, totalEvents,
  durationMs)
- `analytics.aggregator.run_failed` (error; tenantId, date, error)
- `analytics.aggregator.unmapped_event` (info)

---

## 7. Parity-strategi (förberedelse för Phase 5B)

### 7.1 Diff-script-design

Föreslaget npm-script `analytics:parity-diff` som körs som on-demand
verifier (manuellt eller från admin UI). Output: JSON-rapport.

Algoritm:
```
1. SELECT alla rader från AnalyticsDailyMetric WHERE tenant_id=X AND date BETWEEN A..B
2. SELECT alla rader från analytics.daily_metric WHERE tenant_id=X AND date BETWEEN A..B
3. Outer-join på (date, metric, dimension, dimensionValue):
   - V1-only: ny eller försvunnen i v2
   - V2-only: nytt i v2 som inte fanns i v1
   - Both: jämför value
4. För each "both": delta = v2.value - v1.value
   - om |delta / v1.value| < tolerance → OK
   - annars → FLAG
5. Rapport: count per (metric, dimension) i kategorierna OK/FLAG/V1-only/V2-only
```

### 7.2 Tolerance-modell per (metric, dimension)

Olika tolerance per typ:

| Metric × Dimension | Tolerance | Motivering |
|---|---|---|
| REVENUE × * | 0.0% (exakt) | Pengar — varje öre måste matcha |
| ORDERS × * | 0.0% (exakt) | Disktinkt count — exakt deterministisk |
| AOV × TOTAL | 0.5% | Avrundning skiljer (v1 round, v2 round; cents-vs-bigint tröskel) |
| RETURNING_CUSTOMER_RATE | 1.5% | Avrundning + dataset-storlekseffekt: en enskild guest-account-classification på liten dataset (low-volume tenant) kan ge >0.5% drift utan att vara fel |
| SESSIONS × TOTAL | **5%** | Semantik-skifte (§2.8) — multi-tab counts skiljer |
| SESSIONS × DEVICE | **10%** | Heuristik vs UA-parse divergerar (§2.9) |
| SESSIONS × CITY | **10%** | Geo-källa kan skilja (MaxMind-version-skew) (§2.10) |
| VISITORS × TOTAL | **20%** | Definitions-skifte (§2.11) — UA-hash vs visitor-cookie |

Tolerances är förslag. **OPEN Q-decision §9.8** för Leos final-call innan
Phase 5B startar.

### 7.3 Rapport-format

```json
{
  "tenantId": "tnt_…",
  "dateRange": { "from": "2026-05-01", "to": "2026-05-31" },
  "rows": {
    "REVENUE_TOTAL_TOTAL": { "v1": 12345600, "v2": 12345600, "delta_pct": 0, "status": "OK" },
    "SESSIONS_DEVICE_MOBILE": { "v1": 423, "v2": 451, "delta_pct": 6.6, "status": "FLAG" }
  },
  "summary": {
    "OK": 1840, "FLAG": 12, "V1_ONLY": 3, "V2_ONLY": 0
  }
}
```

### 7.4 Var rapporten lagras

Phase 5A: ingen lagring. Scriptet skriver rapporten till stdout +
strukturerad log-emit (`analytics.parity.report_generated`).

Phase 5B: admin UI under `/admin/analytics/parity` med detalj-rendering.
Inte i 5A scope.

---

## 8. Sub-step-plan (B.1 → B.7)

Varje sub-step är en logisk commit på `feature/analytics-phase5a-aggregator`.

### B.1 — Migration: `analytics.daily_metric`

**Filer:** `prisma/migrations/<timestamp>_analytics_phase5a_aggregator/migration.sql`,
`prisma/schema.prisma`

**LOC-diff:** schema.prisma +28; migration.sql +35.

**Innehåll:**
- CREATE TABLE `analytics.daily_metric` med composite unique + 4 index

(Ingen cursor-tabell i 5A — per §3.3 yieldar Inngest-step:n via inbyggd
throttling. AnalyticsAggregationCursor är 5C-territory om
production-mätning kräver det.)

**Beroenden:** ingen.

**Checkpoints:** `npx prisma migrate dev --create-only`, redigera, apply.
`npx prisma migrate status` ⇒ "up to date". `npx tsc --noEmit` ⇒ 3
(oförändrat).

### B.2 — Mapping-registry skeleton

**Filer:** `app/_lib/analytics/aggregation/metric-mapping.ts`,
`app/_lib/analytics/aggregation/metric-mapping.test.ts`

**LOC-diff:** mapping.ts +180; test +120.

**Innehåll:**
- Typer (`MetricContribution`, `EventMapping`)
- `ANALYTICS_METRIC_MAPPINGS` array — Phase 5A-scope (REVENUE/ORDERS/AOV/
  RETURNING/SESSIONS×TOTAL)
- Tester: per mapping verifiera dimensionValue + value-extraktion

**Beroenden:** ingen.

**Checkpoints:** `npm test app/_lib/analytics/aggregation/` ⇒ alla pass.
tsc 3.

### B.3 — Aggregator core (pure compute, no DB write)

**Filer:** `app/_lib/analytics/aggregation/aggregate-day.ts`,
`app/_lib/analytics/aggregation/aggregate-day.test.ts`

**LOC-diff:** aggregate-day.ts +250; test +260.

**Innehåll:**
- `aggregateEvents(events: AsyncIterable<AnalyticsEvent>, tenantId, date): Promise<MetricRow[]>`
- Pure funktion, ingen DB-touch
- Fold-pattern över event-iterator: per-event uppdaterar
  accumulator-state (`Map<string, number>` för sum/count,
  `Map<string, Set<string>>` för distinct), inga del-resultat hålls i
  Array (per §3.3 minne-budget)
- Hanterar sum/count/distinct enligt mapping-aggregator-fält (per §5.1
  semantik-spec)
- Tester med fixture-events (page_viewed, payment_succeeded,
  booking_completed) — assert MetricRow-output. Använder async-generator
  som test-input för att exercisera AsyncIterable-API:et.

**Beroenden:** B.2.

**Checkpoints:** `npm test app/_lib/analytics/aggregation/` ⇒ alla pass.
tsc 3.

### B.4 — Aggregator DB I/O (read events + upsert rows)

**Filer:** `app/_lib/analytics/aggregation/aggregate-day-runner.ts`,
`app/_lib/analytics/aggregation/aggregate-day-runner.test.ts`

**LOC-diff:** runner.ts +110; test +150.

**Innehåll:**
- `runAggregateDay(tenantId, date): AggregationResult`
- SELECT analytics.event WHERE tenant_id+occurred_at-range som
  Postgres-cursor (streaming) — wrappad till AsyncIterable och skickad
  till `aggregateEvents` (B.3)
- Batched upsert till `analytics.daily_metric` (50/batch, samma som v1
  aggregation.ts:213-232)
- Strukturerad log på run_start/run_complete/run_failed
- **Idempotens-test i runner.test.ts:** kör `runAggregateDay` 2x mot
  samma seedade test-DB-state, assert identisk slut-DB-state via
  `SELECT *`-snapshot-jämförelse. Test-namn-strängen "idempotency"
  används som markör så B.6:s verifier kan hitta den statiskt.

**Beroenden:** B.1, B.3.

**Checkpoints:** `npm test` ⇒ pass. tsc 3.

### B.5 — Inngest function wiring

**Filer:** `inngest/functions/scan-analytics-aggregate.ts`,
`inngest/functions/run-analytics-aggregate-day.ts`,
`inngest/index.ts` (registrera nya funktioner)

**LOC-diff:** scan +90; run +60; index +4.

**Innehåll:**
- `scan-analytics-aggregate` — cron `*/15 * * * *`, dispatchar fanout
  per tenant (per §3.1)
- `run-analytics-aggregate-day` — concurrency.key=tenant_id, anropar
  `runAggregateDay` för 48h-fönstret (per §3.4)
- Sentry-wrap via `withSentry` (matcher drainer-pattern)

**Beroenden:** B.4.

**Checkpoints:** `npx tsc --noEmit` ⇒ 3. Inngest dev-runner startar utan
errors (`npm run dev` + manuell trigger via Inngest dev-UI).

### B.6 — Verifier-script (Phase 5A)

**Filer:** `scripts/verify-phase5a-aggregator.ts`,
`package.json` (lägg till `verify:phase5a`)

**LOC-diff:** verifier +280; package.json +1.

**Innehåll (per pattern verify-phase3.ts):**
- 11 statiska checks:
  1. Migration `analytics_phase5a_aggregator` finns på disk
  2. CREATE TABLE `analytics.daily_metric` i migration.sql
  3. Composite unique på rätt kolumner
  4. `metric-mapping.ts` exporterar `ANALYTICS_METRIC_MAPPINGS`
  5. `aggregate-day.ts` exporterar `aggregateEvents`
  6. `runAggregateDay` finns OCH `runner.test.ts` innehåller strängen
     "idempotency" (markör för det idempotens-test som landar i B.4)
  7. Inngest scan-function registrerad i `inngest/index.ts`
  8. Inngest run-function har concurrency.key=tenant_id
  9. Aggregator använder `_unguardedAnalyticsPipelineClient` (singleton)
  10. Cross-tenant scope-skydd: ingen `analytics.event`-query utan
      `tenant_id =` literal i WHERE
  11. tsc clean för Phase 5A-filer

(Idempotens-runtime-testet är en integration-test i B.4:s
`runner.test.ts`, inte en static check här. Verifier-skriptet greppar
bara efter dess existens-markör i check #6.)

**Beroenden:** B.5.

**Checkpoints:** `npm run verify:phase5a` ⇒ 11/11.

### B.7 — Cron registration + docs

**Filer:** `vercel.json` (lägg till cron), `docs/analytics/aggregator.md`
(ny runbook), `package.json` (lägg till `analytics:parity-diff` skeleton)

**LOC-diff:** vercel.json +3; aggregator.md +160; package.json +1; parity-
diff stub +40.

**Innehåll:**
- vercel.json cron (om Vercel-cron används vid sidan av Inngest — annars
  hoppa över)
- Runbook docs/analytics/aggregator.md (matcher loader-hardening.md-pattern):
  arkitektur, körnings-procedurer, parity-diff-användning, FAQ
- `analytics:parity-diff` script-stub (full implementation i Phase 5B)

**Beroenden:** B.6.

**Checkpoints:** `npm run verify:phase5a` ⇒ 11/11. tsc 3.

### B.8 — Push + PR-beskrivning

Inte en commit — git-push + GitHub PR-text.

### Sub-step-summa

| Step | LOC-diff (rough total) | Beroenden |
|---|---|---|
| B.1 | +63 | — |
| B.2 | +300 | — |
| B.3 | +510 | B.2 |
| B.4 | +260 | B.1, B.3 |
| B.5 | +154 | B.4 |
| B.6 | +281 | B.5 |
| B.7 | +204 | B.6 |
| **Total** | **~1772 LOC** | linjär |

Varje step är en standalone-reviewable commit; testbar isolerat
(undantag B.5 som kräver Inngest dev-runner).

---

## 9. Q-decisions

Klassificering: **LOCKED** (svar finns i kod/doc, citerad), **RESOLVED**
(undersökt under recon, motiverat svar) eller **OPEN** (kräver Leo's
input — ingen default).

### 9.1 (OPEN) Source_channel-coverage för PURCHASE-orders

**Frågan:** PURCHASE-orders saknar source_channel i `payment_succeeded`-payload.
Hur fångar vi dem i REVENUE × CHANNEL och ORDERS × CHANNEL?

**Tre alternativ:**
- (a) Phase 5A startar med "direct" som hardkod fallback för PURCHASE.
  Justera i 5A.x via v0.2.0-bump på `payment_succeeded` med optional
  `source_channel`.
- (b) Skicka v0.2.0-bump i 5A direkt — bättre slutgiltig data, men
  blockerar alla PURCHASE-emit-sites under en migration-window.
- (c) Acceptera dimension-förlust för PURCHASE i 5A; 5C tar tillbaka.

Behov av Leo's call: vad är PURCHASE-volym idag (relativt ACCOMMODATION),
och vill du tolerera ett fönster med "direct"-fallback för PURCHASE-orders
under v0.2.0-rollout?

**Ingen default** — frågar Leo.

### 9.2 (OPEN) Per-product revenue-coverage

**Frågan:** REVENUE × PRODUCT är GAP. Tre alternativ:

- (a) v0.2.0-bump på `payment_succeeded` med `line_items: [{ product_id,
  amount }]`. Tight koppling till order-sidan.
- (b) Nytt event `order_line_completed` per LineItem. Större schema-yta
  men ren separation.
- (c) Spara dimension; läs från `Order.lineItems` direkt i aggregatorn
  (Tier 1-isolation: aggregator vidrör operational tables).

(c) bryter mot pipeline-gränsen — operational vs analytics. Det är
det legacy v1 gör (aggregation.ts:113-118 läser `OrderLineItem.productId`).
(a)/(b) håller pipelinen ren men kräver event-schema-arbete före 5A:s
B.3 startar.

**Ingen default** — frågar Leo.

### 9.3 (RESOLVED) Sessions-definition: tab-skoped vs cross-tab

**Frågan:** v1-session = klient-cookie-stabil id; v2-session = ULID per
tab som roterar.

**Svar:** Använd v2-definitionen (tab-scoped + idle/consent-rotation).
Detta är vad `_storefront-context.ts:97-100` explicit specificerar som
"matches industry norm — each tab is its own tracking-session".
Cross-tab-stitching är möjlig via `user_agent_hash` för Phase 5C-aggregeringar
som kräver det. Phase 5A:s SESSIONS-räkning matchar v2-definitionen. Phase
5B:s parity-tolerance är 5% per §7.2.

### 9.4 (OPEN) Device-type-derivation

**Frågan:** SESSIONS × DEVICE är GAP. Tre alternativ per §2.9 — alt (1)
viewport-heuristik är där markerat som **Avrådes** (ostabil input,
permanent dålig data). Frågan är därmed mellan (2) och (3):

- (2) v0.2.0 StorefrontContext + worker UA-parse — korrekt data, kostar
  ~150 LOC i workern under tree-shake-budget.
- (3) Acceptera dimension-förlust i 5A; lös i 5C — billigaste vägen,
  ingen ny LOC, men dashboarden saknar device-fördelning under
  cutover-fönstret.

Mellan (2) och (3) är frågan en business-prioritering: behöver
5A-dashboarden device-fördelning från start, eller acceptabelt att
den dyker upp i 5C?

**Ingen default** — frågar Leo.

### 9.5 (OPEN) Geo-lookup för SESSIONS × CITY

**Frågan:** MaxMind är vendored. Ska `/api/analytics/collect` köra
geo-lookup och berika event.context med `{country, city}`?

**Trade-offs:**
- Pro: dimension återgår, SLA-impact noll (lookup ~2 ms in-memory).
- Con: PII-attityd. IP-adress når aldrig analytics-pipelinen idag —
  introducerar ett nytt PII-handlingsmoment vid collect-endpoint.
- Privacy-lag-koll: city-level är aggregerat tillräckligt för att inte
  räknas som PII under GDPR (rekital 26), men vi vill explicit
  user-consent-check (consent.analytics === true) före lookup.

**Ingen default** — frågar Leo, eftersom PII-vägbeslut kräver opt-in.

### 9.6 (OPEN) Visitors-definition

**Frågan:** v1-visitor = klient-cookie. v2-visitor = ?

**Två alternativ:**
- (a) Distinct `user_agent_hash` per dag — definitions-skifte. Salt-rotation
  bryter (bug-feature ut och in).
- (b) Lägg till `visitor_id` som ny StorefrontContext v0.2.0-fält
  (browser-localStorage ULID, längre livstid än session_id) — kostar
  schema-bump + worker-LOC.

**Ingen default** — frågar Leo. (a) kräver inga schema-ändringar men
gör salt-rotation till en visitor-räknings-cliff; (b) kostar
v0.2.0-context-bump + worker-LOC men ger en stabil long-lived ID som
salt-rotation inte påverkar.

### 9.7 (RESOLVED) Ny tabell vs version-kolumn

**Frågan:** §4.1.

**Svar:** Ny tabell `analytics.daily_metric` i analytics-schemat. Etablerad
multi-schema-pattern (analytics.event/outbox/tenant_config). Parity-
jämförelse blir två rena queries. Rollback = sluta skriva v2.

### 9.8 (OPEN) Parity-tolerances per (metric, dimension)

**Frågan:** §7.2-tabellens tolerances är förslag. Behöver Leos sign-off
innan Phase 5B startar.

**Ingen default** — Leo bekräftar tabellen eller justerar.

### 9.9 (LOCKED) Aggregator pattern

Inngest function (matcher drainer/scanner-pattern). `drain-analytics-outbox.ts:84-93`
är källan för concurrency-modellen. Phase 1B redan låst denna stack.

### 9.10 (LOCKED) Idempotens via composite unique upsert

Composite `[tenantId, date, metric, dimension, dimensionValue]` matcher
v1 (schema.prisma:4047) och Phase 1A:s outbox-pattern. Lockad.

### 9.11 (LOCKED) Ingen direkt skrivning till `analytics.event` från aggregator

Aggregator är read-only mot `analytics.event`. Skrivvägen är drainer
(`drain-analytics-outbox.ts:84` ensam writer). Lockad invariant.

### 9.12 (RESOLVED) Late-event window

Aggregator re-aggregerar yesterday + today varje natt. 2-dagars window
räcker för Phase 5A. Phase 5C kan utöka till 7 dagar om
production-mätning visar late-event-svans bortom 24h.

### Q-summa

| ID | Klass | Sammanfattning |
|---|---|---|
| 9.1 | **OPEN** | Source_channel för PURCHASE |
| 9.2 | **OPEN** | Per-product revenue-coverage |
| 9.3 | RESOLVED | Sessions = tab-scoped (industry norm) |
| 9.4 | **OPEN** | Device-type-derivation |
| 9.5 | **OPEN** | Geo-lookup vid collect |
| 9.6 | **OPEN** | Visitors-definition |
| 9.7 | RESOLVED | Ny tabell `analytics.daily_metric` |
| 9.8 | **OPEN** | Parity-tolerances |
| 9.9 | LOCKED | Inngest-pattern |
| 9.10 | LOCKED | Composite unique upsert |
| 9.11 | LOCKED | Aggregator read-only mot `analytics.event` |
| 9.12 | RESOLVED | 2-dagars late-window |

**5 OPEN. Implementation kan inte starta innan §9.1, §9.2, §9.4, §9.5,
§9.6, §9.8 har RESOLVED-besked från Leo.** Inget av OPEN-besluten har en
tyst default — alla 5 blockerar implementation. §9.8 (parity-tolerances)
blockerar specifikt Phase 5B-start men inte 5A:s implementation, och kan
RESOLVED:as senare.

---

## 10. Inte i denna fas (scope-cap)

Explicit sparade till senare PR:s — får INTE rinna in i Phase 5A:

- **Phase 5B** — parity-validering, dashboard-cutover (route-flip från
  AnalyticsDailyMetric till analytics.daily_metric), AnalyticsProvider-
  rensning. Egen PR ~30 dagar efter 5A.
- **Phase 5C** — drop legacy `AnalyticsDailyMetric`-tabell + drop legacy
  `AnalyticsEvent` + drop `AnalyticsLocation`. Egen migration-PR. Endast
  efter 30+ dagars stabil parity.
- **Phase 4 CDC events** — `accommodation_published`/`archived`/
  `price_changed` är registered men emit deferred till Postgres CDC.
  Inte 5A:s problem.
- **Funnel-metrics** — cart_started/cart_abandoned/checkout_started-
  conversion. Out-of-scope per §5.3. Kan vara 5B.x eller 6.
- **purchase_initiated/completed/abandoned-event-familj** för gift-cards
  + non-cart-purchase (per `event-catalog.md:754-769`). Out-of-scope.
- **Visitor-cookie / visitor_id-context-fält** ifall §9.6 svarar (b).
  Egen PR i den raden, inte 5A.
- **Geo-lookup vid collect-endpoint** ifall §9.5 svarar yes — egen PR
  med PII-bedömning + consent-gate.
- **Source_channel v0.2.0-bump** för payment_succeeded ifall §9.1 svarar (b).
  Eget event-schema-PR + emit-site-uppdateringar; landar **innan** 5A:s
  aggregator-implementation börjar (annars stoppar 5A på CHANNEL-gap).
- **payment_succeeded.line_items v0.2.0-bump** ifall §9.2 svarar (a)
  eller (b). Samma timing som 9.1 — innan 5A.
- **AnalyticsAggregationCursor-tabell** — explicit 5C-territory.
  Per §3.3 yieldar 5A-aggregatorn via Inngest's inbyggda step-throttling
  i stället för persistent cursor. Cursor-tabellen läggs till i 5C
  endast om production-mätning visar att 60 s single-step-budget
  regelbundet är otillräcklig per tenant.
- **7-dagars late-event-window.** 5A kör 48 h sliding window per §3.4.
  Phase 5C kan utöka till 7 dagar om production-mätning visar
  late-event-svans bortom 48 h.
- **RANGE-partitioning på `analytics.daily_metric`.** Behövs vid > 1B
  rader (≈ flera år vid 10k tenants — eller tidigare om PRODUCT-dimension
  blir tung per §6.6 worst-case-not). 5C-territory.
- **Storage-snapshot/backup för cutover.** Phase 5C hanterar (matcher
  `docs/runbooks/pms-reliability-dr.md`-pattern).

---

## 11. Implementation readiness check

Innan Phase 5A:s implementation-PR startar:

- [ ] Leo besvarar §9.1, 9.2, 9.4, 9.5, 9.6 (alla blockerar 5A-start)
- [ ] Leo besvarar §9.8 (blockerar 5B-start, ej 5A)
- [ ] Source_channel + line_items v0.2.0-bumpar landar separata PR:s om
      §9.1/§9.2 kräver det — innan 5A:s B.3 startar
- [ ] Geo-lookup-PR landar separat om §9.5 = yes — innan 5A:s B.4
      startar
- [ ] Branch fortsätter på `feature/analytics-phase5a-aggregator`
- [ ] Implementation följer §8 sub-step-plan exakt; varje step en commit
- [ ] Verifier `verify:phase5a` 11/11 grön innan PR review

---

## Citerade aggregation.ts-rader (sample-check)

Verifierat existens (krav från recon-spec):

- Rad 50–51 — `financialStatus: "PAID"` + `paidAt` filter ✓
- Rad 122–127 — sessionEvents-query med `eventType: { in: ["SESSION_STARTED",
  "PAGE_VIEWED"] }` ✓
- Rad 138 — `visitorId !== "server"`-filter för visitor-distinct ✓
- Rad 213–232 — batch-upsert om 50 med composite unique-key ✓

---

## Citerade dashboard/route.ts-rader (sample-check)

- Rad 53–59 — single-source-läs från `AnalyticsDailyMetric` ✓
- Rad 79–88 — REVENUE × CHANNEL aggregering ✓
- Rad 117–129 — weighted AOV-derivation per dag ✓

---

**Quality gate (självsignerad):** Skulle Shopify Platform-team merge:a
denna recon? Ja — 5 OPEN Q-decisions är explicit blockers, var och en
flaggad som "ingen default" per spec; sub-step-plan är konkret med
LOC-estimat per step; alla invariants från CLAUDE.md är spegelad i §6;
gap-analysen citerar specifika kod-rader och differentierar COVERED/
HYBRID/GAP utan tvetydighet. Implementation kan starta blint efter Leo
svarar på §9.1, 9.4, 9.5, 9.6.
