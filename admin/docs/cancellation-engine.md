# Cancellation Engine — architecture & implementation

Shopify-parity self-service cancellations for bookings. One central saga orchestrator; PMS adapters as plug-ins; strict state machine; explicit idempotency; fee snapshot at policy-evaluation time.

> **Status**: spec (pre-implementation). Last updated 2026-04-22.
> **Audience**: engineers building cancellations + anyone reviewing the design.
> **Related**: `/admin/app/_lib/integrations/` (PMS aggregator), `/admin/app/_lib/orders/` (Order state machine), `admin/CLAUDE.md` (platform invariants).

---

## 1. Goals & non-goals

### Goals
- Guest can self-initiate cancellation from the booking portal; staff can initiate from admin; PMS (Mews et al.) can initiate via webhook.
- Merchant-configurable policies: tiered fee schedules, auto-approve vs. manual review, per-policy expire window.
- Exactly-once side effects: PMS cancel is posted at most once, Stripe refund at most once, cancellation email at most once (per recipient per event).
- State machine is the source of truth; concurrent mutations fail with `INVALID_STATE` rather than corrupt state.
- PMS failure never triggers a refund. Refund failure never rolls back PMS. Saga has explicit retry + escalation rules.
- All operations tenant-scoped; zero cross-tenant leakage.

### Non-goals (Phase 1)
- Partial-night cancellations (refund 2 of 3 nights). Phase 1 is all-or-nothing per booking.
- Exchanges / rebooking credit ("turn refund into future stay credit"). Shopify has this via `ExchangeLineItem`; we defer.
- Guest-portal UI, admin queue UI, email template copy. Covered by Phase 3 and 4.
- Auto-approve based on custom merchant rules engine beyond `requireApproval` bool + tiered fee schedule.

---

## 2. Research-backed decisions

Every decision below is traceable to research findings. Do not change these without reading the linked source.

### Shopify-derived (match their pattern)
| Decision | Source |
|---|---|
| State machine: `REQUESTED → OPEN → CLOSED` with side-terminal `DECLINED` / `CANCELED` | `shopify.dev/.../enums/ReturnStatus` |
| `INVALID_STATE` as the only concurrency guardrail (no row-version ETag returned to clients) | `shopify.dev/.../enums/ReturnErrorCode` |
| Refund decoupled from cancellation status — can close without refund, can have many refunds | `shopify.dev/.../objects/Return.refunds` |
| `guestNote` ≤ 300 chars, `declineNote` ≤ 500 chars | Customer Account API `RequestedLineItemInput`, Admin `ReturnDeclineRequestInput` |
| Reasons as merchant-defined taxonomy with stable `handle` | `shopify.dev/.../objects/ReturnReasonDefinition` |
| Policy snapshot frozen on the order at checkout ("rule changes apply only to future orders") | Help Center: Return rules |
| Decline is terminal-but-restartable (new request can be created); Cancel is terminal | `returnDeclineRequest` docs: "each associated fulfillment line item becomes available for a new return request" |
| Calculate-preview before submit (`returnCalculate` → `cancellationCalculate`) | Customer API `returnCalculate` |

### Hotel-specific divergences (intentionally different from Shopify)
| Decision | Why |
|---|---|
| **Tiered fee schedule** (`hoursBeforeCheckIn → feePercent`) instead of flat `RestockingFee.percentage` | Hotels conventionally use stepped schedules (0% >30d / 50% 7-30d / 100% <7d). |
| **Magic-link auth** for guest-initiated cancel (not full OAuth customer account) | Guests are one-shot visitors, not returning shoppers. Matches the existing `MagicLinkToken` model. |
| **Auto-expire `REQUESTED` after N hours** (`CancellationPolicy.autoExpireHours`, default 48) | Shopify has no auto-expire — hotel revenue management needs a clock on pending decisions. |
| **No line items in Phase 1** (cancel is atomic per booking) | Bookings are single-unit reservations. Multi-night partial cancels deferred. |

### Mews-constrained (API limitations we must work around)
| Limitation | Our response |
|---|---|
| Mews has **no idempotency-key** support | We own dedup via `PendingCancellationLock` (SHA-256 over tenant+booking+attempt) and treat 403 "not cancellable" as success. |
| Mews has **no "un-cancel"** — `Canceled` is terminal | Our state machine has no reversal paths either. Reassurance UX ("are you sure?") lives in the portal. |
| Mews **does not expose rate limits** publicly | Respect `Retry-After` on 429, exponential backoff via `resilientFetch`, circuit breaker after 5 consecutive failures (existing infra). |
| Mews **does not accept `CancellationReason`** in request; only free-text `Notes` | We store our reason locally; send `"reason=<handle> note=<guestNote>"` to Mews `Notes` for operator visibility. |
| Mews **does not auto-refund** (informational only when we own Stripe) | Saga triggers Stripe refund in a second step after PMS cancel confirms. |
| Mews fee math (`AbsoluteFee + RelativeFee`) is under-documented | We compute fee from our own snapshotted policy; we pass `PostCancellationFee=false` to Mews so it does not post its own (possibly divergent) fee. |
| Mews webhook `ServiceOrderUpdated` only carries entity-id; no dedicated "canceled" event | Our webhook handler is a *trigger for polling*: fetches fresh state via `reservations/getAll`, diffs against our record, acts accordingly. |

---

## 3. Data model

### 3.1 New models

