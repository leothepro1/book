# Cancellation engine

Saga orchestrator for booking cancellations. Sequenced, retryable steps
across PMS + Stripe + DB + email + audit log. Every failure mode is
persisted as a state transition; the engine never throws to its caller.

> Full design doc: `admin/docs/cancellation-engine.md`.

---

## Saga sequence

```
1. PMS cancel       adapter.cancelBooking()
                    transient → schedule retry; permanent → DECLINE
                    idempotent via adapter's alreadyCanceled recognition
↓
2. Stripe refund    only when refundAmount > 0 AND order has PaymentIntent
                    idempotency key = "cancellation:{id}:refund"
                    transient → retry; permanent → refundStatus=FAILED, alert admin
                    NEVER reverses the PMS cancel (PMS is upstream)
↓
3. DB commit        single $transaction:
                      Order → CANCELLED + OrderEvent
                      Booking → CANCELLED
                      CancellationRequest → CLOSED
↓
4. Email            sendEmailEvent("BOOKING_CANCELLED")
                    best-effort; failure logged, request stays CLOSED
↓
5. SyncEvent        audit trail for PMS-side observability
```

The engine is called by:
- `approveCancellationRequest()` — inline, immediately after REQUESTED → OPEN
- `retry-cancellation-saga` cron — for OPEN rows whose `nextAttemptAt` passed

---

## State machine

```
REQUESTED ─┬─→ OPEN ─┬─→ CLOSED        (terminal — saga succeeded)
           │         └─→ DECLINED      (permanent failure — restartable via new request)
           ├─→ DECLINED                (staff declined — restartable)
           ├─→ CANCELED                (terminal — buyer/staff withdrew before saga)
           └─→ EXPIRED                  (terminal-but-restartable — REQUESTED aged out)
```

`canTransitionCancellation(from, to)` is the ONLY guard. Terminal-but-
restartable (DECLINED, EXPIRED) means a NEW CancellationRequest can be
created for the same booking, but the existing row never moves further.

`isTerminalCancellationStatus()` and `allowsRestart()` are the helpers
for UI logic.

---

## Backoff schedule

`backoff.ts::computeNextAttemptAt(attempt)` — exponential with jitter:

  attempt 1 → +5 min
  attempt 2 → +15 min
  attempt 3 → +1 h
  attempt 4 → +4 h
  attempt 5 → +24 h
  attempt 6+ → DECLINE (manual intervention)

Same ladder as PMS webhook retry and email retry — operational consistency
across the platform.

---

## Idempotency

`idempotency.ts::acquireCancellationLock(requestId)` claims an in-flight
slot via `updateMany` with a status filter. Two concurrent saga
invocations: only one gets `count=1`. The other returns and lets the
winner proceed.

The Stripe refund call uses the explicit idempotency key
`cancellation:{requestId}:refund` — Stripe deduplicates server-side.

---

## Policy resolution

`policy.ts` + `policy-resolution.ts` — refund policy per booking
(check-in date, days-out, accommodation category override). Returns
`refundAmount` (BigInt ören) consumed by step 2.

Policy precedence:
1. Booking-level override (set on booking creation if present)
2. Accommodation-category policy
3. Tenant default

Policy is evaluated at REQUEST time (frozen on the row), not at saga
time, so mid-saga policy edits never change in-flight refunds.

---

## Critical SLO signals

`cancellation.refund.failed_terminal` — money is stuck (refund permanent
fail after PMS already cancelled). Page operator immediately. Triggers
alert via `alert-operator.ts` pattern (same as PMS reliability).

`cancellation.saga.stuck_open` — OPEN rows older than 24h with no
`nextAttemptAt`. Cron not draining; investigate.

`cancellation.declined_after_pms_success` — saga decided to DECLINE
after PMS already cancelled. Indicates a logic bug — these should be
rare and demand a code-level audit.

---

## Key files

- Saga orchestrator: `app/_lib/cancellations/engine.ts`
- State machine: `app/_lib/cancellations/state-machine.ts`
- Approve / decline: `app/_lib/cancellations/approve.ts`, `decline.ts`
- Create request: `app/_lib/cancellations/create.ts`
- Backoff: `app/_lib/cancellations/backoff.ts`
- Idempotency lock: `app/_lib/cancellations/idempotency.ts`
- Policy: `app/_lib/cancellations/policy.ts`, `policy-resolution.ts`
- Refund calculator: `app/_lib/cancellations/calculate.ts`
- Email trigger: `app/_lib/cancellations/email.ts`
- Errors taxonomy: `app/_lib/cancellations/errors.ts`
- Retry cron: `app/api/cron/retry-cancellation-saga/`
- Design doc: `admin/docs/cancellation-engine.md`

---

## Dependencies

- `_lib/integrations` — adapter.cancelBooking (PMS)
- `_lib/stripe` — refund via Stripe Connect
- `_lib/orders` — Order.canTransition() for the DB commit step
- `_lib/email` — BOOKING_CANCELLED template

---

## Cancellation invariants — never violate

1. `engine.ts` is the ONLY place the 5-step saga runs — never split steps across services
2. Engine never throws to caller — every failure persists as state + retry marker
3. Step 2 (refund) NEVER reverses Step 1 (PMS cancel) — PMS is upstream truth
4. `cancellation:{id}:refund` is the Stripe idempotency key — never generate per-attempt
5. `canTransitionCancellation()` is the ONLY status guard — no inline checks
6. Refund amount frozen at REQUEST time (policy snapshot) — never re-evaluated mid-saga
7. Email failure NEVER moves status backwards — best-effort step
8. SyncEvent (step 5) failure NEVER aborts Step 3's commit — audit is post-commit
9. Manual DECLINE on a booking with successful PMS cancel + failed refund → page operator immediately
10. Backoff ladder is fixed — matches PMS webhook + email retry conventions
