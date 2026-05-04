# Presentment-money handoff

**Status:** CROSS-TEAM CONTRACT — Terminal A + Terminal B alignment doc.
**Datum:** 2026-05-04
**Branch:** `claude/tax-engine-master-plan` (merges with PR #40)
**Författare:** Web Claude (Terminal B prompt-engineer)
**Bakgrund:** Terminal A bad explicit om denna doc i sin coord-response
2026-05-04. Den fixerar contract så Terminal A vet exakt hur deras
analytics-pipeline ska tolka presentment-money-fält när de börjar
konsumera dem post-Tax-4.

---

## Why this doc exists

Tax-0 (master plan §5) lägger till `presentment*`-kolumner additivt på
Order, OrderLineItem, DraftOrder, DraftLineItem — pure schema-add,
ingen behavior change. Tax-4 (Markets-lite) börjar faktiskt populera
dem med non-shop-currency-värden när buyer's market har
`taxDisplayMode = "INCLUSIVE"` med annan currency än shop.

Analytics-pipeline (Terminal A:s scope) behöver en kontrakt-yta att
lita på när de bumpar `payment_succeeded`, `cart_started`,
`cart_updated`, `checkout_started` till presentment-aware shapes
post-Tax-4.

Den här doc:en är det kontraktet.

---

## 1 — Vocabulary

| Term | Definition |
|---|---|
| **Shop currency** | Tenant's settlement / accounting currency. Stored as `Tenant.currency` (default `"SEK"`). Money flows in this currency at the bank-reconciliation layer. |
| **Presentment currency** | Buyer-facing display currency derived from `Market.currencySettings`. Same as shop in single-market tenants; different when multi-market with `localCurrencies = true`. |
| **Settlement currency** | = Shop currency. Stripe/payment-provider charges in this. |
| **Display currency** | = Presentment currency. UI shows this. |
| **MoneyBag** | Shopify's GraphQL pattern: `{ shopMoney, presentmentMoney }` — an amount expressed in BOTH currencies for traceability. We mirror this at the API surface (TypeScript) but flatten at storage (Prisma). See §6. |

---

## 2 — When is presentment ≠ shop?

**Pre-Tax-4 (current state):** ALWAYS equal. Storage convention
post-Tax-0 is `presentment* = shop *` (set by atomic-backfill SQL
inside the same migration that adds the columns).

**Post-Tax-4 (Markets-lite):** Diverge in these specific scenarios:

1. **Multi-market tenant + local currency enabled:**
   `Market.currencySettings.localCurrencies = true` AND
   `Market.taxDisplayMode = "INCLUSIVE"` AND
   buyer's resolved Market currency ≠ shop currency.

2. **B2B catalog override:** `CompanyLocation.priceCatalogCurrency`
   ≠ tenant's shop currency. (Tax-7+ feature.)

In all other cases (single-market tenants, multi-market but
`localCurrencies = false`, B2B without catalog override): equal.

**Detection rule in code:**
```typescript
const isMultiCurrencyOrder =
  order.presentmentCurrency !== null &&
  order.presentmentCurrency !== order.currency;
```

---

## 3 — Backfill semantics for historical rows

**Tax-0 migration `dual_currency_pricing_<timestamp>` runs:**

```sql
UPDATE "Order" SET
  "presentmentSubtotalAmount" = "subtotalAmount",
  "presentmentTaxAmount"      = "taxAmount",
  "presentmentTotalAmount"    = "totalAmount",
  "presentmentCurrency"       = "currency"
WHERE "presentmentSubtotalAmount" IS NULL;

-- Same shape for OrderLineItem, DraftOrder, DraftLineItem
```

**What this means for analytics:**

- All historical rows post-Tax-0 have `presentment* = shop *`.
- Reading `Order.presentmentTotalAmount` is ALWAYS safe — it's never
  null after Tax-0 backfill.
- For historical orders: `presentment* === shop *` is a property of
  the data, not a coincidence — it's the backfill semantic.
- Time-series queries spanning pre-Tax-4 and post-Tax-4 data: data
  before Tax-4 cutover always has `presentmentCurrency === currency`.
  Filter accordingly if multi-currency analysis is needed.

**Backfill is atomic with column-add per Coord #1 ask** — never a
window with NULL presentment values that analytics has to special-case.

---

## 4 — Who writes what

| Writer | Populates | Reads |
|---|---|---|
| **Existing checkout/Order code (pre-Tax-3)** | `currency`, `subtotalAmount`, `taxAmount`, `totalAmount` (shop-only) | Shop-only |
| **Tax-0 migration backfill** | `presentment*` rows = shop-equivalent | — |
| **Tax-3 (commerce wiring)** | `currency` + `presentment*` columns. In single-market case `presentment* = shop *`; in multi-market case `presentment*` = display values. | Computes both |
| **Tax-4 (Markets-lite)** | Same as Tax-3 but Markets resolution enables non-equal cases | Computes both |
| **Analytics emitter (process-paid-side-effects.ts)** | Reads `Order.totalAmount` etc. → emits `payment_succeeded` | Pre-v0.3.0: shop-only<br>v0.3.0+: both |
| **Cron / reconciliation** | Reads shop-only (settlement-side) | Shop-only — never presentment |
| **Storefront UI** | Reads `presentment*` for display | Presentment when set, shop fallback |

**Key invariant:** Settlement / bank reconciliation / Stripe payouts
ALWAYS use shop currency. Presentment is **display only** + analytics
multi-currency reporting.

---

## 5 — Field-level contract per entity

### Order
| Field | Type | Currency | Source |
|---|---|---|---|
| `currency` | String | shop | tenant currency |
| `subtotalAmount` | Int | shop | Stripe charge amount, line sum |
| `taxAmount` | Int | shop | calculator output, shop-converted |
| `totalAmount` | Int | shop | Stripe charge amount |
| `presentmentCurrency` | String? | presentment | Market resolution |
| `presentmentSubtotalAmount` | Int? | presentment | calculator + market FX |
| `presentmentTaxAmount` | Int? | presentment | calculator output, presentment |
| `presentmentTotalAmount` | Int? | presentment | calculator + market FX |

**Pre-Tax-3:** All `presentment*` = same value as shop (post-backfill
only, set by Tax-0 migration).

**Post-Tax-3 + multi-market case:**
- `currency` (shop) reflects what was settled.
- `presentment*` reflects what was displayed to buyer.
- FX rate captured at order time — NOT recomputed on read.

### DraftOrder + DraftLineItem
Same shape, but in BigInt cents (`subtotalCents` etc. → matched by
`presentmentSubtotalCents`).

### TaxLine (new in Tax-0)
Mandatory dual-currency:
```
taxAmountCents              BigInt   (shop)
presentmentTaxAmountCents   BigInt   (presentment)
presentmentCurrency         String   (presentment, never null)
```
TaxLines are always emitted with both — no nullable presentment here.

---

## 6 — MoneyBag-nesting decision (KEY ARCHITECTURE)

Terminal A preferred Shopify-style nesting:
```typescript
amount: {
  shop:        { amount: 12500, currency: "SEK" },
  presentment: { amount: 12500, currency: "SEK" },
}
```

vs. our existing flat convention:
```typescript
amount:               12500
currency:             "SEK"
presentmentAmount:    12500
presentmentCurrency:  "SEK"
```

### Decision: HYBRID

| Layer | Pattern | Reason |
|---|---|---|
| **Prisma schema (storage)** | **Flat** (`presentmentAmount` + `presentmentCurrency` parallel columns) | Matches existing schema convention. Schema-migration-friendly. Indexable per-column. |
| **TypeScript service-API (`_lib/money/types.ts`)** | **Nested MoneyBag** | Forces dev to pick which money to use at every aggregation site. Matches Shopify GraphQL surface. Compiles to type-safe access. |
| **REST/GraphQL API (future)** | **Nested MoneyBag** | Shopify-grade external surface. |
| **Analytics events (Terminal A)** | **Nested MoneyBag** | Per Terminal A:s preference. Forces explicit choice in aggregator code. |
| **Helpers** | `_lib/money/from-flat.ts` + `_lib/money/to-flat.ts` | Map between layers. |

### Helper API (Tax-0 deliverable)

```typescript
// _lib/money/types.ts
export type MoneyV2 = {
  amount: bigint | number;  // bigint for cents, number for legacy Int
  currency: string;
};

export type MoneyBag = {
  shopMoney: MoneyV2;
  presentmentMoney: MoneyV2;
};

// _lib/money/from-flat.ts — Prisma row → MoneyBag
export function moneyBagFromFlat(args: {
  amount: bigint | number;
  currency: string;
  presentmentAmount?: bigint | number | null;
  presentmentCurrency?: string | null;
}): MoneyBag {
  return {
    shopMoney: { amount: args.amount, currency: args.currency },
    presentmentMoney: {
      amount: args.presentmentAmount ?? args.amount,
      currency: args.presentmentCurrency ?? args.currency,
    },
  };
}

// _lib/money/to-flat.ts — MoneyBag → Prisma update payload
export function moneyBagToFlat(bag: MoneyBag) {
  return {
    amount: bag.shopMoney.amount,
    currency: bag.shopMoney.currency,
    presentmentAmount: bag.presentmentMoney.amount,
    presentmentCurrency: bag.presentmentMoney.currency,
  };
}
```

**Why this decision balances both teams:**
- Terminal B keeps schema-convention consistency (flat columns)
- Terminal A gets MoneyBag at the API surface they actually consume
- No schema-rewrite cost
- Compile-time safety at every aggregation site (TypeScript forces
  `.shopMoney.amount` vs `.presentmentMoney.amount`)
- Helpers make the mapping explicit and testable

---

## 7 — Analytics consumption timeline

### Pre-Tax-0 (today)
Analytics emit `payment_succeeded` v0.2.0 with single-currency `amount: { amount, currency }`. Reads `Order.totalAmount` + `Order.currency`. **No change needed.**

### Post-Tax-0 schema lands
Schema has `presentment*` columns; backfilled to shop-equivalent. Analytics keeps reading shop-only — emitter is unchanged.

### Post-Tax-3 commerce wiring
`OrderLineItem` shape may evolve (per Coord #2 ask). Tax-3 recon will spec which field analytics emits. Emitter update **either** lands in same PR as Tax-3 **or** ships as `payment_succeeded` v0.3.0 alongside (Terminal A's choice).

### Post-Tax-4 Markets-lite
**This is when MoneyBag enters analytics events.** Bumps:
- `payment_succeeded` → v0.3.0 with `amount: MoneyBag`
- `cart_started` → similar
- `cart_updated` → similar
- `checkout_started` → similar
- Funnel-rates aggregator gets `(shop_currency, presentment_currency)` dimension pair

**Sequencing:** Path a (coordinated) or Path b (lag acceptable) per Coord #3 — Tax-4 recon decides which.

### Lag estimate per Terminal A
~1-2 weeks per event after Tax-4 ships, plus a Phase 5B/5C-equivalent on the aggregator to add currency_pair dimension.

---

## 8 — Edge cases for analytics to be aware of

1. **Refunded order with multi-currency:**
   `Order.refundedAmount` is shop-only. `presentmentRefundedAmount` is
   future Tax-N work. Analytics: report refunds in shop currency for
   now; multi-currency refund analytics is a separate concern.

2. **FX rate drift:**
   `presentmentAmount` is captured at order-time. If FX moves between
   order placement and refund, Stripe refund happens at **shop**
   currency. Analytics: `presentmentTotalAmount - shopRefundedAmount`
   is NOT a meaningful number. Always compare in same currency-space.

3. **Discount in presentment vs shop:**
   Discounts apply pre-FX. `Order.orderDiscountAmount` is shop;
   `presentmentOrderDiscountAmount` is presentment. Discount **rate**
   is currency-invariant; **amount** differs by FX.

4. **Tax-inclusive markets:**
   Per master plan Decision 11: storage net, presentment formula at
   display. `presentmentSubtotalAmount` therefore ALWAYS net even when
   buyer-displayed price is gross (inclusive). Analytics: subtotal
   means net everywhere, regardless of inclusivity.

5. **Multi-line orders with mixed taxability:**
   Each `TaxLine` has its own `(taxAmountCents, presentmentTaxAmountCents)`. Order-level `totalTax` is the sum.
   Per-line aggregation requires summing TaxLine rows, not a single
   `Order.taxAmount` field (post-Tax-2/Tax-3).

---

## 9 — Validation checklist before Terminal A bumps event schemas

When Tax-4 lands and Terminal A is ready to bump events:

- [ ] Tax-4 PR explicitly states `Order.currency` semantic post-merge
  (shop OR presentment)
- [ ] Tax-4 PR includes representative test fixtures with
  multi-currency Order rows
- [ ] `_lib/money/from-flat.ts` helper available and stable
- [ ] No analytics-test-fixture relies on `presentmentX === shopX`
  (legacy assumption)
- [ ] Funnel-rates aggregator tested with mixed-currency input
- [ ] Worker validator parity test covers MoneyBag shape per CLAUDE.md
  rule

---

## 10 — Cross-team escalation contacts

If Terminal A discovers something inconsistent post-Tax-4 — analytics
emitting wrong currency, FX edge case, etc. — escalation path:

1. Open issue / PR comment on the Tax-N PR that introduced the
   discrepancy
2. Tag Terminal B for review
3. If urgent (production data integrity): Terminal A may push hotfix
   to analytics emitter to use shop-only fallback while Terminal B
   investigates

This doc is canonical — if it disagrees with code, the doc is updated
(via PR + Terminal B + Terminal A review) and code follows.
