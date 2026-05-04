# Tax Engine — Master Plan

**Status:** STRATEGIC FOUNDATION DOC — multi-phase decomposition, not a single FAS recon
**Datum:** 2026-05-04
**Branch:** `claude/tax-engine-master-plan` (från `main` @ `1f5b9cf`)
**Författare:** Claude (Web — claude.ai/code, Terminal B prompt-engineer)
**Källor:** Shopify Engineering, shopify.dev, help.shopify.com, GraphQL Admin reference, partner-docs (Avalara/TaxJar/Vertex), changelog. Full URL-index i §10.

---

## Executive Summary

Idag returnerar `_lib/orders/tax.ts:getTaxRate()` värdet `0`. Ingen kod
använder det. Vår faktiska "tax engine" består av en hardcoded
`Accommodation.taxRate` (basis points) + ett tax-inclusive-flag på
DraftOrder. Det räcker för att starta en svensk camping. Det räcker
inte för platformen vi bygger:

> **"10,000 active tenants … sub-200ms p95 storefront reads … zero
> downtime for schema migrations."** (CLAUDE.md "THE BAR")

Det finns ingen seriös shipping-vägs till **Markets, multi-currency,
multi-jurisdiction, B2B reverse-charge, eller tax-service-integrationer**
från där vi står idag — om vi bygger fel foundation nu.

Den här doc:en är resultatet av en djup källkritisk research mot
Shopifys faktiska arkitektur (12 frågor, 50+ källor). Den synthesiserar
**12 lock-in-decisions** vi måste ta innan första raden tax-kod skrivs,
och dekomponerar bygget i **10 sekventiella faser (Tax-1 → Tax-10)**
över ~3-4 månader Terminal B-arbete + 2 cross-domain-koord-punkter med
Terminal A.

Detta är inte en FAS 7.7. Det är en **maskin** — exakt som operatören
beskrev.

---

## 1 — Why this doc exists (operator's framing)

> "i framtiden, kommer ha exakt som shopify har, man kan skapa nya
> marknader, med nya valutor. detta måste vår tax engine respektera.
> jag vill nu, att du läser på, undersöker och hittar exakt från
> originalkällor hur shopify arbetar med skatt och moms"
> — operator, 2026-05-04

Detta är **arkitekturella beslut som måste tas korrekt från början**.
Felval här lockar in oss i tekniska skulder som tar månader att betala
av senare. Specifikt:

- Om vi inte modellerar `TaxLine` som per-line-per-jurisdiction från
  början, kommer multi-jurisdiction (US state + county + city) kräva
  att vi backfillar alla historiska orders.
- Om vi inte använder `MoneyBag { shopMoney, presentmentMoney }` från
  början, kommer Markets-introduktion bryta varje currency-display-yta.
- Om vi inte använder banker's rounding på line-level från början,
  kommer tax-mismatch-issues spridas under varje partner-integration.

Denna research är därför ENTERPRISE-grundläggning innan FAS-kod.

---

## 2 — Current state audit (intern)

### 2.1 — Vad vi har

```
Accommodation.taxRate          Int (basis points, default 0)  — per produkt
Order.taxRate / taxAmount      Int / Int                       — frozen per order
DraftOrder.taxesIncluded       Boolean (default true)          — display rule
DraftOrder.totalTaxCents       BigInt                          — frozen total
DraftLineItem.taxAmountCents   BigInt                          — frozen per-line
calculator/core.ts             pure function, Math.round       — rotfot-nivå
                                                                 inclusive XOR exclusive
_lib/orders/tax.ts             getTaxRate() returnerar 0       — STUB
```

### 2.2 — Vad vi gör BRA (bevara)

| Beteende | Var | Behåll? |
|---|---|---|
| Pure calculator core, side-effect-free | `calculator/core.ts` | ✅ |
| BigInt ören end-to-end | Alla pricing-paths | ✅ |
| Frozen snapshots vid sendInvoice | `lifecycle.ts:freezePrices` | ✅ |
| Inclusive vs exclusive math (XOR) | `calculator/core.ts:140-150` | ✅ |
| Order inherits frozen totals from Draft | `convert.ts:344-346` | ✅ |

### 2.3 — Vad vi INTE har (gap mot Shopify)

| Gap | Konsekvens om vi inte fixar |
|---|---|
| **TaxLine** som dedikerad data-modell | Multi-jurisdiction omöjlig att backfilla |
| **MoneyBag** dual-currency på pricing-fält | Markets-roll-out bryter alla checkout-ytor |
| **Tax registrations** som separat entitet | Kan inte modellera "vi är registrerade i SE+DE+NL" |
| **Markets**-modell | Kan inte erbjuda multi-region storefront |
| **Tax categories / taxonomy** | Kan inte hantera "mat 12%, övernattning 6%, tjänster 25%" |
| **TaxExemption**-enum | Kan inte göra B2B reverse-charge |
| **Tax-provider-abstraktion** | Inlåsta i egen engine, kan aldrig växla till Avalara |
| **Banker's rounding** | Tax-discrepancies vid integration mot tax-providers |
| **Failure-mode-fallback** | Single-point-of-failure i checkout |

---

## 3 — How Shopify does it (synthesis, citerad)

Sammanfattning av subagentens dossier. Fullständiga utdrag i §A1–A12 i
appendix.

