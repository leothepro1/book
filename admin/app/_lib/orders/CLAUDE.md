# Commerce engine — checkout, orders, payments

Unified checkout architecture. One Order lifecycle, one webhook handler,
one state machine — regardless of payment method.

---

## Core principle: Order-first

An Order is ALWAYS created before any Stripe API call. The Order is the
source of truth. Stripe is an implementation detail under the Order.
Product type (accommodation vs standard) affects fulfillment logic — not
checkout architecture.

> **Where Order creation actually happens:** the `_lib/checkout` engine
> (`processCheckout()`). This file owns the Order model, state machine,
> webhook handler, and reconciliation. The pipeline that creates the
> Order + initiates the PSP call lives in `_lib/checkout/CLAUDE.md`.

---

## Two checkout flows, one Order model

Both flows route through `processCheckout(req, type)` in `_lib/checkout`,
which creates an Order FIRST, then creates the Stripe object:

**1. Checkout Session flow (cart/shop)**
  URL: /shop → /shop/checkout/success
  API: POST /api/checkout/create
  CheckoutType: `types/session.ts`
  Creates: Order + Stripe Checkout Session (hosted by Stripe)
  Used for: STANDARD products via cart (add-to-cart → cart → pay)
  Payment: Redirect to Stripe-hosted page
  Webhook: checkout.session.completed → PENDING→PAID

**2. Elements flow (accommodation)**
  URL: /checkout → /checkout/success
  API: POST /api/checkout/payment-intent
  CheckoutType: `types/elements.ts`
  Creates: Order + Stripe PaymentIntent (clientSecret for Elements)
  Used for: PMS_ACCOMMODATION products (search → select → pay)
  Payment: Embedded Stripe Elements in page
  Webhook: payment_intent.succeeded → PENDING→PAID
  Guest info: Collected in step 3, saved via POST /api/checkout/update-guest

**3. Draft-order flow (B2B / walk-in)**
  Order is NOT created at checkout time — it's created by
  `convertDraftToOrder()` after the buyer pays via the share-token
  invoice link. See `_lib/draft-orders/CLAUDE.md`.

---

## Order state machine

```
PENDING → PAID → FULFILLED
    ↓        ↓
CANCELLED  CANCELLED → (requires refund)
              ↓
           REFUNDED
```

`canTransition(from, to)` in `_lib/orders/types.ts` is the ONLY guard.
It is called before EVERY status mutation — in webhook handlers and
admin actions. Never write `order.status !== "PENDING"` inline.

---

## Data models

