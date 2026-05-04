# Draft orders — B2B invoicing & quote pipeline

Shopify Draft-Orders pattern for B2B + walk-in scenarios. A staff member
assembles a quote, sends an invoice, the buyer pays (Stripe link or marked
manually), the draft converts atomically into a real Order + Booking.

This is the **largest** domain in the codebase (~25k LOC). It owns its own
state machine, calculator, hold lifecycle, and conversion pipeline.

> Public API: import only from `@/app/_lib/draft-orders` (the barrel).
> All internal helpers stay private to the domain.

---

## State machine (DRAFT_TRANSITIONS)

```
OPEN ─┬─→ INVOICED ─┬─→ PAID ─→ COMPLETING ─→ COMPLETED  (terminal)
      │             ├─→ OVERDUE ─→ PAID
      │             └─→ CANCELLED                          (terminal)
      ├─→ PENDING_APPROVAL ─→ APPROVED ─→ INVOICED
      │                  └─→ REJECTED                      (terminal)
      └─→ CANCELLED                                        (terminal)
```

`canTransition(from, to)` in `state-machine.ts` is the ONLY guard. Every
service routes through it — never inline status checks. COMPLETING is a
transient state set inside `convertDraftToOrder`'s transaction; if it
remains stuck >5 min, the recovery cron resolves it.

---

## Hold state machine (HOLD_TRANSITIONS)

DraftReservation drives a separate machine for PMS holds (2-phase commit
with idempotency cache):

```
NOT_PLACED ─→ PLACING ─┬─→ PLACED ─┬─→ RELEASED   (terminal)
                       │           └─→ CONFIRMED  (terminal — convertToOrder)
                       └─→ FAILED ─┬─→ PLACING    (admin retry — fresh nonce)
                                   └─→ RELEASED   (cleanup, no PMS state to clear)
```

Stuck-PLACING recovery: the cron uses the idempotency cache to determine
which side (PLACED / FAILED) to resolve to.

---

## Calculator subsystem

`computeDraftTotals()` is the orchestrator for line-by-line totals.
Pure core in `calculator/core.ts`, async wiring in `calculator/orchestrator.ts`.

Critical rule — **frozen prices**:
When `DraftOrder.pricesFrozenAt` is set, the orchestrator returns the
persisted snapshot DIRECTLY from DraftOrder + DraftLineItem rows without
invoking the core. This guarantees the displayed totals match the invoiced
totals byte-for-byte.

Tax is delegated to `@/app/_lib/tax` (`calculateTax`). Discount evaluation
delegates to `@/app/_lib/discounts/apply.ts` — only **CODE-path** discounts
are evaluated for drafts; AUTOMATIC discounts remain D2C-only.

---

## Buyer kinds

  GUEST    → guestAccountId required, taxesIncluded defaults to true
  COMPANY  → companyLocationId required, taxesIncluded defaults to false
  WALK_IN  → no required link; contact fields optional

`taxesIncluded` can be overridden per draft. `CompanyLocation.taxSetting === "EXEMPT"`
is honoured in the calculator (`COLLECT_UNLESS_EXEMPT` is treated as
`COLLECT` until full tax-engine integration completes).

---

## Convert pipeline

`convertDraftToOrder()` is the only service that promotes PAID drafts:

  PAID → COMPLETING → COMPLETED   (single transaction)
                  ↓
        Order created
        Booking created (per accommodation line)
        DraftReservation.PLACED → CONFIRMED via adapter.confirmHold
        OrderLineItem snapshots from DraftLineItem (frozen)

Idempotent: calling twice on a PAID draft returns the same Order. Hold
confirmation goes through `withIdempotency()` (see
`integrations/reliability/CLAUDE.md`).

---

## Sweep + overdue crons

- `sweepExpiredDrafts()` — drains OPEN/INVOICED past `expiresAt`. Releases
  any PLACED holds (so the unit returns to availability) and transitions
  to CANCELLED.
- `markOverdueDrafts()` — drains INVOICED past payment due date → OVERDUE.
  Triggers `BOOKING_INVOICE_OVERDUE` reminder emails.
- `release-expired-draft-holds` — drains stale PLACED holds whose
  `holdExpiresAt` passed without conversion. Same reliability layer as
  D2C release-expired-holds.

Default hold duration: `DEFAULT_DRAFT_HOLD_DURATION_MS` = 30 min (D2C
checkout uses 15 min — drafts get longer because staff workflow is slower).

---

## Public DTO (share-token portal)

`getDraftByShareToken()` returns `PublicDraftDTO` — the buyer-facing shape
shown on the public `/p/draft/{token}` route. NEVER return internal fields:
no `internalNote`, no `actorUserId`, no PMS credentials, no audit timestamps
beyond what the buyer needs to see (createdAt, expiresAt, dueAt).

---

## PDF rendering

`render-invoice-pdf.tsx` produces the invoice PDF via React Email. The PDF
content is locked to the frozen totals — never re-renders from current
prices. PDF storage: Cloudinary, signed URL with 24h TTL on the share link.

---

## Key files

- Public barrel: `app/_lib/draft-orders/index.ts`
- State machine: `app/_lib/draft-orders/state-machine.ts`
- Calculator orchestrator: `app/_lib/draft-orders/calculator/orchestrator.ts`
- Calculator core (pure): `app/_lib/draft-orders/calculator/core.ts`
- Convert pipeline: `app/_lib/draft-orders/convert.ts`
- Lifecycle (sendInvoice/cancel): `app/_lib/draft-orders/lifecycle.ts`
- Holds: `app/_lib/draft-orders/holds.ts`
- Sweep cron: `app/_lib/draft-orders/expire.ts`
- Overdue cron: `app/_lib/draft-orders/overdue.ts`
- Public DTO: `app/_lib/draft-orders/get-by-share-token.ts`
- Errors taxonomy: `app/_lib/draft-orders/errors.ts`
- Admin UI: `app/(admin)/draft-orders/`

---

## Dependencies on other domains

- `_lib/tax` — line tax via `calculateTax()`
- `_lib/discounts` — code-path discount engine (NEVER automatic)
- `_lib/integrations` — PMS holds via `resolveAdapter`
- `_lib/integrations/reliability/idempotency` — wraps confirmHold
- `_lib/orders` — convert produces an Order via the same `canTransition()` guard
- `_lib/companies` — buyer resolution for COMPANY kind
- `_lib/email` — invoice send + overdue reminders

---

## Draft-orders invariants — never violate

1. `canTransition()` (state-machine.ts) is the ONLY guard — no inline checks
2. Frozen totals (`pricesFrozenAt` set) are returned BYTE-FOR-BYTE — never recomputed
3. `convertDraftToOrder` is idempotent — second call returns same Order
4. Hold confirmation goes through `withIdempotency()` — never raw adapter calls
5. AUTOMATIC discounts are not evaluated on drafts — staff-authored only
6. All amounts are BigInt ören — never floats, never mixed with cents
7. Public DTO never leaks internal fields (see PublicDraftDTO type)
8. Sweep + overdue crons release holds on cancel — never strand PMS reservations
9. Hold state transitions exclusive — PLACING/PLACED/CONFIRMED/RELEASED never go backwards
10. Test files (.test.ts) co-located — every service has tests; do not commit a service without them
