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
