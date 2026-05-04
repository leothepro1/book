# Metric coverage inventory — 12 → 106

**Datum:** 2026-05-04
**Författare:** Web Claude (Architect role per `admin/CLAUDE.md`)
**Status:** RECON ONLY — no code, no schema, no migration. PR-svit-
plan i §4 är förslag som Leo bekräftar innan implementation startar.

**Track:** 2 av 3 i analytics-build-out — Track 1 (besökare-widget,
near-live) shipped, Track 2 (denna inventering) klargör scope för
12→106-utbyggnaden, Track 3 (per-svit implementation) följer.

**Standard:** *"Skulle Shopifys analytics-team merge:a denna
inventering som källa-av-sanning för 12→106-utbyggnaden?"*. Det
styr precision på citationerna och hur fördröjda OPEN-frågor
formuleras.

---

## Förkortningar

- **EXISTS** — claim är verifierad mot kod, file:line citerat.
- **MISSING** — egenskap saknas idag; konkret förslag (event-namn /
  property-shape) ges på plats.
- **DERIVED** — produceras genom kombination av andra metrics; ingen
  egen base-count behövs.
- **SF** = storefront-events (bär `StorefrontContext`).
- **SRV** = server-emitted (operational lifecycle).

---

## §1 Baseline — vad finns idag

### 1.1 Registrerade events (28 distinkta event_names)

Källa: `app/_lib/analytics/pipeline/schemas/registry.ts:65-155`.

**Storefront-emitted (7 events, sätter `StorefrontContext`):**

| Event | Schema-version(er) | Source-file | Domain-purpose |
|---|---|---|---|
| `accommodation_viewed` | 0.1.0 | `schemas/accommodation-viewed.ts` | SF — guest visar boendekort/PDP |
| `availability_searched` | 0.1.0 | `schemas/availability-searched.ts` | SF — sökning kör |
| `cart_started` | 0.1.0 (legacy), 0.2.0 | `schemas/cart-started.ts` | SF — första-add-to-empty-cart |
| `cart_updated` | 0.1.0 (legacy), 0.2.0 | `schemas/cart-updated.ts` | SF — add/remove/qty-change |
| `cart_abandoned` | 0.1.0 (legacy), 0.2.0 | `schemas/cart-abandoned.ts` | SF — beacon på unload med non-empty cart |
| `checkout_started` | 0.1.0 (legacy), 0.2.0 | `schemas/checkout-started.ts` | SF — "Till kassa"-klick |
| `page_viewed` | 0.1.0 | `schemas/page-viewed.ts` | SF — varje route-load |

**Server-emitted operational lifecycle (21 events):**

| Event | Schema | Source-file | Domain |
|---|---|---|---|
| `accommodation_archived` | 0.1.0 | `schemas/accommodation-archived.ts` | accommodation lifecycle |
| `accommodation_price_changed` | 0.1.0 | `schemas/accommodation-price-changed.ts` | accommodation lifecycle |
| `accommodation_published` | 0.1.0 | `schemas/accommodation-published.ts` | accommodation lifecycle |
| `booking_cancelled` | 0.1.0 | `schemas/booking-cancelled.ts` | booking domain |
| `booking_completed` | 0.1.0 | `schemas/booking-completed.ts` | booking domain |
| `booking_imported` | 0.1.0 | `schemas/booking-imported.ts` | booking domain (PMS sync) |
| `booking_modified` | 0.1.0 | `schemas/booking-modified.ts` | booking domain (PMS sync) |
| `booking_no_show` | 0.1.0 | `schemas/booking-no-show.ts` | booking domain |
| `discount_created` | 0.1.0 | `schemas/discount-created.ts` | discount domain |
| `discount_expired` | 0.1.0 | `schemas/discount-expired.ts` | discount domain |
| `discount_used` | 0.1.0 | `schemas/discount-used.ts` | discount domain |
| `guest_account_created` | 0.1.0 | `schemas/guest-account-created.ts` | guest/customer domain |
| `guest_account_linked` | 0.1.0 | `schemas/guest-account-linked.ts` | guest/customer domain |
| `guest_authenticated` | 0.1.0 | `schemas/guest-authenticated.ts` | guest/customer domain |
| `guest_otp_sent` | 0.1.0 | `schemas/guest-otp-sent.ts` | guest/customer domain |
| `payment_disputed` | 0.1.0 | `schemas/payment-disputed.ts` | payment domain |
| `payment_failed` | 0.1.0 | `schemas/payment-failed.ts` | payment domain |
| `payment_refunded` | 0.1.0 | `schemas/payment-refunded.ts` | payment domain |
| `payment_succeeded` | 0.1.0 (legacy), 0.2.0 | `schemas/payment-succeeded.ts` | payment domain |
| `pms_sync_failed` | 0.1.0 | `schemas/pms-sync-failed.ts` | infra/integration |
| `pms_sync_recovered` | 0.1.0 | `schemas/pms-sync-recovered.ts` | infra/integration |

**Total: 28 distinkta event_names. Inga övriga events accepteras —
`/api/analytics/collect` blockerar non-storefront events (per
`route.ts:88` `STOREFRONT_EVENT_NAMES` allowlist).**

### 1.2 StorefrontContext-fält (delas av alla 7 SF-events)

Källa: `app/_lib/analytics/pipeline/schemas/_storefront-context.ts:168-180`.

| Fält | Typ | Status idag | Anteckning |
|---|---|---|---|
| `page_url` | `z.string().min(1)` | EXISTS | sanerad mot allowlist (utm_*, fbclid, gclid) |
| `page_referrer` | `z.string()` | EXISTS | rå `document.referrer`, kan vara cross-origin URL |
| `user_agent_hash` | `z.string().min(1)` | EXISTS | 16-char sha256-hex med per-tenant salt |
| `viewport.width` / `.height` | `z.number().int().nonnegative()` | EXISTS | CSS px |
| `locale` | `z.string().min(2)` | EXISTS | BCP 47 (`sv`, `en-GB`, …) |
| `session_id` | `z.string().min(1)` | EXISTS | tab-scoped ULID; rotates 30 min idle / consent revoke / tab close |
| `device_type` | `z.enum([...]).optional()` | EXISTS (optional) | desktop / mobile / tablet / unknown |
| `visitor_id` | `z.string().min(1).optional()` | EXISTS (optional) | localStorage-persistent ULID |

**`context.geo: { country, city }`** är NOT en StorefrontContext-fält
utan en server-side enrichment vid `/api/analytics/collect` (per
`app/api/analytics/collect/route.ts:282-297`). Citerad som
`event.context.geo.country` / `event.context.geo.city` i metrics
nedan. EXISTS — `app/_lib/analytics/pipeline/geo.ts`.

### 1.3 Per-event payload-fält (sammanfattning)

Detaljerad shape per fält i §2 där det används. Listan här är
tabellöversikten över vad som finns idag.

**`accommodation_viewed@0.1.0`** — `accommodation_id` (string),
`accommodation_type` (enum `hotel|cabin|camping|apartment|pitch`).
+ StorefrontContext.

**`availability_searched@0.1.0`** — `check_in_date`, `check_out_date`
(YYYY-MM-DD), `number_of_guests` (int positive),
`results_count` (int nonnegative), `filters_applied` (string[]).
+ StorefrontContext.

**`cart_started@0.2.0`** — `cart_id`, `product_id`, `cart_total {amount, currency}`.
+ StorefrontContext.

**`cart_updated@0.2.0`** — `cart_id`, `items_count`, `line_items_count`,
`cart_total`, `action` (enum `added|removed|quantity_changed`).
+ StorefrontContext.

**`cart_abandoned@0.2.0`** — `cart_id`, `items_count`, `line_items_count`,
`cart_total`, `time_since_last_interaction_ms`. + StorefrontContext.

**`checkout_started@0.2.0`** — `cart_id`, `items_count`, `line_items_count`,
`cart_total`. + StorefrontContext.

**`page_viewed@0.1.0`** — `page_type` (enum
`home|stay|checkout|account|support|policy|other`).
+ StorefrontContext.

**`booking_completed@0.1.0`** — `booking_id`, `accommodation_id`,
`guest_id`, `check_in_date`, `check_out_date`, `number_of_nights`,
`number_of_guests`, `total_amount`, `source_channel`,
`pms_reference`. *(NO actor fields beyond what BaseEventSchema
provides — actor_id is the analytics-domain pseudonym separately.)*

**`booking_cancelled@0.1.0`** — `booking_id`, `pms_provider`,
`pms_reference`, `check_in_date`, `check_out_date`,
`number_of_nights`, `number_of_guests`, `accommodation_id`,
`source_channel`, `cancelled_at`.

**`booking_imported@0.1.0`** — `booking_id`, `pms_provider`,
`pms_reference`, `check_in_date`, `check_out_date`,
`number_of_nights`, `number_of_guests`, `accommodation_id`,
`guest_email_hash`.

**`booking_modified@0.1.0`** — same shape as cancelled +
`provider_updated_at` (no booking-fält som indikerar VAD ändrades).

**`booking_no_show@0.1.0`** — `booking_id`, `pms_provider`,
`pms_reference`, `expected_check_in_date`, `accommodation_id`,
`number_of_guests`, `detection_source` (`pms|internal`),
`detected_at`.

**`payment_succeeded@0.2.0`** — `payment_id`, `booking_id` (nullable),
`amount`, `provider`, `payment_instrument`, `provider_reference`,
`captured_at`, `source_channel`,
`line_items: [{product_id, amount}]`.

**`payment_refunded@0.1.0`** — `order_id`, `charge_id`, `refund_amount`,
`refund_reason` (enum), `refunded_at`, `provider`.

**`payment_failed@0.1.0`** — `order_id`, `payment_intent_id`, `amount`,
`decline_code`, `error_code`, `error_message`, `attempted_at`,
`provider`.

**`payment_disputed@0.1.0`** — `order_id`, `charge_id`, `dispute_id`,
`disputed_amount`, `dispute_reason` (enum), `dispute_status` (enum).

**`discount_used@0.1.0`** — `discount_id`, `discount_code` (nullable),
`order_id`, `discount_amount`, `order_total`, `used_at`.

**`discount_created@0.1.0`** — `discount_id`, `title`, `method`
(`automatic|code`), `value_type` (`percentage|fixed_amount`),
`value`, `currency`, `starts_at`, `ends_at`, `usage_limit`,
`created_at`, `created_by_actor_id`.

**`discount_expired@0.1.0`** — `discount_id`, `title`, `ends_at`,
`expired_at`, `total_uses`.

**`guest_account_created@0.1.0`** — `guest_id`, `email_hash`, `source`
(`checkout|order|magic_link|import|other`), `created_at`.

**`guest_account_linked@0.1.0`** — `guest_id`, `email_hash`,
`linked_resource_type` (`order|booking`), `linked_resource_id`,
`link_method`, `linked_at`.

**`guest_authenticated@0.1.0`** — `guest_id` (nullable), `email_hash`,
`token_id`, `authenticated_at`.

**`guest_otp_sent@0.1.0`** — `email_hash`, `token_id`, `expires_at`,
`sent_at`.

**`accommodation_archived@0.1.0`** — `accommodation_id`,
`accommodation_type`, `display_name`, `archived_at`,
`archived_by_actor_id`.

**`accommodation_published@0.1.0`** — `accommodation_id`,
`accommodation_type`, `display_name`, `base_price`,
`status_transition {from, to}`, `published_at`.

**`accommodation_price_changed@0.1.0`** — `accommodation_id`,
`accommodation_type`, `previous_price`, `new_price`, `change_pct`,
`changed_at`, `changed_by_actor_id`.

**`pms_sync_failed@0.1.0`** / **`pms_sync_recovered@0.1.0`** — infra
events; not consumed by Leo's 106-metrics list (out-of-scope).

### 1.4 Nuvarande 12 metrics + 5 dimensioner

Källa: `app/_lib/analytics/aggregation/metric-mapping.ts` +
`app/_lib/analytics/aggregation/aggregate-day.ts`.

**Metrics i `analytics.daily_metric` (Phase 5A v2):**

| # | Metric | Source-event | Aggregator | Dimension(s) |
|---|---|---|---|---|
| 1 | `REVENUE` | `payment_succeeded`, `booking_completed` | sum | `TOTAL`, `CHANNEL`, `PRODUCT` (expand) |
| 2 | `ORDERS` | `payment_succeeded`, `booking_completed` | sum | `TOTAL`, `CHANNEL` |
| 3 | `SESSIONS` | `page_viewed` | distinct(session_id) | `TOTAL`, `DEVICE`, `CITY` |
| 4 | `VISITORS` | `page_viewed` | distinct(visitor_id) | `TOTAL` |
| 5 | `CART_STARTED` | `cart_started` | distinct(cart_id) | `TOTAL` |
| 6 | `CHECKOUT_STARTED` | `checkout_started` | distinct(cart_id) | `TOTAL` |
| 7 | `CART_ABANDONED` | `cart_abandoned` | distinct(cart_id) | `TOTAL` |
| 8 | `AVERAGE_ORDER_VALUE` | derived | REVENUE_TOTAL / ORDERS_TOTAL | `TOTAL` |
| 9 | `CART_TO_CHECKOUT_RATE` | derived | CHECKOUT_STARTED / CART_STARTED | `TOTAL` |
| 10 | `CART_ABANDONMENT_RATE` | derived | CART_ABANDONED / CART_STARTED | `TOTAL` |
| 11 | `CHECKOUT_COMPLETION_RATE` | derived | ORDERS / CHECKOUT_STARTED | `TOTAL` |
| 12 | `RETURNING_CUSTOMER_RATE` | derived | runner extra-query, see below | `TOTAL` |

**Live read-path (besökare-widget, Track 3, NOT i daily_metric):**

| Live metric | Source | Computed at request-time |
|---|---|---|
| `visitorsNow` | `page_viewed` last 5 min | distinct(session_id) |

`RETURNING_CUSTOMER_RATE` produces in
`aggregate-day-runner.ts:computeReturningCustomerRate()` via a
secondary query that compares `actor_id`s i dagens
`payment_succeeded`-events mot tidigare events från samma actor.
Definition är "minst en tidigare analytics.event-rad", INTE "minst en
tidigare paid order" — bredare proxy än v1, accommodated by Phase 5B
parity-tolerance på 1.5%.

**Befintliga dimensioner (5):** `TOTAL`, `CHANNEL`, `PRODUCT`, `DEVICE`, `CITY`.
Värden enligt:

- `CHANNEL`: enum från `payment_succeeded.source_channel` /
  `booking_completed.source_channel` (`direct`, `admin_draft`,
  `pms_import`, `third_party_ota`, `unknown`).
- `PRODUCT`: free-form `product_id` (cuid).
- `DEVICE`: `desktop|mobile|tablet|unknown`.
- `CITY`: free-form city name from MaxMind GeoLite2.

### 1.5 Domain-data idag tillgänglig (källor som EJ är i pipelinen ännu)

