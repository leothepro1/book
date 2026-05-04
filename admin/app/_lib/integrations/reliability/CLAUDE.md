# PMS reliability engine

Booking.com / Shopify-grade system that guarantees no booking is
ever lost from a PMS, regardless of network conditions, webhook
delivery failures, or partial outages. Three layers, one ingest
chokepoint, zero tolerance for data loss.

---

## The ingest chokepoint

`upsertBookingFromPms()` in `app/_lib/integrations/reliability/ingest.ts`
is the ONLY path into the Booking table from a PMS. Every writer —
webhook handler, reconciliation cron, manual admin tool — routes
here. This single point of entry is what makes concurrent writes
and out-of-order events correct.

Guarantees:
1. Exactly-once per (tenantId, externalId). Two concurrent calls
   serialize on the row lock; one wins, the other is a no-op.
2. Monotonic version progression. Incoming `providerUpdatedAt` ≤
   stored → `unchanged_stale`. Newer never overwritten by older.
3. Atomic transaction. Booking + version-bump commit as one unit.
4. Non-blocking audit. SyncEvent + structured log run POST-commit.
   Audit failure never aborts a durable write.
5. Transient-failure recovery. P2002 (insert-race) and P2034
   (deadlock/serialization) → jittered exp backoff, max 3 attempts.

---

## Three protection layers

```
Layer 1  Webhook route         → fast path (ack <1s, sync process <8s)
Layer 2  Retry cron            → drains PmsWebhookInbox
Layer 3  Reconciliation cron   → listBookings sweep, catches the rest
```