### 3.1 — Single calculator, three callers, one schema

> "the tax engine is invoked by **three distinct parts of Shopify
> (Cart, Checkout, and Order)** … defined a clear interface and entry
> point into all the tax calls being made … `TaxesRequestSchema` and
> `TaxesResponseSchema` … Each of the complex attributes is simply a
> collection of simple types"
> — [Componentizing Shopify's Tax Engine](https://shopify.engineering/componentizing-shopify-tax-engine)

**Detta är den viktigaste designbeslutet att kopiera.** Cart/Checkout/
Order/Draft kallar samma `calculate(request) → response`. Schema är
"primitive-typed" så ingen sida läcker model details.

### 3.2 — TaxLine är universal output unit

`TaxLine` är `LineItem 1—N TaxLine` och `ShippingLine 1—N TaxLine` —
**en rad per (line, jurisdiction)**. Inga order-level tax-aggregat.
Order-totaler är derivat.

```
TaxLine {
  id: ID!
  title: String!         // "VAT", "State Tax", "City Tax"
  rate: Float            // 0.25
  ratePercentage: Float  // 25.0
  priceSet: MoneyBag!    // { shopMoney, presentmentMoney }
  source: String         // "shopify_tax", "avalara", "merchant_override"
  channelLiable: Boolean // null = unknown
}
```

### 3.3 — Money är alltid dual-currency via MoneyBag

```
MoneyBag {
  shopMoney:        MoneyV2  // tenant settlement currency
  presentmentMoney: MoneyV2  // buyer-facing currency
}

MoneyV2 { amount: Decimal, currencyCode: CurrencyCode }
```

Detta är **enheten för pris** överallt i Shopify-grafen. Retro-fittades
in i partner-platform så sent som 2026-01.

### 3.4 — Markets är localization scope, inte tax-spine

- `Market` grupperar regioner och äger currency/display-behaviour
- `TaxRegistration` lever på shop / business entity och är "konsumeras
  av" Markets — inte "ägs av"
- Detta dekopplar **var du säljer** från **var du måste remittera**

### 3.5 — Product taxonomy är single classifier

Ett 10,000-noder träd ([Shopify/product-taxonomy on GitHub](https://github.com/Shopify/product-taxonomy),
MIT-licensierat). Per-produkt `category_id` lagras. Region-specifika
regler ("mat skattefri i CA, taxed i NY") lever **inuti tax-engine**,
inte på produkten.

### 3.6 — Override precedence är låst

```
Customer/Company-location exemption  >  Merchant tax override  >  Product-category derived rate
```

Override scopas av `(manual collection, region, rate)`. Tax-overrides
disar på US state-level (medvetet coarser än rate-engine).

### 3.7 — Banker's rounding på line-level

> "tax amounts are rounded at the line-item level. … Previously, taxes
> were rounded at the invoice level by calculating the taxes on the
> order's subtotal, and then rounding the results."
> — [Manage your taxes (Shopify Help)](https://help.shopify.com/en/manual/taxes/registration/manage)

Mode: **half-to-even** (banker's rounding). `Math.round` i JS är
half-away-from-zero — INTE samma. Vi behöver explicit half-to-even-
implementation.

### 3.8 — Inclusive vs exclusive är display-contract per market

Inte product-attribute. **Per market** sätter `Tax display = Dynamic`
och formel `Tax = (Rate × Price) / (1 + Rate)` appliceras vid
presentation. Pris-storage är en (alltid net), display är context.

### 3.9 — Tax Platform = synkron req/resp + asynkron summary webhook

Provider-contract (Avalara/Vertex/etc.):

1. **Activate** via `taxAppConfigure` — markerar denna provider som
   active för en region. Endast en provider per region.
2. **Calculate** (synchronous HTTPS request from Shopify till provider's
   endpoint vid cart/checkout/order). Payload har shop+presentment
   money, customer/company metafields, business entity.
3. **Subscribe** till `tax_summaries/create` webhook för fulfillment/
   refund-events (för liability-uppdatering).
4. **Optional write-back** via `taxSummaryCreate` mutation.

### 3.10 — Failure mode = always quote, never block

- Shopify Tax (native) downtime → fallback till **ZIP-only engine**
- Tax Partner App downtime → fallback till **merchant's manual rate
  table**
- Estimate vs. final mismatch → auth-void + re-auth (NOT "refuse
  checkout")

### 3.11 — EU reverse charge är first-class men minimal

- `TaxExemption` enum har `EU_REVERSE_CHARGE_EXEMPTION_RULE`
- VIES-validering vid checkout / B2B company-location-update
- Auto-applied vid valid VIES match
- Legal text på faktura ("Article 138 / 194") är **NOT** auto-emitted
  — left to merchant/partner-app

### 3.12 — Drafts delar TaxLine-shape men har egen calculator entry

`draftOrderCalculate` mutation, returnerar `CalculatedDraftOrder` med
samma `TaxLine`-struktur. **Tax recomputed on every call** — frozen
först vid konvertering till Order.

---

## 4 — 12 Lock-in Architectural Decisions

Dessa MÅSTE tas korrekt **innan** Tax-1 startar. Felval här rippar
genom alla efterföljande faser.

### Decision 1 — Single calculator, multiple callers

**LOCK:** Vi bygger EN `calculateTax(request) → response` som anropas
från Cart, Checkout, DraftOrder.create-with-lines, sendInvoice's
freezePrices, och eventuell future Order-creation-path.

**Schema (locked):**
```typescript
export type TaxRequest = {
  tenantId: string;
  marketId?: string;       // future Tax-4; null pre-Markets = tenant default
  buyerLocation: {
    countryCode: string;   // ISO 3166-1 alpha-2
    region?: string;       // US state, CA province, etc.
    postalCode?: string;
    city?: string;
  };
  fulfillmentLocation: {   // origin (warehouse / accommodation property)
    countryCode: string;
    region?: string;
    postalCode?: string;
  };
  lines: TaxRequestLine[];
  customer?: {
    id?: string;
    taxExemptions: TaxExemptionCode[];
    vatNumber?: string;
  };
  companyLocation?: {       // B2B
    id: string;
    taxExemptions: TaxExemptionCode[];
    vatNumber?: string;
    taxRegistrationId?: string;
    collectMode: "COLLECT" | "DO_NOT_COLLECT" | "COLLECT_UNLESS_EXEMPT";
  };
  shippingLines: ShippingLine[];
  presentmentCurrency: string;  // future: from Market
  shopCurrency: string;
};

export type TaxRequestLine = {
  lineId: string;            // for response correlation
  productId?: string;
  variantId?: string;
  taxonomyCategoryId?: string; // future Tax-5
  taxableAmount: bigint;     // line subtotal post-discount, pre-tax (öre)
  quantity: number;
  taxable: boolean;          // explicit opt-out (e.g. gift cards)
  taxCode?: string;          // Avalara-style override
};

export type TaxResponse = {
  lines: TaxResponseLine[];
  shippingLines: TaxResponseShippingLine[];
  source: string;             // "builtin" | "avalara" | "vertex" | "manual_override" | "fallback_zip"
  estimated: boolean;         // true at cart, false at order finalization
  warnings: string[];         // non-fatal (e.g. "no registration in NY, tax not collected")
};

export type TaxResponseLine = {
  lineId: string;             // mirrors request
  taxLines: ComputedTaxLine[];
};

export type ComputedTaxLine = {
  title: string;              // "VAT 25%", "NY State Tax 4%"
  jurisdiction: string;       // "SE", "US-NY-NEW_YORK_COUNTY"
  rate: number;               // 0.25
  taxableAmount: bigint;      // base for this jurisdiction (öre)
  taxAmount: bigint;          // computed tax (öre, banker-rounded)
  source: string;             // "builtin", "avalara", etc.
  channelLiable: boolean | null;
};
```

**Where this lives:** `app/_lib/tax/calculate.ts` (NEW top-level
domain — NOT under draft-orders or orders).

**Rationale:** mirrors Shopify exactly. Allows future provider-swap
without touching callers.

### Decision 2 — TaxLine is a persistence model, not computed-only

**LOCK:** Add Prisma `model TaxLine` with FK to either `OrderLineItem`
or `DraftLineItem` (and similar för `ShippingLine` när det modelleras).

```prisma
model TaxLine {
  id                  String   @id @default(cuid())
  tenantId            String
  // Polymorphic: exactly one is set
  orderLineItemId     String?
  draftLineItemId     String?
  // Future:
  // shippingLineId   String?
  title               String
  jurisdiction        String
  rate                Decimal  @db.Decimal(7, 6)  // 0.250000
  taxableAmountCents  BigInt
  taxAmountCents      BigInt
  presentmentTaxAmountCents BigInt
  presentmentCurrency String
  source              String   // "builtin", "avalara", etc.
  channelLiable       Boolean?
  createdAt           DateTime @default(now())

  @@index([tenantId, jurisdiction])
  @@index([orderLineItemId])
  @@index([draftLineItemId])
}
```

**Where this lives:** `prisma/schema.prisma` — Tax-0 migration.

**Rationale:** Multi-jurisdiction (US state + county + city) requires
1—N relationship. Tax reports group by `(tenant, jurisdiction)`. Without
this, retroactive multi-jurisdiction support means re-computing every
historical order.

### Decision 3 — MoneyBag as universal pricing type

**LOCK:** All pricing-fält (på `Order`, `OrderLineItem`, `DraftOrder`,
`DraftLineItem`, `TaxLine`, `Discount` etc.) får `presentmentXCents` +
`presentmentCurrency`-systerfält till sin existerande `xCents`-fält.

**Migration approach:** additivt. Existing fält oförändrade. Nya fält
default = same as shop currency (`presentmentTotalCents = totalCents`,
`presentmentCurrency = currency`). Backfill-script för historiska
rows.

**Where this lives:** schema-migration i Tax-0. Backfill-script i
Tax-0.

**Rationale:** Markets-introduktion (Tax-4) kräver att vi kan visa
buyer-facing pris i annan valuta än settlement. Att backfilla efter
hundratals tusentals orders existerar är dyrt.

### Decision 4 — Banker's rounding helper from day 1

**LOCK:** Implementera `roundHalfToEven(value: number): number` i
`_lib/money/round.ts`. **Ersätt all** `Math.round` på tax-paths med
denna helper.

```typescript
// IEEE 754 half-to-even
export function roundHalfToEven(value: number): number {
  const rounded = Math.round(value);
  if (Math.abs(value - Math.trunc(value)) === 0.5) {
    // exactly halfway — round to even
    return rounded % 2 === 0 ? rounded : rounded - Math.sign(value);
  }
  return rounded;
}
```

**Where this lives:** `_lib/money/round.ts` — added in Tax-0. All
tax-line computations in `calculator/core.ts` updated in Tax-1.

**Rationale:** Shopify uses banker's rounding explicitly. Avalara/
Vertex use banker's rounding. Half-away-from-zero (JS default) creates
0.5-öre/cent discrepancies that compound at scale — and break parity
tests against any tax-service-provider integration we ever do.

### Decision 5 — TaxRegistration as separate entity, owned by Tenant (and CompanyLocation for B2B)

**LOCK:** New Prisma models:

```prisma
model TaxRegistration {
  id            String   @id @default(cuid())
  tenantId      String
  countryCode   String   // ISO 3166-1 alpha-2
  region        String?  // US state, CA province
  registrationNumber String? // VAT ID, EIN, etc.
  startedAt     DateTime
  endedAt       DateTime?
  status        TaxRegistrationStatus  // ACTIVE, INACTIVE
  source        String   // "manual", "shopify_tax_managed"
  // Future: holds for nexus-detection if we ever do auto-registration

  @@unique([tenantId, countryCode, region])
  @@index([tenantId])
}

model CompanyLocationTaxSettings {
  companyLocationId String   @id  // 1:1
  taxRegistrationId String?
  collectMode       TaxCollectMode  // COLLECT, DO_NOT_COLLECT, COLLECT_UNLESS_EXEMPT
  taxExemptions     TaxExemptionCode[]
  vatNumber         String?
  vatNumberValidatedAt DateTime?
  vatNumberValid    Boolean?
}
```

**Where this lives:** schema-migration i Tax-0.

**Rationale:** Shopify model exactly. Multi-tenant SaaS for hospitality
needs this — a Swedish camping group expanding to Norway needs
separate `TaxRegistration` rows for SE och NO.

### Decision 6 — Tax categories: lightweight subset of Shopify taxonomy

**LOCK:** Vi bygger INTE Shopifys 10,000-noders taxonomy V1.
**Istället:** En platt enum med ~15 kategorier som täcker hospitality:

```typescript
export type TaxCategory =
  | "ACCOMMODATION_HOTEL"       // standard hotel/B&B
  | "ACCOMMODATION_CAMPING"     // camping pitch (often reduced rate)
  | "ACCOMMODATION_LONG_STAY"   // >30 days (often exempt EU)
  | "FOOD_BREAKFAST"
  | "FOOD_RESTAURANT"
  | "FOOD_GROCERY"
  | "BEVERAGE_NON_ALCOHOLIC"
  | "BEVERAGE_ALCOHOLIC"
  | "TRANSPORT_LOCAL"
  | "EXPERIENCE_TOUR"
  | "EXPERIENCE_SPA"
  | "RETAIL_GENERAL"
  | "RETAIL_SOUVENIR"
  | "FEE_BOOKING"
  | "FEE_CLEANING"
  | "FEE_OTHER";
```

Per-tenant kan utökas via `TaxCategoryOverride` om en specifik tenant
behöver mer granularity. Per-jurisdiction-rates lever i en intern
lookup-tabell `taxCategoryRates` som vi seedar för relevanta länder.

**Where this lives:** `_lib/tax/taxonomy.ts` (enum + base lookup). 
Future Tax-9 kan migrera till full Shopify-taxonomy om vi vill.

**Rationale:** Hospitality har <20 verkliga produktkategorier. Att
bygga 10,000-noder från start är overkill. Vi kan *upgrada* till
Shopify-taxonomy senare när vi har vertikalbredd som rättfärdigar det.

### Decision 7 — Tax overrides: scope-limited

**LOCK:** Per-tenant tax-overrides MAY override:
- Per-(category, country, region) → custom rate

Overrides får INTE:
- Override below jurisdiction-level (ingen city-level overrides)
- Cascade till sub-jurisdictions
- Apply to per-customer (det är `TaxExemption`, separat)

```prisma
model TaxOverride {
  id              String       @id @default(cuid())
  tenantId        String
  taxCategory     TaxCategory
  countryCode     String
  region          String?
  rate            Decimal      @db.Decimal(7, 6)
  shippingTaxRate Decimal?     @db.Decimal(7, 6)  // separate per Shopify
  startedAt       DateTime?
  endedAt         DateTime?

  @@unique([tenantId, taxCategory, countryCode, region])
  @@index([tenantId])
}
```

**Where this lives:** schema-migration i Tax-6.

**Rationale:** Shopify limits override granularity for a reason —
sub-state local taxes are too volatile. Same applies to municipality
taxes here.

### Decision 8 — TaxExemption: enum with mappable codes

**LOCK:** Shopifys `TaxExemption` enum mirroras direkt:

```typescript
export type TaxExemptionCode =
  // EU
  | "EU_REVERSE_CHARGE_EXEMPTION_RULE"
  // US (mirror Shopify per-state codes)
  | "US_AK_RESELLER_EXEMPTION"
  | "US_AZ_RESELLER_EXEMPTION"
  | /* ... 50 states ... */
  // CA
  | "CA_BC_RESELLER_EXEMPTION"
  | "CA_STATUS_CARD_EXEMPTION"
  | "CA_DIPLOMAT_EXEMPTION"
  | /* ... */;
```

Customer + CompanyLocation har `taxExemptions: TaxExemptionCode[]`.
Tax engine konsulterar denna när rate beräknas.

**Where this lives:** `_lib/tax/exemptions.ts` — Tax-7.

**Rationale:** Identical to Shopify enum för plug-and-play med deras
public docs. Hospitality har realistiskt få US-state-exemptions men
EU reverse-charge är kritisk för B2B.

### Decision 9 — Provider abstraction from day 1

**LOCK:** Även om V1 (Tax-1 → Tax-3) är "builtin"-provider, definiera
provider-interface FÖRST:

```typescript
export interface TaxProvider {
  readonly key: string;        // "builtin" | "avalara" | "vertex" | etc.
  readonly displayName: string;
  calculate(req: TaxRequest, ctx: ProviderContext): Promise<TaxResponse>;
  /** Optional. Called on order finalize / fulfillment for liability
   *  reconciliation. Most providers no-op. */
  notifyOrderFinalized?(orderId: string, ctx: ProviderContext): Promise<void>;
}
```

`TenantTaxConfig` håller per-region-aktiv-provider:

```prisma
model TenantTaxConfig {
  id          String @id @default(cuid())
  tenantId    String
  regionScope String  // "GLOBAL" or country code
  providerKey String  // "builtin", "avalara", "vertex"
  credentials Json?   // encrypted, provider-specific
  active      Boolean @default(true)

  @@unique([tenantId, regionScope])
  @@index([tenantId])
}
```

**Where this lives:** `_lib/tax/providers/` — interface i Tax-1,
adaptrar i Tax-8.

**Rationale:** Vi vill inte vara inlåsta i egen tax-engine. Avalara
kostar pengar men sparar massor compliance-arbete. Modellen ska
stödja "builtin för Sverige, Avalara för USA" från day 1.

### Decision 10 — Failure mode: always quote, never block

**LOCK:** Calculator har 3 fallback-tier:

1. **Primary:** active provider (builtin/avalara/etc.)
2. **Secondary (degraded):** static rate-table from `TenantTaxConfig.fallbackRates` JSON
3. **Tertiary (last-resort):** rate=0 + warning "tax_unavailable"

Aldrig kasta från `calculateTax`. Aldrig blocka checkout. Returnera
en `TaxResponse` med `source = "fallback_*"` och `warnings: [...]`.

**Where this lives:** `_lib/tax/calculate.ts` core. Tested explicitly
in Tax-1.

**Rationale:** Shopify pattern direkt. Better an estimate than no
checkout.

### Decision 11 — Tax-inclusive vs exclusive: market-level display contract

**LOCK:** Storage är ALLTID net. Display-time appliceras inclusive-
formel om `Market.taxDisplayMode = "INCLUSIVE"`.

`DraftOrder.taxesIncluded` (existing flag) deprecateas — flyttas till
`Market.taxDisplayMode`. Migration: alla existerande tenants får en
"default market" med `taxDisplayMode = INCLUSIVE` (matchar svensk
practice).

**Where this lives:** Tax-4 (Markets) + Tax-2 (Draft Orders update).

**Rationale:** Net pricing-storage gör multi-currency-conversion
trivial. Inclusive-display blir en ren formel `gross = net × (1 + rate)`.

### Decision 12 — Drafts use same calculator with `estimated=true`

**LOCK:** `draftOrderCalculate` (vår existing `previewDraftTotals`)
anropar samma `calculateTax()` som Order-finalization. Skillnaden är
en flag i request: drafts får `TaxResponse.estimated = true`, orders
får `false`. Vid `freezePrices` på Draft → snapshot till persistent
TaxLine-rader.

**Where this lives:** Tax-2 wires `previewDraftTotals` + `freezePrices`
till nya engine. `convert.ts:344-346` uppdateras att inherita
TaxLine-rader instead av aggregat.

**Rationale:** Shopify pattern direkt. Single source of tax-truth.

---

## 5 — Phase decomposition (Tax-1 → Tax-10)

### Tax-0 — Foundation Schema & Helpers (BLOCKER for everything else)

**Scope:**
- `_lib/money/round.ts` — `roundHalfToEven` helper
- `prisma/schema.prisma` migrations:
  - `TaxLine` model
  - `TaxRegistration` model
  - `CompanyLocationTaxSettings` model
  - `TenantTaxConfig` model
  - Add `presentment*` columns to existing `Order`, `OrderLineItem`, `DraftOrder`, `DraftLineItem` (additive, default = shop currency)
- Backfill-script: existing rows get `presentment* = shop *`
- `_lib/tax/types.ts` — `TaxRequest`, `TaxResponse`, `TaxLine`, `ComputedTaxLine`, `TaxExemptionCode`, `TaxCategory`
- `_lib/tax/providers/interface.ts` — `TaxProvider` interface

**Cross-domain coord:** ⚠ **Schema migration → Terminal A koord-punkt #1**

**No behavior change.** Pure additive. Tests verify backfill correctness.

**Estimat:** 1 PR, 6-8 commits, ~50 tests.

### Tax-1 — Calculator Core (`builtin` provider)

**Scope:**
- `_lib/tax/calculate.ts` — implementing `calculateTax(request)`
- `_lib/tax/providers/builtin.ts` — Swedish-rates baseline + EU rates
- `_lib/tax/taxonomy.ts` — TaxCategory enum + per-(category,country) rate lookup
- Failure-mode fallback (per Decision 10)
- Pure-function tests covering all 12 Lock-in Decisions

**No callers wired yet.** Calculator exists, returns valid responses,
no side-effects.

**Estimat:** 1 PR, 5 commits, ~80 tests.

### Tax-2 — Draft Orders integration

**Scope:**
- `previewDraftTotals` calls `calculateTax()` instead of using
  `Accommodation.taxRate`
- `freezePrices` snapshots TaxLine rows in tx
- `DraftLineItem.taxAmountCents` now derived from sum of related TaxLines
- `convert.ts` inherits TaxLine rows when promoting Draft → Order
- Migration: existing drafts retain frozen totals; new ones use new path

**Cross-domain coord:** None — Draft Orders is Terminal B scope.

**Estimat:** 1 PR, 6 commits, ~40 tests. Includes parity-tests against
old calculation for safety.

### Tax-3 — Order / Cart / Checkout integration

**Scope:**
- `app/api/checkout/payment-intent` calls `calculateTax()`
- `app/api/checkout/create` (cart-checkout) calls `calculateTax()`
- Backfill historical Orders with synthesized TaxLine rows from existing
  `Order.taxRate / taxAmount` (lossy — single tax line per order)

**Cross-domain coord:** ⚠ **Touches `_lib/orders/` and `app/api/checkout/`
which Terminal A may also wire analytics into → coord-punkt #2**

**Estimat:** 1 PR, 8 commits, ~60 tests + parity tests.

### Tax-4 — Markets foundation

**Scope:**
- `Market` model + `MarketRegion` model
- `MarketCurrencySettings`
- `Tenant` gets a `defaultMarketId`
- Wire presentment-currency through pricing-display
- Migrate `DraftOrder.taxesIncluded` → `Market.taxDisplayMode`

**Cross-domain coord:** ⚠ Markets touches every checkout/storefront-
component med presentation-currency → koord-punkt #3.

**Estimat:** 2 PRs, ~12 commits, ~80 tests.

### Tax-5 — Customer & Company exemptions (B2B foundation)

**Scope:**
- `TaxExemption[]` på `GuestAccount` + `CompanyLocation`
- `CompanyLocationTaxSettings.collectMode` consumed by calculator
- Admin UI för att sätta exemptions per customer/company

**Estimat:** 1 PR, 6 commits, ~40 tests.

### Tax-6 — Merchant tax overrides

**Scope:**
- `TaxOverride` model (per recon Decision 7)
- Admin UI för att skapa/redigera overrides
- Override precedence enforcement i calculator

**Estimat:** 1 PR, 5 commits, ~30 tests.

### Tax-7 — EU reverse-charge & VAT validation

**Scope:**
- `EU_REVERSE_CHARGE_EXEMPTION_RULE` plumbed through
- VIES-validering vid VAT-number-entry (real API call)
- Auto-apply på CompanyLocation vid valid VIES match
- Invoice-text uppdaterad för reverse-charge ("Article 138 / 194")

**Cross-domain coord:** Touches invoice-template (`_lib/email/templates/
draft-invoice.tsx`) — Terminal B scope, OK.

**Estimat:** 1 PR, 5 commits, ~35 tests + integration test mot VIES.

### Tax-8 — Provider plugin (Avalara adapter)

**Scope:**
- `_lib/tax/providers/avalara.ts` adapter implementing `TaxProvider`
- Tenant-config UI för att switcha provider per region
- Credentials encryption via existing `INTEGRATION_ENCRYPTION_KEY`

**Estimat:** 1 PR, 5 commits, ~25 tests + sandbox-integration test.

### Tax-9 — Full Shopify-taxonomy migration (optional)

**Scope:** Migrate from flat 15-enum to full 10,000-node Shopify
taxonomy. Backfill products via best-fit auto-classification + admin UI
for review.

**Estimat:** 2 PRs, ~15 commits. **Defer until volume justifies it.**

### Tax-10 — Tax-summary webhooks (provider-platform parity)

**Scope:** Match Shopifys `tax_summaries/create` webhook for our own
provider-app ecosystem.

**Estimat:** 1 PR, ~6 commits. **Defer until 3rd-party tax-providers
exist on our platform.**

---

## 6 — Cross-domain coordination map

### Coord #1 — Tax-0 schema additions (Terminal A)

**What:** New tables: `TaxLine`, `TaxRegistration`,
`CompanyLocationTaxSettings`, `TenantTaxConfig`. Additive columns:
`presentment*` på Order/Draft.

**Why coord:** Schema migrations sequential per Prisma migration-
namespace. Terminal A's analytics-pipeline också gör schema-changes.
Migration-numbers can collide.

**Action:** Operator-decision on coord cadence. Either:
- A) Terminal B opens schema-migration PR first; A waits to layer on top
- B) A finishes Phase 5A; B opens after

### Coord #2 — Tax-3 commerce wiring (Terminal A)

**What:** `app/api/checkout/payment-intent` and `app/api/checkout/
create` get tax engine calls.

**Why coord:** Terminal A:s analytics (per deras handoff) lägger
analytics-events på checkout-paths. If both edit same files,
merge-conflicts.

**Action:** Inverse coord — same patterns as Terminal A:s "we'll add
3 LOC per touchpoint" approach. Sequence: Terminal A first, B layers.

### Coord #3 — Tax-4 Markets touches storefront (Terminal A)

**What:** Markets-rollout adds `presentmentCurrency` everywhere
storefront displays prices. Analytics events also need market-context.

**Why coord:** Major storefront-wide change. Both teams need to align
on Market data-model.

**Action:** Joint design session before Tax-4 start. May spawn separate
"Markets Master Plan" doc om scope grows.

---

## 7 — Open Q-decisions for operator (NOT locked)

### Q1 — Build Tax-0 schema migration before or after merging into Terminal A's coord?

**Options:**
- A) Terminal B blocks new feature-work until Tax-0 schema lands
- B) Terminal B continues with 7.6d/7.6c, Tax-0 happens later
- C) Tax-0 starts as parallel design-only (no migration), schema-add when Terminal A clears

