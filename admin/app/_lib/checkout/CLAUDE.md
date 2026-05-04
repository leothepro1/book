# Checkout engine

`processCheckout(req, type)` is the SINGLE entry point for ALL checkout
flows. It owns the shared infrastructure — rate limiting, tenant
resolution, Stripe verification, Order creation, PaymentIntent / Session
creation, orphan cleanup, structured logging, error mapping.

Each checkout flow contributes only **domain-specific logic** via the
`CheckoutType<T>` interface. Adding a new checkout = 1 file in
`types/` + 1 registry entry. Zero infrastructure code duplication.

> See also: `_lib/orders/CLAUDE.md` for the Order state machine and
> webhook handler. This file covers what happens BEFORE the Order is paid.

---

## The engine pipeline

```
1. Rate limit       checkRateLimit(prefix, max, windowMs)
2. Resolve tenant   resolveTenantFromHost() — NEVER from request body
3. Verify Stripe    verifyChargesEnabled(tenant) — 60s cache
4. Validate input   type.validate(body, ctx) — domain-specific Zod
5. Resolve price    type.resolvePrice(input, ctx) — server-side, never trust client
6. Create order     prisma.order.create() — Order EXISTS before any Stripe call
7. Initiate PSP     initiateOrderPayment(order, opts) → intent | session
8. (on failure)     orphan-cleanup: cancel Order, return error
9. Return           NextResponse.json({ orderId, clientSecret | sessionUrl })
```

Steps 6 → 7 are NEVER reordered. The "Order before Stripe" invariant is
the cornerstone of the reliability model.

---

## CheckoutType interface

```typescript
interface CheckoutType<TInput> {
  name: string;                                           // "elements" | "session" | …
  rateLimit: [prefix: string, max: number, windowMs: number];
  validate(body: unknown, ctx: CheckoutContext): TInput;  // throws CheckoutError
  resolvePrice(input: TInput, ctx: CheckoutContext): Promise<ResolvedPrice>;
  buildOrder(input: TInput, ctx: CheckoutContext, price: ResolvedPrice): OrderCreateInput;
  buildPayment: "intent" | "session";                     // routes to initiateOrderPayment
}
```

Implementations:
- `types/elements.ts` — embedded Stripe Elements (PaymentIntent flow)
- `types/session.ts` — Stripe-hosted Checkout Session (cart flow)

---

## Errors

`CheckoutError` is the domain error type. Each instance carries `(code, message, httpStatus)`:

  RATE_LIMITED · 429
  TENANT_NOT_FOUND · 404
  STRIPE_NOT_CONFIGURED · 503
  INVALID_INPUT · 400
  PRICE_RESOLUTION_FAILED · 422
  AMOUNT_OUT_OF_BOUNDS · 400
  CURRENCY_NOT_ALLOWED · 400
  STRIPE_FAILED · 502

Engine catches `CheckoutError` and returns the mapped response. Any
other thrown error → 500 + Sentry capture (with tenant context already set).

---

## Idempotency

`idempotency.ts` uses the `PendingBookingLock` table — SHA-256 of
`(tenantId, accommodationId, dates, email)`, 60s TTL. Prevents
double-checkout when a guest double-clicks "pay" before the page transitions.

The Stripe call uses the order's idempotencyKey (`order:{id}:initiate`)
as the Stripe API's `Idempotency-Key` header. Retries hit Stripe's
server-side dedup.

---

## Amount + currency safety

`SUPPORTED_CURRENCIES` = `["SEK", "EUR", "NOK", "DKK"]` — `z.enum`, not `z.string`.

`MIN_AMOUNT = 1000` (10 SEK) · `MAX_AMOUNT = 10_000_000` (100k SEK).

These bounds are enforced at the engine layer, not the route. New
checkout types automatically inherit the safety.

---

## Key files

- Public barrel: `app/_lib/checkout/index.ts`
- Engine: `app/_lib/checkout/engine.ts`
- Types interface + bounds: `app/_lib/checkout/types.ts`
- Per-flow implementations: `app/_lib/checkout/types/`
- Errors: `app/_lib/checkout/errors.ts`
- Idempotency: `app/_lib/checkout/idempotency.ts`
- Session-types helper: `app/_lib/checkout/session-types.ts`
- Routes that call the engine: `app/api/checkout/payment-intent/route.ts`,
  `app/api/checkout/create/route.ts`

---

## Dependencies

- `_lib/payments` — `initiateOrderPayment()` for the PSP step
- `_lib/orders` — `nextOrderNumber()`, Order Prisma model, `canTransition()` (webhook side)
- `_lib/tax` — `calculateTax()` for line tax (Tax-3 wires this in)
- `_lib/rate-limit/checkout.ts` — `checkRateLimit()` from observability layer
- `_lib/integrations/reliability` — outbound holds for accommodation flow

---

## Checkout invariants — never violate

1. `processCheckout()` is the ONLY entry point — routes are 5-line wrappers
2. Order is created BEFORE any Stripe API call — always
3. `tenantId` NEVER from request body — only `resolveTenantFromHost()`
4. Amount NEVER from client — `resolvePrice()` derives server-side
5. Currency is z.enum — never z.string
6. Amount bounds enforced at engine layer — every checkout type inherits
7. Stripe failure cancels the orphan Order — never leave PENDING orders behind
8. `CheckoutError` instances map to mapped HTTP responses — bare throws → 500 + Sentry
9. Idempotency lock keys hash the SAME inputs `resolvePrice` uses — drift = double-charge
10. Adding a new checkout flow = 1 file in `types/` + registry entry. NEVER duplicate engine pipeline.