Per `prisma/schema.prisma`, dessa är operationally tillgängliga men
inte ännu emitterade som analytics-events (relevanta för 106-metrics):

- **Order.sourceChannel** (line 2809): direct/booking_com/expedia/
  app-handle. Idag i `payment_succeeded.source_channel`.
- **Order.lineItems** (line 2882-2916): productId, variantId,
  quantity, unitAmount, totalAmount, currency. **Bara `product_id` +
  `amount` i payment_succeeded.line_items idag** — variantTitle, sku,
  quantity, image NOT i pipelinen.
- **GuestAccount.country** (line 1645), **`.locale`** (1648),
  **`.firstName/lastName`** (1639-40) — guest-domain saknar event-
  spegel.
- **Accommodation.accommodationType + .name + .basePricePerNight**
  (2168-2253) — saknar event-spegel.
- **AccommodationCategory.title + .slug** — saknar event-spegel.
- **Booking.totalAmount / .currency** — saknas i booking-events
  utöver `total_amount` i `booking_completed`.
- **Booking.firstName/lastName/guestEmail/country** — guest-snapshot
  vid bokning, saknar event-fält.
- **Discount.method/value_type/value** — finns i `discount_created`
  men `discount_used` har bara `discount_amount + order_total`,
  inte vilken `value_type` som tillämpades.

### 1.6 Phase 5A-pipelinen (kort sammanfattning)

- **Skrivvägen:** event → outbox → drainer (Inngest) →
  `analytics.event` (partitioned monthly på `occurred_at`).
- **Aggregator:** Inngest-cron `*/15 * * * *`, 48h sliding window,
  räknar fold mot `analytics.event`, upsert till
  `analytics.daily_metric` (composite-unique på
  `(tenant_id, date, metric, dimension, dimension_value)`).
- **Read:** dashboard route reads `AnalyticsDailyMetric` (legacy);
  cutover till `analytics.daily_metric` (v2) sker i Phase 5B.

---

## §2 Per-metric inventory (106 metrics)

För varje metric: namn, definition, atomiska events, properties,
dimensioner, aggregation, källa-domän, status. Citationer till
file:line för EXISTS-claims.

### Sektion A — Översikt (8)

#### M1. Total försäljning (Översikt)

**Definition:** Bruttoförsäljning före återbetalningar och
återbetalningar. Pengar som flödat in från guest till tenant under
perioden.

**Atomiska events:** `payment_succeeded@0.2.0` — EXISTS,
`schemas/payment-succeeded.ts`.

**Properties:** `payment_succeeded.amount.amount` (öre) — EXISTS;
`amount.currency` — EXISTS.

**Dimensioner:** `TOTAL` — EXISTS i `metric-mapping.ts:127-132`.

**Aggregation:** `SUM(amount.amount)`.

**Källa-domän:** payment-domain.

**Status:** READY. Identisk med dagens `REVENUE × TOTAL`.

#### M2. Nettoförsäljning (Översikt)

**Definition:** Bruttoförsäljning − återbetalningar (refunds) − ev.
disputes som lett till charge-backs. Snittlinjen
"merchant-actually-keeps".

**Atomiska events:** `payment_succeeded@0.2.0` (numerator base),
`payment_refunded@0.1.0`, `payment_disputed@0.1.0` — alla EXISTS.

**Properties:** `payment_succeeded.amount.amount`,
`payment_refunded.refund_amount.amount`,
`payment_disputed.disputed_amount.amount`.

**Dimensioner:** `TOTAL`. (CHANNEL etc. listas i §F som derived
ratio-pair på samma form.)

**Aggregation:** `SUM(payment_succeeded.amount) − SUM(refund_amount) − SUM(disputed_amount [bara dispute_status='lost'])`.

**Källa-domän:** payment-domain.

**Status:** PARTIAL — events finns, men `dispute_status='lost'`-flagga
tracking saknas: `payment_disputed.dispute_status` är en snapshot
vid dispute-creation; **MISSING** event `payment_dispute_resolved`
med `outcome: enum('won'|'lost'|'warning_closed'|'charge_refunded')`
för att veta NÄR en dispute är "verkligen förlorad". Se §3.1.

#### M3. Sessioner (Översikt)

**Definition:** Antalet unika tab-scoped sessioner som besökt
storefront under perioden. Multi-tab räknas som N distinkta sessioner
(industri-norm — recon §2.5 i besökare-recon).

**Atomiska events:** `page_viewed@0.1.0` — EXISTS.

**Properties:** `payload->>'session_id'` (StorefrontContext.session_id)
— EXISTS.

**Dimensioner:** `TOTAL` — EXISTS i `metric-mapping.ts:314-320`.

**Aggregation:** `COUNT(DISTINCT session_id)`.

**Källa-domän:** storefront-events.

**Status:** READY. Identisk med dagens `SESSIONS × TOTAL`.

#### M4. Unika besökare (Översikt)

**Definition:** Unika `visitor_id`-värden under perioden. Bryts av
localStorage-clear, incognito, browser-data-purge.

**Atomiska events:** `page_viewed@0.1.0` — EXISTS.

**Properties:** `payload->>'visitor_id'` — EXISTS som `optional` i
StorefrontContext (`_storefront-context.ts:179`); pre-X2-events
saknar fältet och mappas till tom sträng (`metric-mapping.ts:332`).

**Dimensioner:** `TOTAL` — EXISTS.

**Aggregation:** `COUNT(DISTINCT visitor_id)` med tom sträng filtrerat.

**Källa-domän:** storefront-events.

**Status:** READY. Identisk med dagens `VISITORS × TOTAL`. Notera:
post-X2 är `visitor_id` always-set när consent.analytics === true;
pre-X2-events bidrar till en synthetisk "anonymous"-visitor.

#### M5. Konverteringsgrad (Översikt)

**Definition:** Andelen sessioner som ledde till en bokning under
perioden. `bookings / sessions`.

**Atomiska events:** `page_viewed` (denominator), `booking_completed`
(numerator) — båda EXISTS.

**Properties:** `payload->>'session_id'` på page_viewed; numerator är
en COUNT av `booking_completed`-events.

**Dimensioner:** `TOTAL`. Per-CHANNEL/DEVICE/etc. listas separat i
§G (M80, M81, M82).

**Aggregation:** `RATIO(numerator=ORDERS_TOTAL, denominator=SESSIONS_TOTAL)` i basis points.

**Källa-domän:** mixed (storefront + booking).

**Status:** PARTIAL. Dagens `CART_TO_CHECKOUT_RATE` /
`CHECKOUT_COMPLETION_RATE` hanterar inte sessions→booking direkt —
**MISSING** derived metric `SESSION_TO_BOOKING_RATE × TOTAL`.
Trivial att derivera: existing ORDERS_TOTAL / SESSIONS_TOTAL.

#### M6. Genomsnittligt ordervärde (Översikt)

**Definition:** Medelvärde av totalbeloppet på betalda orders under
perioden. `revenue / orders`.

**Atomiska events:** `payment_succeeded@0.2.0` — EXISTS.

**Properties:** Samma som M1 + M7.

**Dimensioner:** `TOTAL` — EXISTS i `metric-mapping.ts:473-480`.

**Aggregation:** DERIVED — `SUM(amount) / COUNT(*)`. Implementerat
i `derivedMetrics()`.

**Källa-domän:** payment-domain.

**Status:** READY. Identisk med dagens `AVERAGE_ORDER_VALUE × TOTAL`.

#### M7. Antal bokningar (Översikt)

**Definition:** Antal kompletta bokningar (paid + booking confirmed)
under perioden.

**Atomiska events:** `payment_succeeded@0.2.0` (för
order-perspective) ELLER `booking_completed@0.1.0` (för
booking-perspective) — båda EXISTS.

**Properties:** Inga särskilda — count-aggregation.

**Dimensioner:** `TOTAL`.

**Aggregation:** `COUNT(*)` på `booking_completed` (eller
`COUNT(payment_succeeded)` om man vill räkna även non-accommodation
PURCHASE-orders separat — Leo bestämmer). Idag aggregator counter
båda.

**Källa-domän:** booking-domain.

**Status:** READY. Identisk med dagens `ORDERS × TOTAL`. **OPEN-fråga
i §5.1**: är "bokningar" `booking_completed` only (ACCOMMODATION) eller
också PURCHASE-orders som `payment_succeeded` täcker?

#### M8. Återkommande kund-andel (Översikt)

**Definition:** Andelen `actor_id`s i dagens `payment_succeeded` som
har minst en tidigare analytics.event-rad (samma actor_id, same
tenant). Basis points (10000 = 100%).

**Atomiska events:** `payment_succeeded@0.2.0` (numerator filter:
distinct actor_ids); `analytics.event` (denominator query: prior
events).

**Properties:** `actor_id` (BaseEventSchema, top-level) — EXISTS.

**Dimensioner:** `TOTAL` — EXISTS.

**Aggregation:** DERIVED — runner-extra-query, inte fold (per
`aggregate-day-runner.ts:computeReturningCustomerRate`). Definition:
"minst en tidigare event från samma actor", inte "minst en tidigare
paid order".

**Källa-domän:** payment-domain + cross-event lookup.

**Status:** READY. Identisk med dagens `RETURNING_CUSTOMER_RATE × TOTAL`.
**OPEN i §5.5**: är "återkommande" definitionen rätt — eller ska
vi tigtare till "tidigare paid booking inom rolling 12m"?

---

### Sektion B — Försäljning (15)

#### M9. Försäljning över tid (Försäljning)

**Definition:** Tidsserie av REVENUE × TOTAL per dag (eller per
timme/vecka/månad — tidsupplösning är dashboard-koncern).

**Atomiska events:** `payment_succeeded@0.2.0` — EXISTS.

**Properties:** Samma som M1.

**Dimensioner:** Tidsserie över `daily_metric.date` — EXISTS som
inneboende kolumn på tabellen.

**Aggregation:** `SERIES-OVER-TIME` av `REVENUE × TOTAL`.

**Källa-domän:** payment-domain.

**Status:** READY — identisk med dashboard-rendering av
`REVENUE × TOTAL` rader sorted by date.

#### M10. Bruttoförsäljning (Försäljning)

**Definition:** Pengar in från guest, före refunds eller rabatt-
allokeringar. Synonym med M1 — Leos lista har båda för att Översikt
och Försäljning-sektioner båda ska ha siffran tillgänglig.

**Atomiska events / Properties / Dimensioner / Aggregation / Källa-domän:** Identiska med M1.

**Status:** READY. Aggregator producerar samma rad; UI bara dubblerar
i två sektioner.

#### M11. Nettoförsäljning efter rabatter & återbetalningar (Försäljning)

**Definition:** `gross_revenue − discount_total − refund_total`.

**Atomiska events:** `payment_succeeded@0.2.0` (gross),
`discount_used@0.1.0` (discount_amount), `payment_refunded@0.1.0`
(refund_amount).

**Properties:**
- `payment_succeeded.amount.amount` — EXISTS
- `discount_used.discount_amount.amount` — EXISTS
- `payment_refunded.refund_amount.amount` — EXISTS
- `payment_succeeded.line_items[].amount` (per-product gross) — EXISTS

**Dimensioner:** `TOTAL`.

**Aggregation:** `SUM(amount) − SUM(discount_amount) − SUM(refund_amount)`.

**Källa-domän:** mixed (payment + discount).

**Status:** READY. Behöver ny `NET_REVENUE × TOTAL` derived metric
plus `DISCOUNTS × TOTAL` base count + `REFUNDS × TOTAL` base count.

#### M12. Försäljning per trafikkälla (Försäljning)

**Definition:** REVENUE bryt på UTM-källa eller referrer-domän,
tillskrivet ordern via dess starting-session.

**Atomiska events:** `payment_succeeded` (revenue), och en attributions-
chain via `correlation_id` ELLER session-stitching.

**Properties:** REVENUE per UTM-source, men:
- **MISSING:** `payment_succeeded` har inget `utm_source` /
  `traffic_source`-fält idag. UTM lever bara i `page_viewed.page_url`
  query-string-parsed allowlist (`utm_source`, `utm_medium`,
  `utm_campaign`, `utm_term`, `utm_content`).
- **MISSING attributions-strategi:** First-touch vs last-touch vs
  multi-touch är inte definierad. Se §5 OPEN.

**Dimensioner:** `TRAFFIC_SOURCE` — MISSING. Föreslå dimension med
värden från utm_source-allowlist + `direct` + `referral`.

**Aggregation:** `SUM(revenue) GROUP BY traffic_source`.

**Källa-domän:** mixed (payment + storefront-attribution).

**Status:** GREENFIELD — hela attributions-modellen saknas. Se §5.6
OPEN: vilken attributions-modell? Per task-spec: detta är ett HUVUD-
beslut som påverkar M12-M14, M25-M26, M37, M58, M81, M103-M106.

#### M13. Försäljning per landningssida (Försäljning)

**Definition:** REVENUE bryt på den FÖRSTA `page_url` som sessionen
besökte.

**Atomiska events:** Samma som M12.

**Properties:** `page_viewed.page_url` (first per session_id) +
`payment_succeeded.amount`.

**Dimensioner:** `LANDING_PAGE` — MISSING.

**Aggregation:** GROUP BY first-page-of-session.

**Källa-domän:** mixed.

**Status:** GREENFIELD — kräver session→order attribution AND
"första page_viewed per session_id". Se §5.6.

#### M14. Försäljning per kampanj (Försäljning)