```prisma
// === CancellationRequest ============================================
// Shopify-parity. One per cancellation lifecycle.
// A booking may have many requests *over time* (DECLINED/EXPIRED are
// restartable), but at most one active (non-terminal) at any moment.
model CancellationRequest {
  id        String @id @default(cuid())
  tenantId  String
  bookingId String
  orderId   String?

  // --- State machine ---
  status    CancellationStatus @default(REQUESTED)

  // --- Who initiated & why ---
  initiator       CancellationInitiator
  initiatorUserId String?            // Clerk userId if STAFF; nullable for GUEST/PMS/SYSTEM
  reasonHandle    String?            // FK-like to CancellationReasonDefinition.handle (loose — reason defs may be soft-deleted)
  guestNote       String?            @db.VarChar(300)

  // --- Decline-specific (only populated when status=DECLINED) ---
  declineReason CancellationDeclineReason?
  declineNote   String?                     @db.VarChar(500)

  // --- Financial snapshot (in ören/cents at request creation, never recomputed) ---
  originalAmount        Int
  cancellationFeeAmount Int
  refundAmount          Int     // = originalAmount - cancellationFeeAmount
  currency              String

  // --- Policy snapshot (what rule was applied at this moment) ---
  // Shape: { policyId, policyName, tiers: [{hoursBeforeCheckIn, feePercent}], appliedTier: {...}, hoursBeforeCheckInAtRequest }
  policySnapshot Json

  // --- PMS sync state ---
  pmsProvider          String?   // Denormalized from tenant at request time for audit
  pmsCanceledAt        DateTime?
  pmsExternalFeeItemId String?   // Mews OrderItem ID — null if PostCancellationFee=false (our default)

  // --- Refund tracking ---
  refundStatus   RefundStatus  @default(NOT_APPLICABLE)
  stripeRefundId String?
  refundedAt     DateTime?

  // --- Timeline timestamps (Shopify pattern) ---
  requestedAt DateTime  @default(now())
  approvedAt  DateTime?
  declinedAt  DateTime?
  closedAt    DateTime?
  canceledAt  DateTime? // guest withdrew or auto-expired before any work
  expiresAt   DateTime? // auto-expire cutoff; null once transitioned out of REQUESTED

  // --- Saga retry state ---
  attempts       Int       @default(0) // incremented on each saga run
  lastAttemptAt  DateTime?
  nextAttemptAt  DateTime? // exponential-backoff schedule; null when terminal

  // --- Optimistic locking (our own invariant; we expose INVALID_STATE to callers) ---
  version Int @default(1)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant  Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  booking Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  order   Order?  @relation(fields: [orderId], references: [id])

  events CancellationEvent[]

  @@index([tenantId, status])
  @@index([tenantId, bookingId])
  @@index([status, expiresAt])        // expire cron
  @@index([status, nextAttemptAt])    // saga-retry cron
  @@index([tenantId, requestedAt])    // admin queue sorting
}

enum CancellationStatus {
  REQUESTED
  OPEN
  DECLINED
  CANCELED
  CLOSED
  EXPIRED
}

enum CancellationInitiator {
  GUEST
  STAFF
  PMS     // External cancel via Mews webhook
  SYSTEM  // Auto-expire, no-show, scheduled-cancel
}

enum CancellationDeclineReason {
  OUTSIDE_WINDOW
  NON_REFUNDABLE_RATE
  NO_SHOW
  FORCE_MAJEURE_DECLINED
  OTHER
}

enum RefundStatus {
  NOT_APPLICABLE  // Zero refund (100% fee, or unpaid booking)
  PENDING         // Will be issued by saga
  PROCESSING      // Stripe call in flight
  SUCCEEDED
  FAILED          // Needs admin intervention
}

// === CancellationEvent ==============================================
// Append-only audit log. Every state transition and side-effect logged.
// Parallel to OrderEvent; never UPDATEd, always INSERTed.
model CancellationEvent {
  id                    String                @id @default(cuid())
  cancellationRequestId String
  tenantId              String
  type                  CancellationEventType
  actor                 CancellationInitiator
  actorUserId           String?
  message               String?
  metadata              Json?                 // Structured details (PMS response excerpt, Stripe ID, error message)
  createdAt             DateTime              @default(now())

  cancellationRequest CancellationRequest @relation(fields: [cancellationRequestId], references: [id], onDelete: Cascade)

  @@index([cancellationRequestId, createdAt])
  @@index([tenantId, type, createdAt])
}

enum CancellationEventType {
  REQUESTED
  APPROVED
  DECLINED
  WITHDRAWN
  EXPIRED
  PMS_CANCEL_ATTEMPTED
  PMS_CANCEL_SUCCEEDED
  PMS_CANCEL_FAILED
  REFUND_INITIATED
  REFUND_SUCCEEDED
  REFUND_FAILED
  EMAIL_SENT
  EMAIL_FAILED
  CLOSED
  NOTE_ADDED
}

// === CancellationPolicy =============================================
// Merchant-configured. Attached to Accommodation or RatePlan.
// Policy applicability (which bookings get which policy) is resolved at
// checkout time and snapshotted onto Booking.cancellationPolicySnapshot.
model CancellationPolicy {
  id       String @id @default(cuid())
  tenantId String
  name     String // "Flexible", "Non-refundable", "Standard 14-day"

  // Tiered schedule. JSON shape:
  //   [
  //     { "hoursBeforeCheckIn": 720, "feePercent": 0   },    // 30d
  //     { "hoursBeforeCheckIn": 168, "feePercent": 50  },    // 7d
  //     { "hoursBeforeCheckIn": 0,   "feePercent": 100 }     // <7d
  //   ]
  // Tiers are ordered most-advance first. Applied tier = highest
  // `hoursBeforeCheckIn` where booking.checkIn - now >= hoursBeforeCheckIn.
  // If no tier matches (now > checkIn), 100% fee applied (no-show).
  tiers Json

  // --- Approval policy ---
  requireApproval Boolean @default(false) // false = auto-approve; true = admin must approve every request
  autoExpireHours Int     @default(48)    // How long a REQUESTED request waits for approval before EXPIRED

  // --- Metadata ---
  active      Boolean  @default(true)
  description String?  @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, active])
}

// === CancellationReasonDefinition ===================================
// Shopify's ReturnReasonDefinition 1:1.
// Merchants define their own taxonomy; handle stays stable across renames.
model CancellationReasonDefinition {
  id        String  @id @default(cuid())
  tenantId  String
  handle    String  // Stable machine handle (e.g. "change-of-plans", "illness")
  name      String  // Display label
  sortOrder Int     @default(0)
  deleted   Boolean @default(false) // Soft-deleted defs stay referenced by historical requests

  createdAt DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, handle])
  @@index([tenantId, deleted, sortOrder])
}

// === PendingCancellationLock ========================================
// Idempotency lock. Prevents concurrent saga runs on the same booking.
// Parallel to existing PendingBookingLock pattern for booking creation.
model PendingCancellationLock {
  id        String   @id @default(cuid())
  tenantId  String
  bookingId String
  dedupKey  String   // SHA-256(tenantId + bookingId)
  expiresAt DateTime // TTL 120s — cleaned by cleanup-idempotency-keys cron
  createdAt DateTime @default(now())

  @@unique([tenantId, dedupKey])
  @@index([expiresAt])
}
```