**Default:** A — schema is foundational, sooner = less retrofit pain.

### Q2 — How aggressive on Decision 4 (banker's rounding migration)?

**Options:**
- A) Tax-0 introduces helper, Tax-1 migrates all paths in one go
- B) Tax-0 introduces helper, gradual migration over Tax-1..3 with parity tests
- C) Big-bang in Tax-1: parity discrepancies block merge

**Default:** B — gradual minimizes risk of customer-visible cent-level
differences.

### Q3 — Build provider abstraction in Tax-1 or defer to Tax-8?

**Options:**
- A) Define interface in Tax-1, only `builtin` impl. Tax-8 adds Avalara.
- B) Just write builtin in Tax-1 imperatively, refactor to interface in Tax-8.

**Default:** A — interface upfront prevents inevitable refactor pain.

### Q4 — Markets in our model or just multi-currency for now?

**Options:**
- A) Skip Tax-4 (Markets), just thread presentmentCurrency through. Defer Markets to separate initiative.
- B) Markets is part of Tax-4 — model + currency together.

**Default:** A — Markets is its own cross-cutting concern. Tax-4 should
just be `presentmentCurrency` enabling. Full Markets model deserves its
own Master Plan doc.

### Q5 — Cross-tenant tax-rate seed data ownership?

**Options:**
- A) Hardcoded seed in `_lib/tax/taxonomy.ts` (covers SE, NO, DK, DE, etc.)
- B) Per-tenant override stored in DB
- C) Both: seed = baseline, tenant can override