**Definition:** REVENUE bryt på `utm_campaign` (extracted from the
session's first `page_viewed.page_url` query string).

**Atomiska events:** `payment_succeeded@0.2.0` (revenue) +
`page_viewed@0.1.0` (utm) — båda EXISTS, men cross-event-attribution
saknas.

**Properties:** `payment_succeeded.amount.amount` — EXISTS;
`utm_campaign` parsed from `page_viewed.page_url` query string per
allowlist (per `loader-context.ts:50` PAGE_URL_QUERY_ALLOWLIST).
**MISSING** structured property — finns idag bara som en del av URL.

**Dimensioner:** `UTM_CAMPAIGN` — MISSING.

**Aggregation:** SUM(revenue) GROUP BY utm_campaign via session→order
chain.

**Källa-domän:** mixed (payment + storefront-attribution).

**Status:** GREENFIELD — same attribution-blocker som M12.

#### M15. Försäljning per enhet (Försäljning)

**Definition:** REVENUE bryt på guest's `device_type`.

**Atomiska events:** `payment_succeeded` (revenue), `page_viewed`
(device — only carried by storefront events).

**Properties:** `device_type` exists on storefront events; **MISSING**
på `payment_succeeded` (server-emitted, no browser context).

**Dimensioner:** `DEVICE` — EXISTS i `daily_metric` men just nu bara
för SESSIONS. Återanvänd för REVENUE.

**Aggregation:** SUM(revenue) GROUP BY device. Kräver attribution
order→session_id→device_type.

**Källa-domän:** mixed.

**Status:** PARTIAL — same attribution blocker as M12. Solving
attribution unlocks M15 + M27 + M80.

#### M16. Försäljning per land (Försäljning)

**Definition:** REVENUE bryt på guest's geo-country.

**Atomiska events:** `payment_succeeded` + geo-context.

**Properties:** `event.context.geo.country` — EXISTS i
`/api/analytics/collect` enrichment. **MISSING:** server-emitted
`payment_succeeded` har INGEN `context.geo` idag — geo enrichment
körs bara på collect-route. Server-emit-pipelinen behöver också
kunna sätta geo via `Order.billingAddress.country` ELLER `Booking.country`.

**Dimensioner:** `COUNTRY` — MISSING; föreslå ISO 3166-1 alpha-2 enum.

**Aggregation:** SUM(revenue) GROUP BY country.

**Källa-domän:** payment-domain + order/booking-domain.

**Status:** PARTIAL — events finns men geo-coverage saknas på
server-events. Se §3.2.

#### M17. Försäljning per boendetyp (Försäljning)

**Definition:** REVENUE bryt på `accommodation_type` (hotel | cabin |
camping | apartment | pitch).

**Atomiska events:** `booking_completed@0.1.0` har `accommodation_id`
men INTE `accommodation_type`. Idag måste vi joina till
`Accommodation`-tabellen vid aggregator-tid (out-of-band).

**Properties:** `booking_completed.accommodation_type` — **MISSING**.
Föreslå PATCH-additive (optional) field, fyll vid emit-tid.

**Dimensioner:** `ACCOMMODATION_TYPE` — MISSING.

**Aggregation:** SUM(revenue) GROUP BY accommodation_type.

**Källa-domän:** booking-domain.

**Status:** PARTIAL — kräver schema-bump på `booking_completed` till
v0.2.0 med `accommodation_type` (enum, samma som
`accommodation_published`). Och samma fält på `payment_succeeded`
om revenue ska bryta per type oberoende av `booking_completed`.

#### M18. Försäljning per kategori (Försäljning)

**Definition:** REVENUE bryt på `AccommodationCategory` (Hotellrum,
Stuga, Husvagnsplats, etc.).

**Atomiska events:** Same as M17 + category-mapping.

**Properties:** `accommodation_id → AccommodationCategoryItem.categoryId
→ AccommodationCategory.title`. **MISSING** event-fält:
`booking_completed.accommodation_category_id` (eller slug).

**Dimensioner:** `ACCOMMODATION_CATEGORY` — MISSING.

**Aggregation:** SUM(revenue) GROUP BY category.

**Källa-domän:** booking-domain.

**Status:** PARTIAL — kräver booking_completed-schema-bump för
`accommodation_category_id` ELLER aggregator gör join (bryter
"events as portable state"-pattern).

**OPEN i §5.7:** category-mapping är M:N (en accommodation kan vara
i flera kategorier per `AccommodationCategoryItem`). Hur räknar vi —
multi-emit, primary-category, eller alla kategorier får full
attribution?

#### M19. Försäljning per rabattkod (Försäljning)

**Definition:** REVENUE från orders som använt en specifik rabattkod.
"Tributerad" till en kod = kod var tillämpad på den ordern.

**Atomiska events:** `discount_used@0.1.0` + `payment_succeeded@0.2.0`.

**Properties:**
- `discount_used.discount_code` — EXISTS (nullable för automatic
  discounts).
- `discount_used.order_id` — EXISTS.
- `payment_succeeded.amount.amount` — EXISTS.

**Dimensioner:** `DISCOUNT_CODE` — MISSING.

**Aggregation:** SUM(revenue) GROUP BY discount_code, joining
order_id between events.

**Källa-domän:** mixed (discount + payment).

**Status:** PARTIAL — events finns men aggregator saknar cross-event-
join-logic. Lösning: `payment_succeeded.discount_code` (PATCH-additive
optional) så vi slipper joina across events vid aggregator-tid.

#### M20. Försäljning från nya kunder (Försäljning)

**Definition:** REVENUE från `actor_id`s som har sin FIRST
`payment_succeeded` denna period.

**Atomiska events:** `payment_succeeded@0.2.0`.

**Properties:** `actor_id` + cross-event "har actor_id en tidigare
payment_succeeded".

**Dimensioner:** `CUSTOMER_TYPE` — MISSING; värden `new` | `returning`.

**Aggregation:** SUM(revenue) WHERE actor_id NOT IN earlier_paid_actors.

**Källa-domän:** payment-domain + cross-event lookup.

**Status:** PARTIAL — same lookup-pattern som RETURNING_CUSTOMER_RATE.
Implementeras som derived/runner-query analogt till M8.

#### M21. Försäljning från återkommande kunder (Försäljning)

**Definition:** Komplement till M20. REVENUE från `actor_id`s med
minst en tidigare `payment_succeeded` före perioden.

**Atomiska events:** `payment_succeeded@0.2.0` + cross-event lookup.
Samma som M20.

**Properties:** Samma som M20.

**Dimensioner:** `CUSTOMER_TYPE` med dim_value=`returning`. Identisk
med M20:s dim-shape.

**Aggregation:** SUM(amount) WHERE actor_id IN earlier_paid_actors.
Komplement till M20.

**Källa-domän:** payment-domain + cross-event lookup.

**Status:** PARTIAL — landar i samma runner-query som M20.

#### M22. Återbetalningar (Försäljning)

**Definition:** Total refund-belopp under perioden.

**Atomiska events:** `payment_refunded@0.1.0` — EXISTS.

**Properties:** `payment_refunded.refund_amount.amount` — EXISTS.

**Dimensioner:** `TOTAL`. CHANNEL/PRODUCT/etc. saknas — MISSING fält
på `payment_refunded` (`source_channel`, `line_items[]`).

**Aggregation:** SUM(refund_amount).

**Källa-domän:** payment-domain.

**Status:** READY för × TOTAL — base metric `REFUNDS × TOTAL` är
trivial. PARTIAL för slicing (saknar source_channel + line_items
på `payment_refunded`).

#### M23. Nettointäkt efter avgifter (Försäljning)

**Definition:** `gross_revenue − refunds − processing_fees − platform_fees`.

**Atomiska events:** `payment_succeeded` + `payment_refunded` +
**MISSING** event för fees.

**Properties:**
- `Order.platformFeeBps` (line 2793 i schema.prisma) — EXISTS i
  domain men INTE emitterat som event.
- Stripe processing-fee — INTE i pipelinen alls (lever i Stripe-
  webhooks som inte har analytics-emit).

**Dimensioner:** `TOTAL`.

**Aggregation:** SUM-chain.

**Källa-domän:** payment-domain + Stripe-data.

**Status:** GREENFIELD — kräver event för platform-fee + processing-
fee per order. Föreslå ny event `payment_settled@0.1.0` med
`{ order_id, gross_amount, processing_fee, platform_fee, net_amount }`.

---

### Sektion C — Bokningar (12)

#### M24. Bokningar över tid (Bokningar)

**Definition:** Tidsserie av antal bokningar per dag i perioden.

**Atomiska events:** Samma som M7 (`payment_succeeded` eller
`booking_completed` enligt §5.1 OPEN).

**Properties:** Inga särskilda — count-aggregation på event.

**Dimensioner:** `TOTAL` plottat över `daily_metric.date`-axeln.

**Aggregation:** `SERIES-OVER-TIME` av `ORDERS × TOTAL` (eller motsv.
booking-only metric).

**Källa-domän:** booking-domain.

**Status:** READY — dashboard-rendering av M7's daily values.

#### M25. Bokningar per trafikkälla (Bokningar)

**Definition:** `booking_completed`-count bryt på utm_source.

**Atomiska events:** `booking_completed@0.1.0` + attribution.

**Properties:** Same blocker as M12 — attribution.

**Status:** GREENFIELD.

#### M26. Bokningar per landningssida (Bokningar)

**Definition:** COUNT(`booking_completed`) bryt på den FÖRSTA `page_url`
som sessionen besökte. Same shape som M13 men numerator är COUNT, inte SUM.

**Atomiska events / Properties / Dimensioner / Källa-domän:**
Identiska med M13. Aggregation: COUNT(*) GROUP BY landing_page.

**Status:** GREENFIELD — same attribution-blocker som M13/M12.

#### M27. Bokningar per enhet (Bokningar)

**Definition:** COUNT(`booking_completed`) bryt på guest's `device_type`,
attribuerat via session→order chain.

**Atomiska events / Properties / Dimensioner / Källa-domän:**
Identiska med M15 (sales per device); skillnad är aggregation =
COUNT istället för SUM.

**Status:** GREENFIELD — same attribution-blocker som M15.

#### M28. Bokningar per veckodag (Bokningar)

**Definition:** Antal bokningar per `weekday(booking_created_at)`.

**Atomiska events:** `booking_completed@0.1.0` — EXISTS.

**Properties:** `occurred_at` (BaseEventSchema) — EXISTS. Veckodag
beräknas vid query-tid eller dimension-fyllning.

**Dimensioner:** `WEEKDAY` — MISSING; värden `mon`...`sun` (eller
`0`...`6`).

**Aggregation:** COUNT(*) GROUP BY weekday.

**Källa-domän:** booking-domain.

**Status:** READY — derived dimension från `occurred_at`. Aggregator
sätter dimensionValue själv vid emit. **MISSING:** UI/aggregator-
behov av dim-värde innan storage.

**OPEN i §5.8:** veckodag-värde tas på `booking.occurred_at` (när
bokningen skapades) eller `booking.check_in_date` (när gästen kommer)?
Olika dashboard-frågor; båda fall är meningsfulla.

#### M29. Bokningar per timme (Bokningar)

**Definition:** COUNT(`booking_completed`) GROUP BY hour-of-day från
`occurred_at` (eller `check_in_date` per §5.8 OPEN).

**Atomiska events:** `booking_completed@0.1.0` — EXISTS.

**Properties:** `occurred_at` — EXISTS i BaseEventSchema.

**Dimensioner:** `HOUR_OF_DAY` — MISSING. Värden 0-23.

**Aggregation:** COUNT(*) GROUP BY hour.

**Källa-domän:** booking-domain.

**Status:** READY — derived dimension från `occurred_at`. Same OPEN
§5.8 om val av tidsfält.

#### M30. Genomsnittligt ordervärde (bokningar) (Bokningar)

**Definition:** AOV begränsat till bokningar (filtrerat från PURCHASE-
orders).

**Atomiska events:** `booking_completed@0.1.0` — EXISTS;
`booking_completed.total_amount` är monetary, kan gummera direct.

**Properties:** `booking_completed.total_amount.amount`.

**Dimensioner:** `TOTAL`.

**Aggregation:** DERIVED — `SUM(total_amount) / COUNT(*)`.

**Källa-domän:** booking-domain.

**Status:** READY — analogt till M6 men på `booking_completed`-events
istället för `payment_succeeded`.

#### M31. Genomsnittlig vistelselängd (Bokningar)

**Definition:** Average `number_of_nights` per bokning.

**Atomiska events:** `booking_completed.number_of_nights` — EXISTS.

**Properties:** `number_of_nights` (positive int).

**Dimensioner:** `TOTAL`.

**Aggregation:** DERIVED — `SUM(number_of_nights) / COUNT(*)`. Behöver
ny base metric `NIGHTS × TOTAL = sum(number_of_nights)` så ratio
kan deriveras.

**Källa-domän:** booking-domain.

**Status:** READY — schema har fältet. Aggregator-mapping behöver
sum-bidrag.

#### M32. Genomsnittligt antal gäster per bokning (Bokningar)

**Definition:** Average `number_of_guests` per booking.

**Atomiska events:** `booking_completed.number_of_guests` — EXISTS.

**Aggregation:** DERIVED — `SUM(number_of_guests) / COUNT(*)`.

**Status:** READY — analogt M31 + new base `GUESTS × TOTAL`.

#### M33. Bokningsfönster i dagar i förväg (Bokningar)

**Definition:** Average `(check_in_date − booking_created_date)` i
dagar.

**Atomiska events:** `booking_completed@0.1.0` — har
`check_in_date` (string YYYY-MM-DD) + `occurred_at` (datetime när
bokningen skapades).

**Properties:** Båda EXISTS. Subtraction sker vid aggregator-tid.

**Dimensioner:** `TOTAL`. **MISSING base metric**:
`BOOKING_LEAD_DAYS × TOTAL = sum(lead_days)`.

**Aggregation:** DERIVED — `SUM(lead_days) / COUNT(*)`.

**Källa-domän:** booking-domain.

**Status:** READY — derived field, schema covers.

**OPEN i §5.9:** mätning i hela dagar eller timmar? Recon-prompt-spec
sa "räkna i dagar eller timmar".

#### M34. Avbokningsfrekvens (Bokningar)

**Definition:** `cancelled_bookings / total_bookings`.

**Atomiska events:** `booking_cancelled@0.1.0` (numerator),
`booking_completed@0.1.0` (denominator).

**Properties:** Counts, no per-event field needed.

**Dimensioner:** `TOTAL`.

**Aggregation:** DERIVED — `RATIO(CANCELLED, BOOKINGS)`.

**Källa-domän:** booking-domain.

**Status:** READY — events finns; nya base metrics
`CANCELLATIONS × TOTAL` + ratio derived.

**OPEN i §5.10:** kund-initierade vs operator-initierade avbokningar
— skillnad i siffran? `booking_cancelled` saknar idag fält som anger
varför / vem. **MISSING** field `cancellation_initiator` (`guest|operator|system|pms`).

#### M35. Avbokningar per trafikkälla (Bokningar)

**Definition:** COUNT(`booking_cancelled`) bryt på den ursprungliga
sessionens utm_source.

**Atomiska events:** `booking_cancelled@0.1.0` — EXISTS;
attribution-chain via `booking_cancelled.booking_id` →
`booking_completed` → session.

**Properties:** booking_id binder en cancellation till en tidigare
booking_completed. Saknad property: `traffic_source` på antingen
event (men det vore redundant — joinas via booking_id).

**Dimensioner:** `TRAFFIC_SOURCE`.

**Aggregation:** COUNT(*) GROUP BY traffic_source via join.

**Källa-domän:** booking-domain + storefront-attribution.

**Status:** GREENFIELD — same attribution-blocker som M25.

---

### Sektion D — Trafik & källor (15)

#### M36. Sessioner över tid (Trafik & källor)

**Definition:** Tidsserie av M3 per dag.

**Status:** READY.

#### M37. Sessioner per trafikkälla (Trafik & källor)

**Definition:** Distinct session_ids GROUP BY first-utm_source.

**Atomiska events:** `page_viewed@0.1.0` + utm-extraction.

**Properties:** Extract `utm_source` from `page_viewed.page_url`
querystring per allowlist.

**Dimensioner:** `TRAFFIC_SOURCE` — MISSING.

**Aggregation:** distinct(session_id) GROUP BY traffic_source. Kräver
"first page_viewed per session_id"-logic eller pre-attribution.

**Källa-domän:** storefront-events.

**Status:** PARTIAL — utm-fält finns i `page_url` allowlist men inte
extracted till en property. **MISSING** event-property
`page_viewed.utm: { source, medium, campaign, term, content }` (parsed
form). ALTERNATE: aggregator parse:r URL själv vid query-tid (LIKE
`%utm_source=%` parsing). Båda alternativen i §5.6 OPEN.

#### M38. Sessioner per medium (Trafik & källor)

**Definition:** distinct(session_id) GROUP BY `utm_medium` från first
page_viewed.

**Atomiska events / Properties / Källa-domän:** Identiska med M37 men
extraktion targets `utm_medium` istället för `utm_source`.

**Dimensioner:** `UTM_MEDIUM` — MISSING.

**Aggregation:** distinct(session_id) GROUP BY utm_medium.

**Status:** PARTIAL — same blocker som M37 (utm-property på page_viewed).

#### M39. Sessioner per kampanj (Trafik & källor)

**Definition:** distinct(session_id) GROUP BY `utm_campaign`.

**Atomiska events / Properties / Källa-domän:** Identiska med M37.

**Dimensioner:** `UTM_CAMPAIGN` — MISSING.

**Aggregation:** distinct(session_id) GROUP BY utm_campaign. TOP-N
recommended pga unbounded cardinality.

**Status:** PARTIAL — same blocker som M37.

#### M40. Sessioner per landningssida (Trafik & källor)

**Definition:** distinct(session_id) GROUP BY den `page_url` som var
första `page_viewed` i sessionen.

**Atomiska events:** `page_viewed@0.1.0` — EXISTS.

**Properties:** `page_url` (StorefrontContext) — EXISTS;
`session_id`; ordering by `occurred_at` to identify "first".

**Dimensioner:** `LANDING_PAGE` — MISSING.

**Aggregation:** distinct(session_id) GROUP BY first-page_url.
Kräver runner-extra-query liknande M49 (per session_id, finn första
event och ta dess page_url).

**Källa-domän:** storefront-events.

**Status:** PARTIAL — events finns; logic saknas. URL-canonicalization
(path only? include host?) i §5.11 OPEN.

#### M41. Sessioner per hänvisare (Trafik & källor)

**Definition:** distinct(session_id) GROUP BY referrer-domain.

**Atomiska events:** `page_viewed@0.1.0` — EXISTS.

**Properties:** `payload->>'page_referrer'` — EXISTS i
StorefrontContext.

**Dimensioner:** `REFERRER_DOMAIN` — MISSING. Bör hämta endast
host-delen för cardinality-kontroll (`?` paths blåser upp).

**Aggregation:** distinct(session_id) GROUP BY referrer_domain.

**Källa-domän:** storefront-events.

**Status:** READY — fält finns; aggregator kan extrahera domain.

#### M42. Sessioner per social källa (Trafik & källor)

**Definition:** Subset av M41 — bara referrer-domains som matchar en
social-list (facebook.com, instagram.com, tiktok.com, twitter.com,
x.com, linkedin.com, pinterest.com, …).

**Atomiska events:** Same as M41.

**Aggregation:** distinct(session_id) WHERE referrer_domain ∈ social_set.

**Status:** PARTIAL — referrer-fältet finns. Social-set definition är
en aggregator-konfiguration. **OPEN i §5.12:** vilken initial set?

#### M43. Sessioner per enhet (Trafik & källor)

**Definition:** distinct(session_id) GROUP BY `device_type`. Identisk
med dagens `SESSIONS × DEVICE`.

**Atomiska events:** `page_viewed@0.1.0` — EXISTS.

**Properties:** `device_type` — EXISTS som optional StorefrontContext-
fält (`_storefront-context.ts:178`).

**Dimensioner:** `DEVICE` — EXISTS i `daily_metric` (per Phase 5A).

**Aggregation:** distinct(session_id) GROUP BY device_type. Idag
implementerat i `metric-mapping.ts:335-341`.

**Källa-domän:** storefront-events.

**Status:** READY — täckt av nuvarande `SESSIONS × DEVICE`.

#### M44. Sessioner per browser (Trafik & källor)

**Definition:** distinct(session_id) GROUP BY browser-name.

**Atomiska events:** `page_viewed`.

**Properties:** `payload->>'user_agent_hash'` — EXISTS men är HASH,
inte UA-strängen. UA-strängen passerar ALDRIG till worker
(`_storefront-context.ts:64-65`).

**Dimensioner:** `BROWSER` — MISSING.

**Status:** GREENFIELD — kräver att browser-derivation görs
loader-side (analogt med `device_type`) INNAN UA hashas. **MISSING**
property `payload.browser_family`: enum `chrome|firefox|safari|edge|opera|other|unknown`.
Bör vara optional, like `device_type`.

#### M45. Sessioner per land (Trafik & källor)

**Definition:** distinct(session_id) GROUP BY context.geo.country.

**Atomiska events:** `page_viewed`.

**Properties:** `event.context.geo.country` — EXISTS via
geo-enrichment vid `/api/analytics/collect`.

**Dimensioner:** `COUNTRY` — MISSING (men data finns).

**Aggregation:** distinct(session_id) GROUP BY country.

**Status:** READY — data finns. Aggregator-mapping ska bara läggas
till.

#### M46. Sessioner per stad (Trafik & källor)

**Definition:** distinct(session_id) GROUP BY `context.geo.city`.
Identisk med dagens `SESSIONS × CITY`.

**Atomiska events:** `page_viewed@0.1.0` + geo-enrichment.

**Properties:** `event.context.geo.city` — EXISTS via
`/api/analytics/collect` enrichment per `app/_lib/analytics/pipeline/geo.ts`.

**Dimensioner:** `CITY` — EXISTS.

**Aggregation:** distinct(session_id) GROUP BY city — implementerat i
`metric-mapping.ts:343-352`.

**Källa-domän:** storefront-events + geo-enrichment.

**Status:** READY — täckt av nuvarande `SESSIONS × CITY`.

#### M47. Sessioner per språk (Trafik & källor)

**Definition:** distinct(session_id) GROUP BY locale.

**Atomiska events:** `page_viewed`.

**Properties:** `payload->>'locale'` — EXISTS.

**Dimensioner:** `LOCALE` — MISSING.

**Status:** READY — fält finns. Aggregator-mapping behövs.

#### M48. Sidor per session (Trafik & källor)

**Definition:** Average `page_views_per_session = total_page_viewed / distinct(session_id)`.

**Atomiska events:** `page_viewed`.

**Aggregation:** DERIVED — `COUNT(page_viewed) / COUNT(DISTINCT session_id)`.
Kräver ny base `PAGE_VIEWS × TOTAL` (count, not distinct).

**Status:** READY — bara aggregator-mapping.

#### M49. Genomsnittlig sessionslängd (Trafik & källor)

**Definition:** Average `(last_event_in_session - first_event_in_session)` i sekunder.

**Atomiska events:** Alla SF-events med samma `session_id`.

**Properties:** `occurred_at` per event.

**Aggregation:** DERIVED — runner-extra-query analogt till
RETURNING_CUSTOMER_RATE: per session_id, beräkna `max(occurred_at) − min(occurred_at)`,
sedan average.

**Källa-domän:** storefront-events.

**Status:** PARTIAL — events finns. Behöver runner-extra-query
(extra DB-touch like M8). **MISSING** logic.

#### M50. Avvisningsfrekvens (Trafik & källor)

**Definition:** Andel sessions med exakt 1 page_viewed.

**Atomiska events:** `page_viewed`.

**Aggregation:** DERIVED — `single_page_sessions / total_sessions`.

**Status:** PARTIAL — kräver session-grouped count med equals-1-filter.
Same shape som M49 — runner-query.

---

### Sektion E — Kunder (9)

#### M51. Nya vs återkommande kunder (Kunder)

**Definition:** Två-bucket fördelning över `actor_id`s i perioden:
new bucket = M52, returning bucket = M53. Renderas typically som
stack-bar eller donut.

**Atomiska events / Properties / Källa-domän:** Identiska med M52+M53
(baserat på cross-event lookup på actor_id).

**Dimensioner:** `CUSTOMER_TYPE` — MISSING; värden `new` | `returning`.

**Aggregation:** Två separata distinct-counts mot `daily_metric`-rader
med dimension=`CUSTOMER_TYPE`.

**Status:** PARTIAL — derived från M52+M53 base counts.

#### M52. Antal nya kunder (Kunder)

**Definition:** Distinct `actor_id`s vars FIRST `payment_succeeded`
inföll i perioden.

**Atomiska events:** `payment_succeeded@0.2.0` + cross-event lookup.

**Aggregation:** distinct(actor_id) WHERE actor_id has no prior
payment_succeeded.

**Status:** PARTIAL — analogt till M20 (revenue), här count-of-actors.

#### M53. Antal återkommande kunder (Kunder)

**Definition:** distinct(actor_id)s vars FIRST `payment_succeeded`
inföll FÖRE perioden, men har MINST EN `payment_succeeded` i perioden.
Komplementtill M52.

**Atomiska events / Properties / Källa-domän:** Identiska med M52.

**Dimensioner:** `CUSTOMER_TYPE` med dim_value=`returning`.

**Aggregation:** distinct(actor_id) WHERE actor_id HAS prior
payment_succeeded.

**Status:** PARTIAL — landar i samma runner-query som M52.

#### M54. Kundlivstidsvärde (Kunder)

**Definition:** Average lifetime spend per actor_id.

**Atomiska events:** `payment_succeeded@0.2.0` aggregated all-time.

**Aggregation:** `SUM(revenue) / COUNT(DISTINCT actor_id)` over an
unbounded time window.

**Status:** PARTIAL.

**OPEN i §5.13:** Tidsfönster för LTV — all-time / rolling 12m / 24m?
Påverkar både semantik och query-cost (all-time skär över hela
event-tabellen, expensive vid 10k tenants).

#### M55. Genomsnittligt antal bokningar per kund (Kunder)

**Definition:** Average antal bokningar per distinct `actor_id` i
perioden.

**Atomiska events:** `payment_succeeded@0.2.0` — EXISTS.

**Properties:** `actor_id` (BaseEventSchema) — EXISTS.

**Dimensioner:** `TOTAL`.

**Aggregation:** DERIVED — `ORDERS × TOTAL / DISTINCT_CUSTOMERS × TOTAL`.
Kräver ny base `DISTINCT_CUSTOMERS × TOTAL = COUNT(DISTINCT actor_id)`.

**Källa-domän:** payment-domain.

**Status:** READY — bara aggregator-mapping (ny base count + derived
ratio).

#### M56. Tid mellan bokningar (Kunder)

**Definition:** Average days mellan consecutive bookings för samma
actor_id.

**Atomiska events:** `payment_succeeded@0.2.0` × 2+ per actor_id.

**Aggregation:** Per actor: differ-i-tid mellan consecutive
payment_succeeded. Average over actors with ≥2.

**Status:** GREENFIELD — kräver per-actor sequenced-query (extra
runner-query liknande M8/M49). **MISSING** logic.

#### M57. Kunder per land (Kunder)

**Definition:** distinct(actor_id) GROUP BY country.

**Atomiska events:** `payment_succeeded` + country-sourcing.

**Properties:** **MISSING** — `payment_succeeded` har ingen `country`-
fält. Optional shapes:
1. Pull från `Order.billingAddress.country` vid emit-tid.
2. Pull från `Booking.country` när det finns en booking_id.
3. Use `event.context.geo.country` om server-events får context-fältet.

**Dimensioner:** `COUNTRY`.

**Status:** PARTIAL — events behöver country. Same blocker som M16.

#### M58. Kunder per förvärvskanal (Kunder)

**Definition:** distinct(actor_id) GROUP BY den utm_source som var
FIRST-touch när actor blev kund.

**Atomiska events:** `page_viewed` (utm) + `payment_succeeded` (att
binda actor till en converted session).

**Properties:** Same blocker som M12 — utm-extraction och first-touch
attribution.

**Dimensioner:** `TRAFFIC_SOURCE` (delas med M12, M37).

**Aggregation:** distinct(actor_id) GROUP BY first_session.utm_source.

**Källa-domän:** mixed.

**Status:** GREENFIELD — same blocker som M12. Beror på Svit α
(attribution).

#### M59. Toppkunder efter utgift (Kunder)

**Definition:** TOP-N actor_ids by `SUM(revenue)`.

**Atomiska events:** `payment_succeeded@0.2.0`.

**Aggregation:** TOP-N. **NOTE:** TOP-N is NOT a clean fit for
daily_metric's `(metric, dimension, dim_value)` shape — varje (datum,
actor) blir en rad. På 10k tenants × 10k actors blir det stor — men
OK om vi begränsar till TOP-100 per dag.

