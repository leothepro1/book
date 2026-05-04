# Bedfront Analytics — event catalog

The single source of truth for which events the analytics pipeline
carries, what triggers each one, and what the payload contains. Add a
new entry here whenever a new `(event_name, schema_version)` is added
to `app/_lib/analytics/pipeline/schemas/registry.ts`.

For the runtime contract (Zod schemas, registry lookup, drainer
validation), see `app/_lib/analytics/pipeline/schemas/`.

## Status legend

- **Active** — the event is registered in the schema registry and at
  least one operational code path emits it.
- **Registered** — schema is in the registry, but no operational code
  emits it yet (placeholder for an upcoming integration).
- **Planned** — slot reserved, schema not yet written.

## Event context

Every event row in `analytics.event` carries an optional
`context: Json?` column alongside `payload`. The two fields have
distinct contracts:

- **`payload`** — event-domain data. Schema-validated against the
  registered Zod schema (`schemas/registry.ts`) at BOTH the emitter
  and the drainer (defense in depth). Required shape per
  `(event_name, schema_version)`.
- **`context`** — request-time metadata that doesn't fit in the
  event-domain payload. Caller-supplied, **opaque to the drainer**
  (no schema validation), nullable. Examples: client IP-derived geo
  (`{ country, city }`), user-agent classification hints, `locale`,
  `page_url` for server-side emits, request correlation ids that
  outlive the event lifecycle.

### What CAN go in `context`

Caller-supplied request-time data that:

- Is informational, not load-bearing for downstream aggregations.
- Does not need cross-event schema consistency (each emitter chooses
  its shape; readers handle absence gracefully).
- Pairs cleanly with the event but doesn't fit the event-domain
  payload's stable shape.

### What CANNOT go in `context`

- **PII raw values.** No raw email, raw IP, raw User-Agent string,
  raw name. Hash, classify, or omit. Same posture as
  `user_agent_hash` in the storefront context: derive coarse
  signals on the privileged side, ship only the derived value.
  See Phase 5A recon §2.10 for the geo-PII bedömning that drives
  this rule.
- **Secrets.** No tokens, no credentials, no signed URLs. Even if
  short-lived — `analytics.event` is append-only with a 730-day
  default retention.
- **Domain data.** If a value is needed for an aggregation,
  it belongs in `payload` under a versioned schema field — context
  is for things readers may consult opportunistically, not require.

### End-to-end flow (PR-X3a)

```
caller        → emitAnalyticsEvent(tx, { …, context })
emitter       → INSERT into analytics.outbox (payload, context, …)
drainer       → SELECT context FROM analytics.outbox
              → INSERT into analytics.event (payload, context, …)
                ON CONFLICT (event_id, occurred_at) DO NOTHING
Phase 5+      → SELECT … FROM analytics.event WHERE …
              → consult event.context opportunistically
```

The outbox column is nullable (`Json?`); pre-PR-X3a outbox rows
landed without it and the drainer treats them as `context: NULL`.
Post-X3a, callers that omit context get the same `NULL`; callers
that pass `{}` get a JSON empty object (the distinction is
preserved end-to-end). The drainer never inspects context content;
schema-validation runs against `payload` only.

## Geo enrichment

Storefront events emitted via `/api/analytics/collect` (`page_viewed`,
`accommodation_viewed`, `availability_searched`, the cart_* events,
`checkout_started`) carry a coarse `geo` field on
`event.context.geo` — populated post-consent at the dispatch
endpoint via a MaxMind GeoLite2 lookup. PR-X3a's context-pipeline
wire-through is the prerequisite that lets this data flow end-to-end
to `analytics.event.context`.

**When the lookup runs.** AFTER the consent gate AND the per-tenant
pipeline feature flag pass. A consent-declined or pipeline-disabled
visitor never burns a MaxMind read; the lookup is also skipped on
rate-limited / origin-rejected requests.

**What is read.** The first hop in the request's `X-Forwarded-For`
header (the visitor's external IP — Vercel sets this on every
request).

**What is stored.** Exactly two fields on `event.context.geo`:

  ```
  geo.country  ISO 3166-1 alpha-2 country code (uppercase) — e.g. "SE"
  geo.city     English city name (MaxMind 'en' name) — e.g. "Apelviken"
  ```

Nothing else. The helper's return type structurally lacks `lat` /
`lng` so they cannot leak even by accident, and the IP is NEVER
stored — not in the database, not in logs.

**Privacy posture.** GDPR rekital 26 puts city-level geo (without
the underlying IP, without precise coordinates) under the PII
threshold when stored against a pseudonymous identifier. Bedfront's
posture aligns:

  - The IP is consumed at the request boundary and discarded.
  - lat/lng never enters the helper's return object.
  - Lookup is gated by `consent.analytics === true` (the consent
    gate runs upstream of `resolveGeoForContext`).
  - Logs emit the derived country only (city is omitted from logs
    because country + tenant + timing rebuilds a coarse fingerprint
    of where a tenant's traffic comes from — interesting enough to
    keep, not coarse enough to pair with city safely).

The posture is complementary to `user_agent_hash` and
`device_type`: in every case we leak the coarse class and never
the raw signal.

**Failure mode.** GeoLite2 database absent (preview deploys may
skip the prebuild download), unparsable IP (private network,
reserved range), MaxMind throws — every failure path returns
`null` from the helper, the dispatch route omits the `geo` field
on `event.context`, and emit proceeds. A guest's session is never
blocked by an unavailable GeoLite2 database. Aggregators map
absent-geo to the `"unknown"` bucket per Phase 5A recon §2.10.

**Server-side events** (booking_completed, payment_succeeded,
booking_imported, …) do NOT carry `geo` today — they don't
naturally have a request-IP source (PMS sync events run on a cron,
checkout side-effects run server-internal). If Phase 5+ ever
needs geo on server-side events, it lands as a separate enrichment
PR with its own consent + PII analysis. Out of scope for X3b.

## Schema authoring rules

Locked decisions every new event schema MUST follow.