**Layer 1 — webhook** (`/api/webhooks/pms/[provider]`):
- Raw body captured BEFORE JSON parse (signature covers exact bytes)
- Tenant resolved from payload via `resolveWebhookExternalTenant()`
  (credential-free — breaks the "need creds to verify signature,
  need tenant to find creds" paradox)
- Signature verified by `adapter.verifyWebhookSignature()`
- Events parsed by `adapter.parseWebhookEvents(rawBody, payload)`
- Each event → PmsWebhookInbox row (transactional inbox pattern)
- Sync process within 8s budget, else defer to retry cron
- Unknown tenant = 200 (don't let PMS retry forever for unhosted enterprises)
- Rate limited per-tenant via Upstash (600/min)

**Layer 2 — retry cron** (`/api/cron/retry-pms-webhooks`, every 5 min):
- Picks PENDING/FAILED inbox rows ordered by `nextRetryAt ASC`
- Reuses `processInboxRow()` — same pipeline as the live route
- Retry ladder: 5m → 15m → 1h → 4h → 24h → DEAD
- DEAD rows require manual intervention (surface in admin UI)

**Layer 3 — reconciliation** (`/api/cron/reconcile-pms?tier=X`):
- `hot` (every 2 min, 30-min window): catches typical misses
- `warm` (every hour, 24-hour window): covers outages
- `cold` (nightly 03:23, 7-day window): drift + cancellation sweep
- Active-tenant filter (not manual, status != error, recon enabled,
  recent sync activity) — reduces 10k-tenant fleet by 70–90%
- Per-tenant Redis lock (`recon:{tenant}:{provider}:{tier}`) — no
  double-processing across concurrent cron invocations
- Cursor resume: `ReconciliationCursor` persisted before first fetch
  and after every page. Crash mid-sweep = next run resumes exactly
  where we stopped
- Budget-aware: 8s/tenant for hot, 20s/warm, 60s/cold. Over budget
  → yield, save cursor, next run continues

---

## Webhook inbox pattern

Every webhook delivery is persisted to `PmsWebhookInbox` BEFORE we
try to process it. The atomic unit is "event persisted", not "event
fully processed". Duplicate deliveries collide on
`@@unique([provider, externalEventId])` and are deflected at the DB.

Status machine: PENDING → PROCESSING → PROCESSED | FAILED | DEAD.
`updateMany where status IN (PENDING, FAILED)` is the claim
mechanism — two workers racing for the same row, only one gets
`count=1`, the other skips.

---

## Re-fetch pattern (NOT trust-the-payload)

The webhook handler NEVER trusts the payload as booking state. It
calls `adapter.lookupBooking(externalBookingId)` to fetch the
CURRENT state from the PMS, then feeds that through the ingest
chokepoint. Resilient to out-of-order deliveries, reordered PMS
retries, stale payloads, and PMS bugs — whatever happened at the
PMS, we always get the latest view.

---

## The critical SLO signal

`pms.ingest.created` with `source="reconciliation"` means the
webhook path missed a booking. Should be 0 in steady state. Any
sustained non-zero per-tenant = webhooks broken for that tenant.
Alerting should tail this event and page on baseline deviation.

Secondary signals: `pms.webhook.dead` (retry ladder exhausted —
manual review), `pms.webhook.signature_invalid` at high frequency
(attacker probing or misconfigured integration),
`pms.reconcile.list_bookings_failed` (adapter health).

---

## Reliability engine invariants — never violate

1. `upsertBookingFromPms()` is the ONLY writer to Booking from PMS
2. `providerUpdatedAt` is the version vector — adapters MUST return
   a non-null value; fabricated timestamps break stale detection
3. Webhook handler NEVER trusts payload state — always re-fetches
4. Inbox row persists BEFORE processing — never the other way
5. Dedup key is `(provider, externalEventId)` — provider-specific
   derivation (Mews uses `sha256(rawBody)` since it lacks native IDs)
6. Status transitions are exclusive: PROCESSING/PROCESSED/DEAD never
   move backwards; FAILED → PROCESSING transitions via updateMany
   with status filter (one worker wins)
7. Retry ladder is fixed (5m → 15m → 1h → 4h → 24h → DEAD) —
   matches email retry convention
8. Reconciliation cursor saved BEFORE first page fetch AND after
   every page — crash safety
9. Circuit breaker checked before every tenant sweep
10. Tenant kill-switch: `TenantIntegration.reconciliationEnabled`
    only affects reconciliation; webhook always flows

---

## Key files (inbound)

- Ingest chokepoint: `app/_lib/integrations/reliability/ingest.ts`
- Webhook intake: `app/_lib/integrations/reliability/webhook.ts`
- Reconciliation: `app/_lib/integrations/reliability/reconcile.ts`
- Tier config + active-tenant selection: `app/_lib/integrations/reliability/tiers.ts`
- Ingest contract: `app/_lib/integrations/reliability/types.ts`
- Webhook tenant resolver: `app/_lib/integrations/webhook-tenant.ts`
- Redis lock helper: `app/_lib/redis/lock.ts`
- Concurrency pool: `app/_lib/concurrency/pool.ts`
- Webhook route: `app/api/webhooks/pms/[provider]/route.ts`
- Retry cron: `app/api/cron/retry-pms-webhooks/route.ts`
- Reconciliation cron: `app/api/cron/reconcile-pms/route.ts`
- Cleanup cron: `app/api/cron/cleanup-pms-reliability/route.ts`

---

## Outbound booking pipeline (counterpart to inbound)

When a guest pays in our checkout, the PMS createBooking call goes
through a transactional outbox — same reliability rigor as inbound,
but for the outgoing direction. Prevents the "guest paid, hotel has
no record" failure mode.

Flow:

  Stripe webhook → processOrderPaidSideEffects
    → enqueueOutboundJob (writes PmsOutboundJob row, idempotent)
    → processOutboundJob (sync fast-path)
    → createPmsBookingAfterPayment

On failure: row stays PENDING/FAILED → retry cron drains with
exponential backoff (5m → 15m → 1h → 4h → 24h). If ladder exhausts:
row → DEAD → compensation phase → Stripe refund + Order CANCELLED +
Booking CANCELLED. If refund also fails after its own ladder: row →
COMPENSATION_FAILED (page operator; money stuck at Stripe).

Status machine:
  PENDING → PROCESSING → COMPLETED ⟂
  PROCESSING → FAILED → PROCESSING (retry) OR → DEAD (ladder done)
  DEAD → COMPENSATING → COMPENSATED ⟂
  DEAD → COMPENSATING → COMPENSATION_FAILED ⟂ (operator intervention)

Critical SLO signals:
  pms.outbound.dead > 0 sustained — adapter consistently rejecting
  pms.outbound.compensation_failed_terminal — money is stuck, PAGE
  pms.outbound.completed — baseline success metric

Outbound invariants — never violate:
1. enqueueOutboundJob is the ONLY writer to PmsOutboundJob on create
2. Every terminal status write uses CAS (updateMany with
   claimedAt match) — stolen reclaims never overwrite newer state
3. Primary phase (createBooking) and compensation phase (refund)
   have INDEPENDENT retry ladders — a failed refund does NOT roll
   back to re-attempt createBooking
4. Refund goes through payment adapter's refund() — never direct
   Stripe SDK calls; keeps multi-PSP-ready
5. Booking cancellation mirrors Order cancellation — Booking.status
   is updated to CANCELLED in the same compensation pass
6. PROCESSING / COMPENSATING stranded > 5 min are reclaimed by the
   retry cron via lastAttemptAt / compensationLastAt cutoff

### Outbound key files

- Core module: `app/_lib/integrations/reliability/outbound.ts`
- Compensation logic: `app/_lib/integrations/reliability/outbound-compensation.ts`
- Integration: `app/_lib/orders/process-paid-side-effects.ts` (enqueues + fast-path)
- PMS booking creation: `app/_lib/accommodations/create-pms-booking.ts`
- Retry cron: `app/api/cron/retry-pms-outbound/route.ts`

---

## Availability hold (checkout-phase reservation)

Prevents the "two guests at the last unit" double-booking race.
When checkout begins (Order + Booking created but before Stripe PI),
we call `adapter.holdAvailability()` to lock the unit at the PMS
for 15 minutes. On successful payment, `adapter.confirmHold()`
promotes the Optional reservation to Confirmed. On timeout, the
release-expired-holds cron calls `adapter.releaseHold()` and
cancels the Order.

Flow:

  POST /api/checkout/payment-intent
    → Create Order + Booking (no Stripe yet)
    → placeHoldForOrder → adapter.holdAvailability
        ├─ Mews: reservations/add with State=Optional + ReleasedUtc
        ├─ Fake: in-memory Map with status=HELD
        └─ Manual: returns null (no hold, legacy behaviour)
    → If hold fails: cancel Order, return 503 (guest retries)
    → If hold succeeds: save holdExternalId + holdExpiresAt on Booking
    → Create Stripe PaymentIntent → return clientSecret to client

  Stripe webhook: payment_intent.succeeded
    → processOrderPaidSideEffects
    → enqueueOutboundJob → processOutboundJob
    → createPmsBookingAfterPayment
    → Hold path: adapter.confirmHold(holdExternalId) → pmsBookingRef
    → No-hold path: adapter.createBooking (legacy fallback)

  Timeout / abandonment:
    → release-expired-holds cron (every 5 min)
    → adapter.releaseHold + Booking CANCELLED + Order CANCELLED
    → Best-effort: cancel Stripe PaymentIntent so late payment blocked

Hold invariants — never violate:
1. placeHoldForOrder is called AFTER Order+Booking tx commit but
   BEFORE any Stripe API call — hold failure voids Order cheaply.
2. Hold expiration before confirmHold = Order refunded (hold expired,
   unit gone to someone else). Checked in create-pms-booking.ts.
3. Adapters returning null from holdAvailability = no hold (legacy),
   flow degrades to post-payment createBooking.
4. holdExternalId and externalId may be the same (Mews reuses) or
   differ (other PMSes). confirmHold() returns the final externalId.
5. release-expired-holds cron is the local safety net; the PMS also
   auto-releases at ReleasedUtc — having both means we're robust to
   either side missing the release.

### Hold key files

- Hold placement: `app/_lib/integrations/reliability/place-hold-for-order.ts`
- Adapter interface: `holdAvailability / confirmHold / releaseHold` in `adapter.ts`
- Mews implementation: `app/_lib/integrations/adapters/mews/index.ts`
- Fake implementation: `app/_lib/integrations/adapters/fake/index.ts` (in-memory)
- Checkout integration: `app/api/checkout/payment-intent/route.ts`
- Post-payment confirm: `app/_lib/accommodations/create-pms-booking.ts`
- Expire cron: `app/api/cron/release-expired-holds/route.ts`

---

## Idempotency-key layer (outbound PMS dedup)

Prevents duplicate PMS bookings when our network call to the PMS
times out AFTER the PMS completed the operation but BEFORE we
received the response. Without this, the outbound retry ladder
would blindly retry and create duplicate reservations.

Every mutating PMS call (createBooking, holdAvailability) is wrapped
in `withIdempotency(key, opts, fn)`. The key is derived from
(tenantId, provider, operation, canonicalized inputs) — identical
retries compute identical keys.

First caller: claims IN_FLIGHT row, runs fn, stores result as
COMPLETED (or FAILED with the error payload).

Concurrent / later callers with the same key: see the existing row,
return the cached result (or rethrow the cached error). The PMS is
never called twice for the same operation.

TTL: 48 hours (covers retry ladder worst case of ~30h + buffer).
Cleanup cron deletes COMPLETED and FAILED rows older than this;
IN_FLIGHT rows are left for manual triage (orphans are rare and
signal a bug worth investigating).

### Idempotency invariants — never violate

1. Key input MUST include every parameter that affects outcome.
   Missing orderId = dedup collapses different logical bookings.
2. Keys are deterministic — same retry produces same key.
3. FAILED cached errors are terminal by default. Callers that want
   to retry after failure must compute a DIFFERENT key (e.g. mix
   in attempt number).
4. Idempotency wraps the BOUNDARY call (adapter method invocation),
   not the entire business-logic function. Business logic around
   the call is not idempotent and may run multiple times safely.
5. Only wrap operations that have side effects at the PMS side.
   Read-only calls (getAvailability, listBookings) don't need it.

---

## Circuit breaker (v2: half-open + time-reset)

Three implicit states derived from TenantIntegration columns:

- CLOSED: `consecutiveFailures < 5`. Normal operation.
- OPEN: `consecutiveFailures >= 5` AND `lastErrorAt` within last 60 s.
  Reconcile cron skips the tenant. Webhook inbox continues (but
  marks DEAD faster since lookupBooking fails).
- HALF_OPEN: `consecutiveFailures >= 5` AND `lastErrorAt` older
  than 60 s. `isCircuitOpen()` returns false so ONE probe call can
  go through. Success → CLOSED (counter reset). Failure →
  increments counter, transition back to OPEN.

Auto-recovery: a transient Mews outage that lasts <60s self-heals
on the next scheduled webhook or reconcile sweep. No manual reset
needed. The `pms.circuit.auto_closed` log event fires when
transitioning from OPEN/HALF_OPEN back to CLOSED — operators see
the recovery in structured logs.

### Idempotency + circuit breaker key files

- Idempotency helper: `app/_lib/integrations/reliability/idempotency.ts`
- Idempotency schema: `PmsIdempotencyKey` in `prisma/schema.prisma`
- Circuit breaker: `app/_lib/integrations/sync/circuit-breaker.ts`
- Cleanup cron: `app/api/cron/cleanup-pms-reliability/route.ts`

---

## Backup + disaster recovery

The reliability engine has a portable state: every important row
(inbox, outbound, cursors, idempotency, audit events) can be
streamed to JSONL and restored into any compatible DB. This gives
us a second-order backup independent of Neon PITR.

npm commands:

  npm run pms:export                    # all tenants, to stdout
  npm run pms:export -- --tenantId=X    # single tenant
  npm run pms:export -- --output=s.jsonl
  npm run pms:import -- --input=s.jsonl              # additive
  npm run pms:import -- --input=s.jsonl --overwrite --yes
  npm run pms:import -- --input=s.jsonl --dry-run
  npm run pms:verify                    # round-trip smoke test

Full DR runbook: `docs/runbooks/pms-reliability-dr.md` — scenarios
for single-table corruption, accidental DROP, tenant-specific
rollback, Neon PITR, and replay into fresh environments.

Recommended operational cadence:
- Weekly JSONL snapshot to S3 (via `pms:export`)
- Quarterly restore drill (create Neon branch → verify)
- Monthly `pms:verify` in CI

---

## Fairness + health monitoring

Retry crons fetch 3× the batch size and round-robin-interleave
rows by tenantId before passing to the concurrency pool. A single
tenant with thousands of PENDING rows cannot monopolise the 8
worker slots; every active tenant gets at least one slot per run.

Pull-based health endpoint: `GET /api/admin/pms-reliability/health`
(auth: Bearer CRON_SECRET). Returns JSON aggregating:

- Per-table counts by status + oldest pending/dead age
- Stranded PROCESSING / COMPENSATING counts
- Tenant-level: withOpenCircuit, withDeadWebhookRows, withCompensationFailed
- Last cron run ages (reconcile hot/warm/cold, webhook ingest)
- Backlog counters (inboxPending, outboundPending, expiredHoldsPending)

Wire to Datadog/Grafana/Uptime via HTTP polling (recommended every
minute). Alert rules:

- `backlog.inboxPending > 5000`                  → system saturated
- `tenants.withCompensationFailed > 0`           → money stuck, page on-call
- `tables.PmsWebhookInbox.strandedProcessing > 0` → retry cron degraded
- `crons.reconcileHotAgeSec > 300`               → hot-tier cron not running
- `tables.PmsWebhookInbox.oldestPendingAgeSec > 600` → backlog growing

Key files:

- Round-robin helper: `app/_lib/concurrency/round-robin.ts`
- Health endpoint: `app/api/admin/pms-reliability/health/route.ts`

---

## Delivery-guarantee verification (read-your-write + shadow audit)

Closes the remaining "did the PMS actually store what we sent?"
gap. Three layers:

**1. Read-your-write post-write** (synchronous)
After createBooking / confirmHold succeeds, the reliability engine
calls `adapter.lookupBooking` and compares the stored fields
(checkIn day, checkOut day, guests, email, status) against what
we sent. Mismatches don't fail the write — they set
`Booking.integrityFlag` + `integrityMismatchFields` for operator
review. Catches timezone drift, field truncation, and silent
eventual-consistency where the PMS accepts but doesn't persist.

**2. Nightly shadow audit** (`/api/cron/shadow-audit-pms`, 02:30)
Walks every PAID Booking with pmsBookingRef set, up to 30 days
old, that hasn't been integrity-checked in the last 24 h. Verifies
each against PMS via the same helper. Complementary to
reconciliation which sweeps by PMS-modification time (reconcile
misses bookings that were stable but silently corrupted locally).

**3. Hold-expired recovery path**
Before `create-pms-booking.ts` treats an expired hold as DEAD
(triggering refund), it calls adapter.lookupBooking first. If PMS
returns a valid Confirmed/Started/Checked-out reservation
(microsecond-near-edge race), we recover — save the ref and
complete normally, no refund. Without this, genuine confirmed
bookings get refunded while the hotel has the guest on the books.

**4. COMPENSATION_FAILED escalation**
`outbound.ts` fires `sendOperatorAlert` via direct Resend on the
(rare) case where both the PMS booking AND the Stripe refund fail
terminally. Sends to `OPERATOR_ALERT_EMAIL` env var, falls back to
`PLATFORM_ADMIN_EMAIL`. Money-stuck-at-Stripe no longer depends on
someone watching logs.

### Verification invariants — never violate

1. Read-your-write is NON-BLOCKING. A mismatch flags the booking
   but does not fail the write — the booking IS created at PMS.
2. `adapter_unreachable` is NEVER flagged as mismatch. "We
   couldn't check" is distinct from "we checked and it's wrong".
3. Shadow audit skips bookings already flagged in last 24 h —
   avoids re-flagging same mismatch indefinitely.
4. Hold-expired recovery ALWAYS consults PMS first, never fires
   compensation on clock-drift alone.
5. Operator alert is fire-and-forget — email send failures don't
   prevent the state transition that triggered them.

### Verification key files

- Verify helper: `app/_lib/integrations/reliability/verify-pms-state.ts`
- Shadow audit cron: `app/api/cron/shadow-audit-pms/route.ts`
- Hold recovery: `app/_lib/accommodations/create-pms-booking.ts`
- Operator alert: `app/_lib/integrations/reliability/alert-operator.ts`