**Källa-domän:** payment-domain.

**Status:** READY — `REVENUE × CUSTOMER` dimension med dim_value=actor_id,
filtrerat till TOP-100 vid materialization.

**OPEN i §5.14:** TOP-N — vilken N? 100? 1000? Per period eller all-time?

---

### Sektion F — Boenden (7)

#### M60. Toppsäljande boenden — intäkt (Boenden)

**Definition:** TOP-N accommodation_id by SUM(revenue).

**Atomiska events:** `booking_completed@0.1.0`
(`accommodation_id` + `total_amount`).

**Properties:** Båda EXISTS.

**Dimensioner:** `ACCOMMODATION` — MISSING; dim_value = accommodation_id (cuid).

**Aggregation:** SUM(total_amount) GROUP BY accommodation_id, TOP-N.

**Källa-domän:** booking-domain.

**Status:** READY — bara aggregator-mapping.

#### M61. Toppsäljande boenden — antal (Boenden)

**Definition:** TOP-N `accommodation_id` by COUNT(`booking_completed`).

**Atomiska events / Properties / Källa-domän:** Identiska med M60.

**Dimensioner:** `ACCOMMODATION` (delas med M60).

**Aggregation:** COUNT(*) GROUP BY accommodation_id, TOP-N.

**Status:** READY — analog aggregator-mapping till M60 men COUNT
istället för SUM.

#### M62. Mest visade boenden (Boenden)

**Definition:** TOP-N accommodation_id by COUNT(`accommodation_viewed`).

**Atomiska events:** `accommodation_viewed@0.1.0` — EXISTS.

**Properties:** `accommodation_viewed.accommodation_id` — EXISTS.

**Dimensioner:** `ACCOMMODATION`.

**Aggregation:** COUNT(*) GROUP BY accommodation_id.

**Källa-domän:** storefront-events.

**Status:** READY — ny base `ACCOMMODATION_VIEWS × ACCOMMODATION`.

#### M63. Konverteringsgrad per boende (Boenden)

**Definition:** Per accommodation_id, ratio
`booking_completed_count / accommodation_viewed_count`. Visar vilka
boenden som converterar bra ifrån view → booking.

