# Tax-0 — Foundation Schema & Helpers (recon)

**Master plan reference:** `_audit/tax-engine-master-plan.md` §5 (Tax-0)
**Branch:** `claude/tax-0-recon` (från `main`)
**Datum:** 2026-05-04
**Författare:** Claude (Web — claude.ai/code, Terminal B prompt-engineer)
**Status:** RECON — pending operator-godkännande av D Q-decisions och pending Terminal A koord på schema-migration-namespace.

---

## Mål

Lägga grunden för tax-engine **utan beteendeförändring**. Tax-0 är pure
foundation: schema-tillägg (additivt), nya types, banker's rounding-
helper, provider-interface-skelett. Ingen calculator-logik, inga callers
wiras.

Tax-0 är förutsättning för Tax-1 (calculator core) och måste vara mergat
till main innan Tax-1 startar.

**Per master plan §5 (Tax-0):** "No behavior change. Pure additive. Tests
verify backfill correctness."

---

## Stop-protocol

- **Cross-domain coord:** ⚠ Schema migration → Terminal A koord-punkt #1.
  **Tax-0 får INTE pushas innan Terminal A bekräftat migration-namespace
  är fritt för oss.**
- Out-of-scope (Terminal A): all analytics-kod, observability
- INGA callers wiras (det är Tax-1 + Tax-2 + Tax-3)
- INGA calculator-implementationer (det är Tax-1)
- INGA provider-implementationer utöver interface (det är Tax-1 builtin
  + Tax-8 Avalara)
- INGA UI-changes
- Backwards-compat: alla nya kolumner nullable eller med safe defaults