### 3.2 Booking additions

```prisma
model Booking {
  // ... existing fields

  // Cancellation policy snapshot — frozen at checkout time.
  // Shape: same as CancellationPolicy.tiers + { policyId, name, autoExpireHours, requireApproval }.
  // Rule changes apply only to FUTURE bookings; this booking always uses what was in effect when it was made.
  cancellationPolicySnapshot Json?

  // Denormalized cancelled timestamp (also in BookingStatus=CANCELLED, but explicit for queries)
  cancelledAt DateTime?

  // Relations
  cancellationRequests CancellationRequest[]

  // ... existing indexes
  @@index([tenantId, cancelledAt])
}
```

### 3.3 No changes needed to existing models
- `Order` already has `cancelledAt`, `refundedAt`, `status` with `CANCELLED/REFUNDED`. Engine reuses `canTransition()`.
- `OrderEvent` already has `ORDER_CANCELLED`, `REFUND_SUCCEEDED`, `REFUND_FAILED`. Engine writes events through existing path.
- `SyncEvent` is the PMS-side audit. Engine writes `"booking.cancelled"` events through existing path.
- `EmailSendLog` + `EmailRateLimit` handle `BOOKING_CANCELLED` (already registered in `email/registry.ts`).

---

## 4. State machine

### 4.1 Transition diagram

```
                  ┌─────────────┐
                  │  REQUESTED  │  (guest/staff/pms submitted; expiresAt set)
                  └──────┬──────┘
           approve       │       decline       withdraw      expire
      ┌────────────┬─────┴─────┬────────────┬────────────────┐
      ▼            ▼           ▼            ▼                ▼
  ┌──────┐   ┌───────────┐   ┌──────────┐                ┌─────────┐
  │ OPEN │   │  DECLINED │   │ CANCELED │                │ EXPIRED │
  └──┬───┘   └───────────┘   └──────────┘                └─────────┘
     │        (terminal-but-                              (terminal-but-
 saga│run     restartable)                                 restartable)
     │
 success│                 permanent failure
     ├─────────┐          (e.g. 400 from PMS after retries)
     ▼         │                         │
 ┌────────┐    │                         ▼
 │ CLOSED │    │                   ┌───────────┐
 └────────┘    └──────────────────▶│ DECLINED  │
 (terminal)                        │ (OTHER +  │
                                   │ declineNote)
                                   └───────────┘
```

Pre-work cancellation of an `OPEN` request (Shopify allows this via `returnCancel`) is **not** supported in Phase 1 — once the saga starts, the request commits or terminally fails. Rationale: our saga is seconds-long, not hours. Admin-initiated force-close after a stuck saga is a Phase 2 admin-tool feature.

### 4.2 Transition table (canTransitionCancellation)

| From → To | Allowed | Precondition |
|---|---|---|
| `REQUESTED → OPEN` | ✓ | Approval (auto or admin) |
| `REQUESTED → DECLINED` | ✓ | Admin decline with reason |
| `REQUESTED → CANCELED` | ✓ | Guest/staff withdraw |
| `REQUESTED → EXPIRED` | ✓ | `expiresAt <= now` (cron) |
| `OPEN → CLOSED` | ✓ | Saga completed all side effects |
| `OPEN → DECLINED` | ✓ | Saga hit permanent failure → flip to DECLINED with reason=OTHER |
| `CLOSED | DECLINED | CANCELED | EXPIRED → *` | ✗ | Terminal |

State transitions are enforced in `state-machine.ts` via a `canTransitionCancellation(from: CancellationStatus, to: CancellationStatus): boolean`. Every mutation goes through this gate. Never inline a status check.

### 4.3 Rule: at most one non-terminal request per booking

Enforced at create-time via:
```sql
-- Partial unique index (not expressible in Prisma DSL; raw SQL in migration)
CREATE UNIQUE INDEX idx_cancellation_one_active_per_booking
  ON "CancellationRequest"("tenantId", "bookingId")
  WHERE status IN ('REQUESTED', 'OPEN');
```
A second concurrent create attempt fails with unique-violation, caught and translated to `INVALID_STATE` user error. Matches the CLAUDE.md partial-index convention.

---

## 5. PMS adapter contract extension

### 5.1 New capabilities (9 and 10 in the existing 8-capability interface)