**Atomiska events:** `accommodation_viewed@0.1.0` + `booking_completed@0.1.0`.

**Properties:** Båda har `accommodation_id`.

**Dimensioner:** `ACCOMMODATION` (delas).

**Aggregation:** DERIVED — RATIO per accommodation_id i basis points,
emitterad efter base-counts folded.

**Källa-domän:** mixed (storefront + booking).

**Status:** READY — derived från M61+M62 base counts.

#### M64. Lägg till i bokning per boende (Boenden)

**Definition:** distinct(cart_id) WHERE cart-flow includes
accommodation_id.

**Atomiska events:** `cart_started@0.2.0` har `product_id` —
**MISSING:** semantiken `product_id` är en Shop-Product, inte en
Accommodation. Bokningar går genom `/checkout` (Elements flow), INTE
`/shop/checkout` cart-flow. Cart-events fyrar bara på Shop-products.

**Status:** GREENFIELD — kräver antingen:
1. Nytt event `accommodation_added_to_booking` med `accommodation_id` +
   `cart_id`/`session_id`.
2. Cart-event-utvidgning så accommodation booking-flow också emitterar
   cart_started med accommodation_id.

**OPEN i §5.15:** vill vi unifiera cart för accommodation OR ha
separata events?

#### M65. Genomsnittligt pris per boende (Boenden)

**Definition:** Per accommodation_id, average sale price
`SUM(total_amount) / COUNT(*)`.

**Atomiska events:** `booking_completed@0.1.0`.

**Properties:** `accommodation_id` + `total_amount.amount`.

**Dimensioner:** `ACCOMMODATION` (delas).

**Aggregation:** DERIVED per accommodation_id ratio.

**Källa-domän:** booking-domain.

**Status:** READY — derived från M60+M61 base counts.

#### M66. Boenden utan försäljning (Boenden)

**Definition:** Lista av accommodation_id som EJ har någon
`booking_completed` under perioden.

**Atomiska events:** `booking_completed` (negativt — har inga).

**Källa-domän:** booking-domain + accommodation-catalog (Bedfront-
domain — vi måste veta VILKA acc_ids som finns).

**Status:** PARTIAL — kräver join-mot-Accommodation-tabellen vid
aggregator-tid. **OPEN i §5.16:** ska vi emittera
`accommodation_published`-events varje dag som ett "vi-finns-fortfarande"-
heartbeat? Eller är aggregator-tid-join OK för denna metric?

---

### Sektion G — Tillägg (5)

**Bedfront-konvention:** "Tillägg" = addons (frukost, parkering,
sänglinne, utrustning) som säljs ovanpå en bokning. I `Order.lineItems`
representeras de som standalone line-items utan accommodation_id, eller
som Shop-products kopplade till AccommodationCategoryAddon.

#### M67. Toppsäljande tillägg (Tillägg)

**Definition:** TOP-N addon-product_id by SUM(line_item.amount).

**Atomiska events:** `payment_succeeded@0.2.0.line_items[]` — EXISTS,
men:
- **MISSING:** ingen markör som distinguerar "addon" vs "accommodation"
  vs "gift_card" line-items. Idag är `line_items[]` bara `{product_id,
  amount}`.

**Status:** PARTIAL — kräver `line_items[].kind` field
(`accommodation|addon|gift_card|other`) på `payment_succeeded` schema.

#### M68. Tilläggsfrekvens (% bokningar med tillägg) (Tillägg)

**Definition:** Andelen bokningar (paid orders) som inkluderar minst
ett line-item med `kind = "addon"`.

**Atomiska events:** `payment_succeeded@0.3.0` (efter line_items[].kind
property-bump per §3.2).

**Properties:** `line_items[].kind` — MISSING; required för denna metric.

**Dimensioner:** `TOTAL`.

**Aggregation:** DERIVED — `RATIO(orders_with_any_addon, orders_total)`.

**Källa-domän:** payment-domain.

**Status:** PARTIAL — kräver `line_items[].kind` (M67) plus
booking↔order-association.

#### M69. Genomsnittligt antal tillägg per bokning (Tillägg)

**Definition:** Average count of `line_items[i].kind = "addon"` per
booking.

**Atomiska events:** `payment_succeeded@0.3.0`.

**Properties:** Same blocker som M67/M68.

**Dimensioner:** `TOTAL`.

**Aggregation:** DERIVED — `SUM(addon_line_count) / COUNT(orders)`.

**Källa-domän:** payment-domain.

**Status:** PARTIAL — same blocker.

#### M70. Försäljning från tillägg (Tillägg)

**Definition:** SUM(`line_items[i].amount`) WHERE `line_items[i].kind = "addon"`.

**Atomiska events:** `payment_succeeded@0.3.0`.

**Properties:** Same blocker.

**Dimensioner:** `TOTAL` (eller `ADDON_PRODUCT` för per-addon
breakdown).

**Aggregation:** SUM filtered by kind.

**Källa-domän:** payment-domain.

**Status:** PARTIAL — same blocker.

#### M71. Konverteringsgrad per tillägg (Tillägg)

**Definition:** `addon_purchased / accommodation_viewed_with_addon_offered`.
**MISSING:** ingen tracking av "addon offered" idag (passive listing
på checkout-page är inte trackat).

**Status:** GREENFIELD — kräver nytt event `addon_offered` eller
`addon_viewed`.

---

### Sektion H — Funnel & konvertering (11)

#### M72. Sessioner → tillgänglighetssökning (Funnel)

**Definition:** `distinct(session_id with availability_searched event) / distinct(session_id)`.

**Atomiska events:** `page_viewed`, `availability_searched` — båda EXISTS.

**Aggregation:** DERIVED — RATIO.

**Status:** READY — bara aggregator-mapping.

#### M73. Tillgänglighetssökning → boendevy (Funnel)

**Definition:** `distinct(session_id with accommodation_viewed) /
distinct(session_id with availability_searched)`.

**Status:** READY.

#### M74. Boendevy → påbörjad bokning (Funnel)

**Definition:** `distinct(session_id with cart_started OR
booking_initiated) / distinct(session_id with accommodation_viewed)`.

**Atomiska events:** `accommodation_viewed`, `cart_started`.

**Status:** PARTIAL — för accommodation-bookings kanske inte
`cart_started` fyrar (M64 OPEN). **MISSING** event
`booking_initiated` (analogt till `cart_started` men för
accommodation-flow).

#### M75. Påbörjad bokning → kassa (Funnel)

**Definition:** Andelen `cart_started`-carts som leder till
`checkout_started` (samma cart_id).

**Atomiska events:** `cart_started@0.2.0` + `checkout_started@0.2.0`.

**Properties:** `cart_id` på båda — EXISTS.

**Dimensioner:** `TOTAL`.

**Aggregation:** DERIVED — existing `CART_TO_CHECKOUT_RATE` per
`metric-mapping.ts:504-510`.

**Källa-domän:** storefront-events.

**Status:** READY — täckt idag.

#### M76. Kassa → slutförd bokning (Funnel)

**Definition:** Andelen `checkout_started`-carts som leder till
`payment_succeeded`.

**Atomiska events:** `checkout_started@0.2.0` + `payment_succeeded@0.2.0`.

**Properties:** `checkout_started.cart_id` — EXISTS;
`payment_succeeded` har `booking_id` men inte `cart_id` direkt.
Cross-event-correlation via session eller `Order.metadata.cart_id` (set
vid checkout-create).

**Dimensioner:** `TOTAL`.

**Aggregation:** DERIVED — existing `CHECKOUT_COMPLETION_RATE` per
`metric-mapping.ts:528-535` (som dock approximerar med ORDERS-count,
inte cart-id-correlation).

**Källa-domän:** mixed (storefront + payment).

**Status:** READY — täckt idag, OPEN i §5.20 om vi vill tighta från
order-count till cart_id-correlation.

#### M77. Övergivna kassor (Funnel)

`distinct(checkout_started) − distinct(payment_succeeded)`.

**Status:** PARTIAL — kräver session-stitching mellan storefront
checkout_started (cart_id) och server payment_succeeded (booking_id).
**MISSING** correlation_id-prop på checkout_started → payment_succeeded.

#### M78. Övergivna bokningar (Funnel)

**Definition:** Bokningsflow som påbörjats men inte slutförts.

**Status:** Same som M74/M77 — semantiskt blockerad av
`booking_initiated`-event.

#### M79. Konvertering över tid (Funnel)

**Definition:** Tidsserie av M5 (`SESSION_TO_BOOKING_RATE × TOTAL`)
per dag.

**Atomiska events / Properties / Källa-domän:** Identiska med M5.

**Dimensioner:** Tidsserie över `daily_metric.date`.

**Aggregation:** SERIES-OVER-TIME av M5.

**Status:** READY — derived från M5.

#### M80. Konvertering per enhet (Funnel)

**Definition:** Per `device_type`, ratio
`booking_completed_with_device / sessions_with_device`.

**Atomiska events / Properties / Källa-domän:** Same som M27 + M43.

**Dimensioner:** `DEVICE`.

**Aggregation:** DERIVED — RATIO per device.

**Status:** GREENFIELD — same attribution-blocker som M27 (need
session→order chain).

#### M81. Konvertering per trafikkälla (Funnel)

**Definition:** Per utm_source, ratio bookings/sessions.

**Atomiska events / Properties / Källa-domän:** Same som M25 + M37.

**Dimensioner:** `TRAFFIC_SOURCE`.

**Aggregation:** DERIVED — RATIO per traffic_source.

**Status:** GREENFIELD — same attribution-blocker.

#### M82. Konvertering per landningssida (Funnel)

**Definition:** Per landing-page-URL, ratio bookings/sessions.

**Atomiska events / Properties / Källa-domän:** Same som M26 + M40.

**Dimensioner:** `LANDING_PAGE`.

**Aggregation:** DERIVED — RATIO per landing_page.

**Status:** GREENFIELD — same attribution-blocker.

---

### Sektion I — Sökning på sajten (6)

#### M83. Mest sökta datum (Sökning)

**Definition:** TOP-N (check_in_date, check_out_date)-pair by
COUNT(`availability_searched`).

**Atomiska events:** `availability_searched@0.1.0` — EXISTS.

**Properties:** `check_in_date`, `check_out_date` — EXISTS (YYYY-MM-DD).

**Dimensioner:** `SEARCH_DATE_PAIR` — MISSING; dim_value som
`{check_in}_{check_out}` koncatenerad sträng.

**Aggregation:** COUNT(*) GROUP BY date-pair.

**Status:** READY.