**Order** — every purchase, regardless of type
  id, tenantId, orderNumber (sequential #1001+), status, paymentMethod
  (STRIPE_CHECKOUT | STRIPE_ELEMENTS), guestEmail, guestName, guestPhone
  subtotalAmount, taxRate (basis points), taxAmount, totalAmount, currency
  stripeCheckoutSessionId, stripePaymentIntentId, metadata (JSON)
  Timestamps: paidAt, fulfilledAt, cancelledAt, refundedAt

**OrderLineItem** — snapshot frozen at purchase time
  title, variantTitle, sku, imageUrl — NEVER join back to Product

**OrderEvent** — append-only audit log (Shopify timeline)
  Types: CREATED, PAID, FULFILLED, CANCELLED, REFUNDED, NOTE_ADDED,
         EMAIL_SENT, INVENTORY_RESERVED/CONSUMED/RELEASED,
         STRIPE_WEBHOOK_RECEIVED, PAYMENT_FAILED, GUEST_INFO_UPDATED,
         RECONCILED

**OrderNumberSequence** — atomic per-tenant counter via raw SQL
  INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING (race-safe)

**StripeWebhookEvent** — event-level dedup (stripeEventId PK)
  Cleaned up after 30 days by cron.

---

## Stripe Connect

Each tenant connects their own Stripe account (Standard Connect).
Key fields on Tenant: stripeAccountId, stripeOnboardingComplete,
stripeLivemode, stripeConnectedAt.

- `getStripe()` in `_lib/stripe/client.ts` — singleton, ONLY entry point
- `_lib/stripe/connect.ts` — onboarding, status check, disconnect
- `_lib/stripe/verify-account.ts` — cached charges_enabled check (60s TTL)
- Connect params: `{ stripeAccount: tenant.stripeAccountId }` on all Stripe calls

---

## Webhook handler (api/webhooks/stripe/route.ts)

Handles all Stripe events in one handler:
  checkout.session.completed — Checkout Session paid
  checkout.session.expired — session timed out
  payment_intent.succeeded — Elements payment confirmed
  payment_intent.payment_failed — Elements payment failed (logged, not cancelled)
  charge.refunded — refund processed

Security layers:
1. Signature verification (stripe.webhooks.constructEvent, default 300s tolerance)
2. Connect account verification (event.account → prisma lookup before trusting metadata)
3. Event-level dedup (StripeWebhookEvent unique INSERT)
4. Order-level idempotency (canTransition guard)

---

## Reconciliation (api/cron/reconcile-stripe/route.ts)

Runs every 15 minutes. Finds PENDING orders older than 30 minutes,
checks actual status on Stripe, heals missed webhooks.
Covers: PI succeeded but webhook missed, session expired but webhook missed.

---

## Cart system

Client-side localStorage, server-validated at checkout.
Key: `bf_cart_{tenantId}`. NOT a DB model.
`validateCart()` re-computes prices via `effectivePrice()` — never trusts client.

---

## Security hardening

- tenantId NEVER in request bodies — resolved from host header via
  `resolveTenantFromHost()` in all checkout/booking API routes
- Amount NEVER from client — derived server-side from product/PMS
- Amount bounds: min 1000 (10 SEK), max 10,000,000 (100K SEK)
- Currency allowlist: SEK, EUR, NOK, DKK — z.enum(), not z.string()
- Date validation: `validateStayDates()` in `_lib/validation/dates.ts`
  (shared across all routes — min 1 night, max 365, not in past)
- Rate limiting: in-memory sliding window per IP (X-Forwarded-For first IP)
  PI: 10/hr, checkout-create: 10/hr, bookings: 20/hr, update-guest: 5/10min
- Connect: `verifyChargesEnabled()` with 60s cache before every Stripe call
- PMS booking idempotency: `PendingBookingLock` table (SHA-256 of
  tenant+category+dates+email), 60s TTL, cleaned by cron

---

## Tax

The tax engine is `@/app/_lib/tax` — provider-pluggable, with the
Nordic V1 builtin provider active. `_lib/orders/tax.ts` is a thin
adapter wiring `calculateTax()` into the order pipeline.

Order stores `taxRate` (basis points), `taxAmount`, and any
`taxLines[]` breakdown for the receipt. The UI shows the same total
the tax engine returned — never "inkl. moms" placeholders in production.

See `_lib/tax/CLAUDE.md` for the calculator contract, failure-mode
tiering, and provider registry.

---

## Key files

- Checkout page: `app/(guest)/checkout/page.tsx` + `CheckoutClient.tsx`
- Success page: `app/(guest)/checkout/success/page.tsx`
- Payment intent: `app/api/checkout/payment-intent/route.ts`
- Checkout create: `app/api/checkout/create/route.ts`
- Guest info: `app/api/checkout/update-guest/route.ts`
- Webhook: `app/api/webhooks/stripe/route.ts`
- Reconciliation: `app/api/cron/reconcile-stripe/route.ts`
- Expire reservations: `app/api/cron/expire-reservations/route.ts`
- Stripe client: `app/_lib/stripe/client.ts`
- Stripe Connect: `app/_lib/stripe/connect.ts`
- Account verify: `app/_lib/stripe/verify-account.ts`
- Order types: `app/_lib/orders/types.ts`
- Order sequence: `app/_lib/orders/sequence.ts`
- Tax stub: `app/_lib/orders/tax.ts`
- Cart client: `app/_lib/cart/client.ts`
- Cart validate: `app/_lib/cart/validate.ts`
- Date validation: `app/_lib/validation/dates.ts`
- Rate limiting: `app/_lib/rate-limit/checkout.ts`
- Logger: `app/_lib/logger.ts`
- Booking create: `app/api/bookings/create/route.ts`
- Availability: `app/api/availability/route.ts`
- Admin orders: `app/(admin)/orders/`
- Payments settings: `app/(admin)/settings/payments/`

---

## Cron jobs (vercel.json)

- `/api/cron/expire-reservations` — every 5 min
  Releases expired inventory reservations, booking locks, webhook events (>30d)
- `/api/cron/reconcile-stripe` — every 15 min
  Heals stuck PENDING orders by checking Stripe status

For the broader cron landscape (PMS retry/reconcile, draft-order sweep,
cancellation saga retry, email retry, etc.) see `app/api/CLAUDE.md`.

---

## Dependencies on other domains

- `_lib/checkout` — owns the engine pipeline; this domain owns the Order model + lifecycle
- `_lib/payments` — `initiateOrderPayment()` for the PSP step; `adapter.refund()` for refunds
- `_lib/tax` — `calculateTax()` is the only entry point; never inline tax math
- `_lib/discounts` — `applyDiscountInTx()` mutates `Order.discountAmount` inside the convert/checkout transaction
- `_lib/integrations/reliability` — outbound pipeline triggers `createPmsBookingAfterPayment` from PAID transitions
- `_lib/cancellations` — saga reads Order via `canTransition()`; transitions Order → CANCELLED in a single tx
- `_lib/draft-orders` — `convertDraftToOrder()` produces an Order via the same `canTransition()` guard
- `_lib/email` — order confirmation + cancellation triggers
- `_lib/analytics` — emits ORDER_CREATED / ORDER_PAID / ORDER_CANCELLED / ORDER_REFUNDED via fire-and-forget

---

## Commerce invariants — never violate these

1. Order is created BEFORE any Stripe API call — always
2. canTransition() is the ONLY guard for status mutations — no inline checks
3. tenantId is NEVER in a request body — resolved from host header
4. Payment amount is NEVER from the client — derived server-side
5. Product prices in smallest currency unit (ören/cents) — never floats
6. effectivePrice() is the ONLY price resolution function
7. Order line items snapshot all product data at purchase time
8. Inventory changes are append-only — never UPDATE, always INSERT
9. Stripe webhooks are idempotent — event dedup + canTransition guard
10. Cart validated server-side before checkout — never trust client prices
11. Order numbers are sequential per tenant — atomic DB counter
12. All Stripe calls use Connect params when tenant has stripeAccountId
13. No Stripe secret keys in client code — only NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
14. Reservation TTL enforced — cron releases expired reservations
15. Structured logging (JSON) on all payment lifecycle events
