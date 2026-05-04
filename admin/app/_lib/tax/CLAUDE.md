# Tax engine

Provider-pluggable tax calculator. Single `calculateTax(req)` entry point
called by Cart, Checkout, DraftOrder, and Order. Built-in Nordic V1
provider ships with the platform; Avalara provider is the planned tier-2
implementation.

This subsystem is under active development — see recent commits
(Tax-1 calculator core, Tax-2 DraftOrder wiring).

---

## Public API

```typescript
import { calculateTax } from "@/app/_lib/tax";

const response = await calculateTax({
  tenantId,
  fulfillmentLocation,    // { countryCode, region? }
  customer,               // optional — drives B2B reverse-charge etc.
  lines: [{ id, amount, taxCategory, … }],
  shipping: { amount, taxCategory },
  collectMode,            // COLLECT | EXEMPT | COLLECT_UNLESS_EXEMPT
});
```

`calculateTax()` **NEVER throws** — every failure mode falls through to
the tier-3 zero-rate fallback so checkout flows can always quote a total.

---

## Failure-mode tiering (Decision 10 — always quote, never block)

Tier 1 — Resolved provider succeeds → return its response.

Tier 2 — Provider throws or unreachable → log + tier-3 fallback.

Tier 3 — Zero-rate response with `source: "fallback_zero"` and a
`warnings` entry naming the cause. The order is creatable. The discrepancy
shows up as a structured log event (`tax.calculate.provider_threw`) that
operators monitor and reconcile manually.

This is non-negotiable: a tax provider outage cannot stop bookings. The
business decision is "always quote and reconcile later" — never lose the
sale.

---

## Provider registry

`providers/registry.ts` — providers registered by key. The builtin
provider auto-registers on module load (idempotent for HMR).

Adding a provider:
1. Implement the `TaxProvider` interface from `providers/interface.ts`
2. Register with `registerTaxProvider({ key, calculate })` at module load
3. Set `TenantTaxConfig.providerKey = "<your-key>"` per tenant

The Avalara provider (planned Tax-8) will follow this pattern — no
calculator-core changes needed.

---

## Tax categories (taxonomy)

`taxonomy.ts` — `TaxCategory` enum and `DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE`
mapping. Categories drive rate selection in the builtin provider:

  STANDARD            — 25% Nordic default
  REDUCED_FOOD        — 12% (food, restaurant)
  REDUCED_LODGING     — 12% (accommodation in SE)
  REDUCED_BOOKS       — 6% (books, certain media)
  ZERO                — 0% (exports, B2B reverse-charge)
  EXEMPT              — line excluded from VAT base entirely

Adding a category requires updates to: enum, default mapping, and every
provider's rate table.

---

## Exemptions

`exemptions.ts` — `TaxExemptionCode` enum + canonical reason strings.
Used when `customer.exempt = true` (verified via tax-ID lookup, never
trusted from input).

---

## Tax response shape

```
{
  totalTaxCents: bigint,
  lines: [{ lineId, taxAmountCents, taxRate, breakdown[] }],
  shipping: { taxAmountCents, taxRate },
  source: "builtin" | "avalara" | "fallback_zero",
  providerKey: "builtin" | …,
  warnings: string[],     // empty on success
}
```

`breakdown[]` enumerates per-jurisdiction lines (federal, state, county)
for receipt rendering. Builtin Nordic V1 emits a single line per `taxLine`.

---

## Parity tests

`parity.test.ts` — runs the same fixtures through DraftOrder calculator
+ Order calculator + Checkout engine and asserts identical totals.
This is the safety net against drift between the four call sites.

---

## Key files

- Public barrel: `app/_lib/tax/index.ts`
- Calculator entry point: `app/_lib/tax/calculate.ts`
- Types: `app/_lib/tax/types.ts`
- Taxonomy: `app/_lib/tax/taxonomy.ts`
- Exemptions: `app/_lib/tax/exemptions.ts`
- Provider interface: `app/_lib/tax/providers/interface.ts`
- Provider registry: `app/_lib/tax/providers/registry.ts`
- Builtin Nordic V1 provider: `app/_lib/tax/providers/builtin.ts`
- Rate seed loader: `app/_lib/tax/seed-rates.ts`
- Cross-caller parity test: `app/_lib/tax/parity.test.ts`

---

## Dependencies

- `_lib/orders` calls calculateTax via `_lib/orders/tax.ts` wiring
- `_lib/checkout` calls calculateTax in the engine pipeline
- `_lib/draft-orders/calculator/orchestrator.ts` calls calculateTax
- `_lib/cart/validate.ts` calls calculateTax for client preview totals

---

## Tax invariants — never violate

1. `calculateTax()` NEVER throws — all failure modes fall to tier-3 fallback
2. Tier-3 fallback always returns `source: "fallback_zero"` with a warning — never silent
3. `TenantTaxConfig.providerKey` is the only routing input — never hardcode provider per tenant
4. Builtin provider auto-registers on load — duplicate `registerTaxProvider` is silent (idempotent)
5. All amounts in BigInt ören — never floats
6. Exemption status is verified server-side — never trust client `customer.exempt`
7. The four callers (Cart, Checkout, DraftOrder, Order) MUST produce identical totals — `parity.test.ts` enforces
8. Adding a tax category = update enum + default-mapping + every provider's rate table — no shortcuts