```typescript
// admin/app/_lib/integrations/adapter.ts

export interface PmsAdapter {
  // ... existing 8 methods

  /**
   * Cancel a reservation in the PMS.
   *
   * Idempotency: the adapter must treat a repeated call with the same
   * idempotencyKey as a no-op (or, if the PMS does not support idempotency,
   * it must recognize "already cancelled" errors and return alreadyCanceled=true).
   *
   * Side effects (in the PMS only): reservation state flips to Canceled;
   * inventory released; PMS audit log entry created.
   *
   * This method does NOT: touch our Order, trigger refund, send email.
   * Those are the engine's responsibility.
   */
  cancelBooking(tenantId: string, params: CancelBookingParams): Promise<CancelBookingResult>;

  /**
   * Compute what a cancellation WOULD cost right now, without mutating anything.
   * Used by the guest portal to show "You will be refunded X" before submit.
   *
   * Returns null if the PMS cannot preview (e.g. policy fetch unavailable).
   * Callers must fall back to our locally-snapshotted policy in that case.
   */
  previewCancellation(tenantId: string, params: PreviewCancellationParams): Promise<CancellationPreview | null>;
}
```

### 5.2 Normalized types

```typescript
// admin/app/_lib/integrations/types.ts

export interface CancelBookingParams {
  bookingExternalId: string;

  /** Free text sent to the PMS's notes/comments field. Often includes our reason handle. */
  note?: string;

  /**
   * Our idempotency key. Adapter must use this to dedupe at the PMS level
   * if the PMS supports it; otherwise rely on PMS's own "already cancelled"
   * detection.
   *
   * Format: `cancellation:{cancellationRequestId}:attempt:{n}`
   */
  idempotencyKey: string;

  /**
   * Whether the PMS should post its own cancellation fee on the folio.
   * We default to FALSE — we compute and charge fees ourselves via Stripe.
   */
  chargeFee: boolean;

  /**
   * Whether the PMS should send its own guest email.
   * We default to FALSE — we send BOOKING_CANCELLED ourselves via sendEmailEvent().
   */
  sendGuestEmail: boolean;
}

export interface CancelBookingResult {
  /** When the PMS confirmed the cancellation (its server clock). */
  canceledAtPms: Date;

  /**
   * True if the PMS responded with "already cancelled" — adapter translated
   * that to a success. Engine treats this identically to a fresh cancel.
   */
  alreadyCanceled: boolean;

  /** If PostCancellationFee=true, the PMS-generated fee item. */
  pmsFeeItemId?: string;
  pmsFeeAmountOre?: number;
  pmsFeeCurrency?: string;

  /** Truncated PMS response payload for SyncEvent audit. Must not contain secrets. */
  rawAuditPayload?: Record<string, unknown>;
}

export interface PreviewCancellationParams {
  bookingExternalId: string;
  /** Defaults to new Date() if not provided. */
  cancelAt?: Date;
}

export interface CancellationPreview {
  feeAmountOre: number;
  refundAmountOre: number;
  currency: string;
  withinFreeCancelWindow: boolean;
  /** Tier that would apply if cancelled now. */
  appliedTier: { hoursBeforeCheckIn: number; feePercent: number };
  /** Full tier schedule, for UX display. */
  tiers: Array<{ hoursBeforeCheckIn: number; feePercent: number }>;
  /** Source of this preview. "pms" = live PMS call; "snapshot" = fell back to Booking.cancellationPolicySnapshot. */
  source: "pms" | "snapshot";
}
```

### 5.3 Per-adapter implementation

#### Mews (`adapters/mews/cancel.ts`)
```
POST /api/connector/v1/reservations/cancel
  body: { ClientToken, AccessToken, Client, EnterpriseId,
          ReservationIds: [externalId],
          PostCancellationFee: params.chargeFee,  // false by default
          SendEmail: params.sendGuestEmail,       // false by default
          Notes: params.note }

Response handling:
  200 → return { canceledAtPms: new Date(), alreadyCanceled: false, ... }
  403 with body matching "not cancellable" / "already" → { alreadyCanceled: true, ... }
  429 → throw TransientPmsError(retryAfterSec)
  408 / 500 / network → throw TransientPmsError
  400 / 401 → throw PermanentPmsError
```

Preview (`adapters/mews/preview-cancellation.ts`):
```
POST /api/connector/v1/cancellationPolicies/getByReservations
  body: { ..., ReservationIds: [externalId] }

Response → local math:
  Apply Applicability + ApplicabilityOffset → compute window-start
  If now >= window-start: feeAmount = AbsoluteFee + RelativeFee * reservationPrice
  Else: feeAmount = 0
  Return { feeAmountOre, refundAmountOre, source: "pms", ... }

On error or missing policy → return null; engine falls back to snapshot.
```

#### Fake (`adapters/fake/cancel.ts`)
Scenarios via credentials: `"always-succeed"`, `"always-fail"`, `"already-canceled"`, `"rate-limited"`, `"network-timeout"`. Returns deterministic shaped data for tests.

#### Manual (`adapters/manual/cancel.ts`)
No-op success. Returns `{ canceledAtPms: new Date(), alreadyCanceled: false }` immediately. Used by tenants without a PMS integration.

---

## 6. Engine & saga orchestrator

### 6.1 Public entry points

```typescript
// admin/app/_lib/cancellations/

// From guest portal or admin UI (creates REQUESTED row, auto-approves if policy allows)
createCancellationRequest(params): Promise<CancellationRequest>

// Admin manual approval (REQUESTED → OPEN + triggers saga)
approveCancellationRequest(id, actorUserId): Promise<CancellationRequest>

// Admin decline (REQUESTED → DECLINED)
declineCancellationRequest(id, actorUserId, reason, note): Promise<CancellationRequest>

// Guest/staff withdraw (REQUESTED → CANCELED, before saga starts)
withdrawCancellationRequest(id, actorUserId?): Promise<CancellationRequest>

// Fee + refund preview (does NOT mutate anything)
calculateCancellation(bookingId): Promise<CancellationPreview>

// Saga entry point (called by approve() and by retry cron)
runCancellationSaga(id): Promise<void>
```