**Default:** C.

### Q6 — When to start Tax-0?

**Options:**
- A) Now (operator clearance)
- B) After 7.6d (smaller scope, less coord)
- C) After Terminal A:s Phase 5B completes
- D) After 1-2 more Terminal B small features (so we have track record before introducing schema-changes)

**Default:** Operator decision.

### Q7 — Tax-engine target market scope V1

**Options:**
- A) Sweden-only (current scope)
- B) Nordic countries (SE, NO, DK, FI)
- C) EU-wide
- D) EU + UK + US

**Default:** B — natural geographic expansion for hospitality. A is too
narrow for the foundation effort. C/D too broad for V1 testing.

---

## 8 — Recommended sequencing

```
Phase                 Estimat     Cross-domain  Operator-decision required
─────────────────────────────────────────────────────────────────────────
Tax-0 (foundation)    2-3 weeks   ⚠ #1 A coord  Q1, Q6
Tax-1 (calculator)    1-2 weeks   none          Q2, Q3, Q5
Tax-2 (drafts)        1 week      none          —
Tax-3 (commerce)      2 weeks     ⚠ #2 A coord  —
Tax-4 (markets-lite)  1-2 weeks   ⚠ #3 A coord  Q4
Tax-5 (exemptions)    1 week      none          —
Tax-6 (overrides)     1 week      none          —
Tax-7 (EU rev-charge) 1-2 weeks   none          Q7
Tax-8 (Avalara)       1-2 weeks   none          —
Tax-9 (full taxonomy) DEFER       —             —
Tax-10 (provider WH)  DEFER       —             —
```

