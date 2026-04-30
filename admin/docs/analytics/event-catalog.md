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

### `payment_succeeded` v0.1.0 — Active

A payment for an Order was captured. Fires for **every** paid Order
regardless of `orderType` (ACCOMMODATION, PURCHASE, …).

- **Trigger:** same as `booking_completed` —
  `processOrderPaidSideEffects` after Order is PAID.
- **Idempotency key:** `payment_succeeded:${stripePaymentIntentId ??
  order.id}`. Stripe PI is the canonical reference for Stripe-backed
  orders; for INVOICE / future SwedbankPay / NETS without a
  stripePaymentIntentId, `order.id` is the stable fallback.
- **Payload (`PaymentSucceededPayloadSchema`):**

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
  ```

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