### 6.2 `createCancellationRequest` flow

```
1. Load booking, verify tenantId, verify not already cancelled.
2. Check for existing non-terminal request → reject with INVALID_STATE.
3. Read booking.cancellationPolicySnapshot → required (every paid booking has one).
4. calculateCancellation():
     - Find applicable tier from snapshot based on (checkIn - now).
     - feeAmount = booking.totalAmount * appliedTier.feePercent / 100
     - refundAmount = booking.totalAmount - feeAmount
5. INSERT CancellationRequest (status=REQUESTED, expiresAt=now+autoExpireHours).
6. INSERT CancellationEvent (type=REQUESTED).
7. If policy.requireApproval === false → call approveCancellationRequest() immediately (auto-approve).
8. Else → send "cancellation requested" internal notification to admins; guest gets "we received your request" email.
9. Return the request.
```

### 6.3 Saga flow (`runCancellationSaga`)

```
acquireLock(tenantId, bookingId, ttl=120s)
  ├ fail → throw IDEMPOTENCY_LOCK_HELD (another attempt is in flight)
  └ ok → continue

try:
  Reload request WHERE id = X AND version = version_at_read
    ├ status != OPEN → release lock, return (concurrent completion)
    └ ok → proceed

  INCREMENT attempts, SET lastAttemptAt = now, SET nextAttemptAt = now + backoff(attempts)

  === Step 1: PMS cancel ===
  emitEvent(PMS_CANCEL_ATTEMPTED, { attempt: n })
  adapter = resolveAdapter(tenantId)
  try:
    pmsResult = adapter.cancelBooking({
      bookingExternalId,
      note: `reason=${reasonHandle} note=${guestNote}`,
      idempotencyKey: `cancellation:${id}:attempt:${attempts}`,
      chargeFee: false,
      sendGuestEmail: false,
    })
    emitEvent(PMS_CANCEL_SUCCEEDED, { alreadyCanceled, canceledAtPms })
  catch TransientPmsError:
    emitEvent(PMS_CANCEL_FAILED, { transient: true, error })
    // Do NOT mark DECLINED. Leave status=OPEN. Retry cron will pick up.
    if attempts >= MAX_ATTEMPTS (5):
      → transition OPEN → DECLINED with declineReason=OTHER, declineNote="PMS cancellation failed after 5 attempts; see events"
      → alert admin via Sentry
    release lock; return
  catch PermanentPmsError:
    emitEvent(PMS_CANCEL_FAILED, { transient: false, error })
    → transition OPEN → DECLINED
    → alert admin via Sentry
    release lock; return

  === Step 2: Stripe refund (only if refundAmount > 0 AND order has a payment) ===
  if refundAmount > 0 AND order?.stripePaymentIntentId:
    emitEvent(REFUND_INITIATED)
    try:
      refund = getStripe().refunds.create(
        { payment_intent: order.stripePaymentIntentId, amount: refundAmount },
        { idempotencyKey: `cancellation:${id}:refund` }
      )
      emitEvent(REFUND_SUCCEEDED, { refundId: refund.id })
    catch TransientStripeError:
      emitEvent(REFUND_FAILED, { transient: true })
      // PMS is already canceled. Do NOT reverse PMS.
      // Retry cron re-enters saga; Step 1 is a no-op (alreadyCanceled=true).
      if attempts >= MAX_ATTEMPTS:
        → keep request OPEN, mark refundStatus=FAILED, alert admin
      release lock; return
    catch PermanentStripeError:
      emitEvent(REFUND_FAILED, { transient: false })
      → mark refundStatus=FAILED, keep request OPEN
      → alert admin (manual refund needed)
      release lock; return
  else:
    refundStatus = NOT_APPLICABLE

  === Step 3: Commit everything in one DB transaction ===
  prisma.$transaction([
    // Order (if exists)
    order && canTransition(order.status, targetOrderStatus) ?
      update Order SET status=targetOrderStatus, cancelledAt=now, refundedAt=?, version++
      AND insert OrderEvent(ORDER_CANCELLED) (+ REFUND_SUCCEEDED if refunded)

    // Booking
    update Booking SET status=CANCELLED, cancelledAt=now, version++
      WHERE id=X AND version=version_at_read
      (concurrent update → transaction aborts, saga retries)

    // CancellationRequest
    update CancellationRequest SET
      status=CLOSED,
      closedAt=now,
      pmsCanceledAt, pmsExternalFeeItemId,
      stripeRefundId, refundStatus, refundedAt,
      version++
      WHERE id=X AND version=version_at_read
  ])

  emitEvent(CLOSED)

  === Step 4: Email (best-effort) ===
  safeSend(() => sendEmailEvent(tenantId, "BOOKING_CANCELLED", booking.guestEmail, {
    guestName, hotelName, bookingRef, cancellationReason, refundAmount, feeAmount
  }))
    success → emitEvent(EMAIL_SENT)
    failure → emitEvent(EMAIL_FAILED); do NOT throw

  === Step 5: SyncEvent audit (for PMS-side observability) ===
  insert SyncEvent(eventType="booking.cancelled", bookingExternalId, payload=summary)

release lock
```

### 6.4 Saga retry schedule

Exponential backoff with jitter:
```
attempts  delay        cumulative
--------  -----        ----------
1 → 2     1 min        1 min
2 → 3     5 min        6 min
3 → 4     30 min       36 min
4 → 5     2 h          2.6 h
5 → *     STOP; DECLINE or manual-refund escalation
```