1. **Datetime fields use `z.union([z.string(), z.date()])`, NEVER
   `z.coerce.date()`.** The Phase 2 Commit G fix is the canonical
   pattern. `z.coerce.date()` inside a payload is a transform, and
   Zod's intersection (`BaseEventSchema.and(z.object({payload: …}))`)
   refuses to merge transforms with the wider
   `z.record(z.string(), z.unknown())` payload on the base schema.
   The drainer would reject every such event with
   `Unmergable intersection`. The union accepts both `Date` (from
   emitter callers) and ISO string (from JSONB → JS string after
   `JSON.stringify` on emit). `base.ts`'s top-level `occurred_at`
   keeps `z.coerce.date()` because it's outside the payload
   intersection.

2. **`z.union([z.string(), z.date()])` storage shape is unchanged.**
   JSONB stores whatever JSON representation the emit produced;
   Phase 5 readers parse as needed. The union is purely a
   validation-side relaxation.

3. **Storefront events use `StorefrontContextSchema`** — see
   `schemas/_storefront-context.ts` — for `page_url`, `page_referrer`,
   `user_agent_hash`, `viewport`, `locale`, and `session_id`.
   Intersect it via `.and()` with the per-event payload object so the
   browser-side context fields stay consistent across all storefront
   events.

4. **Idempotency-key composition** must include every dimension the
   key should scope by. See Phase 1A's `tenant_id:event_name:custom`
   pattern and Phase 2 Q6's counter-augmented keys for retry-prone
   events.

## Events

### `booking_completed` v0.1.0 — Active

A direct booking made through Bedfront's checkout flow has been paid
and is ready for fulfillment. Direct bookings only.

- **Trigger:** `processOrderPaidSideEffects` after the operational
  Order is committed as PAID. Stripe webhook (`payment_intent.succeeded`)
  is the primary path; the reconciliation cron retries if the webhook
  was missed.
- **Idempotency key:** `booking_completed:${booking.id}`. Stripe-webhook
  + reconcile-cron retries dedupe at the outbox via the deterministic
  ULID derivation.
- **Skip conditions:** the linked Booking row is missing
  `accommodationId` or has `guestCount` null/zero. Logged as
  `process_paid.pipeline_booking_completed_skipped`.
- **Payload (`BookingCompletedPayloadSchema`):**

  ```
  booking_id          CUID            Booking.id
  accommodation_id    CUID            Booking.accommodationId
  guest_id            string          GuestAccount.id (CUID, no prefix)
                                      OR `email_<sha256-16hex>` for
                                      email-only bookings
  check_in_date       YYYY-MM-DD      Booking.arrival (UTC)
  check_out_date      YYYY-MM-DD      Booking.departure (UTC)
  number_of_nights    int positive    derived
  number_of_guests    int positive    Booking.guestCount
  total_amount        { amount: int   Order.totalAmount + Order.currency
                        in minor units (öre / cents),
                        currency: ISO 4217 }
  source_channel      enum            "direct" for Phase 1B (PMS-imports
                                      get a separate event — see below)
  pms_reference       string | null   Booking.externalId
  ```

### `booking_imported` v0.1.0 — Active

A booking that originated AT a PMS (Mews, Apaleo, Opera, …) was
ingested by Bedfront's reliability engine. **Deliberately a separate
event type** from `booking_completed` because PMS imports have a
different field profile (no Order, no money, often no
accommodationId) and different trigger semantics (we consume vs we
produce).

- **Trigger:** `executeUpsertOnce` in
  `app/_lib/integrations/reliability/ingest.ts` Case 1 INSERT.
  Transactional emit — the booking row and the outbox row commit
  together.
- **Idempotency key:** `booking_imported:${booking.id}`. The PMS
  chokepoint is exactly-once per `(tenantId, externalId)`; one
  insert ⇒ one event.
- **Payload (`BookingImportedPayloadSchema`):**

  ```
  booking_id           string         Booking.id
  pms_provider         enum           mews | fake | manual | other
                                      (derivePMSAdapterType)
  pms_reference        string         Booking.externalId
  check_in_date        YYYY-MM-DD     Booking.arrival (UTC)
  check_out_date       YYYY-MM-DD     Booking.departure (UTC)
  number_of_nights     int positive   derived
  number_of_guests     int|null       Booking.guestCount (nullable)
  accommodation_id     string|null    Booking.accommodationId (nullable)
  guest_email_hash     string         email_<sha256-16hex>(tenantId:email)
  ```

### `booking_modified` v0.1.0 — Active

An existing Booking row's content changed (dates, guest count, status
change that isn't a cancellation). Phase 2 emits only from the PMS
chokepoint; future direct-booking edit flows will emit from their own
sites with `source_channel: "direct"`.

- **Trigger:** `executeUpsertOnce` Case 4 UPDATE — fires when the
  chokepoint detects real content change.
- **Idempotency key:** `booking_modified:${booking.id}:${providerUpdatedAt.getTime()}`.
  The PMS version timestamp scopes the key so successive
  modifications of the same booking are distinct events.
- **Relationship to other events:** Cancel trumps modify. When a
  single PMS update both modifies fields AND transitions
  status → CANCELLED, only `booking_cancelled` is emitted. See
  `booking_cancelled` for the full discriminator. The discriminator
  lives inline in `app/_lib/integrations/reliability/ingest.ts` Case 4.
- **Payload (`BookingModifiedPayloadSchema`):**

  ```
  booking_id           string         Booking.id (current value)
  pms_provider         enum           derivePMSAdapterType
  pms_reference        string|null    Booking.externalId
  check_in_date        YYYY-MM-DD     Booking.arrival (current)
  check_out_date       YYYY-MM-DD     Booking.departure (current)
  number_of_nights     int positive   derived
  number_of_guests     int|null       Booking.guestCount
  accommodation_id     string|null    Booking.accommodationId
  source_channel       enum           "pms_import" today
  provider_updated_at  ISO date       PMS version timestamp
  ```

### `booking_cancelled` v0.1.0 — Active

A booking transitioned to status=CANCELLED. Phase 2 emits only from
the PMS chokepoint; future direct-cancellation flows (admin cancel,
guest self-cancel) will emit from their own sites.

- **Trigger:** `executeUpsertOnce` Case 4 UPDATE — fires when the
  update transitions status to CANCELLED AND the previous status was
  not CANCELLED (no double-emit on re-sync of an already-cancelled
  booking).
