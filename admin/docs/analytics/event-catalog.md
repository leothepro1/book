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

### `booking_imported` v0.x.0 — Planned (Phase 2)

A booking that originated AT a PMS (Mews, Apaleo, Opera, …) was
ingested by Bedfront's reliability engine. **Deliberately a separate
event type** from `booking_completed`, NOT the same event with a
different `source_channel` value, because:

- PMS-imported bookings have a different field profile. The local
  `Booking` row from the PMS chokepoint has no linked Order, no
  guaranteed accommodationId, and no money on the Booking model
  itself (totalAmount + currency live on Order, which PMS-imports
  don't have). Forcing both shapes into one schema would either
  destroy the required-field contract for `booking_completed` or
  pad PMS-import payloads with placeholder values — both options
  destroy dimensional clarity at the analytics layer.

- Conflating them would also defeat Phase 5 aggregations. Questions
  like "what's the average revenue per direct booking?" or "how
  much PMS-side volume are we observing?" need to filter by event
  type, not by an enum value inside an otherwise-overloaded payload.

- The trigger sites are different (operational layer's
  `ingest.ts` for imports, `processOrderPaidSideEffects` for direct).
  Two events, two emit sites, two clear contracts.

Phase 2 will add the schema and emit site. Until then, PMS-imported
bookings are visible only in the legacy `public.AnalyticsEvent`
table (via the legacy emitter, untouched by this work).

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
