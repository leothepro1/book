# Payments — multi-PSP boundary

Payment-method registry and PSP adapter layer. Stripe is the active
provider; the architecture is multi-PSP-ready (Adyen / Klarna direct /
Mollie can plug in via the same provider interface).

---

## Two layers

```
payment methods (this dir)            PSP adapters (this dir/providers/)
────────────────────────────         ────────────────────────────────
PAYMENT_METHOD_REGISTRY              StripeProvider (active)
  card · klarna · apple_pay …        future: AdyenProvider, …
                  ↓                              ↓
resolvePaymentMethods(config)        initiateOrderPayment(order, provider)
  → ResolvedPaymentMethods           → { providerKey, intent | session }
                  ↓                              ↓
checkout engine consumes both via processCheckout()
```

`resolvePaymentMethods` decides WHAT methods are offered.
`initiateOrderPayment` (in `providers/initiate.ts`) decides HOW the
chosen method is processed.

---

## Payment method registry

Static, code-defined manifest in `registry.ts`. Each method declares:

  id              — "card" | "klarna" | "apple_pay" | "google_pay" | …
  category        — "card" | "wallet" | "bnpl" | "bank" …
  alwaysOn        — locked on, tenant cannot disable
  defaultEnabled  — initial state for new tenants
  clientDetected  — wallet detection happens in browser (Apple/Google Pay)
  stripeTypes     — array of Stripe PaymentMethod types to enable

`PAYMENT_METHOD_MAP` is a derived lookup. Use `getMethodDefinition(id)`
or `getMethodsByCategory(cat)` from `registry.ts` — never index the map directly.

---

## resolvePaymentMethods

Single entry point for "what should we pass to Stripe?":

```typescript
import { resolvePaymentMethods } from "@/app/_lib/payments";

const { stripeTypes, availableMethods, walletsEnabled, klarnaEnabled } =
  resolvePaymentMethods(tenant.paymentMethodConfig);
```

Rules baked in:
1. `alwaysOn` methods always included
2. Missing methods in tenant config use `defaultEnabled` from registry
3. `clientDetected` (wallets) → in `availableMethods` but NOT in `stripeTypes`
   — wallets use "card" via the Payment Request API
4. `stripeTypes` is deduplicated

**Never bypass this resolver.** Checkout routes that build their own
Stripe types list will drift from what the admin UI shows.

---

## Provider adapter layer

`providers/initiate.ts::initiateOrderPayment(order, opts)` is the ONLY
entry point checkout uses to start a payment. It returns one of:

```
{ kind: "intent",  clientSecret, paymentIntentId }   ← Elements flow
{ kind: "session", url, sessionId }                  ← Hosted Checkout
```

`providers/registry.ts` maps `providerKey` → adapter. Stripe is the only
implementation today. Adding a provider means: implement
`PaymentProvider` interface, register at module load, set
`Tenant.paymentProviderKey` per tenant.

`providers/credentials.ts` — encrypted PSP credentials (same encryption
as PMS adapters, AES-256-GCM with `INTEGRATION_ENCRYPTION_KEY`).

`providers/webhook.ts` — common webhook signature verification + dedup.
Provider-specific event parsing happens in the adapter (`providers/adapters/stripe.ts`).

---

## Platform fee

`platform-fee.ts` — Stripe Connect application fee calculation. Returns
the fee amount in ören per order; passed to `applicationFee` on the
PaymentIntent or `payment_intent_data.application_fee_amount` on Sessions.

Fee config lives on `Tenant.platformFeeBasisPoints` (default platform
default). Computed deterministically — same order always produces the
same fee.

---

## Key files

- Public barrel: `app/_lib/payments/index.ts`
- Method registry: `app/_lib/payments/registry.ts`
- Method config defaults: `app/_lib/payments/defaults.ts`
- Method resolver: `app/_lib/payments/resolve.ts`
- Provider initiate: `app/_lib/payments/providers/initiate.ts`
- Provider registry: `app/_lib/payments/providers/registry.ts`
- Provider credentials: `app/_lib/payments/providers/credentials.ts`
- Webhook helper: `app/_lib/payments/providers/webhook.ts`
- Stripe adapter: `app/_lib/payments/providers/adapters/`
- Platform fee: `app/_lib/payments/platform-fee.ts`

---

## Dependencies

- `_lib/checkout` — calls `initiateOrderPayment()` from the engine
- `_lib/orders` — webhook handler verifies via `providers/webhook.ts`
- `_lib/cancellations` — uses provider adapter `.refund()` (never raw Stripe SDK)
- `_lib/integrations/reliability/outbound-compensation.ts` — uses adapter `.refund()`

---

## Payment invariants — never violate

1. `resolvePaymentMethods()` is the ONLY way to compute `stripeTypes` for an Order — never inline
2. `initiateOrderPayment()` is the ONLY entry point to start a payment — never call PSP SDK directly from routes
3. Payment-method definitions live in code (`registry.ts`) — DB stores tenant config only
4. `Tenant.paymentProviderKey` selects adapter — `Tenant.paymentMethodConfig` selects methods
5. PSP credentials encrypted at rest — never logged, never in client bundles
6. Refunds go through `adapter.refund()` — never raw Stripe SDK calls (keeps multi-PSP-ready)
7. `clientDetected` wallets do NOT add stripe types — they use "card" via Payment Request API
8. Platform fee computed deterministically — same Order always produces same fee
9. Provider webhook signature verification runs BEFORE event parsing — never trust unsigned payloads
10. Adding a payment method = registry entry + admin toggle + provider stripeTypes mapping. No checkout-engine changes.