- **Idempotency key:** `booking_cancelled:${booking.id}:${providerUpdatedAt.getTime()}`.
  Includes the version timestamp so a cancellation, un-cancellation,
  and re-cancellation each produce distinct events.
- **Relationship to other events:** Cancel trumps modify. When a
  single PMS update both changes fields AND transitions to CANCELLED,
  only this event is emitted. The cancellation is the more specific
  signal; pre-cancellation field changes are almost always PMS
  internal housekeeping (clearing dates, reassigning units, closing
  balances) that downstream Phase 5 aggregations shouldn't
  double-count. The discriminator lives inline in
  `app/_lib/integrations/reliability/ingest.ts` Case 4.
- **Out of scope until v0.2.0:** `cancellation_reason`. The Booking
  model has no reason field today; adding one without a product
  decision on the reason taxonomy would lock in guesses.
- **Payload (`BookingCancelledPayloadSchema`):**

  ```
  booking_id           string         Booking.id
  pms_provider         enum           derivePMSAdapterType
  pms_reference        string|null    Booking.externalId
  check_in_date        YYYY-MM-DD     Booking.arrival
  check_out_date       YYYY-MM-DD     Booking.departure
  number_of_nights     int positive   derived
  number_of_guests     int|null       Booking.guestCount
  accommodation_id     string|null    Booking.accommodationId
  source_channel       enum           "pms_import" today
  cancelled_at         ISO date       providerUpdatedAt (PMS-reported)
  ```

### `booking_no_show` v0.1.0 — Registered, emit deferred to Phase 2.x

A guest failed to arrive on the scheduled check-in date. **Schema is
registered but no operational emit site exists yet.** The deferral is
not about implementation cost — it's about the product decision
behind no-show detection: "When does a booking count as no-show? 24h
after arrival? 48h?" That window is for Apelviken (and other early
tenants) to define before we wire detection.

When Apelviken settles the window, Phase 2.x will either flip on
emit at the existing PMS-reported path
(`ingest.ts` already maps `IngestStatus="no_show"`) or add a
detection cron, and the schema is already in place.

- **Listed in `KNOWN_DEFERRED_EVENTS`** in
  `scripts/verify-phase2.ts` with the explicit reason.
- **Payload (`BookingNoShowPayloadSchema`, planned):**

  ```
  booking_id              string         Booking.id
  pms_provider            enum           derivePMSAdapterType
  pms_reference           string|null    Booking.externalId
  expected_check_in_date  YYYY-MM-DD     Booking.arrival
  accommodation_id        string|null
  number_of_guests        int|null
  detection_source        enum           "pms" | "internal"
  detected_at             ISO date       now() at emit time
  ```

### `payment_succeeded` v0.2.0 — Current; v0.1.0 deprecated

A payment for an Order was captured. Fires for **every** paid Order
regardless of `orderType` (ACCOMMODATION, PURCHASE, GIFT_CARD, …).

- **Trigger:** same as `booking_completed` —
  `processOrderPaidSideEffects` after Order is PAID.
- **Idempotency key:** `payment_succeeded:${stripePaymentIntentId ??
  order.id}`. Stripe PI is the canonical reference for Stripe-backed
  orders; for INVOICE / future SwedbankPay / NETS without a
  stripePaymentIntentId, `order.id` is the stable fallback.
- **Payload (`PaymentSucceededPayloadSchema`, v0.2.0):**

  ```
  payment_id          string          Order.id (local stable id —
                                      survives across providers,
                                      including INVOICE which has no
                                      Stripe PI)
  booking_id          string | null   Booking.id when the order's
                                      orderType is ACCOMMODATION and
                                      the linked Booking exists; null
                                      otherwise
  amount              { amount: int,  Order.totalAmount + Order.currency
                        currency }
  provider            enum            stripe | swedbankpay | manual |
                                      other (see deriveProvider)
  payment_instrument  enum            card | bank_transfer | wallet |
                                      other (see deriveInstrument)
  provider_reference  string non-empty stripePaymentIntentId ?? order.id
                                      — schema requires non-empty so
                                      the fallback covers non-Stripe
                                      orders
  captured_at         ISO date        Order.paidAt
  source_channel      enum            direct | admin_draft | pms_import
                                      | third_party_ota | unknown
                                      (see deriveOrderSourceChannel) —
                                      NEW in v0.2.0
  line_items          array           [{ product_id: string,
                                         amount:     int (öre) }]
                                      one entry per OrderLineItem; can
                                      be empty array — NEW in v0.2.0
  ```

**Schema versions:**

| Version | Status | Notes |
|---|---|---|
| v0.2.0 | Current | Adds REQUIRED `source_channel` (mapped from `Order.sourceChannel` via `deriveOrderSourceChannel`) and REQUIRED `line_items[]` (per-OrderLineItem `{ product_id, amount }`). Phase 5A's aggregator depends on both for REVENUE × CHANNEL, ORDERS × CHANNEL, and REVENUE × PRODUCT dimensions. |
| v0.1.0 | **Deprecated** | Lacked `source_channel` and `line_items`. Phase 5 PURCHASE-orders had no CHANNEL coverage and REVENUE × PRODUCT had no source. Kept registered at `schemas/legacy/payment-succeeded-v0.1.0.ts` for outbox-drain backward-compat only. Drop after the outbox is confirmed empty of v0.1.0 events. |

**Semantic Contract (v0.2.0 fields)**

