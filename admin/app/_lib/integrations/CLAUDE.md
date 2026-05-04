# PMS integration layer

Aggregator pattern — normalizes data from multiple hotel systems (Mews,
Apaleo, Opera) into a canonical format. Hotels connect once, platform
queries real-time availability, rates, and restrictions everywhere.

> See also: `reliability/CLAUDE.md` for the inbound/outbound reliability engine
> (webhook inbox, reconciliation, holds, idempotency, circuit breaker).

**Architecture: real-time queries, not background sync.**
The booking engine queries PMS on demand (availability search, rate lookup,
booking creation). There is no background sync loop — data is always fresh.

---

## Adapter contract (8 capabilities)

Every PMS implements PmsAdapter interface:

  1. getAvailability(params)       — rooms/units per date with rate plans
  2. getRoomTypes(tenantId)        — categories, capacity, images, facilities
  3. getRestrictions(from, to)     — min/max stay, CTA/CTD per date
  4. lookupBooking(reference)      — existing booking by confirmation number
  5. getGuest(bookingExternalId)   — guest data linked to a booking
  6. getAddons(categoryId?)        — extras (breakfast, parking, cleaning)
  7. getPaymentStatus(bookingId)   — paid/unpaid/outstanding balance
  8. testConnection(credentials)   — validate PMS credentials

Plus webhook infrastructure: resolveWebhookTenant(), verifyWebhookSignature()

`resolveAdapter(tenantId)` is the ONLY entry point for platform code.
Never call PMS APIs directly. Registry maps provider → adapter instance.

Implemented: Mews (stubbed — infrastructure ready), Fake (full dev data), Manual (no PMS)
Planned: Apaleo, Opera

---

## Normalized types (types.ts)

  RoomCategory      — accommodation type (id, name, description, images, capacity, base price)
  RatePlan          — pricing option (flexible/non-refundable, price per night, total, addons)
  AvailabilityResult — search result (categories with rate plans, units, search params)
  Restriction       — stay constraints (min/max nights, CTA/CTD per date)
  BookingLookup     — existing booking (guest, dates, status, amount, rate plan)
  GuestData         — guest info (name, email, phone, address)
  Addon             — extra service (name, price, pricing mode)
  PaymentStatus     — payment state (total, paid, outstanding, status)

All types have Zod schemas for runtime validation.

---

## Credentials & encryption

AES-256-GCM encryption (crypto.ts). 12-byte IV, 16-byte auth tag.
Key: INTEGRATION_ENCRYPTION_KEY env var (min 32 chars).
Credentials never logged, never returned to client in cleartext.
Sensitive fields masked as "••••••••••••••••" in UI.

---

## Resilience layers

1. Rate limiting — DB-backed token bucket (200 req/30s per accessToken)
2. Circuit breaker — consecutiveFailures on TenantIntegration (opens after 5)
3. Webhook dedup — WebhookDedup table with unique dedupKey (7d retention)
4. Webhook signature verification — provider-specific (Mews: URL token)
5. Audit logging — SyncEvent append-only log for all PMS interactions

---

## Data models

  TenantIntegration — 1:1 with Tenant. Provider, encrypted creds, status, circuit breaker
  SyncEvent — append-only audit log (webhook events, connection tests)
  RateLimit — token bucket per accessToken (DB-backed)
  WebhookDedup — dedup key per webhook event (7d retention)

---

## Key files

- Normalized types: `app/_lib/integrations/types.ts`
- Adapter interface: `app/_lib/integrations/adapter.ts`
- Registry: `app/_lib/integrations/registry.ts`
- Resolution: `app/_lib/integrations/resolve.ts`
- Mews adapter: `app/_lib/integrations/adapters/mews/`
- Fake adapter: `app/_lib/integrations/adapters/fake/`
- Circuit breaker: `app/_lib/integrations/sync/circuit-breaker.ts`
- Encryption: `app/_lib/integrations/crypto.ts`

---

## Integration invariants — never violate these

1. resolveAdapter(tenantId) is the ONLY way to get an adapter
2. All PMS data normalized to canonical types (RoomCategory, RatePlan, etc.)
3. Credentials encrypted at rest, decrypted only at call time
4. Real-time queries — no background sync, data is always fresh from PMS
5. Circuit breaker uses consecutive failures (opens after 5)
6. Webhook dedup via DB unique constraint
7. Fake adapter throws in production — dev/test only
8. Every adapter method returns normalized data — never raw PMS responses