Cron job `/api/cron/retry-cancellation-saga` runs every 5 min, picks up `CancellationRequest WHERE status=OPEN AND nextAttemptAt <= NOW() AND attempts < 5`, calls `runCancellationSaga(id)`. Batch size 20 per cron run.

### 6.5 Auto-expire cron

`/api/cron/expire-cancellations` runs every 10 min:
```sql
UPDATE "CancellationRequest"
SET status='EXPIRED', canceledAt=NOW(), version=version+1
WHERE status='REQUESTED' AND expiresAt <= NOW()
RETURNING id
```
Then for each returned id, insert `CancellationEvent(EXPIRED)` and send a "your request expired, please contact us" email (non-rate-limited because it's administrative).

---

## 7. Policy resolution & fee math

### 7.1 When policy is snapshotted

At the moment of booking confirmation (i.e., when `Booking.status` transitions from any to `PRE_CHECKIN` with a paid `Order`), the active `CancellationPolicy` for that accommodation+ratePlan is serialized into `Booking.cancellationPolicySnapshot` as:

```json
{
  "policyId": "cup_abc123",
  "policyName": "Flexible",
  "tiers": [
    { "hoursBeforeCheckIn": 720, "feePercent": 0 },
    { "hoursBeforeCheckIn": 168, "feePercent": 50 },
    { "hoursBeforeCheckIn": 0,   "feePercent": 100 }
  ],
  "requireApproval": false,
  "autoExpireHours": 48,
  "snapshottedAt": "2026-04-22T14:00:00Z"
}
```

Mutation path: must be set in the same transaction as Booking creation / confirmation, never lazily.

### 7.2 Applicable-tier algorithm

```typescript
function applyTier(tiers: Tier[], hoursUntilCheckIn: number): Tier {
  // tiers are ordered most-advance first (largest hoursBeforeCheckIn first)
  const sorted = [...tiers].sort((a, b) => b.hoursBeforeCheckIn - a.hoursBeforeCheckIn);
  for (const tier of sorted) {
    if (hoursUntilCheckIn >= tier.hoursBeforeCheckIn) {
      return tier;
    }
  }
  // Past all tiers (hoursUntilCheckIn < smallest threshold, typically 0)
  // — the smallest tier wins (typically 100%). If there's no 0-threshold tier,
  // default to feePercent=100 (safer to over-fee than under-fee).
  return sorted[sorted.length - 1] ?? { hoursBeforeCheckIn: 0, feePercent: 100 };
}
```

### 7.3 Fee calculation

```typescript
function calculateFee(booking: Booking, tiers: Tier[], now: Date): FeeResult {
  const hoursUntil = Math.floor((booking.checkIn.getTime() - now.getTime()) / 3_600_000);
  const tier = applyTier(tiers, hoursUntil);
  const feeAmountOre = Math.floor(booking.totalAmountOre * tier.feePercent / 100);
  return {
    feeAmountOre,
    refundAmountOre: Math.max(0, booking.totalAmountOre - feeAmountOre),
    appliedTier: tier,
    hoursBeforeCheckInAtRequest: hoursUntil,
  };
}
```

All integer arithmetic. No floats in money math. `Math.floor` always rounds in the merchant's favor (they charge slightly more in fee, refund slightly less). Documented invariant.

### 7.4 Negative-hours handling (booking already started)

If `hoursUntil < 0` (check-in has passed), the booking is typically `ACTIVE` or `COMPLETED` already. The engine rejects cancellation for `ACTIVE`/`COMPLETED` bookings at the create step — those go through a separate "early checkout" flow (not in scope).

---

## 8. Idempotency & concurrency

### 8.1 Layered defense

| Layer | Protection | Mechanism |
|---|---|---|
| Client → API | Double-click on "Cancel booking" | Frontend button disable + server-side 409 on duplicate active request |
| API → engine | Two concurrent create calls | Partial unique index `WHERE status IN ('REQUESTED','OPEN')` |
| Engine → saga | Retry cron and webhook both triggering saga | `PendingCancellationLock` with 120s TTL |
| Saga → PMS | Saga crash mid-run, cron retries | PMS 403 "already cancelled" → `alreadyCanceled: true` (treated as success) |
| Saga → Stripe | Same crash + retry | Stripe idempotency key `cancellation:{id}:refund` |
| Saga → DB | Concurrent `version` update | Optimistic locking; second tx aborts → saga retries |
| Saga → email | Double email on retry | `BOOKING_CANCELLED` rate-limit (2/24h) in existing email system |

### 8.2 Stripe idempotency key design

`cancellation:{cancellationRequestId}:refund` (no attempt suffix). Stripe is idempotent on identical keys — a replay with the same key returns the original refund. That's what we want: if saga crashes between "refund created" and "DB commit", the next attempt's refund call returns the same refund, and we record its ID in the DB commit.

For the PMS path, Mews has no idempotency support, so the key is per-attempt (`:attempt:{n}`) purely for our audit. Duplicate-detection is via Mews's own "already cancelled" response.

---

## 9. Error handling & escalation

### 9.1 Error taxonomy

```typescript
// admin/app/_lib/cancellations/errors.ts

class CancellationError extends Error {
  code: "INVALID_STATE" | "NOT_FOUND" | "POLICY_MISSING" |
        "PRECONDITION_FAILED" | "IDEMPOTENCY_LOCK_HELD";
}

// Thrown by adapter, caught by saga
class TransientPmsError extends Error {
  retryAfterMs?: number;
}
class PermanentPmsError extends Error {}
class TransientStripeError extends Error {}
class PermanentStripeError extends Error {}
```

### 9.2 Failure → outcome matrix

| Failure | Outcome | Admin alert? |
|---|---|---|
| Guest submits twice | 2nd request 409 with existing `id` | No |
| PMS 429 | Saga retries (attempts++, backoff) | No until attempts=5 |
| PMS 403 "already cancelled" | Treated as success (we probably already cancelled) | No |
| PMS 400 (bad request) | Permanent → DECLINE with reason=OTHER | Yes (Sentry) |
| Stripe transient (network / 500) | Saga retries; PMS already done | No until attempts=5 |
| Stripe permanent (e.g. already refunded, insufficient funds) | `refundStatus=FAILED`, keep OPEN | Yes (Sentry, admin dashboard flag) |
| DB version conflict | Transaction aborts, saga retries next tick | No |
| Lock held (concurrent saga) | Exit gracefully, next cron tick wins | No |
| Email send fail | `emailSent=false`, event logged, saga continues | No (fail-open per CLAUDE.md) |

### 9.3 Structured logging (required)

Every lifecycle event emits:
```typescript
log("info" | "warn" | "error", "cancellation.<event>", {
  tenantId,
  cancellationRequestId,
  bookingId,
  orderId,
  status,
  attempts,
  error?: scrubbed,
});
```

Events logged at minimum: `cancellation.created`, `cancellation.approved`, `cancellation.declined`, `cancellation.withdrawn`, `cancellation.expired`, `cancellation.saga_started`, `cancellation.pms_cancel_succeeded`, `cancellation.pms_cancel_failed`, `cancellation.refund_succeeded`, `cancellation.refund_failed`, `cancellation.closed`, `cancellation.saga_max_attempts_reached`.

---

## 10. Email integration

### 10.1 Wiring

`BOOKING_CANCELLED` is already registered in `app/_lib/email/registry.ts`. Engine calls:
```typescript
import { sendEmailEvent } from "@/app/_lib/email/send";
import { safeSend } from "@/app/_lib/integrations/sync/safe-send";

await safeSend(() =>
  sendEmailEvent(tenantId, "BOOKING_CANCELLED", booking.guestEmail, {
    guestName: booking.firstName,
    hotelName: tenant.siteName,
    bookingRef: booking.externalId ?? booking.id,
    cancellationReason: request.reasonHandle ?? "",
    refundAmount: formatMoney(request.refundAmount, request.currency),
    feeAmount: formatMoney(request.cancellationFeeAmount, request.currency),
    checkIn: formatDate(booking.checkIn, tenant.defaultLocale),
    checkOut: formatDate(booking.checkOut, tenant.defaultLocale),
  }),
);
```

Phase 1 uses the platform default template. Phase 4 adds a tenant-overridable React Email template.

### 10.2 Additional emails (Phase 1)

| Event | Recipient | Trigger |
|---|---|---|
| `BOOKING_CANCELLED` | Guest | Saga succeeded (CLOSED) |
| (Future) `CANCELLATION_REQUEST_RECEIVED` | Guest | When policy requires approval; Phase 4 |
| (Future) `CANCELLATION_REQUEST_DECLINED` | Guest | On decline; Phase 4 |
| (Future) `CANCELLATION_REQUEST_NEEDS_REVIEW` | Admin (tenant staff) | When policy.requireApproval=true; Phase 4 |

Phase 1 only wires the `BOOKING_CANCELLED` flow; others registered but no-op until Phase 4.

---

## 11. Phase breakdown

### Phase 1 — Engine + API-to-PMS (this phase)
- [ ] Migration: new models + Booking fields + partial unique index
- [ ] Zod schemas + TypeScript types
- [ ] State machine + `canTransitionCancellation`
- [ ] PMS adapter contract: `cancelBooking`, `previewCancellation`
- [ ] Mews adapter implementation (cancel + preview)
- [ ] Fake adapter scenarios (always-succeed, already-canceled, rate-limited, network-timeout)
- [ ] Manual adapter no-op
- [ ] `createCancellationRequest`, `approveCancellationRequest`, `declineCancellationRequest`, `withdrawCancellationRequest`
- [ ] `calculateCancellation` (snapshot-based, with PMS-preview fallback)
- [ ] Idempotency lock (`acquireLock` / `releaseLock`)
- [ ] Saga orchestrator (`runCancellationSaga`)
- [ ] Cron: `expire-cancellations`, `retry-cancellation-saga`
- [ ] Email trigger (BOOKING_CANCELLED via existing sendEmailEvent)
- [ ] Unit tests for state machine, fee math, policy resolution
- [ ] Integration tests: full saga against Fake adapter (all scenarios)

### Phase 2 — Admin UI
- Queue view (REQUESTED list), approve/decline modals, decline-reason picker.
- Admin-triggered cancel from booking detail page.
- Cancellation policies CRUD under `/(admin)/settings/cancellation-policies`.
- Reason definitions CRUD.

### Phase 3 — Guest portal UI
- "Cancel booking" button in `/portal/stays/[id]` with preview + confirm.
- Magic-link access path (matches existing MagicLinkToken flow).
- Live fee/refund preview via `calculateCancellation`.

### Phase 4 — Email templates
- React Email templates: `BOOKING_CANCELLED`, `CANCELLATION_REQUEST_RECEIVED`, `CANCELLATION_REQUEST_DECLINED`, `CANCELLATION_REQUEST_NEEDS_REVIEW`.
- Tenant override capability.

### Phase 5 — PMS webhook (inbound)
- Handle Mews `ServiceOrderUpdated` → poll `reservations/getAll` → detect externally-triggered cancel → create `CancellationRequest(initiator=PMS)` → auto-approve → saga.
- Dedup via existing `WebhookDedup` table.

### Phase 6 — Reconciliation
- Cron: for each integration, daily read reservations updated in last 24h, diff against our state, heal drift (e.g. PMS canceled but our webhook was missed).

---

## 12. Invariants — never violate these

1. **`canTransitionCancellation()` is the only gate for status mutations.** Never inline `if (status !== 'REQUESTED')`.
2. **`resolveAdapter(tenantId)` is the only way to reach a PMS.** Engine never calls Mews directly.
3. **PMS failure never triggers a refund.** Step 2 runs only after Step 1 succeeds.
4. **Refund failure never reverses PMS.** Escalate to admin; do not compensate automatically.
5. **`sendEmailEvent()` is the only way to send email.** Never `resendClient` from the engine.
6. **Policy is snapshotted at booking time, never recomputed at cancel time.** Rule changes apply only to future bookings.
7. **All amounts are integers in ören/cents.** No floats in money math, ever.
8. **Every mutation is idempotent.** Saga retry must be safe.
9. **Tenant-scoped everywhere.** `tenantId` in every query, every index, every lock.
10. **Append-only audit.** `CancellationEvent` rows are never UPDATEd. New state = new row.
11. **Optimistic locking via `version`.** Every update `WHERE version = X AND SET version = version + 1`.
12. **Saga attempts capped at 5.** Beyond that, escalate to admin; do not retry forever.
13. **Structured logging on every transition.** `log()` only, never `console.log` in new code.
14. **Sentry tag with tenantId on every error.** Existing `setSentryTenantContext` pattern.

---

## 13. Appendix

### 13.1 Shopify → our domain mapping (quick reference)

| Shopify | Ours | Notes |
|---|---|---|
| `Return` | `CancellationRequest` | Same lifecycle, no line items in Phase 1 |
| `ReturnStatus` | `CancellationStatus` | Same values; we add `EXPIRED` |
| `ReturnDeclineReason` | `CancellationDeclineReason` | Hotel-specific values |
| `ReturnReasonDefinition` | `CancellationReasonDefinition` | 1:1 |
| `RestockingFee.percentage` | `CancellationPolicy.tiers[].feePercent` | Tiered instead of flat |
| Return rules (admin UI) | `CancellationPolicy` | Same "future bookings only" snapshot rule |
| `returnCalculate` | `calculateCancellation` | Pre-submit fee preview |
| `returnApproveRequest` | `approveCancellationRequest` | Same `INVALID_STATE` semantics |
| `returnDeclineRequest` | `declineCancellationRequest` | Same 500-char note limit |
| `returnCancel` (pre-work) | `withdrawCancellationRequest` | REQUESTED → CANCELED |
| `returnProcess` | Saga Step 2 (refund inside saga) | Not a separate mutation |
| `returnClose` | Automatic saga success | No separate close mutation |
| `returns/*` webhooks | Phase 5 outbound webhooks | Same retry semantics recommended |

### 13.2 Mews endpoint reference

| Operation | Endpoint | Used by |
|---|---|---|
| Cancel reservation | `POST /reservations/cancel` | `MewsAdapter.cancelBooking()` |
| Read policies for reservation | `POST /cancellationPolicies/getByReservations` | `MewsAdapter.previewCancellation()` |
| Read reservation state | `POST /reservations/getAll/2023-06-06` | Phase 5 webhook handler, Phase 6 reconciliation |
| Read OrderItems (for fee confirmation) | `POST /orderItems/getAll` | Phase 6 reconciliation |

### 13.3 File layout (Phase 1)

```
admin/app/_lib/cancellations/
├── types.ts                      Zod schemas + TS types
├── state-machine.ts              canTransitionCancellation
├── policy.ts                     snapshotPolicy, loadPolicyFromSnapshot, applyTier
├── calculate.ts                  calculateCancellation
├── create.ts                     createCancellationRequest
├── approve.ts                    approveCancellationRequest (triggers saga inline)
├── decline.ts                    declineCancellationRequest
├── withdraw.ts                   withdrawCancellationRequest
├── engine.ts                     runCancellationSaga
├── idempotency.ts                acquireLock, releaseLock
├── events.ts                     emitEvent helper
├── errors.ts                     error classes
├── backoff.ts                    computeBackoff(attempts)
└── __tests__/                    unit + integration tests

admin/app/_lib/integrations/
├── adapter.ts                    (extended) + cancelBooking, previewCancellation
├── types.ts                      (extended) + CancelBookingParams etc.
└── adapters/
    ├── mews/
    │   ├── cancel.ts             POST /reservations/cancel
    │   └── preview-cancellation.ts  POST /cancellationPolicies/getByReservations + local math
    ├── fake/
    │   └── cancel.ts             scenarios
    └── manual/
        └── cancel.ts             no-op success

admin/app/api/cron/
├── expire-cancellations/route.ts
└── retry-cancellation-saga/route.ts

admin/prisma/migrations/<timestamp>_add_cancellation_engine/
└── migration.sql
```

### 13.4 Open questions (resolve during implementation)

1. **Mews `CancellationReason` derivation** — Mews may auto-set `RequestedByBooker` or `Other` based on caller type; verify in sandbox. If controllable, pass our reason through. If not, accept the limitation.
2. **Mews fee math exact formula** — `AbsoluteFee + RelativeFee` — test with known policy in sandbox, reconcile against actual `OrderItem.Amount`.
3. **Refund-already-issued edge case** — if admin manually refunded before cancelling (bypassing our UI), Stripe returns `charge_already_refunded`. Treat as success, mark `refundStatus=NOT_APPLICABLE`.
4. **Booking status rules around `ACTIVE`** — can we cancel a checked-in (but not checked-out) booking? Decision: no — route through "early checkout" flow (future work). Engine rejects `ACTIVE`/`COMPLETED` bookings.