`source_channel`. Analytics-domain enum derived from
`Order.sourceChannel` (a free-form `String?` column,
`prisma/schema.prisma:2856`). The mapping is in
`deriveOrderSourceChannel` (`integrations.ts`):

  - `"direct"`           — guest checkout flow (POST /api/checkout/*)
  - `"admin_draft"`      — merchant-created via draft-order conversion
                           (`app/_lib/draft-orders/convert.ts:355`)
  - `"third_party_ota"`  — `Order.sourceChannel ∈ {"booking_com",
                           "expedia"}` (reserved for future OTA
                           integration)
  - `"pms_import"`       — reserved (currently no Order originates at
                           the PMS; collapsed defensively if the
                           operational column ever takes that value)
  - `"unknown"`          — `Order.sourceChannel` is null or any value
                           the mapper hasn't seen. Never throws — a
                           non-zero "unknown" tally per tenant in
                           Phase 5 dashboards is the signal to add a
                           new enum member.

The enum is a **superset** of `booking_completed.source_channel` — it
adds `"admin_draft"` because `Order` carries that distinction but
`Booking.externalSource` does not. Aggregators that join the two
events MUST handle the wider set.

`line_items`. One entry per row in `Order.lineItems` (the
`OrderLineItem[]` Prisma relation). Each entry maps:

  - `product_id` ← `OrderLineItem.productId`
  - `amount`     ← `OrderLineItem.totalAmount` (öre — `quantity × unitAmount`)

Empty array is valid: orders without explicit `OrderLineItem` rows
emit `line_items: []` rather than omitting the field. The shape is
required and deterministic — schema validation gates emit, so a null
or missing array would reject before reaching the outbox.

`Order.lineItems` MUST be in the Prisma `include` at the emit site
(`processOrderPaidSideEffects` already does this for the spot-marker
cleanup path; v0.2.0 reuses the same load).

### `payment_failed` v0.1.0 — Active

A payment attempt failed. Phase 2 emits only from the Stripe webhook;
future providers (Swedbankpay, Nets) will emit from their own webhook
handlers when activated.

- **Trigger:** `handlePaymentIntentFailed` in
  `app/api/webhooks/stripe/route.ts` (`payment_intent.payment_failed`).
  Standalone emit — order is not mutated through a tx the analytics
  emit can attach to.
- **Idempotency key:** `payment_failed:${paymentIntent.id}:${stripeEventId}`.
  The PI ID alone is NOT unique per failure occurrence — Stripe can
  deliver multiple `payment_intent.payment_failed` events for the same
  PI when it retries. The Stripe `event.id` differs per delivery, so
  appending it gives "one analytics event per failure occurrence".
  Phase 5 needs occurrence counts to compute per-customer / per-provider
  failure rates and time-to-recovery.
- **Payload (`PaymentFailedPayloadSchema`):**

  ```
  order_id            string         Order.id (from pi.metadata.orderId)
  payment_intent_id   string         Stripe PI.id
  amount              { amount: int, pi.amount + pi.currency
                        currency }
  decline_code        string|null    pi.last_payment_error?.decline_code
  error_code          string|null    pi.last_payment_error?.code
  error_message       string|null    pi.last_payment_error?.message
                                     (truncated to 500 chars)
  attempted_at        ISO date       now() at emit time
  provider            enum           "stripe" today
  ```

### `payment_refunded` v0.1.0 — Active

A refund was processed. A single Order can produce multiple
`payment_refunded` events for partial refunds across separate webhook
deliveries.

- **Trigger:** `handleChargeRefunded` in
  `app/api/webhooks/stripe/route.ts` (`charge.refunded`). Standalone
  emit, fire-and-forget.
- **Idempotency key:** `payment_refunded:${charge.id}:${stripeEventId}`.
  Including the Stripe event id makes partial refunds across
  successive webhook deliveries distinct events.
- **Payload (`PaymentRefundedPayloadSchema`):**

  ```
  order_id          string        Order.id (resolved via PI → Order)
  charge_id         string        Stripe Charge.id
  refund_amount     { amount: int, charge.amount_refunded (cumulative)
                      currency }
  refund_reason     enum          duplicate | fraudulent |
                                  requested_by_customer |
                                  expired_uncaptured_charge |
                                  other | unknown
                                  (deriveRefundReason)
  refunded_at       ISO date      now() (Stripe doesn't expose a
                                  per-refund timestamp on the charge
                                  object's top-level fields)
  provider          enum          "stripe"
  ```

### `payment_disputed` v0.1.0 — Active

A Stripe `charge.dispute.created` webhook fired (chargeback initiated).
Disputes are operationally expensive: chargebacks include Stripe fees,
require evidence response, and threaten merchant payment-account
standing. The analytics event lets Phase 5 compute per-merchant dispute
rate and per-instrument dispute likelihood.

- **Trigger:** `handleChargeDisputed` in
  `app/api/webhooks/stripe/route.ts` (NEW handler added in Phase 2
  Commit B). Standalone emit. The handler also writes an `OrderEvent`
  of type `ORDER_UPDATED` with `dispute: true` metadata so the
  operator-facing order timeline reflects the dispute. A dedicated
  `ORDER_DISPUTED` enum value would require a Prisma migration —
  tracked as follow-up; the metadata flag is the bridge for now.
- **Idempotency key:** `payment_disputed:${dispute.id}:${stripeEventId}`.
  Stripe disputes are unique per chargeback; the event id absorbs
  hypothetical webhook re-deliveries.
- **Out of scope until v0.2.0:** dispute lifecycle transitions
  (`dispute.updated`, `dispute.closed`). v0.1.0 captures only the
  creation snapshot; dispute_status is the value at creation time.
- **Payload (`PaymentDisputedPayloadSchema`):**

  ```
  order_id          string        Order.id (via dispute.payment_intent
                                  → Order)
  charge_id         string        Stripe Charge.id (dispute.charge)
  dispute_id        string        Stripe Dispute.id
  disputed_amount   { amount: int, dispute.amount + dispute.currency
                      currency }
  dispute_reason    enum          credit_not_processed | duplicate |
                                  fraudulent | general |
                                  incorrect_account_details |
                                  insufficient_funds |
                                  product_not_received |
                                  product_unacceptable |
                                  subscription_canceled |
                                  unrecognized | other | unknown
                                  (deriveDisputeReason)
  dispute_status    enum          warning_needs_response |
                                  warning_under_review |
                                  warning_closed | needs_response |
                                  under_review | charge_refunded |
                                  won | lost | unknown
  created_at        ISO date      Stripe dispute.created
  provider          enum          "stripe"
  ```

### `guest_account_created` v0.1.0 — Active

A new GuestAccount row was inserted. Today the trigger is the
checkout / order-linking path; future explicit signup flows will emit
from their own sites.

- **Trigger:** `emitIfNewAccount` in `app/_lib/guest-auth/account.ts`
  (called from `upsertGuestAccount` when the row was just created).
  Standalone emit, fire-and-forget.
- **Idempotency key:** `guest_account_created:${account.id}`.
- **Payload:** `guest_id`, `email_hash`, `source` (checkout / order /
  magic_link / import / other), `created_at`.

### `guest_otp_sent` v0.1.0 — Active

A magic-link OTP email was queued for delivery. Pairs with
`guest_authenticated` via the `token_id` correlation key.

- **Trigger:** `requestMagicLink` in `app/_lib/magic-link/request.ts`,
  after the MagicLinkToken row is persisted. Standalone emit,
  fire-and-forget. Rate-limited / invalid-email branches don't reach
  the emit.
- **Idempotency key:** `guest_otp_sent:${token_id}`. One token per send;
  re-runs of the same handler with the same token would dedupe.
- **Privacy:** the token itself is NEVER in the event. `token_id` is
  `sha256(token).slice(0, 16)` — a correlation key, not a credential.
- **Payload:** `email_hash`, `token_id`, `expires_at`, `sent_at`.

### `guest_authenticated` v0.1.0 — Active

A guest successfully verified a magic-link OTP. Pairs with
`guest_otp_sent` via `token_id` for funnel-conversion aggregations.

- **Trigger:** `validateMagicLink` in `app/_lib/magic-link/validate.ts`,
  after the token is atomically marked as used. Standalone emit.
  Expired / used / not-found paths do NOT emit (those are a separate
  `guest_otp_failed` event, deferred to v0.2.0).
- **Idempotency key:** `guest_authenticated:${token_id}`. The validate
  path is atomic — a token is consumed exactly once.
- **Payload:** `guest_id` (CUID if linked, null in auth-then-create
  flows), `email_hash`, `token_id`, `authenticated_at`.

### `guest_account_linked` v0.1.0 — Active

An existing operational resource (Order today, future Booking) had its
`guestAccountId` populated by linking to a GuestAccount row.

- **Trigger:** `upsertGuestAccountFromOrder` in
  `app/_lib/guest-auth/account.ts`. Standalone emit, fire-and-forget.
- **Idempotency key:**
  `guest_account_linked:${guestAccountId}:${orderId}`. One link per
  (account, order) — re-runs of the same handler dedupe.
- **Phase 5 use case:** account-level revenue rollup requires this
  event to attribute historical orders to a GuestAccount discovered
  later via email match.
- **Payload:** `guest_id`, `email_hash`, `linked_resource_type`
  ("order" today, "booking" reserved), `linked_resource_id`,
  `link_method` ("auto_via_email_match" today), `linked_at`.

### `discount_created` v0.1.0 — Active

A merchant created a new Discount row.

- **Trigger:** `POST /api/admin/discounts` admin route, inside the
  existing `prisma.$transaction`. Transactional emit.
- **Idempotency key:** `discount_created:${discount.id}`.
- **Payload:** `discount_id`, `title`, `method` (automatic / code),
  `value_type` (percentage / fixed_amount), `value` (basis points or
  minor units), `currency` (nullable — Discount has no explicit
  currency; fixed_amount discounts are interpreted in tenant primary
  currency), `starts_at`, `ends_at` (nullable), `usage_limit`
  (nullable), `created_at`, `created_by_actor_id` (nullable).

### `discount_used` v0.1.0 — Active

A discount was applied to an Order at checkout.

- **Trigger:** `commitDiscountApplication` in
  `app/_lib/discounts/apply.ts`, transactional with the Order-creation
  flow.
- **Idempotency key:** `discount_used:${orderId}:${discountId}`. The
  unique constraint on `DiscountUsage.orderId` enforces one usage per
  order at the operational layer.
- **Payload:** `discount_id`, `discount_code` (nullable — AUTOMATIC
  discounts have no code), `order_id`, `discount_amount`,
  `order_total` (post-discount), `used_at`.

### `discount_expired` v0.1.0 — Active

A Discount's `endsAt` passed and the existing
`sync-discount-statuses` cron transitioned it to EXPIRED. Q5 of the
Phase 2 plan resolved as **extend the existing cron** rather than
defer — the cron's expire branch is small (~12 lines), clean, and has
all the data needed (id, tenantId, title, endsAt, usageCount).

- **Trigger:** `syncDiscountStatuses` in `app/_lib/discounts/status.ts`,
  inside the existing `toExpire` batch. Standalone emit, fire-and-forget
  per discount expired in the cron tick.
- **Idempotency key:** `discount_expired:${discountId}:${endsAt.getTime()}`.
  endsAt in the key so a discount that's reset and re-expired produces
  a distinct event.
- **Payload:** `discount_id`, `title`, `ends_at` (the timestamp that
  triggered the transition), `expired_at` (cron observation time —
  approximate, bounded by the cron interval), `total_uses`
  (`Discount.usageCount` snapshot at expiry).
- **Latency note:** the cron runs every 15 minutes, so `expired_at` may
  be up to that delayed from real expiry. Phase 5 should treat
  `ends_at` as the precise timestamp and `expired_at` as the
  observation time.

### `accommodation_published` v0.1.0 — Registered, emit deferred to Phase 4 CDC

An accommodation went live on the guest-facing booking engine
(`status` transitioned to `ACTIVE`).

**Status: registered, emit deferred to Phase 4 CDC.** Bedfront has
multiple admin write-paths for accommodations (visual editor saves,
bulk import, future AI tools, manual admin). Instrumenting every
write-path is fragile — a new admin route added later forgets to emit
and the analytics record drifts from reality. Postgres CDC captures
status transitions regardless of the writing code path; one
emit-source for all writers. Listed in `KNOWN_DEFERRED_EVENTS` in
`scripts/verify-phase2.ts` with the explicit reason.

- **Payload:** `accommodation_id`, `accommodation_type` (hotel /
  cabin / camping / apartment / pitch), `display_name`, `base_price`,
  `status_transition: { from, to: "active" }`, `published_at`.

### `accommodation_archived` v0.1.0 — Registered, emit deferred to Phase 4 CDC

An accommodation was soft-archived (`status` set to `ARCHIVED`). Same
Phase 4 CDC deferral as `accommodation_published`.

- **Payload:** `accommodation_id`, `accommodation_type`,
  `display_name`, `archived_at`, `archived_by_actor_id` (nullable —
  CDC may not surface the actor).

### `accommodation_price_changed` v0.1.0 — Registered, emit deferred to Phase 4 CDC

The base price of an accommodation changed. Same Phase 4 CDC
deferral.

- **Payload:** `accommodation_id`, `accommodation_type`,
  `previous_price`, `new_price`, `change_pct` (nullable when previous
  was zero), `changed_at`, `changed_by_actor_id`.

### `pms_sync_failed` v0.1.0 — Active

A PMS sync attempt failed and the circuit-breaker incremented
`TenantIntegration.consecutiveFailures`.

- **Trigger:** `recordFailure` in
  `app/_lib/integrations/sync/circuit-breaker.ts`. Standalone emit,
  fire-and-forget — analytics failures must never block circuit-breaker
  state updates.
- **Idempotency key:**
  `pms_sync_failed:${tenantId}:${provider}:${consecutive_failures}`.
  Each increment is a distinct analytics event so Phase 5 can compute
  MTBF, error rate, and time-to-recovery from occurrence counts.
  Documented inline at the emit site.
- **Payload:** `pms_provider`, `consecutive_failures` (post-increment),
  `error_message` (truncated to 500 chars), `failed_at`.

### `pms_sync_recovered` v0.1.0 — Active

The circuit-breaker auto-closed —
`TenantIntegration.consecutiveFailures` was at or above
`FAILURE_THRESHOLD` and a successful sync reset it to 0. Pairs with
`pms_sync_failed` for time-to-recovery aggregations.

- **Trigger:** `recordSuccess` in
  `app/_lib/integrations/sync/circuit-breaker.ts`, ONLY when the
  `wasOverThreshold` flag is true. The "every successful sync" event
  would be high-volume noise; aggregating it would defeat its purpose.
- **Idempotency key:**
  `pms_sync_recovered:${tenantId}:${provider}:${recovered_at.getTime()}`.
  Successive open→close cycles get distinct events.
- **Payload:** `pms_provider`, `previous_failures` (count just before
  reset, ≥ FAILURE_THRESHOLD by definition), `recovered_at`.

## Why `booking_completed` and `booking_imported` are separate event types

Repeated for emphasis: this is a deliberate design choice, not an
oversight. The two events share a domain ("a booking exists") but
differ in:

1. **Origin direction.** `booking_completed` flows AT Bedfront and
   then OUT to the PMS (we produce it). `booking_imported` flows IN
   from the PMS (we consume it).
2. **Field availability.** Direct bookings carry money + accommodation
   + guest-count; PMS-imports may be missing one or all three.
3. **Trigger site.** Different code paths, different
   transactional contexts, different idempotency keys.
4. **Aggregation interest.** Phase 5+ aggregations filter by event
   type, not by a sub-discriminator inside a shared schema.

Adding a new event type is cheap (one entry in this catalog, one
schema file, one registry entry, ~one emit site). Conflating two
event types into one and untangling them later is expensive (an
analytics-data backfill / re-encoding). Pay the small cost up front.

## Adding a new event

1. Decide `(event_name, schema_version)`. Lowercase snake_case for the
   name; semver `0.x.y` until Apelviken go-live, `1.x.y` after.
2. Write the Zod schema in
   `app/_lib/analytics/pipeline/schemas/<event-name>.ts`. Extend
   `BaseEventSchema.and(z.object({ event_name: z.literal(...),
   schema_version: z.literal(...), payload: <PayloadSchema> }))`.
3. Add it to the `ANALYTICS_EVENT_REGISTRY` in
   `app/_lib/analytics/pipeline/schemas/registry.ts`.
4. Add the emit site (transactional via `emitAnalyticsEvent(tx, params)`
   when an operational tx exists, standalone via
   `emitAnalyticsEventStandalone(params)` for after-commit handlers).
5. Add an entry to this file describing the event.
6. Unit test the schema (accept + reject paths) and any new derive
   helpers that translate operational fields.

## Versioning policy

- **PATCH** (e.g. 0.1.0 → 0.1.1): additive optional field. No
  consumer changes required.
- **MINOR** (e.g. 0.1.0 → 0.2.0): additive required field with a
  default; new optional enum value; new dimension. Old consumers can
  still parse new events.
- **MAJOR** (e.g. 0.x.y → 1.0.0): anything that could break a
  downstream consumer — removed field, renamed field, changed
  semantics, contracted enum.

Multiple versions of the same event can be live simultaneously
during migration windows. Both must be in the registry; the emitter
+ drainer route by `(event_name, schema_version)` independently.

## Storefront events (Phase 3)

These fire from the analytics web worker (Phase 3 PR-B) running in the
guest portal. They reach the outbox via the dispatch endpoint at
`/api/analytics/collect` (Phase 3 PR-A Commit C), which validates each
event against the registry, enforces consent, and emits via
`emitAnalyticsEventStandalone`. Every storefront event carries the
shared `StorefrontContextSchema` fields (`page_url`, `page_referrer`,
`user_agent_hash`, `viewport`, `locale`, `session_id`, plus the two
optional PR-X2 additions `device_type` and `visitor_id`).

**Privacy posture (storefront):**
- Raw `navigator.userAgent` never leaves the browser. We hash it to a
  16-char prefix (`user_agent_hash`) for stability without
  fingerprinting. The PR-X2 device classifier ALSO runs loader-side
  on the raw UA — only the four-bucket label (desktop/mobile/tablet/
  unknown) reaches the worker and the outbox.
- Raw email never enters the worker. When a guest authenticates, the
  loader hashes the email to the `email_<sha256-16hex>` form (same
  convention as Phase 1B's `deriveGuestId`) before passing it as
  `actor_id` to the worker.
- All storefront events default to `analytics` consent category.
  Events that fire before consent is granted are queued in the
  worker's pending buffer; on consent grant, queued events flush; on
  deny, they're discarded.
- `visitor_id` (the long-lived browser-stable identifier from PR-X2)
  is written to localStorage ONLY when consent is granted. The
  loader's `track()` path checks consent before invoking
  `buildStorefrontContext()`, so the localStorage write at
  `getOrCreateVisitorId()` never happens for non-consenting visitors.

**Device classification (PR-X2)**

`device_type` is computed loader-side via a hand-rolled regex helper
(`app/_lib/analytics/pipeline/runtime/device-type.ts`). Buckets:

  - `desktop` — anything not matching mobile/tablet patterns
  - `mobile`  — UA contains `iPhone`, or `Android` with the `Mobile`
    marker, or generic `Mobile` keyword
  - `tablet`  — UA contains `iPad`, or `Android` without the `Mobile`
    marker, or `navigator.platform === "MacIntel"` with
    `navigator.maxTouchPoints > 1` (iPadOS 13+ desktop-mode fix —
    Apple changed Safari on iPad to report a Mac UA, so the touch
    capability is the only browser-exposed signal that distinguishes
    an iPad from a real Mac)
  - `unknown` — UA absent / empty (SSR / headless contexts)

Pre-X2 emits omit the field — the schema is OPTIONAL, so pre-deploy
outbox rows + post-deploy SSR-only emits validate without it.
Post-X2 emits ALWAYS include it; the classifier never throws (empty
UA → `"unknown"`). Aggregators map absence to the `"unknown"` bucket
so dimension coverage stays consistent across the cutover window.

No third-party UA library (`ua-parser-js`, `bowser`, …) — the
hand-rolled classifier costs ~500 bytes minified, against ~7-15 KB
for the libraries. Worker bundle budget is locked at 30 KB gzipped
per `scripts/build-analytics-runtime.mjs:71`.

**Visitor identity (PR-X2)**

`visitor_id` is a ULID generated by the loader on the first emit per
browser+origin and persisted in `localStorage` under the key
`bf_visitor_id`. The lifecycle is BROADER than `session_id`:

| Trigger | session_id | visitor_id |
|---|---|---|
| 30-min idle since last emit | rotates | survives |
| Tab close + reopen | rotates (sessionStorage clears) | survives |
| Consent revoke + regrant | rotates (privacy reset) | survives |
| localStorage cleared | unaffected | rotates (new visitor by definition) |
| Incognito / private browsing | unaffected | rotates per browser-session (localStorage is session-scoped) |
| Browser data purge | unaffected | rotates |

Cross-tenant isolation: each tenant has its own subdomain;
localStorage is origin-scoped. A guest visiting two Bedfront tenants
gets two distinct `visitor_id`s — the browser enforces it, we don't
have to.

GDPR posture: `visitor_id` is a pseudonymous identifier stored
locally on the client during analytics consent. It is NOT classified
as personal data when stored alone (no email, no IP, no name), but
becomes part of a profile under analytics consent — the same
treatment as `session_id` and `user_agent_hash`. Consent revoke
should call `clearVisitorId()` if the operator wants to enforce
"forget this visitor" semantics; the default behaviour preserves
the id across consent transitions because most visitors who
revoke-then-regrant are the same human (toggling preferences) rather
than a new visitor.

Pre-X2 emits omit the field. Post-X2 emits include it whenever
consent is granted AND localStorage is writable. Phase 5
aggregations should treat absent `visitor_id` as "session-scoped
visitor count" and present `visitor_id` as "long-lived visitor
count" — the dimension expands without breaking pre-deploy data.

### `page_viewed` v0.1.0 — Active (PR-B emits, PR-A registers)

Fires on every page load + SPA navigation in the guest portal. The
foundational storefront event — most Phase 5 funnel aggregations join
against `page_viewed` for the denominator.

- **Trigger:** analytics worker (Phase 3 PR-B) on URL changes.
- **Idempotency key:** client-generated ULID (worker), passed through
  the dispatch endpoint as the outbox `event_id`.
- **Consent category:** `analytics`.
- **Payload:** shared `StorefrontContext` fields + `page_type` (enum:
  home / stay / checkout / account / support / policy / other).

### `accommodation_viewed` v0.1.0 — Active (PR-B emits, PR-A registers)

Fires when a guest opens an accommodation detail page.

- **Trigger:** worker on URL match for the storefront's accommodation-
  detail route.
- **Idempotency key:** client-generated ULID.
- **Consent category:** `analytics`.
- **Payload:** shared context + `accommodation_id` + `accommodation_type`
  (hotel / cabin / camping / apartment / pitch).

### `availability_searched` v0.1.0 — Active (PR-B emits, PR-A registers)

Fires when the guest performs an availability search.

- **Trigger:** worker on search-form submission.
- **Idempotency key:** client-generated ULID.
- **Consent category:** `analytics`.
- **Payload:** shared context + `check_in_date` + `check_out_date` +
  `number_of_guests` + `results_count` + `filters_applied: string[]`.

### `cart_started` v0.2.0 — Current; v0.1.0 deprecated

Fires when the FIRST item lands in a previously-empty cart. Pairs
with `cart_updated`, `cart_abandoned`, and `checkout_started` for
funnel analysis.

- **Trigger:** worker, subscribed to cart state. Fires only when
  `cart.items.length === 0` immediately before the add.
- **Idempotency key:** client-generated ULID per emit; the cart's
  `cart_id` (separate client ULID) is what carries forward to
  subsequent cart_* events for the same lifecycle.
- **Consent category:** `analytics`.
- **Payload (v0.2.0):** shared context + `cart_id` + `product_id`
  (Product.id cuid) + `cart_total: { amount, currency }`.

**Schema versions:**

| Version | Status | Notes |
|---|---|---|
| v0.2.0 | Current | `accommodation_id` replaced by `product_id`. |
| v0.1.0 | **Deprecated** | Required `accommodation_id`. Mismatched the actual cart shape (Shop product cart, no accommodation concept). Kept registered at `schemas/legacy/cart-started-v0.1.0.ts` for outbox-drain backward compat only. Drop after the outbox is confirmed empty of v0.1.0 events. |

See `schemas/cart-started.ts` for the full Semantic Contract,
including the `cart_id` lifecycle (localStorage-backed, multi-tab
shared, regenerated on `clearCart()`).

### `cart_updated` v0.2.0 — Current; v0.1.0 deprecated

Fires on every cart mutation AFTER `cart_started` — adding, removing,
or changing quantity of line items.

- **Trigger:** worker, subscribed to cart state. The worker does NOT
  throttle or debounce — every emit-site call produces a distinct
  event with its own ULID. Outbox dedup is by
  `UNIQUE (tenant_id, event_id)`.
- **Idempotency key:** client-generated ULID per emit.
- **Consent category:** `analytics`.
- **Payload (v0.2.0):** shared context + `cart_id` + `items_count`
  (positive — sum of quantities) + `line_items_count` (positive —
  distinct line-item count) + `cart_total` + `action` (added /
  removed / quantity_changed).

**Schema versions:**

| Version | Status | Notes |
|---|---|---|
| v0.2.0 | Current | Adds required `line_items_count`. Tightens `items_count` from non-negative to positive. Sharpens `action` semantics (variant-swap → remove+add; coupon-only → no emit). |
| v0.1.0 | **Deprecated** | Lacked `line_items_count`. Allowed `items_count = 0`. Kept registered at `schemas/legacy/cart-updated-v0.1.0.ts`. |

See `schemas/cart-updated.ts` for the full Semantic Contract.

### `cart_abandoned` v0.2.0 — Current; v0.1.0 deprecated

Fires when the guest closes the tab or navigates away with a non-
empty cart that wasn't moved into checkout. Dispatched via
`navigator.sendBeacon()` from the unload handler.

- **Trigger:** worker on `pagehide` / `visibilitychange` to hidden,
  when cart is non-empty AND the cart is not currently being pushed
  to checkout.
- **Idempotency key:** client-generated ULID per emit.
- **Consent category:** `analytics`.
- **Payload (v0.2.0):** shared context + `cart_id` + `items_count`
  (positive) + `line_items_count` (positive) + `cart_total` +
  `time_since_last_interaction_ms` (cart-mutation events strictly).

**Schema versions:**

| Version | Status | Notes |
|---|---|---|
| v0.2.0 | Current | Adds `line_items_count` for parity with `cart_updated`. Defines "interaction" strictly as cart-mutation events (addToCart / removeFromCart / updateQuantity). |
| v0.1.0 | **Deprecated** | Lacked `line_items_count`; "interaction" was undefined. Kept registered at `schemas/legacy/cart-abandoned-v0.1.0.ts`. |

See `schemas/cart-abandoned.ts` for the full Semantic Contract,
including the `bf_cart_{tenantId}.lastMutationAt` storage location.

### `checkout_started` v0.2.0 — Current; v0.1.0 deprecated

Fires when the guest enters the checkout flow from the cart drawer.
Pairs with the SERVER-side `payment_succeeded` for checkout-
conversion analysis.

- **Trigger:** cart-drawer's checkout-button click handler, BEFORE
  the redirect to `/checkout?session=…`.
- **Idempotency key:** client-generated ULID per emit.
- **Consent category:** `analytics`.
- **Payload (v0.2.0):** shared context + `cart_id` + `items_count`
  (positive) + `line_items_count` (positive) + `cart_total`.

**Schema versions:**

| Version | Status | Notes |
|---|---|---|
| v0.2.0 | Current | Adds `line_items_count`. Makes cart-only scope explicit — non-cart purchase flows MUST NOT emit `checkout_started`. |
| v0.1.0 | **Deprecated** | Lacked `line_items_count`; cart-only scope was ambiguous. Kept registered at `schemas/legacy/checkout-started-v0.1.0.ts`. |

See `schemas/checkout-started.ts` for the full Semantic Contract.

### Out of scope: gift-card and one-shot purchase flows

`/shop/gift-cards/[slug]` (and any future one-shot purchase flow that
does NOT use the Shop product cart) MUST NOT emit `cart_started`,
`cart_updated`, `cart_abandoned`, or `checkout_started`. The cart
event family's `cart_id` is load-bearing for Phase 5 funnel joins; a
synthetic non-cart identifier joins to nothing and corrupts
conversion metrics.

A separate `purchase_initiated` event family (and likely
`purchase_completed` / `purchase_abandoned`) is deferred to a
follow-up PR. Until that PR lands, gift-card revenue is captured
via the server-side `payment_succeeded` event — what's missing is
the storefront-side funnel signal (intent → completion). Phase 5
gift-card dashboards will display revenue but not funnel rate
until that follow-up ships.

---

## Legacy analytics coexistence

Phase 3 PR-B introduces a new web pixel runtime that emits storefront
events through `/api/analytics/collect` → outbox → analytics pipeline.
The previously-existing `AnalyticsProvider`
(`app/(guest)/_components/AnalyticsProvider.tsx`) continues to fire
its own server-side `track()` calls to the v1 endpoint, writing to
`public.AnalyticsEvent`.

Both systems run **in parallel** during the Phase 3 → Phase 5 parity
window. This is intentional — duplicate emissions of conceptually-
overlapping events (`PAGE_VIEWED` v1 vs `page_viewed` v0.1.0) are the
mechanism that lets us validate the new pipeline's aggregations match
the legacy data before we cut over.

| Path | Endpoint | Storage | Lifecycle |
|---|---|---|---|
| Legacy (v1) | `/api/...` (AnalyticsProvider) | `public.AnalyticsEvent` table | Active, **kept untouched** through Phase 5 |
| PR-B (v0.1.0) | `/api/analytics/collect` | `analytics.event` via outbox | Active from Phase 3 PR-B onwards |

**Cutover plan:** post-Phase 5 — once the new pipeline's aggregations
have been production-validated against the legacy data for at least
30 days. The cutover PR removes:

- `app/(guest)/_components/AnalyticsProvider.tsx`
- The inline `<AnalyticsProvider>` mount in `app/(guest)/layout.tsx`
- The legacy v1 endpoint route + its associated DB writes
- The `public.AnalyticsEvent` table (drop migration after backup)

Until that PR ships, do **not** remove `AnalyticsProvider` from the
guest layout. The intent + cutover plan are also called out in the
JSX comment block above the `<AnalyticsLoader>` mount in the layout.

`RumCollector` is a separate concern (Real User Monitoring vitals,
not analytics events) and is kept untouched by both Phase 3 PR-B
and the future Phase 5 cutover.
