# Tenant-isolation audit — payments/orders

**Domain agent:** `Audit payments/orders tenant-isolation` (2026-04-21)
**Main report:** [../tenant-isolation-2026-04-21.md](../tenant-isolation-2026-04-21.md)

## Models covered

Order, OrderLineItem, OrderEvent, CheckoutSession, PaymentSession,
StripeWebhookEvent, InventoryChange, InventoryReservation,
DiscountUsage, OrderNumberSequence, PendingBookingLock,
CheckoutIdempotencyKey.

## Summary

**180 call-sites. 163 SAFE · 7 AMBIGUOUS · 0 UNSAFE.**

All tier-1 models passed deep audit: Order (35+18 calls), OrderLineItem
(11), CheckoutSession (32), PaymentSession (11), StripeWebhookEvent (5),
InventoryReservation (14), CheckoutIdempotencyKey (6).

## Per-model classification

| Model | SAFE | AMBIGUOUS | UNSAFE |
|---|---|---|---|
| Order | 35 | 7 | 0 |
| OrderLineItem | 11 | 0 | 0 |
| OrderEvent | 21 | 0 | 0 |
| CheckoutSession | 32 | 0 | 0 |
| PaymentSession | 11 | 0 | 0 |
| StripeWebhookEvent | 5 | 0 | 0 |
| InventoryChange | 11 | 0 | 0 |
| InventoryReservation | 14 | 0 | 0 |
| DiscountUsage | 3 | 1 | 0 |
| OrderNumberSequence | 1 | 0 | 0 |
| PendingBookingLock | 2 | 0 | 0 |
| CheckoutIdempotencyKey | 6 | 0 | 0 |

## Key findings

- ✅ **tenantId from host header, never from request body** — verified
  across `/api/checkout/*`, `/api/bookings/*`, and webhook handlers.
- ✅ **Order-first pattern** — Order is always created in DB with
  explicit `tenantId` before any Stripe API call.
- ✅ **Stripe Connect verification** — `verifyChargesEnabled()` is
  called per-order on cron paths; `tenant.stripeAccountId` is used
  to re-verify event ownership before trusting webhook metadata.
- ✅ **Composite unique keys** on idempotency (CheckoutIdempotencyKey,
  PendingBookingLock, StripeWebhookEvent) all include tenantId
  either explicitly or via FK chain.
- ⚠️ **DiscountUsage findFirst at `_lib/discounts/engine.ts:92`** —
  missing tenantId filter; see main report H2.
- ℹ️ **Cron jobs are intentionally cross-tenant**: `reconcile-stripe`,
  `reconcile-payments` find PENDING/INITIATED rows across all tenants,
  then loop with per-order Stripe Connect account verification. Add
  comment explaining the pattern (L6 in main report).

## Recommended fixes

See main report **H2** (discounts engine tenantId) and **L6**
(cron-job design comments).

No P0 or P1 fixes scoped to this domain beyond what the main report
already captures.