Baseline (post-PR #40 master-plan-merge):
- tsc 3 errors (project baseline accommodations)
- vitest green
- eslint clean

---

## A — Lock-in decisions (från master plan §4) som Tax-0 implementerar

| Decision | Tax-0 deliverable |
|---|---|
| #2 TaxLine persistent model | `model TaxLine` schema |
| #3 MoneyBag dual-currency | `presentment*` columns på Order/OrderLineItem/DraftOrder/DraftLineItem |
| #4 Banker's rounding helper | `_lib/money/round.ts:roundHalfToEven` |
| #5 TaxRegistration + CompanyLocationTaxSettings | Båda models i schema |
| #6 Hospitality TaxCategory enum | TypeScript-enum i `_lib/tax/taxonomy.ts` |
| #8 TaxExemptionCode enum | TypeScript-enum i `_lib/tax/exemptions.ts` |
| #9 Provider abstraction | `_lib/tax/providers/interface.ts` + `TenantTaxConfig` model |

Andra decisions (#1, #7, #10, #11, #12) implementeras i Tax-1..7.

---

## B — Implementation-plan (7 commits, ONE PR)

### B.1 — Banker's rounding helper

**Filer:**
- `app/_lib/money/round.ts` (ny)
- `app/_lib/money/round.test.ts` (ny)

**Innehåll:**
```typescript
/**
 * IEEE 754 round-half-to-even (banker's rounding).
 *
 * JavaScript's Math.round uses round-half-away-from-zero, which
 * compounds upward bias at scale. Tax engines (Shopify, Avalara,
 * Vertex) use banker's rounding to minimize aggregate bias.
 *
 * Examples:
 *   roundHalfToEven(2.5)  === 2  (round to even)
 *   roundHalfToEven(3.5)  === 4
 *   roundHalfToEven(-2.5) === -2
 *   roundHalfToEven(2.49) === 2  (not exactly halfway, normal round)
 *   roundHalfToEven(2.51) === 3
 */
export function roundHalfToEven(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("roundHalfToEven: value must be finite");
  }
  const rounded = Math.round(value);
  const diff = Math.abs(value - Math.trunc(value));
  if (diff !== 0.5) return rounded;
  // Exactly halfway: round to even
  return rounded % 2 === 0 ? rounded : rounded - Math.sign(value);
}

/**
 * Apply banker's rounding to a tax calculation result.
 * Wrapper for clarity at call-sites.
 */
export function roundTaxAmount(amountInOren: number): number {
  return roundHalfToEven(amountInOren);
}
```

**Tests (15+ cases):**
- Exhaustive halfway cases: 0.5 → 0, 1.5 → 2, 2.5 → 2, 3.5 → 4
- Negative halfway: -0.5 → 0, -1.5 → -2, -2.5 → -2
- Non-halfway: 2.49 → 2, 2.51 → 3, 2.4999 → 2
- Zero: 0 → 0
- Edge: very small positive (0.0001), very small negative
- Edge: max safe integer + 0.5
- Edge: NaN, Infinity, -Infinity → throw
- Parity-test mot Shopify-dokumenterad exempel:
  `2.685 → 2.68` (snippet citerad i master plan §3.7)
  `2.6982 → 2.70`

**Checkpoint:** tsc 0 nya, vitest +15 nya passing.

---

### B.2 — Tax types & enums

**Filer:**
- `app/_lib/tax/types.ts` (ny)
- `app/_lib/tax/taxonomy.ts` (ny — TaxCategory enum)
- `app/_lib/tax/exemptions.ts` (ny — TaxExemptionCode enum)
- `app/_lib/tax/index.ts` (ny — barrel)

**Innehåll:**

`types.ts` — TaxRequest / TaxResponse schemas (per master plan §4
Decision 1):
```typescript
export type TaxRequest = {
  tenantId: string;
  marketId?: string;
  buyerLocation: TaxLocation;
  fulfillmentLocation: TaxLocation;
  lines: TaxRequestLine[];
  customer?: TaxRequestCustomer;
  companyLocation?: TaxRequestCompanyLocation;
  shippingLines: TaxRequestShippingLine[];
  presentmentCurrency: string;
  shopCurrency: string;
};

export type TaxLocation = {
  countryCode: string;
  region?: string;
  postalCode?: string;
  city?: string;
};

export type TaxRequestLine = {
  lineId: string;
  productId?: string;
  variantId?: string;
  taxCategory: TaxCategory;
  taxableAmount: bigint;
  quantity: number;
  taxable: boolean;
  taxCodeOverride?: string;
};

export type TaxRequestShippingLine = { /* ... */ };
export type TaxRequestCustomer = { /* ... */ };
export type TaxRequestCompanyLocation = { /* ... */ };

export type TaxResponse = {
  lines: TaxResponseLine[];
  shippingLines: TaxResponseShippingLine[];
  source: string;
  estimated: boolean;
  warnings: string[];
};

export type TaxResponseLine = {
  lineId: string;
  taxLines: ComputedTaxLine[];
};

export type ComputedTaxLine = {
  title: string;
  jurisdiction: string;
  rate: number;
  taxableAmount: bigint;
  taxAmount: bigint;
  presentmentTaxAmount: bigint;
  source: string;
  channelLiable: boolean | null;
};
```

`taxonomy.ts`:
```typescript
export type TaxCategory =
  | "ACCOMMODATION_HOTEL"
  | "ACCOMMODATION_CAMPING"
  | "ACCOMMODATION_LONG_STAY"
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

export const TAX_CATEGORIES: TaxCategory[] = [/* all of above */];

/** Default mapping from product type → tax category. */
export const DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE: Record<string, TaxCategory> = {
  PMS_ACCOMMODATION: "ACCOMMODATION_HOTEL",
  STANDARD: "RETAIL_GENERAL",
};
```

`exemptions.ts`:
```typescript
export type TaxExemptionCode =
  | "EU_REVERSE_CHARGE_EXEMPTION_RULE"
  // US — mirrors Shopify TaxExemption enum verbatim
  | "US_AK_RESELLER_EXEMPTION"
  | "US_AL_RESELLER_EXEMPTION"
  | /* ... 50 states ... */
  // CA — mirrors Shopify
  | "CA_BC_RESELLER_EXEMPTION"
  | "CA_STATUS_CARD_EXEMPTION"
  | "CA_DIPLOMAT_EXEMPTION";

export const TAX_EXEMPTION_CODES: TaxExemptionCode[] = [/* all */];
```

**Tests (10 cases):**
- Type-narrowing tests för TaxCategory (all-cases-checked exhaustiveness)
- Type-narrowing för TaxExemptionCode
- Defaults map covers all current ProductType values
- Snapshot-test: TAX_CATEGORIES === expected list (regression-skydd)
- Snapshot-test: TAX_EXEMPTION_CODES count

**Checkpoint:** tsc 0 nya, vitest +10 nya passing.

---

### B.3 — Provider interface (skeleton)

**Filer:**
- `app/_lib/tax/providers/interface.ts` (ny)
- `app/_lib/tax/providers/registry.ts` (ny — empty registry, framework only)

**Innehåll:**
```typescript
import type { TaxRequest, TaxResponse } from "../types";

export interface TaxProviderContext {
  tenantId: string;
  /** Decrypted credentials from TenantTaxConfig.credentials. Empty for builtin. */
  credentials: Record<string, string>;
}

export interface TaxProvider {
  readonly key: string;
  readonly displayName: string;
  calculate(req: TaxRequest, ctx: TaxProviderContext): Promise<TaxResponse>;
  /** Optional: called on order-finalization for liability tracking. */
  notifyOrderFinalized?(orderId: string, ctx: TaxProviderContext): Promise<void>;
}

const registeredProviders = new Map<string, TaxProvider>();

export function registerTaxProvider(provider: TaxProvider): void {
  if (registeredProviders.has(provider.key)) {
    throw new Error(`TaxProvider key collision: ${provider.key}`);
  }
  registeredProviders.set(provider.key, provider);
}

export function getTaxProvider(key: string): TaxProvider | undefined {
  return registeredProviders.get(key);
}

export function listTaxProviders(): readonly TaxProvider[] {
  return Array.from(registeredProviders.values());
}
```

**Tests (5 cases):**
- registerTaxProvider succeeds with unique key
- registerTaxProvider throws on duplicate key
- getTaxProvider returns registered, returns undefined for unknown
- listTaxProviders returns all registered
- Type-shape: TaxProvider interface enforces `calculate` signature

**Checkpoint:** tsc 0 nya, vitest +5 nya passing.

---

### B.4 — Schema migration #1: Tax-domain models

**Filer:**
- `prisma/schema.prisma` (utökad)
- `prisma/migrations/<timestamp>_tax_foundation/migration.sql` (auto-genererad)

**Innehåll — nya models:**

```prisma
enum TaxRegistrationStatus {
  ACTIVE
  INACTIVE
}

enum TaxCollectMode {
  COLLECT
  DO_NOT_COLLECT
  COLLECT_UNLESS_EXEMPT
}

model TaxLine {
  id                          String   @id @default(cuid())
  tenantId                    String
  // Polymorphic: exactly one of orderLineItemId / draftLineItemId set
  orderLineItemId             String?
  draftLineItemId             String?
  // Future: shippingLineId
  title                       String
  jurisdiction                String   // "SE", "US-NY-NEW_YORK_COUNTY"
  rate                        Decimal  @db.Decimal(7, 6)
  taxableAmountCents          BigInt
  taxAmountCents              BigInt
  presentmentTaxAmountCents   BigInt
  presentmentCurrency         String   @default("SEK")
  source                      String   // "builtin", "avalara", etc.
  channelLiable               Boolean?
  createdAt                   DateTime @default(now())

  @@index([tenantId, jurisdiction])
  @@index([orderLineItemId])
  @@index([draftLineItemId])
}

model TaxRegistration {
  id                  String                @id @default(cuid())
  tenantId            String
  countryCode         String
  region              String?
  registrationNumber  String?               // VAT ID, EIN, etc.
  startedAt           DateTime
  endedAt             DateTime?
  status              TaxRegistrationStatus @default(ACTIVE)
  source              String                @default("manual")

  @@unique([tenantId, countryCode, region])
  @@index([tenantId])
}

model CompanyLocationTaxSettings {
  companyLocationId    String         @id  // 1:1
  taxRegistrationId    String?
  collectMode          TaxCollectMode @default(COLLECT)
  taxExemptions        String[]       @default([])  // TaxExemptionCode[]
  vatNumber            String?
  vatNumberValidatedAt DateTime?
  vatNumberValid       Boolean?
}

model TenantTaxConfig {
  id          String  @id @default(cuid())
  tenantId    String
  regionScope String  @default("GLOBAL")  // "GLOBAL" or country code
  providerKey String  @default("builtin")
  credentials Json?   // encrypted, provider-specific
  active      Boolean @default(true)

  @@unique([tenantId, regionScope])
  @@index([tenantId])
}
```

**Migration name:** `tax_foundation_<timestamp>` — Terminal A coord-bekräftat innan Terminal Claude pushar.

**Backwards-compat:**
- Inga FKs till existing tables — TaxLine refererar via `orderLineItemId` / `draftLineItemId` strings (matchar existing loose-FK pattern i DraftOrder)
- `CompanyLocationTaxSettings` är 1:1 med existing `CompanyLocation` (loose FK)

**Tests:**
- Schema validates (`prisma format`)
- Migration generates without errors
- Generated SQL backwards-compat (no DROP, no NOT NULL on existing data)

**Checkpoint:** `prisma generate` succeeds, schema-validation green.

---

### B.5 — Schema migration #2: presentment* dual-currency columns

**Filer:**
- `prisma/schema.prisma` (utökad — additivt)
- `prisma/migrations/<timestamp>_dual_currency_pricing/migration.sql`

**Innehåll — additivt på existing models:**

```prisma
model Order {
  // ... existing ...
  // Dual-currency (Tax-0 Decision 3)
  presentmentSubtotalAmount Int?    // null = same as subtotalAmount (shop currency)
  presentmentTaxAmount      Int?
  presentmentTotalAmount    Int?
  presentmentCurrency       String? // null = same as currency
}

model OrderLineItem {
  // ... existing ...
  presentmentUnitAmount     Int?
  presentmentTotalAmount    Int?
  presentmentCurrency       String?
}

model DraftOrder {
  // ... existing ...
  presentmentSubtotalCents      BigInt?
  presentmentOrderDiscountCents BigInt?
  presentmentTotalTaxCents      BigInt?
  presentmentTotalCents         BigInt?
  presentmentCurrency           String?
}

model DraftLineItem {
  // ... existing ...
  presentmentUnitPriceCents  BigInt?
  presentmentSubtotalCents   BigInt?
  presentmentLineDiscountCents BigInt?
  presentmentTaxAmountCents  BigInt?
  presentmentTotalCents      BigInt?
  presentmentCurrency        String?
}
```

**Backfill SQL (in same migration):**
```sql
-- Existing rows get presentment* = shop currency values
UPDATE "Order" SET
  "presentmentSubtotalAmount" = "subtotalAmount",
  "presentmentTaxAmount" = "taxAmount",
  "presentmentTotalAmount" = "totalAmount",
  "presentmentCurrency" = "currency"
WHERE "presentmentSubtotalAmount" IS NULL;

-- Same for OrderLineItem, DraftOrder, DraftLineItem
```

**Per Q4 (Markets-lite):** dessa kolumner är *prepared* för Markets men
används inte av application code i Tax-0. Code reads continue using
existing single-currency fields. Tax-4 wires presentment.

**Tests:**
- Backfill-SQL is idempotent (re-runnable)
- All existing rows have non-null presentment* after migration
- TypeScript types updated via `prisma generate`

**Checkpoint:** Migration applies clean, prisma generate succeeds, tests
verify backfill correctness on a seeded fixture.

---

### B.6 — Stub `getTaxRate()` deprecation

**Filer:**
- `app/_lib/orders/tax.ts` (utökad — JSDoc deprecation notice, NO removal)

**Innehåll:**
```typescript
/**
 * @deprecated Use `calculateTax()` from `@/app/_lib/tax` instead.
 * This stub will be removed in Tax-3 once all callers migrate.
 * See `_audit/tax-engine-master-plan.md`.
 */
export function getTaxRate(/* ... */) {
  return 0;
}
```

**Rationale:** Vi tar inte bort det än (skulle bryta callers även om
return value är 0). Vi flaggar för deprecation så framtida code-search
hittar det.

**Tests:** Inga nya — befintlig stub-test räcker.

**Checkpoint:** linter respects deprecated tag.

---

### B.7 — Roadmap update + reference doc

**Filer:**
- `_audit/draft-orders-roadmap.md` (utökad — referens till tax-engine-master-plan)
- `_audit/tax-engine-master-plan.md` (uppdaterad om något i Tax-0
  divergerar från plan — om så är fallet, dokumentera + flagga)

Lägg till sektion i roadmap:
```markdown
## Tax Engine — separate master plan

See `_audit/tax-engine-master-plan.md` for the multi-phase decomposition
(Tax-0 → Tax-10). Tax-0 is the foundation phase that blocks all
downstream tax work.

| Phase | Status |
|---|---|
| Tax-0 | <commit-shas> — verified: tsc 3 baseline, tests +N, eslint 0 |
```

---

## C — Filer som RÖRS

### Nya filer
- `app/_lib/money/round.ts` + test
- `app/_lib/tax/types.ts`
- `app/_lib/tax/taxonomy.ts` + test
- `app/_lib/tax/exemptions.ts` + test
- `app/_lib/tax/providers/interface.ts` + test
- `app/_lib/tax/providers/registry.ts`
- `app/_lib/tax/index.ts` (barrel)
- `prisma/migrations/<timestamp>_tax_foundation/migration.sql`
- `prisma/migrations/<timestamp>_dual_currency_pricing/migration.sql`

### Modifierade filer
- `prisma/schema.prisma` (4 nya models + presentment* columns på 4 existing models)
- `app/_lib/orders/tax.ts` (deprecation notice only)
- `_audit/draft-orders-roadmap.md`

### EJ rörda
- Alla calculator-paths (`_lib/draft-orders/calculator`, etc.) — det är Tax-1, Tax-2, Tax-3
- Alla checkout/payment-paths
- Alla UI-komponenter
- `app/api/webhooks/**`
- `_lib/email/**`
- All analytics-kod
- `CLAUDE.md`

---

## D — Q-decisions

### Q1 — Migration-strategi: 1 stor eller 2 små?

**Rekommendation:** **1 PR med båda migrations** —
`tax_foundation_<timestamp>` och `dual_currency_pricing_<timestamp>`
shippas i samma PR (atomic backfill).

**Beslut:** **LOCKED** — Terminal A's explicit ask 2026-05-04. Citat:

> "keep both Tax-0 migrations in the same PR (you implied this), so
> backfill + new columns commit atomically. Don't split into two
> separate merges — that would put the dual-currency backfill in a
> window where presentment* columns exist but are NULL on historical
> rows, and any analytics tail-read in between has to special-case."
> — Terminal A, `_audit/session-2026-05-04-resume.md` §A

Implementation-konsekvens: Terminal Claude shippar BÅDA migrations i
samma feature-branch + samma PR. Backfill-SQL embeds i samma migration
som schema-add (atomic transaction, zero-downtime-deploy-safe).

### Q2 — `TaxLine.rate` som Decimal eller Int (basis points)?

**Rekommendation:** **`Decimal(7, 6)`** — matchar Shopifys interna
representation (rate som decimal e.g. 0.250000). Tillåter precision
som basis points inte gör (e.g. 2.85% = 0.0285 är inte 285 bp utan
2.85% via `Decimal(0.0285, 4)` blir snyggt; basis points kräver bp
fractional som vi inte har).

**Alternativ:** Int basis points som existing `Accommodation.taxRate`.
Konsistent men förlorar precision för udda jurisdictions.

**Beslut:** LOCKED — Decimal matchar Shopify + Avalara API contracts.

### Q3 — Polymorphic FKs (orderLineItemId / draftLineItemId) som loose strings eller proper @relation?

**Rekommendation:** **loose strings** — matchar existing pattern i
DraftOrder (loose FK till GuestAccount, CompanyLocation). Behåller
flexibilitet för future polymorphism (shipping lines, etc.) utan
Prisma-relation-constraints som kasserar med multi-table-inheritance.

**Beslut:** LOCKED — pattern-konsistens med existing.

### Q4 — TaxCategory enum: TypeScript-only eller Prisma-enum?

**Rekommendation:** **TypeScript-only** för V1. Prisma-enum skulle
kräva DB-migration vid varje TaxCategory-ändring; TypeScript kan
itereras snabbare. Validation via Zod vid storage-time.

**Beslut:** advisory — per master plan §6 (Decision 6) som föreslog
flat enum.

### Q5 — TaxExemptionCode: alla US-stater + CA-provinser i V1?

**Rekommendation:** **JA** — kopiera Shopifys enum verbatim. Saknas
någon → blir Q1 i Tax-7 (EU rev-charge) eller Tax-9 (full taxonomy).
Bättre att ha hela enum:en disponibel även om bara EU_REVERSE_CHARGE
används aktivt i V1 (Sverige/Nordic).

**Beslut:** advisory.

### Q6 — `TenantTaxConfig` default-row vid tenant-creation?

**Rekommendation:** **JA** — auto-create `{ regionScope: "GLOBAL",
providerKey: "builtin", active: true }` row vid tenant-creation
(modify existing tenant-bootstrap code). Förenklar Tax-1 calculator
som annars måste null-handle "no provider configured".

**Beslut:** advisory — påverkar tenant-onboarding-flow.

### Q7 — `presentment*` kolumner: Int eller BigInt?

**Rekommendation:** **matcha typen som existing-kolumnen**. `Order.subtotalAmount`
är Int (legacy från pre-FAS-7), så `presentmentSubtotalAmount` också Int.
`DraftOrder.subtotalCents` är BigInt, så `presentmentSubtotalCents` också
BigInt.

Inkonsistensen mellan Order (Int) och DraftOrder (BigInt) är pre-existing
debt — att fixa den är out-of-scope för Tax-0.

**Beslut:** LOCKED — minimal-touch på existing schema.

### Q8 — Backfill timing: i samma migration eller separat?

**Rekommendation:** **i samma migration** som SQL `UPDATE`-statement.
Atomisk: schema-add + backfill = en transaction. Inga halvfärdiga
states.

**Beslut:** LOCKED — atomicitet är viktig för zero-downtime-deploys.

### Q9 — Provider-interface: synchronous eller streaming?

**Rekommendation:** **synchronous Promise<TaxResponse>** — matchar
Shopifys partner-platform contract (synchronous HTTPS request/response
per cart/checkout/order). Streaming overengineering för V1.

**Beslut:** LOCKED — matchar Shopify partner-platform.

### Q10 — Tests mot live Shopify-rounding-exempel?

**Rekommendation:** **JA** — bake in master plan §3.7 citatet som
test-fixture: `2.685 → 2.68`, `2.6982 → 2.70`. Parity-test.

**Beslut:** LOCKED — citerade källor är trustworthy fixtures.

---

## E — Q-decisions sammanfattning

| Q | Status | Type |
|---|---|---|
| Q1 migration-strategi | OPEN | advisory |
| Q2 TaxLine.rate type | LOCKED | — |
| Q3 polymorphic FK style | LOCKED | — |
| Q4 TaxCategory enum-style | OPEN | advisory |
| Q5 US states/CA provinces | OPEN | advisory |
| Q6 TenantTaxConfig default | OPEN | advisory |
| Q7 presentment* int/bigint | LOCKED | — |
| Q8 backfill timing | LOCKED | — |
| Q9 provider sync/streaming | LOCKED | — |
| Q10 Shopify rounding fixtures | LOCKED | — |

**Totalt öppna:** 4 advisory, 0 blocking.

---

## F — Verifieringsplan (innan första push)

```bash
cd /workspaces/book-C/admin
git fetch origin && git checkout claude/tax-0-implementation
git pull

# 1. Type-check FULL
npx tsc --noEmit 2>&1 | tee /tmp/tsc-tax-0.log
echo "Total errors:"
grep -cE "error TS" /tmp/tsc-tax-0.log
# Förväntat: 3 (project baseline accommodations).
# NEW = 0.

# 2. New tests
npx vitest run \
  app/_lib/money/round.test.ts \
  app/_lib/tax \
  2>&1 | tail -15
# Förväntat: alla gröna, +35+ net new

# 3. Lint new files
npx eslint \
  app/_lib/money/round.ts \
  app/_lib/money/round.test.ts \
  app/_lib/tax \
  2>&1 | tail -10
# Förväntat: 0 errors

# 4. Schema validation
npx prisma format
npx prisma validate
npx prisma generate
# Alla succeed

# 5. Migration dry-run mot dev DB:
npx prisma migrate dev --name tax_foundation --create-only
# Inspect generated SQL — verify backwards-compat

# 6. Apply migration:
npx prisma migrate deploy

# 7. Verify backfill (sample query):
npx prisma db execute --stdin <<EOF
SELECT
  COUNT(*) as total_orders,
  COUNT(*) FILTER (WHERE "presentmentSubtotalAmount" IS NULL) as null_presentment
FROM "Order";
EOF
# Förväntat: null_presentment = 0
```

---

## G — Cross-domain coord checklist

> **Status update 2026-05-04:** Terminal A reviewed coord and gave
> green-light. Their full response is captured in
> `_audit/session-2026-05-04-resume.md` (section "Terminal A coord
> response"). Relevant items below marked ✅.

**PUSHA INTE Tax-0 implementation INNAN:**

1. [ ] PR #40 (master plan) mergad till main
2. [ ] PR #41 (denna recon) mergad till main
3. [x] **✅ Terminal A bekräftat schema-migration-namespace fritt**
   - Latest analytics migration on main: `20260504144722_analytics_phase5a_aggregator`
   - No concurrent migration in flight
   - `feature/analytics-funnel-metrics` is pure additive logic, zero schema touch
   - Namespace `tax_foundation_<timestamp>` then `dual_currency_pricing_<timestamp>` är OK
4. [x] **✅ Terminal A informed of new `presentmentCurrency` columns**
   - They confirmed YES interest in consuming presentment fields
   - Timeline: post-Tax-4 (no immediate consumption post-Tax-0)
   - Naming preference: MoneyBag-nesting at API surface (per
     `_audit/presentment-money-handoff.md`)
   - Cross-team contract doc at `_audit/presentment-money-handoff.md`
     is the canonical reference
5. [ ] Both Tax-0 migrations confirmed shipping in **single PR**
   (Terminal A's lock-in ask — see Q1 above)

---

## H — PR-strategi

När Tax-0 implementerat + verifierat:
- Öppna PR mot main
- Titel: `feat(tax-engine): Tax-0 — foundation schema & helpers`
- Liten + fokuserad (~600-1000 LOC, mest schema + types + tests)
- Body refererar `tax-engine-master-plan.md` + denna recon
- Tag operator + Terminal A för review (cross-domain notification)

---

## I — Stop-protocol-status

- Branch: `claude/tax-0-recon` (recon-doc only)
- Implementation-branch (kommer senare): `claude/tax-0-implementation`
- Master plan PR #40: pending merge — **MÅSTE landas innan Tax-0 implementation startar**
- Terminal A coord: pending — **MÅSTE bekräftas innan Tax-0 schema-migration pushas**