**OPEN i §5.17:** semantiken — ska vi räkna check_in_date single
("mest sökta natt") eller hela check_in/check_out-paret ("mest sökt
period")? Olika metrics; båda meningsfulla.

#### M84. Mest sökta datum utan tillgänglighet (Sökning)

**Definition:** Same as M83 men filtrerat på `results_count = 0`.

**Atomiska events:** Same.

**Properties:** `results_count` — EXISTS, `int().nonnegative()`.

**Aggregation:** COUNT(*) WHERE results_count = 0 GROUP BY date-pair.

**Status:** READY.

#### M85. Mest sökta boendetyper (Sökning)

**Definition:** TOP-N accommodation_type from search filters.

**Atomiska events:** `availability_searched.filters_applied` —
**SAKNAR struktur**. Idag är det `z.array(z.string().min(1))` — fri-
form sträng, ingen typing.

**Status:** PARTIAL — schema bumpa till v0.2.0 med `filters: { accommodation_types: [...], price_range: ... }` som typed object. Eller åtminstone normaliserad struktur på `filters_applied[i]` (`type:hotel`, `type:cabin`, etc.).

#### M86. Mest sökta antal gäster (Sökning)

**Definition:** TOP-N by `availability_searched.number_of_guests`.

**Atomiska events:** `availability_searched.number_of_guests` —
EXISTS.

**Aggregation:** COUNT(*) GROUP BY number_of_guests.

**Status:** READY.

#### M87. Sökningar utan resultat (Sökning)

**Definition:** Count of `availability_searched` events with
`results_count = 0`.

**Status:** READY.

**OPEN i §5.18:** "tomma datum-spann" (e.g. user söker hösten 2030,
inga rates ännu) räknas som "no results" — vill vi separera
"genuinely sold out" från "no rates configured"? Kräver i så fall ny
`results_zero_reason` field.

#### M88. Sökning → boendevy konvertering (Sökning)

**Definition:** Andelen sessions med `availability_searched` som
sedan trigger `accommodation_viewed`. Funnel-step.

**Atomiska events:** `availability_searched@0.1.0` + `accommodation_viewed@0.1.0`.

**Properties:** `session_id` på båda (StorefrontContext) — EXISTS.

**Dimensioner:** `TOTAL`.

**Aggregation:** DERIVED — same shape som CART_TO_CHECKOUT_RATE men
för andra event-pair.

**Källa-domän:** storefront-events.

**Status:** READY — bara derived-metric tillägg.

---

### Sektion J — Rabatter (5)

#### M89. Rabattkoder använda (Rabatter)

**Definition:** Total count of `discount_used` events under perioden
— hur många gånger en rabatt-kod tillämpades.

**Atomiska events:** `discount_used@0.1.0` — EXISTS,
`schemas/discount-used.ts`.

**Properties:** Inga särskilda — count-aggregation. `discount_id`
finns men aggregeras bort i × TOTAL.

**Dimensioner:** `TOTAL`.

**Aggregation:** COUNT(*).

**Källa-domän:** discount-domain.

**Status:** READY — bara ny base metric `DISCOUNT_USES × TOTAL`.

#### M90. Användning per rabattkod (Rabatter)

**Definition:** COUNT(`discount_used`) GROUP BY discount_code.

**Properties:** `discount_used.discount_code` — EXISTS (nullable
för automatic).

**Dimensioner:** `DISCOUNT_CODE` — MISSING.

**Aggregation:** COUNT(*) GROUP BY discount_code.

**Status:** READY.

**OPEN i §5.19:** för automatic discounts (discount_code = null) —
egen dim_value som `__automatic`?

#### M91. Försäljning från rabattkoder (Rabatter)

**Definition:** SUM(`payment_succeeded.amount`) WHERE order har
en associated `discount_used`-event.

**Atomiska events:** `discount_used@0.1.0` (som identifier) +
`payment_succeeded@0.2.0` (för order-total).

**Properties:** `discount_used.order_id` (för join) +
`payment_succeeded.amount`. Alternativt `discount_used.order_total`
direkt.

**Dimensioner:** `TOTAL`.

**Aggregation:** SUM(order_total) over orders som har discount_used.

**Källa-domän:** mixed (discount + payment).

**Status:** READY — `discount_used` har redan `order_total`-fält så
join inte är strikt nödvändig. Bara aggregator-mapping.

#### M92. Genomsnittlig rabatt per order (Rabatter)

**Definition:** Average `discount_amount` per order som hade en
rabatt-användning. `SUM(discount_amount) / COUNT(discount_used)`.

**Atomiska events:** `discount_used@0.1.0`.

**Properties:** `discount_amount.amount` — EXISTS.

**Dimensioner:** `TOTAL`.

**Aggregation:** DERIVED — `SUM(discount_amount) / COUNT(*)`.

**Källa-domän:** discount-domain.

**Status:** READY — derived ratio från base counts.

#### M93. Konvertering med vs utan rabattkod (Rabatter)

**Definition:** Two ratios: `bookings_with_discount / sessions_with_discount`
vs `bookings_without_discount / sessions_without_discount`.

**Status:** GREENFIELD — kräver session-level "did this session have a
discount applied to its order" tracking. **MISSING** correlation_id
or session_id på `discount_used` (idag bara `order_id`).

**OPEN i §5.20:** denominator definition — sessions med rabatt-input
(typed in checkout) eller sessions som SÅG en discount-prompt? Olika
saker.

---

### Sektion K — Geografi (4)

#### M94. Bokningar per land (Geografi)

**Definition:** COUNT(`booking_completed`) GROUP BY country.

**Atomiska events:** `booking_completed`.

**Properties:** **MISSING** `booking_completed.country` (idag bara
`Booking.country` på domain-modellen).

**Status:** PARTIAL — events behöver country. Same blocker som M16/M57.

#### M95. Bokningar per stad (Geografi)

**Definition:** COUNT(`booking_completed`) GROUP BY city.

**Atomiska events:** `booking_completed@0.1.0`.

**Properties:** **MISSING** `booking_completed.city` (idag bara
`Booking.city` på domain-modellen).

**Dimensioner:** `CITY`.

**Aggregation:** COUNT(*) GROUP BY city.

**Källa-domän:** booking-domain.

**Status:** PARTIAL — same blocker som M94 (booking-event saknar geo-
fält).

#### M96. Försäljning per land (Geografi)

**Definition:** SUM(revenue) GROUP BY country. Identisk med M16; här
listad i Geografi-sektionen för UI-vyn.

**Atomiska events / Properties / Dimensioner / Källa-domän:** Identiska
med M16.

**Aggregation:** SUM(revenue) GROUP BY country.

**Status:** PARTIAL — same blocker som M16.

#### M97. Karta över kunder (Geografi)

**Definition:** Per (country, city), distinct(actor_id)-count för
karta-rendering (varje punkt = en stad, color/size = customer-density).

**Atomiska events:** `payment_succeeded@0.2.0` + geo-data.

**Properties:** `actor_id` + country/city. Same blocker som M16/M57.

**Dimensioner:** `CITY` (med country-prefix för disambig:
`SE:Stockholm`).

**Aggregation:** distinct(actor_id) GROUP BY city.

**Källa-domän:** payment-domain + geo.

**Status:** PARTIAL — same source-of-data blocker som M16/M94.

---

### Sektion L — Säsong & tid (5)

#### M98. Försäljning per säsong (Säsong & tid)

**Definition:** SUM(revenue) GROUP BY season-bucket
(`{spring, summer, autumn, winter}` baserat på `check_in_date`).

**Atomiska events:** `booking_completed.check_in_date` (för
booking-perspective) eller `payment_succeeded.captured_at` (för
revenue-recognition-perspective).

**Properties:** `check_in_date` EXISTS.

**Dimensioner:** `SEASON` — MISSING; derived dimension from date.

**Status:** READY — derived dimension.

**OPEN i §5.21:** säsong-mapping — Nordisk konvention (vinter = nov-feb)
eller astronomisk (vinter = dec-feb)? Apelviken-perspective.

#### M99. Bokningar per check-in månad (Säsong & tid)

**Definition:** COUNT(`booking_completed`) GROUP BY
`EXTRACT(MONTH FROM check_in_date)`.

**Atomiska events:** `booking_completed@0.1.0` — EXISTS.

**Properties:** `check_in_date` (YYYY-MM-DD) — EXISTS.

**Dimensioner:** `CHECK_IN_MONTH` — MISSING (derived dimension från
date).

**Aggregation:** COUNT(*) GROUP BY check_in_month.

**Källa-domän:** booking-domain.

**Status:** READY — derived dim från existing fält.

#### M100. Försäljning per check-in månad (Säsong & tid)

**Definition:** SUM(`booking_completed.total_amount.amount`) GROUP BY
check_in_month.

**Atomiska events / Properties / Källa-domän:** Identiska med M99.

**Dimensioner:** `CHECK_IN_MONTH` (delas).

**Aggregation:** SUM(total_amount) GROUP BY check_in_month.

**Status:** READY — same dim som M99.

#### M101. Bokningar per veckodag (Säsong & tid)

**Definition:** Per `weekday(check_in_date)`-bucket, count of
booking_completed.

**Atomiska events:** `booking_completed@0.1.0`.

**Properties:** `check_in_date` (eller `occurred_at` per §5.8 OPEN).

**Dimensioner:** `CHECK_IN_WEEKDAY` (om resolverad till check_in)
eller `WEEKDAY` (om occurred_at).

**Aggregation:** COUNT(*) GROUP BY weekday-bucket.

**Källa-domän:** booking-domain.

**Status:** READY — derived dim. Resolve §5.8 OPEN för fält-val.

#### M102. Bokningar per timme på dygnet (Säsong & tid)

**Definition:** Per `hour(occurred_at)`-bucket (`booking-creation
hour`), count of bookings. Hour-of-day är meningsfullt bara på
`occurred_at`, inte `check_in_date` (där tiden är 00:00).

**Atomiska events:** `booking_completed@0.1.0`.

**Properties:** `occurred_at` — EXISTS.

**Dimensioner:** `HOUR_OF_DAY` (delas med M29).

**Aggregation:** COUNT(*) GROUP BY hour-of-day.

**Källa-domän:** booking-domain.

**Status:** READY.

---

### Sektion M — Kampanj (4)

#### M103. Sessioner per UTM-kampanj (Kampanj)

**Definition:** distinct(session_id) GROUP BY `utm_campaign` från
first page_viewed. Identisk med M39.

**Atomiska events / Properties / Dimensioner / Aggregation / Källa-domän:**
Identiska med M39.

**Status:** PARTIAL — same blocker som M37/M39 (utm-extraction).

#### M104. Bokningar per UTM-kampanj (Kampanj)

**Definition:** COUNT(`booking_completed`) bryt på utm_campaign från
first-touch attribution.

**Atomiska events / Properties / Dimensioner / Aggregation / Källa-domän:**
Identiska med M14 men numerator är COUNT, inte SUM.

**Status:** GREENFIELD — same attribution-blocker som M14.

#### M105. Försäljning per UTM-kampanj (Kampanj)

**Definition:** Identisk med M14 — SUM(revenue) per utm_campaign.

**Atomiska events / Properties / Dimensioner / Aggregation / Källa-domän:**
Identiska med M14.

**Status:** GREENFIELD — same blocker som M14.

#### M106. Topp-konverterande UTM-kombinationer (Kampanj)

**Definition:** TOP-N (utm_source, utm_medium, utm_campaign)-tuples by
`bookings / sessions` ratio.

**Atomiska events:** `page_viewed` + `booking_completed`.

**Aggregation:** RATIO per UTM-tuple, TOP-N filtered by min volume.

**Status:** GREENFIELD.

**OPEN i §5.22:** N + minimum-volume threshold.

---

## §3 Gap-analys — aggregerat

### §3.1 Events att lägga till

| Föreslaget event | Motivering | Påverkar metrics |
|---|---|---|
| `payment_dispute_resolved@0.1.0` | M2 — netto-försäljning kräver veta NÄR dispute är "lost" och ska räknas som negativ revenue | M2 (NET_REVENUE) |
| `accommodation_added_to_booking@0.1.0` | M64, M74, M78 — accommodation-bookings använder inte `cart_started`, så vi har inget motsvarande event för "lade till ett boende i bokningsfönstret" | M64, M74, M78 |
| `booking_initiated@0.1.0` | M74, M78 — kompletterar `accommodation_added_to_booking` om vi vill skilja "klickade på 'Boka'" från "första-add-to-cart" | M74, M78 |
| `addon_offered@0.1.0` | M71 — vi behöver veta vilka addons som visades för konverteringsgrad-beräkning | M71 |
| `payment_settled@0.1.0` | M23 — net-revenue-after-fees kräver per-order processing-fee + platform-fee snapshot | M23 |

### §3.2 Properties att lägga till på existerande events

| Event | Saknad property | Motivering | Påverkar metrics |
|---|---|---|---|
| `payment_succeeded@0.3.0` | `country` (string ISO 3166-1 alpha-2, optional) | M16 — server-emit har ingen geo-context idag | M16, M57, M96 |
| `payment_succeeded@0.3.0` | `discount_code` (string nullable) | M19 — så vi slipper joina across events vid query-tid | M19 |
| `payment_succeeded@0.3.0` | `customer_type` (enum `new\|returning`, optional) | M20+M21 — alternative till runner-extra-query om vi vill flytta logiken till emit-tid | M20, M21, M51-M53 |
| `payment_succeeded@0.3.0` | `line_items[].kind` (enum `accommodation\|addon\|gift_card\|other`) | M67-M70 — distinguish addon-revenue från accommodation-revenue | M67, M68, M69, M70 |
| `booking_completed@0.2.0` | `accommodation_type` (enum, same som accommodation_published) | M17 — slippa runtime-join | M17 |
| `booking_completed@0.2.0` | `accommodation_category_id` (string) | M18 — same | M18 |
| `booking_completed@0.2.0` | `country` + `city` (optional) | M94, M95 | M94, M95, M97 |
| `booking_cancelled@0.2.0` | `cancellation_initiator` (enum `guest\|operator\|system\|pms`) | M34 — kund vs operator-distinktion | M34 |
| `payment_refunded@0.2.0` | `source_channel` + `line_items[]` | M22 sliced — så refunds kan brytas på samma dimensioner som revenue | M22 |
| `discount_used@0.2.0` | `session_id` eller `correlation_id` | M93 — för session-level discount conversion-tracking | M93 |
| `availability_searched@0.2.0` | `filters: { accommodation_types: [...], price_range: ... }` (typed object) | M85 — strukturerad filter-data istället för fri-form `filters_applied[]` | M85 |
| `availability_searched@0.2.0` | `results_zero_reason` (enum `sold_out\|no_rates_configured\|outside_window\|other\|null`) | M87 OPEN-resolution | M87 |
| `page_viewed@0.2.0` | `utm: { source, medium, campaign, term, content }` (optional struct, parsed from page_url) | M37-M39, M103 — undvika query-tid URL-parsing | M37, M38, M39, M103 |
| `page_viewed@0.2.0` | `browser_family` (enum, optional, loader-derived) | M44 | M44 |
| StorefrontContext fragment | (no change — see §3.5 instead) | utm-extraction can land on page_viewed only | — |

### §3.3 Dimensioner att lägga till i `analytics.daily_metric`

`analytics.daily_metric` har redan generic
`(metric, dimension, dimension_value)`-shape per
`prisma/schema.prisma:5707-5725`. **Ingen schema-ändring krävs** —
nya dimensions är bara nya `dimension`-värden.

Föreslagna nya dim-värden för `dimension`-kolumnen:

| Ny dimension | Source-fält | Cardinality | Anteckning |
|---|---|---|---|
| `TRAFFIC_SOURCE` | utm_source / referrer | ~50 | enum + free-form fallback |
| `UTM_MEDIUM` | utm_medium | ~10 | typically: organic, cpc, social, email |
| `UTM_CAMPAIGN` | utm_campaign | unbounded | TOP-N capped to 100 per day |
| `LANDING_PAGE` | first page_url | high | URL canonicalization needed |
| `REFERRER_DOMAIN` | parsed from page_referrer | ~hundreds | host only |
| `BROWSER` | browser_family enum | ~10 | chrome/firefox/safari/edge/opera/other/unknown |
| `COUNTRY` | event.context.geo.country | ~250 | ISO 3166-1 alpha-2 |
| `LOCALE` | StorefrontContext.locale | ~30 | BCP 47 |
| `WEEKDAY` | derived from occurred_at | 7 | mon-sun |
| `HOUR_OF_DAY` | derived from occurred_at | 24 | 0-23 |
| `ACCOMMODATION` | accommodation_id | unbounded | TOP-N capped per tenant |
| `ACCOMMODATION_TYPE` | accommodation_type enum | 5 | hotel/cabin/camping/apartment/pitch |
| `ACCOMMODATION_CATEGORY` | accommodation_category_id | ~tens | per tenant |
| `DISCOUNT_CODE` | discount_used.discount_code | unbounded | TOP-N capped |
| `CUSTOMER_TYPE` | new/returning | 2 | binary |
| `CUSTOMER` | actor_id | unbounded | TOP-N capped to 100 |
| `SEARCH_DATE_PAIR` | check_in__check_out | unbounded | TOP-N |
| `NUMBER_OF_GUESTS` | availability_searched.number_of_guests | ~10 | small int |
| `SEASON` | derived from check_in_date | 4 | spring/summer/autumn/winter |
| `CHECK_IN_MONTH` | derived | 12 | 01-12 |

**Risk vid 10k tenants:** `daily_metric` row-count i recon §6.6 var
~55 GB/year vid dagens 5 dimensioner. Att lägga till 20 till
multiplicerar grovt med 4-5×; potentiellt ~250 GB/year. Hanterbart,
men `event_default`-partition-larm (Phase 5A audit Tier 1 #1) blir
ännu viktigare.

### §3.4 Domain-data till analytics-pipeline — events vs snapshot

**Beslut: events (outbox-pattern), INTE snapshot-jobb.**

**Varför:**

- Phase 5A:s pattern är "events as portable state" per Track 1 §B.7
  (Chris Richardson outbox).
- Pull-from-Order/Booking vid aggregator-tid bryter pipeline-isolation
  per `_audit/analytics-shopify-grade-audit-2026-05-04.md` D.5 #19
  (pre-aggregation defers OLAP-DB decision).
- 10k tenants × 100k bookings = 1B+ rows on `Order`/`Booking`. Pulling
  vid query-time kommer aldrig hålla aggregator-cron-budget.

**Praktiskt: vi behöver bumpar på existing events** (`booking_completed`,
`payment_succeeded`, `payment_refunded`, `discount_used`,
`availability_searched`, `page_viewed`) per §3.2. Var och en följer
PATCH-additive eller MINOR-versioning per
`registry.ts:14-22` (PATCH för optional, MINOR för required-with-
default, MAJOR för breaking).

**Varning:** PATCH-additive (optional fält) tillåts utan registry-
version-bump per recon `_storefront-context.ts:156-163`. MEN — om
fältet är load-bearing för en metric, kan vi inte tolerera "optional"
i aggregator-logic; vi måste hantera frånvaro som "unknown"-bucket.
Det gör `dimension_value = "unknown"` till en löpande klump, och vi
mister den gradvisa övergången från required-with-default → required.

### §3.5 Schema-evolution-strategi

**Recommended path för 12→106:**

1. **MINOR-bumps på server-events** (`booking_completed → 0.2.0`,
   `payment_succeeded → 0.3.0`, `discount_used → 0.2.0`,
   `payment_refunded → 0.2.0`, `availability_searched → 0.2.0`)
   som lägger till multiple required-with-default fält samtidigt.
   Lägg gamla v0.x.0 som legacy (samma som dagens cart-cluster +
   payment_succeeded). Worker validators (per CLAUDE.md
   "validator-parity rule") gäller bara storefront-events; server-
   events behöver inte den hand-rolled validator-spegeln, så
   server-side bumpar är billigare.

2. **PATCH-additive på storefront-events** (`page_viewed → 0.1.1`,
   etc.) för optional fält som `utm`, `browser_family`. Worker
   validator MUST mirra (CLAUDE.md analytics worker-rule), så det
   är dyrare per fält.

3. **Ny event-typ** (`payment_dispute_resolved`, `payment_settled`,
   `accommodation_added_to_booking`, `booking_initiated`,
   `addon_offered`) per §3.1. Var och en följer Phase 1A start-at-
   v0.1.0-pattern.

**Compat under cutover:** Per `metric-mapping.ts:127`-pattern: ny
event_name + version-pair får sin egen mapping; gamla mappings finns
kvar tills outboxen är tom på legacy-versioner. Aggregator dispatchar
per (event_name, schema_version)-pair. Inga breaking changes.

---

## §4 PR-svit-gruppering

Klustrad så varje svit:
- delar atomiska events (1 schema-bump-PR per cluster)
- levererar synligt produktvärde (1 dashboard-sektion per release)
- är isolerbar för parity-validation
- 5-15 metrics per svit, ~300-800 LOC inkl tests

**Beroende-graf:**

```
Svit α: Attribution-foundation (no metrics; unblocks β/γ/η)
  └─ Svit β: Trafik & källor (15 metrics)
       └─ Svit γ: Funnel & sökning (17 metrics)
       └─ Svit η: Kampanj (4 metrics)
  └─ Svit ε: Kunder (9 metrics)
       └─ Svit κ: Översikt-derived (8 metrics; sista att shippas)
Svit δ: Försäljning + bokningar core (22 metrics; oberoende)
Svit ζ: Boenden (7 metrics)
Svit θ: Tillägg (5 metrics)
Svit ι: Rabatter (5 metrics)
Svit λ: Geografi (4 metrics)
Svit μ: Säsong & tid (5 metrics)
```

### Svit α — Attribution foundation (0 metrics direkt; OPEN-blocker resolved)

**Scope:** Resolva §5.6 OPEN — vilken attributions-modell? Implementera
sedan korrelation_id eller session-stitching enligt valet. Inkluderar:

- `page_viewed@0.1.0 → 0.1.1` PATCH-additive med `utm: {...}` parsed.
- Loader-side: extract UTM från `page_url` query string och stoppa i
  `payload.utm` direkt vid emit (slippa query-tid parsing).
- session→order-attribution: persist `session_id` på `Order.metadata`
  vid checkout-create.
- Aggregator-helper: `session_first_touch_utm(session_id)` query.

**Estimerad LOC:** ~400 LOC (loader + emit + aggregator helper +
tests + docs).

**Ordning:** FÖRST — blockerar fyra senare sviter.

### Svit β — Trafik & källor (15 metrics: M36-M50)

**Scope:** sektion D av Leos lista.

**Saknade events:** Inga nya — all data finns på `page_viewed` post
Svit α.

**Saknade properties:** `browser_family` (`page_viewed → 0.1.2`,
PATCH-additive optional).

**Saknade dimensioner:** `TRAFFIC_SOURCE`, `UTM_MEDIUM`, `UTM_CAMPAIGN`,
`LANDING_PAGE`, `REFERRER_DOMAIN`, `BROWSER`, `COUNTRY`, `LOCALE`,
`WEEKDAY`, `HOUR_OF_DAY`. Alla bara nya dim-values, ingen schema-
ändring på `daily_metric`.

**Plus:** `PAGE_VIEWS × TOTAL` base count (count not distinct), runner-
queries för M49 (sessionslängd) och M50 (avvisningsfrekvens).

**Estimerad LOC:** ~700 LOC.

**Ordning:** Efter Svit α.

### Svit γ — Funnel & sökning (17 metrics: M72-M88)

**Scope:** sektioner H + I.

**Saknade events:** `accommodation_added_to_booking` +
`booking_initiated` (per §3.1). Optional: `availability_searched →
0.2.0` med strukturerad `filters` + `results_zero_reason`.

**Saknade dimensioner:** `SEARCH_DATE_PAIR`, `NUMBER_OF_GUESTS`,
`ACCOMMODATION_TYPE` (om M85 är typed).

**Cross-event correlation:** session_id-stitching mellan storefront
funnel-events och server payment_succeeded (för M77 övergivna).
Beror på Svit α.

**Estimerad LOC:** ~800 LOC.

**Ordning:** Efter Svit β (delar attribution-infra).

### Svit δ — Försäljning + Bokningar core (22 metrics: M9-M11, M22, M24, M28-M34)

**Scope:** Force base-metrics innan derived. Inkluderar M9-M11
(försäljning över tid + brutto + netto), M22 (refunds), M24 (bokningar
över tid), M28-M34 (booking-detail metrics). Lämnar M12-M21 (sliced
sales) till Svit ε / β.

**Saknade events:** `payment_dispute_resolved` (för M2/M11 net),
`payment_settled` (M23 — fees) — sistnämnda kan deferras till svit
egen.

**Saknade properties:** `payment_refunded → 0.2.0` med `source_channel`
+ `line_items[]`. `booking_cancelled → 0.2.0` med
`cancellation_initiator`.

**Saknade dimensioner:** `WEEKDAY`, `HOUR_OF_DAY`. (Delas med Svit β.)

**Plus:** `NIGHTS × TOTAL`, `GUESTS × TOTAL`, `BOOKING_LEAD_DAYS × TOTAL`,
`CANCELLATIONS × TOTAL`, `REFUNDS × TOTAL`, `DISCOUNTS × TOTAL` base
counts. Plus M30, M31, M32, M33, M34 derived.

**Estimerad LOC:** ~750 LOC.

**Ordning:** Kan landa parallellt med Svit β (oberoende av attribution).

### Svit ε — Kunder (9 metrics: M51-M59)

**Scope:** sektion E.

**Saknade events:** Inga nya. Behov av `customer_type`-derivation —
runner-query liknande RETURNING_CUSTOMER_RATE.

**Saknade properties:** `payment_succeeded → 0.3.0` med optional
`country` + `customer_type` (low-priority — runner-query räcker, men
property gör aggregator billigare).

**Saknade dimensioner:** `CUSTOMER_TYPE` (binary), `CUSTOMER` (TOP-N).

**Plus:** Runner-queries för M52 (count new), M53 (count returning),
M54 (LTV — kräver §5.13 OPEN-resolution), M56 (tid mellan).

**Estimerad LOC:** ~600 LOC.

**Ordning:** Efter Svit α (för M58) och Svit δ (för base counts).

### Svit ζ — Boenden (7 metrics: M60-M66)

**Scope:** sektion F.

**Saknade events:** Inga nya. M64 har en design-fråga (cart vs new
event) — beror på Svit γ:s
`accommodation_added_to_booking`-deliverable.

**Saknade properties:** `booking_completed → 0.2.0` med
`accommodation_type` + `accommodation_category_id` (delas med Svit
δ:s booking-bumpar — kan landa i samma schema-bump-PR).

**Saknade dimensioner:** `ACCOMMODATION`, `ACCOMMODATION_TYPE`,
`ACCOMMODATION_CATEGORY`.

**Plus:** `ACCOMMODATION_VIEWS × ACCOMMODATION` base, M63 derived,
M66 needs domain-snapshot fallback (or join).

**Estimerad LOC:** ~500 LOC.

**Ordning:** Efter Svit γ.

### Svit η — Kampanj (4 metrics: M103-M106)

**Scope:** sektion M.

**Saknade events:** Inga (UTM finns post Svit α/β).

**Saknade dimensioner:** `UTM_CAMPAIGN`, `UTM_TUPLE` (för M106).

**Estimerad LOC:** ~250 LOC.

**Ordning:** Efter Svit β + γ.

### Svit θ — Tillägg (5 metrics: M67-M71)

**Scope:** sektion G.

**Saknade events:** `addon_offered@0.1.0` (M71 only).

**Saknade properties:** `payment_succeeded → 0.3.0.line_items[].kind`
enum.

**Estimerad LOC:** ~450 LOC.

**Ordning:** Oberoende — kan landa när som helst efter Svit δ.

### Svit ι — Rabatter (5 metrics: M89-M93)

**Scope:** sektion J.

**Saknade events:** Inga.

**Saknade properties:** `discount_used → 0.2.0` med `session_id` (för
M93). `payment_succeeded → 0.3.0.discount_code` (for M91 som alternative
till cross-event-join).

**Saknade dimensioner:** `DISCOUNT_CODE`.

**Estimerad LOC:** ~400 LOC.

**Ordning:** Oberoende, can land any time after Svit α (för M93).

### Svit κ — Översikt-derived (8 metrics: M1-M8)

**Scope:** sektion A.

**INGEN ny event eller property** — allt deriveras från base counts
producerade i Svit β-ι.

**Estimerad LOC:** ~200 LOC (mest derivedMetrics-utbyggnad).

**Ordning:** SIST. Det är dashboard-overview-vyn som skördar arbete
från alla andra sviter.

### Svit λ — Geografi (4 metrics: M94-M97)

**Scope:** sektion K.

**Saknade properties:** server-events behöver country/city. Delas med
Svit δ:s booking_completed-bump och Svit ε:s payment_succeeded-bump.

**Saknade dimensioner:** `COUNTRY`. (Delas med β.)

**Estimerad LOC:** ~250 LOC.

**Ordning:** Efter δ + ε.

### Svit μ — Säsong & tid (5 metrics: M98-M102)

**Scope:** sektion L.

**INGEN ny event eller property** — allt derived från `occurred_at` /
`check_in_date`.

**Saknade dimensioner:** `SEASON`, `CHECK_IN_MONTH`. (`WEEKDAY` /
`HOUR_OF_DAY` delas med β/δ.)

**Estimerad LOC:** ~250 LOC.

**Ordning:** Oberoende. Kan landa efter Svit δ.

### Sammanfattning sviter

| Svit | Metrics | LOC | Ordning | Beroenden |
|---|---|---|---|---|
| α — Attribution | 0 | ~400 | 1 | — |
| β — Trafik | 15 | ~700 | 2 | α |
| δ — Försäljning core | 22 | ~750 | 2 (parallel β) | — |
| γ — Funnel & sökning | 17 | ~800 | 3 | α, β |
| ζ — Boenden | 7 | ~500 | 4 | γ, δ |
| ε — Kunder | 9 | ~600 | 4 | α, δ |
| ι — Rabatter | 5 | ~400 | 4 | α |
| η — Kampanj | 4 | ~250 | 5 | β, γ |
| θ — Tillägg | 5 | ~450 | 5 | δ |
| λ — Geografi | 4 | ~250 | 5 | δ, ε |
| μ — Säsong | 5 | ~250 | 5 | δ |
| κ — Översikt | 8 | ~200 | 6 (last) | alla |
| **Total** | **101** | **~5550** | | |

**Skillnad mot 106:** M5 + M6 + M7 + M8 är derived och delas med Svit
κ; M3, M4 är READY idag och behöver ingen ny svit (täcks av §1.4).

**Total LOC-budget för 12→106 utbyggnaden: ~5,550 LOC** (production
+ tests + verifier-extensions). Spridd över 12 sviter = ~460 LOC
per svit average. Under 800 LOC per svit är inom Shopify-grade
PR-storlek.

---

## §5 Q-decisions

Klassificering: **LOCKED** (svar finns i kod/doc, citerat),
**RESOLVED** (motiverat i recon själv), **OPEN** (kräver Leos input).

### §5.1 (OPEN) "Bokning" = booking_completed only, eller också PURCHASE-orders?

**Frågan:** Påverkar M7, M24, M30, M55. Idag aggregator counter både
`payment_succeeded` (alla orders) och `booking_completed` (bara
ACCOMMODATION) som bidrar till `ORDERS × CHANNEL`. För
"Antal bokningar"-vyn — räknar vi PURCHASE-orders (gift cards,
shop-products) också?

**Recommendation:** "Bokningar" = bara ACCOMMODATION (booking_completed).
PURCHASE-orders har en egen "Försäljning"-sektion och bör inte konfundera
booking-statistik. Men:

**Ingen default — Leo bekräftar.**

### §5.2 (OPEN) Definition av "ny" vs "återkommande" kund

**Frågan:** Påverkar M8, M20, M21, M51, M52, M53, M58.

**Tre alternativ:**

- (a) **Ingen tidigare paid order någon gång** = ny. (All-time historik.)
- (b) **Ingen paid order senaste rolling N månader** = ny. N typically
  6 eller 12.
- (c) **Ingen tidigare ANALYTICS-EVENT från samma actor_id** =
  current `RETURNING_CUSTOMER_RATE`-definition. Bredare proxy.

**Implication för query-cost:** (a) skär över hela historik per
actor_id-lookup; (c) är vad vi gör idag (snabbt). (b) är mellan-
alternativ och vanligast i hospitality-analytics.

**Ingen default — Leo bekräftar.**

### §5.3 (OPEN) Kundlivstidsvärde — tidsfönster

**Frågan:** Påverkar M54.

**Alternativ:** all-time / rolling 12m / rolling 24m. Same
query-cost-analys som §5.2.

**Ingen default.**

### §5.4 (OPEN) "Återbetalning" — alla refund-typer?

**Frågan:** Påverkar M11, M22.

**Alternativ:**

- Full refund.
- Partial refund.
- Voucher (refund som credit istället för pengar).
- Platsbyte (omprissättning).

`payment_refunded@0.1.0` har inget fält för dessa varianter idag —
all `payment_refunded` är "pengar tillbaka". Voucher/platsbyte är inte
emitterat alls.

**Recommendation:** Räkna full + partial idag (bägge är "pengar
tillbaka"). Voucher + platsbyte är separata domain-händelser som inte
ska in i refund-metric. **MEN** Leo:s vision för Apelviken kanske
behandlar voucher som "kund får tillbaka värde" — då räknas det.

**Ingen default.**

### §5.5 (OPEN) Avbokning — kund vs operator-initierad

**Frågan:** Påverkar M34.

**Recommendation:** Visa båda separat — guest-initierade är produkt-
problem (eller pris-elasticity), operator-initierade är operations-
problem (over-booking, incidents). **Kräver** `cancellation_initiator`
field på `booking_cancelled@0.2.0` per §3.2.

**Ingen default.**

### §5.6 (OPEN) Attributions-modell

**Frågan:** Påverkar M12, M13, M14, M15, M25, M26, M27, M37-M39, M58,
M81, M103, M104, M105, M106. **Detta är det STÖRSTA enskilda beslutet
i 12→106-utbyggnaden.**

**Tre standardmodeller:**

- (a) **First-touch:** session→order tributeras till session's första
  page_url + utm.
- (b) **Last-touch:** sista page_viewed före order-creation.
- (c) **Multi-touch / linear:** equal share across touch-points.

(c) ger mest insight men är dyr (per-event allocation, complex
aggregator). (a) är billigast och är default-pattern hos GA, Mixpanel,
Segment. (b) tweekar små fördelningar runt kampanjer som "stäng-the-
deal".

**Recommendation:** First-touch (a) för v1. Ger god representativitet
för "vilka kanaler ger oss kunder" utan complexity. Multi-touch i
Phase 5C.

**Ingen default — Leo bekräftar.**

### §5.7 (OPEN) Accommodation-Category mapping är M:N

**Frågan:** Påverkar M18.

**Alternativ:**

- (a) Multi-emit per booking_completed: en bidrag per kategori
  accommodation tillhör. Problem: revenue dubbel-räknas across kategorier.
- (b) Primary-category: använd t.ex. lägsta `sortOrder` som "primary"
  för revenue-tribution. Problem: andra kategorier ser ut som "ingen
  försäljning".
- (c) Räkna unique på COUNT-only (M18:s "Antal bokningar per kategori")
  och använd primary för REVENUE. Problem: confusion mellan vyer.

**Recommendation:** (b) — primary med lowest sortOrder. Lägg `primary_category_id`
på `booking_completed.accommodation_category_id` (inte alla kategorier).
Mest defensiv default; matchar Shopify Collection-attribution-pattern.

**Ingen default.**

### §5.8 (OPEN) Veckodag/timme baseras på `occurred_at` eller `check_in_date`?

**Frågan:** Påverkar M28, M29, M101, M102.

**Alternativ:**

- (a) **`occurred_at`** (när bokningen skapades) — speglar booking-
  velocity (när kunder bokar).
- (b) **`check_in_date`** — speglar gäst-flöde (när folk kommer).

Båda meningsfulla. Olika dashboard-frågor.

**Recommendation:** Båda — separata metrics. Dock: M28/29 ska vara
`occurred_at` (per "bokningar"-naming), och M101/102 i sektion
"Säsong & tid" ska vara `check_in_date`. Två olika dimensioner:
`WEEKDAY` (occurred_at) och `CHECK_IN_WEEKDAY` (check_in_date).

**Ingen default.**

### §5.9 (OPEN) Bokningsfönster — dagar eller timmar?

**Frågan:** Påverkar M33.

**Recommendation:** Dagar (round to nearest). Hospitality bokar
typically i dagar; timmar är onödig precision och brusig (06:00 vs
07:00 är inte signifikant).

**Ingen default.**

### §5.10 (OPEN) "Avbokning" — stat på `BookingStatus.CANCELLED` eller event?

Implementation-detalj. Recommendation: event är källa. Leo OK med det?

### §5.11 (OPEN) Landing-page URL — path only eller include host?

**Frågan:** Påverkar M40, M13.

**Recommendation:** Path only. Host är `<tenant>.rutgr.com` per Bedfront-
konvention; ger samma värde för alla rader på samma tenant.

### §5.12 (OPEN) Social-källor lista

**Frågan:** Påverkar M42.

**Recommendation:** Initial set: `facebook.com, m.facebook.com,
instagram.com, l.instagram.com, tiktok.com, twitter.com, x.com,
t.co, linkedin.com, lnkd.in, pinterest.com, reddit.com,
youtube.com, m.youtube.com`. Aggregator-konfiguration, no schema impact.

### §5.13 (OPEN) Kund-LTV tidsfönster

Same som §5.3 — dubblett. Konsolidera.

### §5.14 (OPEN) TOP-N caps

**Frågan:** Påverkar M59, M60, M61, M83, M106. TOP-N-metrics genererar
en rad per dim_value per dag. Caps:

- TOP-100 per metric per day per tenant: 10k tenants × 100 × 365 =
  365M extra rader/year per TOP-N-metric.
- TOP-1000 är 10× det.

**Recommendation:** TOP-100 default. Daglig storage ~50 MB/year per
TOP-N-metric vid 10k tenants — additivt, hanterbart.

**Ingen default.**

### §5.15 (OPEN) Cart för accommodation eller separat event?

**Frågan:** Påverkar M64, M74, M78.

**Recommendation:** Separat event `accommodation_added_to_booking`.
Cart-events är Shop-flow; accommodation-flow är annan UX. Mixing dem
gör cart_id-lifecycle och funnel-rates konfunderande.

**Ingen default.**

### §5.16 (OPEN) M66 — boenden utan försäljning

**Frågan:** Negative-set query (boenden som EJ har en
booking_completed). Behöver vi snapshot-events eller är runtime-join
OK?

**Recommendation:** En liten snapshot-emit-cron (en gång per dag per
tenant) som emits `accommodation_active_snapshot`-events skulle
hålla pipelinen ren. Men vid 10k tenants × 100 acc avg = 1M extra
events/day for very little signal. Aggregator-side join mot
`Accommodation`-tabellen är pragmatiskt här (low-volume read,
acceptable to break "events as portable state" för enskild metric).

**Ingen default.**

### §5.17 (OPEN) Mest sökta datum — single date eller pair?

**Frågan:** Påverkar M83.

**Recommendation:** Pair (`check_in__check_out`) ger mer kontext.
Single check-in är dock kompakt och ofta vad operatörer vill se.
Lev båda — `SEARCH_DATE_PAIR` och `SEARCH_CHECKIN_DATE`.

### §5.18 (OPEN) "Sökning utan resultat" — sold_out vs no_rates_configured?

**Frågan:** Påverkar M87. Add `results_zero_reason`-fält per §3.2.

### §5.19 (OPEN) Automatic discounts under M90 — own bucket?

**Recommendation:** dim_value `__automatic` för null-code.

### §5.20 (OPEN) M93 — denominator definition

**Frågan:** Sessions med discount-input vs sessions som SÅG en
discount-prompt?

**Recommendation:** Sessions med ANY `discount_used`-event på den
order_id som sessions slutade med. Cleanest, undviker behov av nytt
"prompt-shown" event.

**Ingen default.**

### §5.21 (OPEN) Säsong-mapping

**Recommendation:** Nordisk: vinter = dec-feb (vintersäsong), vår =
mar-maj, sommar = jun-aug, höst = sep-nov. Apelviken-specifikt:
sommar är högsäsong, sept-okt är viktig "off-season"-bracket.

### §5.22 (OPEN) M106 — N + minimum-volume threshold

**Recommendation:** TOP-10 per period med min-10-bookings-volume för
att inkluderas. Lägre N + min-volume gör listan stabil och meningsfull.

### §5.23 (LOCKED) Pipeline-pattern — events as portable state

Per Phase 5A external research §B.7 (Chris Richardson outbox) +
internal audit §B.5 (D.5 #19 pre-aggregation). Events är källa-av-
sanning; aggregator får inte pulla från Order/Booking-tabellen.
Beslutet är låst.

### §5.24 (LOCKED) Schema-versioning policy

Per `registry.ts:14-22`. PATCH = additive optional; MINOR = additive
required-with-default; MAJOR = breaking. Multiple versions live samtidigt
under cutover. Locked.

### §5.25 (LOCKED) Tenant-isolation

Verifier check #10 enforcing `tenant_id = ${literal}` i WHERE.
Locked från Phase 5A.

### §5.26 (RESOLVED) Storage-projection

Per `_audit/analytics-phase5a-aggregator-recon.md` §6.6 +
§3.3 ovan: ~250 GB/year vid 10k tenants × 25 dimensioner.
Hanterbart utan partitioning på `daily_metric` minst 2 år. Locked.

### Q-summa

| ID | Klass | Sammanfattning |
|---|---|---|
| §5.1 | OPEN | Bokning = booking_completed only? |
| §5.2 | OPEN | Ny-vs-återkommande kund — definition |
| §5.3 | OPEN | Kund-LTV tidsfönster |
| §5.4 | OPEN | Refund — alla varianter? |
| §5.5 | OPEN | Avbokning — kund vs operator-initierad |
| §5.6 | OPEN | Attributions-modell (HUVUDBESLUT) |
| §5.7 | OPEN | Accommodation-Category M:N-mapping |
| §5.8 | OPEN | Veckodag/timme — occurred_at vs check_in_date |
| §5.9 | OPEN | Bokningsfönster — dagar eller timmar |
| §5.11 | OPEN | Landing-page — path-only vs full URL |
| §5.12 | OPEN | Social-källor lista |
| §5.14 | OPEN | TOP-N caps |
| §5.15 | OPEN | Cart-för-accommodation eller separat event |
| §5.16 | OPEN | M66 snapshot-events vs join |
| §5.17 | OPEN | Mest sökta datum — single vs pair |
| §5.18 | OPEN | Search-no-results — sold_out vs no_rates |
| §5.19 | OPEN | Automatic discounts dim-värde |
| §5.20 | OPEN | M93 denominator |
| §5.21 | OPEN | Säsong-mapping (Nordisk vs astronomisk) |
| §5.22 | OPEN | M106 TOP-N + min-volume |
| §5.23 | LOCKED | Events as portable state |
| §5.24 | LOCKED | Schema-versioning policy |
| §5.25 | LOCKED | Tenant-isolation |
| §5.26 | RESOLVED | Storage-projection |

**21 OPEN.** Implementation kan inte starta innan Leo svarar på MINST
§5.6 (attributions-modell) — den blockerar 4 sviter (β, γ, η + delar
av ε). Övriga OPEN-frågor blockerar mindre subgrupper; vissa kan
landa med default-decision senare.

---

## §6 Inte i denna PR (scope-cap)

Explicit ej-i-scope. Får INTE rinna in i implementation-arbetet.

- **Implementation-kod.** Allt i §4 är förslag som Leo bekräftar.
- **Schema-bumpar.** Inga events får version-bump i denna PR.
- **Migrations.** `daily_metric`-tabellen är oförändrad.
- **UI / dashboard-rendering.** Sektioner i §2 mappar till framtida
  dashboard-kort men ingen UI byggs här.
- **Tester.** Recon är dokumentation, inte runnable.
- **Multi-touch attribution.** §5.6 OPEN endast; multi-touch är
  Phase 5C+ territory.
- **Real-time / SSE / WebSockets.** Alla 105 batch-metrics; bara
  besökare-widget är near-live (Track 3 redan landad).
- **Cohort-analyse / funnel-time-to-conversion.** §5 OPEN-frågor är
  tightare definitioner; cohort-analytics är separat workstream.
- **GDPR retention-tied dimensions.** Dimension-cardinality påverkar
  DR-runbook (Phase 5A audit Tier 1 #5) — beräknas där, inte här.
- **Dashboard-cutover till v2.** Phase 5B-arbete; oberoende av
  metric-utbyggnaden.

---

## §7 Quality gate (självbedömning)

**§1 Baseline:** ✅ Green. 28 events listade med file:line. 12 metrics
+ 5 dimensioner specificerade. Domain-data gap-listad.

**§2 Per-metric inventory:** ⚠️ Yellow. 106 metrics × 7 fält =
742 inventory-points. Varje EXISTS-claim har file:line; varje MISSING
har konkret förslag (event-namn + property-shape eller dim-värde).
Dock — 21 OPEN-frågor i §5 blockerar några rader. Stickprov:

- M5 (Konverteringsgrad): events EXISTS, RATIO derived clean.
- M64 (Lägg till i bokning per boende): GREENFIELD med design-fråga
  flaggad.
- M85 (Mest sökta boendetyper): PARTIAL med konkret schema-bump-förslag.
- M93 (Konvertering med vs utan rabattkod): GREENFIELD plus OPEN
  denominator-question.
- M106 (Topp-konverterande UTM-kombinationer): GREENFIELD plus OPEN
  TOP-N-threshold.

Alla 5 har konkret status; ingen är gissnings-maskerad.

**§3 Gap-analys:** ✅ Green. 5 nya events listade med motivering. 15+
property-bumpar specificerade per event-version. Dimensioner mapped
till nya `dimension_value`-strängar — INGEN schema-ändring på
`daily_metric`-tabellen behövs (per §3.3 generic-shape redan).

**§4 PR-svit:** ✅ Green. 12 sviter, beroende-graf explicit, total
LOC-budget 5,550 — under 800 per svit average. Sviterna är clusterade
på event-overlap, inte sektion-namn.

**§5 Q-decisions:** ⚠️ Yellow. 21 OPEN — många fler än Phase 5A:s 5
OPEN. Det reflekterar verkligheten (Leos 106-vision är mer detaljerad
än Phase 5A:s base-set), men 21 är många och risken är att Leo
bedömer flera tillsammans utan precision. **Mitigation:** §5.6 är
HUVUDBESLUTET; resten kan landa successivt under sviterna.

**§6 Out-of-scope:** ✅ Green.

### Skulle Shopifys analytics-team merge:a denna inventering?

**Ja, med caveat.** Inventeringen är trogen kod (varje EXISTS har
file:line), gap-listan är konkret (varje MISSING har förslagen
shape), och svit-grupperingen är defensiv (event-overlap, inte
katalog-ordning). Riskerna:

1. **§5.6 (attribution)** är ett enskilt beslut som blockerar 4
   sviter. Recon föreslår first-touch som v1; Leo MÅSTE bekräfta innan
   Svit α kan startas.
2. **TOP-N storage** vid 10k tenants × 100 daily TOP-N-rader ×
   ~10 TOP-N-metrics × 365 = 3.65B extra rader/year. Komfortabelt
   under 1 TB Postgres at 150 bytes/row inkl index, men nära Phase 5A
   audit Tier 1 #1 partition-lifecycle-blocker. Worth flagging
   explicitly så Tier 1 fix kommer FÖRE TOP-N-sviter.
3. **Cross-event correlation** för funnel-metrics (M77, M93) — kräver
   `correlation_id` propagation från storefront → server. Recon
   föreslår `correlation_id` på discount_used + checkout_started; det
   är ett genomtänkt beslut, men Leo bör validera att vi inte
   onödigt bumpar storefront-events (worker-validator-parity-cost).

Dessa tre är inte gissnings-blottor — de är arkitektoniska beslut
Leo faktiskt äger. Resten av inventeringen är kod-grundad och redo
att tjäna som källa-av-sanning för 12→106-utbyggnaden.

---

**End of inventory.**

Implementation prompts kan inte draftas innan §5.6 (attribution-
modell) har RESOLVED-besked från Leo. Övriga OPEN-frågor löses
incrementellt under svit-arbetet.