**Total Tax-0..8: ~13-16 weeks Terminal B time.** Concurrent Terminal A
tracks possible during Tax-1, Tax-2, Tax-5, Tax-6, Tax-7, Tax-8.

**Critical path:** Tax-0 → Tax-1 → Tax-2 → Tax-3 (everything else can
parallelize after Tax-3).

---

## 9 — Rules of engagement

Vid Tax-engine-implementation gäller:

1. **Inga calculator-paths utanför `_lib/tax/`.** All tax-math lever
   där. Calculator kallas, aldrig återimplementeras.
2. **Ingen `Math.round` på tax-amounts.** Alltid `roundHalfToEven`.
3. **Ingen single-currency assumption.** Alla pris-fält MÅSTE alltid
   ha matchande presentment-fält.
4. **Provider-interface är immutable post-Tax-1.** Ändringar måste gå
   genom omflyttning av interface-filer + parity-tests + 2-week
   migration-period.
5. **Failure-mode är aldrig "throw".** Calculator returnerar alltid
   en valid `TaxResponse` med `source` = degraded provider.
6. **Inga calculator-anrop i React render.** Server-side bara.
7. **Tester: 1:1 mot Shopifys dokumenterade exempel** där vi har dem
   (line-rounding, EU reverse-charge, US-state-overrides).

---

## 10 — Källor & referenser

### Shopify Engineering
- [Componentizing Shopify's Tax Engine](https://shopify.engineering/componentizing-shopify-tax-engine) — single calculator, three callers
- [The Complex Data Models Behind Shopify's Tax Insights Feature](https://shopify.engineering/complex-data-models-behind-shopify-tax-insights)
- [Evolution of Product Classification at Shopify](https://shopify.engineering/evolution-product-classification)
- [The Shopify Tax Platform (Enterprise blog)](https://www.shopify.com/enterprise/blog/tax-platform)

### GraphQL Admin reference
- [TaxLine](https://shopify.dev/docs/api/admin-graphql/latest/objects/TaxLine)
- [OrderCreateTaxLineInput](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/OrderCreateTaxLineInput)
- [Market](https://shopify.dev/docs/api/admin-graphql/latest/objects/Market)
- [MarketCurrencySettings](https://shopify.dev/docs/api/admin-graphql/latest/objects/MarketCurrencySettings)
- [MoneyBag](https://shopify.dev/docs/api/admin-graphql/latest/objects/moneybag)
- [CalculatedDraftOrder](https://shopify.dev/docs/api/admin-graphql/latest/objects/CalculatedDraftOrder)
- [draftOrderCalculate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/draftordercalculate)
- [taxAppConfigure](https://shopify.dev/docs/api/admin-graphql/latest/mutations/taxAppConfigure)
- [TaxExemption enum](https://shopify.dev/docs/api/admin-graphql/latest/enums/TaxExemption)
- [companyLocationTaxSettingsUpdate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/companylocationtaxsettingsupdate)
- [CompanyLocationTaxSettings](https://shopify.dev/docs/api/admin-graphql/latest/objects/companylocationtaxsettings)

### Shopify Help Center (operational)
- [Manage your taxes](https://help.shopify.com/en/manual/taxes/registration/manage) — banker's rounding, line-level
- [Manage your EU taxes](https://help.shopify.com/en/manual/taxes/eu/eu-tax-manage)
- [Tax overrides and exemptions](https://help.shopify.com/en/manual/taxes/tax-overrides) — precedence rules
- [Product categories (tax)](https://help.shopify.com/en/manual/taxes/shopify-tax/product-categories-tax)
- [Dynamic tax-inclusive pricing](https://help.shopify.com/en/manual/international/pricing/dynamic-tax-inclusive-pricing)
- [VAT validation in checkout](https://help.shopify.com/en/manual/taxes/shopify-tax/vat-validate)
- [Choose a tax service](https://help.shopify.com/en/manual/taxes/shopify-tax/choose-tax-service)

### Open-source
- [Shopify/product-taxonomy](https://github.com/Shopify/product-taxonomy) — MIT license

### Partner integration spec (Avalara/TaxJar)
- [Avalara for Shopify](https://www.avalara.com/us/en/products/integrations/shopify.html)
- [TaxJar — Sales Tax Guide for Shopify Sellers](https://developers.taxjar.com/integrations/guides/shopify/)

### Changelog (atomic facts dated)
- [Tax_summaries/create webhook + taxSummaryCreate](https://shopify.dev/changelog/taxsummariescreate-webhook-and-taxsummarycreate-mutation-now-available)
- [Tax webhook now uses Global IDs](https://shopify.dev/changelog/tax-webhook-summary-and-calculation-requests-now-use-global-ids)
- [Tax calc + summary include shop & presentment currency](https://shopify.dev/changelog/tax-summary-webhook-and-calculation-requests-now-includes-shop-and-presentment-currency-amount)
- [Reverse Charge expanded to UK](https://changelog.shopify.com/posts/reverse-charge-expanded-to-the-united-kingdom)
- [VAT number validation included on Shopify Tax](https://changelog.shopify.com/posts/vat-number-validation-now-included-on-shopify-tax)

---

## Approval workflow

Detta är ett strategiskt foundation-dokument, INTE en recon för en
specifik fas. PR-flödet:

1. Operator reviews this doc — godkänner eller redirectar
2. Q-decisions besvaras (Q1-Q7)
3. Doc mergas till main som canonical reference
4. Per-fas-recons (Tax-0-recon.md, Tax-1-recon.md...) referar
   tillbaka hit
5. Vid varje fas-implementation re-läses §4 lock-in decisions och
   §9 rules of engagement

**När operator klar med review:** PR mergeas, sen scopas Tax-0 som
första concrete fas.

---

## Final word

Operatören efterfrågade detta som "en maskin, en uppgift, en process i
sig" — och det är vad det är. 13-16 veckors Terminal B-arbete över
8 implementations-faser, plus 3 Terminal A-koord-punkter, plus en
shipping-väg som matchar Shopifys exakta arkitektur. Inte som en
shortcut, utan så att vi i framtiden faktiskt kan handla nya marknader
med nya valutor exakt som operatören beskrev.

Säg till om du vill ändra Q-decisions eller Phase-decomposition innan
vi mergar.
