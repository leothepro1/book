# Tax-2 — Draft Orders integration (recon)

**Master plan reference:** `_audit/tax-engine-master-plan.md` §5 (Tax-2)
**Branch:** `claude/tax-2-recon` (från `main` @ `66c95f3`)
**Datum:** 2026-05-04
**Författare:** Claude (Web — claude.ai/code, Terminal B prompt-engineer)
**Status:** RECON — pending operator-godkännande av §D Q-decisions.

---

## Mål

Wira den existerande **DraftOrder**-pricing-pipelinen
(`previewDraftTotals` + orchestrator `computeDraftTotals` + lifecycle
`freezePrices` + `convert.ts` Draft → Order) till den nya `calculateTax()`
single-calculator från Tax-1.

Detta är **första call-site-integration**. Cart/Checkout (Tax-3) följer
samma pattern men med rörlig coord-ytan mot Terminal A — Drafts är
Terminal B-only och därför rätt fas för att lock-in:a integration-
patternet utan cross-team-friction.

**Per master plan §5 (Tax-2):**
> "previewDraftTotals calls calculateTax() instead of using
> Accommodation.taxRate. freezePrices snapshots TaxLine rows in tx.
> DraftLineItem.taxAmountCents now derived from sum of related TaxLines.
> convert.ts inherits TaxLine rows when promoting Draft → Order.
> Migration: existing drafts retain frozen totals; new ones use new
> path."

Decisions implementerade i Tax-2:
- **#1** Single calculator → Drafts ringer `calculateTax()`
- **#2** TaxLine persistence → `freezePrices` skriver TaxLine-rader i tx
- **#4** Banker's rounding → calculator gör det redan; vi sluta runda i
  draft-calculator-core
- **#11** Net pricing storage → bevara `taxesIncluded` som display-flag
- **#12** Drafts use same calculator → exakt det Tax-2 levererar

---

## Stop-protocol

- **INGA** schema-changes (TaxLine model finns redan från Tax-0; ingen
  ny kolumn behövs). Om en `Accommodation.taxCategory`-kolumn anses
  värdefull → separat senare PR, inte här.
- **INGA** ändringar till call-sites utanför Drafts:
  - `app/api/checkout/**` — Tax-3
  - `_lib/orders/process-paid-side-effects.ts` — Tax-3
  - `_lib/cart/**` — Tax-3
- **INGA** UI-changes (admin draft-totals UI rör vi i Tax-2.x om alls;
  rate-display blir kommande task)
- **INGA** Tax-1 calculator-edits (calculator är immutable
  contract från Tax-1)
- **INGA** Avalara/Vertex-providers — Tax-8
- `Accommodation.taxRate` (basis points) blir LEGACY-fält men raderas
  INTE i Tax-2 (data migration → Tax-3 efter Cart/Checkout också wirats)
- Failure-mode: Drafts MUST aldrig blockera på tax-fel (calculator har
  redan tier-3 fallback från Tax-1)

Baseline (post-Tax-1 #48 merge):
- tsc 3 errors (project baseline accommodations)
- vitest grön
- eslint clean

---

## A — Vilka master-plan lock-in decisions Tax-2 implementerar

| Decision | Tax-2 deliverable |
|---|---|
| #1 Single calculator, multiple callers | Draft-orchestrator + `previewDraftTotals` ringer `calculateTax()`; pure-core's per-line tax-math RETIREAS |
| #2 TaxLine per (line, jurisdiction) | `freezePrices` skapar TaxLine-rader i tx; `convert.ts` reparentar `draftLineItemId → orderLineItemId` |
| #4 Banker's rounding | Vi DELETE:ar `Math.round` i `core.ts:138-151` (calculator gör det redan) |
| #11 Inclusive vs exclusive = display contract | DraftOrder.taxesIncluded styr display, INTE math; calculator alltid net-pricing |
| #12 Drafts use same calculator | `TaxRequest.estimated`-flagga: live-preview = `estimated:true`, freeze = `estimated:false` |

Andra decisions kvarstår:
- **#3** MoneyBag (presentment-currency) wires upp i Tax-4 (Markets)
- **#5** TaxRegistration + nexus-aware skips → Tax-1 calculator gör det
  redan; Tax-2 bara förser request
- **#6** TaxCategory enum — Tax-2 mappar lineType → category
- **#7** Merchant overrides → Tax-6
- **#8** TaxExemption (B2B) — befintlig `companyTaxExempt` flagga
  bevaras, ny calculator hanterar både `EXEMPT_FOREIGN_DIPLOMAT` och
  `EU_REVERSE_CHARGE_EXEMPTION_RULE` på TaxRequest-nivå
- **#9** Provider abstraction — färdig från Tax-1
- **#10** Failure mode (always quote) — calculator levererar tier-3 noll;
  Drafts respekterar `TaxResponse.warnings`

---

## B — Implementation-plan (6 commits, ONE PR)

### B.1 — DraftOrder → TaxRequest mapper

**Filer:**
- `app/_lib/draft-orders/calculator/tax-request.ts` (ny)
- `app/_lib/draft-orders/calculator/tax-request.test.ts` (ny)

**Innehåll (skiss):**
```typescript
import type { TaxRequest } from "@/app/_lib/tax/types";
import type { TaxCategory } from "@/app/_lib/tax/taxonomy";
import { DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE } from "@/app/_lib/tax/taxonomy";
import type { RawDraftOrder, RawDraftLineItem } from "./context";

const MS_PER_DAY = 86_400_000;

/**
 * Heuristic: lineType → TaxCategory.
 *
 * Tax-2 Q1 LOCKED: no schema change in this PR. We use defaults; future
 * Tax-2.x may add `Accommodation.taxCategory` column for camping vs
 * hotel disambiguation. Long-stay detection happens here per Tax-1 Q8
 * LOCKED — nights > 30 → ACCOMMODATION_LONG_STAY (rate 0 in seed).
 */
function resolveTaxCategory(
  line: RawDraftLineItem,
  productTypeById: Map<string, "STANDARD" | "GIFT_CARD">,
): TaxCategory {
  if (line.lineType === "ACCOMMODATION") {
    if (line.checkInDate && line.checkOutDate) {
      const nights = Math.ceil(
        (line.checkOutDate.getTime() - line.checkInDate.getTime()) /
          MS_PER_DAY,
      );
      if (nights > 30) return "ACCOMMODATION_LONG_STAY";
    }
    return "ACCOMMODATION_HOTEL"; // Q1 default — Camping requires
                                  // future Accommodation.taxCategory.
  }
  if (line.lineType === "PRODUCT" && line.productId) {
    const pt = productTypeById.get(line.productId) ?? "STANDARD";
    return DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE[pt];
  }
  // CUSTOM → fee bucket. Q2 advisory.
  return "FEE_OTHER";
}

export type BuildTaxRequestParams = {
  draft: RawDraftOrder;
  lineItems: readonly RawDraftLineItem[];
  /** Pre-resolved per-line taxable base post-discount (BigInt ören). */
  taxableBaseByLineId: Map<string, bigint>;
  productTypeById: Map<string, "STANDARD" | "GIFT_CARD">;
  /** Tenant default fulfillment country — see Q3. */
  fulfillmentCountryCode: string;
  buyerCountryCode: string;
  shopCurrency: string;
  /** Tax-4 Markets — currently equals shopCurrency (Q4 LOCKED). */
  presentmentCurrency: string;
};

export function buildTaxRequestFromDraft(
  params: BuildTaxRequestParams,
): TaxRequest {
  const { draft, lineItems, taxableBaseByLineId, productTypeById,
    fulfillmentCountryCode, buyerCountryCode, shopCurrency,
    presentmentCurrency } = params;

  return {
    tenantId: draft.tenantId,
    buyerLocation: { countryCode: buyerCountryCode },
    fulfillmentLocation: { countryCode: fulfillmentCountryCode },
    lines: lineItems.map((l) => ({
      lineId: l.id,
      productId: l.productId ?? l.accommodationId ?? undefined,
      taxCategory: resolveTaxCategory(l, productTypeById),
      taxableAmount: taxableBaseByLineId.get(l.id) ?? BigInt(0),
      quantity: l.quantity,
      taxable: l.taxable,
    })),
    shippingLines: draft.shippingCents > BigInt(0)
      ? [{
          shippingLineId: `shipping_${draft.id}`,
          taxableAmount: draft.shippingCents,
        }]
      : [],
    presentmentCurrency,
    shopCurrency,
    // companyLocation populated downstream when buyerKind=COMPANY.
  };
}
```

**Tests (10+ cases):**
- lineType=ACCOMMODATION + nights ≤ 30 → ACCOMMODATION_HOTEL
- lineType=ACCOMMODATION + nights > 30 → ACCOMMODATION_LONG_STAY
- lineType=ACCOMMODATION + missing dates → ACCOMMODATION_HOTEL
- lineType=PRODUCT + STANDARD → RETAIL_GENERAL
- lineType=PRODUCT + GIFT_CARD → FEE_OTHER
- lineType=CUSTOM → FEE_OTHER
- shippingCents > 0 → shipping line emitted
- shippingCents = 0 → no shipping line
- presentmentCurrency defaults to shopCurrency (Q4)
- Empty lines array → empty TaxRequest.lines

**Checkpoint:** tsc 0 nya, vitest +10 nya passing.

---

### B.2 — Orchestrator wired to calculateTax

**Filer:**
- `app/_lib/draft-orders/calculator/orchestrator.ts` (modifierad)
- `app/_lib/draft-orders/calculator/orchestrator.test.ts` (utökad)

**Förändring (orchestrator.ts):**
1. **Beräkna `taxableBase` per line** PRE-tax-call (subtotal − manualDiscount
   − allocatedOrderDiscount, clamped non-neg, suppressed=0 om non-taxable
   eller `companyTaxExempt`). Detta är samma bas som calculator-core
   redan beräknar i Step 5 — vi flyttar den till orchestrator.
2. **Ringa `calculateTax(req)`** med byggd request. Bygg
   `companyLocation`-payload när `buyerKind=COMPANY` med
   `taxExemptions`, `vatNumber`, `collectMode` från
   `CompanyLocationTaxSettings`.
3. **Aggregera `TaxResponse` per line** → bygg ny shape
   `taxByLineId: Map<lineId, { taxCents: bigint, taxLines: ComputedTaxLine[] }>`.
4. **Förse pure-core** med pre-calculated `taxByLineId` istället för
   `accTaxRateMap`. Pure-core RETIREAR sin `computeLineTax()` inline-math.
5. **Bevara `companyTaxExempt`-flagga** men tunna ut den — calculator
   hanterar exemption nu via `companyLocation.taxExemptions`.
6. **Warnings**: prepend `TaxResponse.warnings` med prefix
   `tax.<warning>` till totals.warnings (transparent surface).

**Förändring (core.ts):**
- DELETE `computeLineTax(taxableBase, taxRateBp, taxesIncluded)` (rad
  138-151).
- `DraftTotalsLineInput.taxRateBp` → `taxCents: bigint` direct (
  pre-computed by orchestrator). `taxLines: ComputedTaxLine[]` läggs till
  om vi vill behålla per-jurisdiction breakdown i `DraftTotals.perLine`.
- Step 6 i core blir `const taxCents = line.taxCents` (renderar utan
  inline-math).
- `taxesIncluded`-flag bevaras eftersom `lineTotal`-uträkningen Step 8
  fortfarande beror på den (display-only).

**Förändring (context.ts):**
- DELETE `resolveLineTaxRateBp` (ersatt av tax-request mapper i B.1).
- `buildDraftTotalsInput` ny parameter `taxByLineId: Map<string, bigint>`
  (eller utvidgad shape med ComputedTaxLine[]).

**Tests (15+ cases):**
- Happy path: 1 ACCOMMODATION line → orchestrator ringer calculateTax
  med korrekt taxCategory + taxableBase
- 1 PRODUCT + 1 ACCOMMODATION → 2 request-lines
- companyTaxExempt → calculator får `taxExemptions: ["EXEMPT_FOREIGN_DIPLOMAT"]`
  ELLER taxableBase=0 (Q5 advisory)
- Calculator returnerar warnings → propageras till `DraftTotals.warnings`
- Calculator throws → tier-3 fallback kicks in (calculator hanterar internt
  enligt Tax-1)
- Frozen short-circuit: pricesFrozenAt set → INTE ringa calculator
- `taxesIncluded=true` → totalCents excluded tax (samma som idag)
- `taxesIncluded=false` → totalCents inkluderar tax (samma som idag)

**Checkpoint:** tsc 0 nya, vitest existing-tests still pass + 15 nya.

---

### B.3 — TenantTaxConfig fulfillment-country resolution

**Filer:**
- `app/_lib/draft-orders/calculator/orchestrator.ts` (samma som B.2,
  ny privat helper)
- `app/_lib/draft-orders/calculator/fulfillment-country.ts` (ny, ren
  helper)
- `app/_lib/draft-orders/calculator/fulfillment-country.test.ts` (ny)

**Innehåll (fulfillment-country.ts):**
```typescript
/**
 * Resolve the fulfillment country for a DraftOrder per Q3 LOCKED.
 *
 * Tax-2 V1: tenant has ONE default fulfillment country derived from
 * the tenant's country (configured at sign-up) OR fallback to "SE".
 *
 * Future Tax-4 (Markets): per-Market resolution via marketId. Future
 * (multi-property): per-Accommodation property address.
 *
 * The resolved country drives:
 *  - Per-category rate-lookup in builtin provider (seed-rates Nordic V1).
 *  - TenantTaxConfig provider resolution (regionScope → GLOBAL fallback).
 */
export async function resolveFulfillmentCountry(
  tenantId: string,
  tx: PrismaClient | TransactionClient,
): Promise<string> {
  const tenant = await tx.tenant.findFirst({
    where: { id: tenantId },
    select: { country: true /* if exists */ },
  });
  return tenant?.country?.toUpperCase() ?? "SE";
}
```

**Q3 Open:** Vi måste verifiera om `Tenant.country` finns som column.
Om INTE → introducera en `TenantTaxConfig.defaultFulfillmentCountry`
(redan finns? — kolla schema). Hardcoded `"SE"` är acceptabel V1 om
operatören kör Sverige-only beta. Detta är Q3 advisory.

**Tests:**
- Tenant with country="NO" → "NO"
- Tenant with country=null → "SE"
- Tenant with country="se" (lowercase) → "SE"
- Cross-tenant resolution → Q3 enforce tenantId-scope

**Checkpoint:** tsc 0 nya, vitest +5 nya.

---

### B.4 — freezePrices snapshots TaxLine rows

**Filer:**
- `app/_lib/draft-orders/lifecycle.ts` (modifierad)
- `app/_lib/draft-orders/freeze-tax-lines.ts` (ny — ren helper)
- `app/_lib/draft-orders/freeze-tax-lines.test.ts` (ny)

**Innehåll (lifecycle.ts ändring):**
```typescript
// Inside freezePrices tx, after totals computed and DraftOrder/
// DraftLineItem rows updated:

// Snapshot TaxLine rows from totals.perLine[].taxLines.
// One row per (draftLineItemId, jurisdiction). Source: provider key.
await persistTaxLinesForDraft(tx, {
  tenantId: draft.tenantId,
  draftId: draft.id,
  perLine: totals.perLine,        // includes taxLines array per line
  presentmentCurrency: draft.currency, // Tax-4: real presentment
});
```

**Innehåll (freeze-tax-lines.ts):**
```typescript
import type { Prisma } from "@prisma/client";
import type { DraftTotalsLineBreakdown } from "./calculator/types";

type Tx = Prisma.TransactionClient;

export async function persistTaxLinesForDraft(
  tx: Tx,
  params: {
    tenantId: string;
    draftId: string;
    perLine: DraftTotalsLineBreakdown[];
    presentmentCurrency: string;
  },
): Promise<void> {
  const { tenantId, perLine, presentmentCurrency } = params;

  // Idempotency: delete existing TaxLines for these draftLineItemIds
  // first (re-freeze is forbidden by lifecycle but defensive in case
  // of re-issue flow). Per Q6 LOCKED.
  const draftLineItemIds = perLine.map((p) => p.lineId);
  if (draftLineItemIds.length === 0) return;

  await tx.taxLine.deleteMany({
    where: {
      tenantId,
      draftLineItemId: { in: draftLineItemIds },
    },
  });

  const rows = perLine.flatMap((breakdown) =>
    (breakdown.taxLines ?? []).map((tl) => ({
      tenantId,
      draftLineItemId: breakdown.lineId,
      orderLineItemId: null,
      title: tl.title,
      jurisdiction: tl.jurisdiction,
      rate: tl.rate.toString(),               // Decimal string per Prisma
      taxableAmountCents: tl.taxableAmount,
      taxAmountCents: tl.taxAmount,
      presentmentTaxAmountCents: tl.presentmentTaxAmount,
      presentmentCurrency,
      source: tl.source,
      channelLiable: tl.channelLiable,
    })),
  );

  if (rows.length === 0) return;

  await tx.taxLine.createMany({ data: rows });
}
```

**Q6 LOCKED:** delete-before-insert under tx är OK eftersom
`assertDraftFreezable` redan blockerar dubbel-freeze på normal-path.
Defensive cleanup garanterar invariant: max 1 TaxLine-set per
draftLineItem.

**Tests (12+ cases):**
- 1 ACC line + SE → 1 TaxLine (jurisdiction="SE", rate=0.12,
  source="builtin")
- Long-stay → 1 TaxLine med rate=0 + warning-text (Q5 advisory om
  zero-rate-emission)
- Tier-3 fallback (calculator threw) → 0 TaxLines (taxLines=[]),
  warnings emitted men freeze går igenom
- companyTaxExempt → 0 TaxLines per line, freeze går igenom
- Re-freeze edge case → deleteMany clean-up + new insert
- Mix: 2 ACC + 1 PRODUCT + 1 CUSTOM (FEE_OTHER) → 4 TaxLine rows
- presentmentCurrency = shopCurrency Tax-2 → presentmentTaxAmount =
  taxAmount (Q4 LOCKED)
- DraftLineItem.taxAmountCents = sum of related TaxLine.taxAmountCents
  (parity invariant)

**Checkpoint:** tsc 0 nya, vitest +12 nya.

---

### B.5 — convert.ts inherits TaxLines on Draft → Order

**Filer:**
- `app/_lib/draft-orders/convert.ts` (modifierad)
- `app/_lib/draft-orders/convert-tax-lines.ts` (ny — ren helper)
- `app/_lib/draft-orders/convert-tax-lines.test.ts` (ny)

**Innehåll (convert.ts ändring):**
```typescript
// Inside convertDraftToOrder tx, AFTER createOrderLineItemsFromDraftInTx
// produces the OrderLineItem rows:

// Reparent TaxLines from draftLineItemId → orderLineItemId.
// One-to-one pairing via the position-ordered draftLineItem ↔
// orderLineItem mapping that createOrderLineItemsFromDraftInTx returns.
await reparentTaxLinesDraftToOrder(tx, {
  tenantId: draft.tenantId,
  pairs: orderLineItemPairs, // Array<{ draftLineItemId, orderLineItemId }>
});
```

**Innehåll (convert-tax-lines.ts):**
```typescript
import type { Prisma } from "@prisma/client";
type Tx = Prisma.TransactionClient;

/**
 * Reparent TaxLine rows from draftLineItem → orderLineItem when a
 * Draft is promoted. Per Tax-2 invariant: orderLineItemId XOR
 * draftLineItemId is non-null at any time. After convert, draft rows
 * have orderLineItemId set and draftLineItemId nulled.
 *
 * Q7 LOCKED: We do NOT delete and recreate. We UPDATE in place. This
 * preserves audit history (createdAt, source, channelLiable from the
 * original calculation).
 */
export async function reparentTaxLinesDraftToOrder(
  tx: Tx,
  params: {
    tenantId: string;
    pairs: Array<{ draftLineItemId: string; orderLineItemId: string }>;
  },
): Promise<void> {
  for (const pair of params.pairs) {
    await tx.taxLine.updateMany({
      where: {
        tenantId: params.tenantId,
        draftLineItemId: pair.draftLineItemId,
      },
      data: {
        orderLineItemId: pair.orderLineItemId,
        draftLineItemId: null,
      },
    });
  }
}
```

**Q8 advisory:** existing pre-Tax-2 frozen drafts have NO TaxLine rows.
Their `Order.taxAmount` is back-filled from `draft.totalTaxCents` (line
346 in convert.ts). When such an Order is later inspected, queries
finding TaxLines come back empty. This is acceptable in V1 — Tax-3
backfill phase synthesizes a single TaxLine per existing Order.

**Tests (8+ cases):**
- Draft with 2 lines × 1 TaxLine each → reparent updates both
- Draft pre-Tax-2 with 0 TaxLines → no-op, no error
- Multi-jurisdiction draft (future) → all jurisdictions reparent
- Cross-tenant guard: reparent skips other tenants' rows
- Order.taxAmount blir SUM(orderLineItem.taxLines.taxAmount) — parity
  invariant
- Existing convert tests pass unchanged (drift-detection)

**Checkpoint:** tsc 0 nya, vitest +8 nya. Existing convert tests pass.

---

### B.6 — Parity tests + roadmap update

**Filer:**
- `app/_lib/draft-orders/calculator/parity-old-vs-new.test.ts` (ny)
- `_audit/draft-orders-roadmap.md` (uppdaterad — Tax-2 marked done)

**Parity-test ansats:**
Snapshot the OLD computation (pre-Tax-2) by hand-coding the formula
for the 12 most common DraftOrder shapes (1 ACC line × SE rate=0.12,
1 PRODUCT × 0.25, mixed cases, B2B exempt, long-stay, tier-3
fallback). For each shape, build a synthetic draft, run BOTH:
1. Manually-computed expected (`old expectation`).
2. New `computeDraftTotals` calling Tax-1 calculator.

Assert byte-equality for `subtotalCents`, `taxCents`, `totalCents`. Drift
> 1 öre fails the test (banker's rounding can shift one rounding
direction in edge cases — that's documented exception, not regression).

**Tests (12+ shape × 2 = 24 assertions):**
- 1 ACC SE × 5 nights × 1500 SEK/night × inclusive
- 1 ACC SE × 5 nights × 1500 SEK/night × exclusive
- 1 ACC NO × camping → still ACCOMMODATION_HOTEL by Q1 default → 12% MVA
- 1 ACC SE × 35 nights → ACCOMMODATION_LONG_STAY → rate=0
- 1 PRODUCT SE × 1000 SEK × inclusive → 25% extracted
- 2 lines × discount → allocated proportionally (existing behaviour)
- companyTaxExempt → tax = 0 across all lines
- Cross-tenant rate-resolution attempted → fail-closed, tier-3
- All-zero result → empty TaxLines array (Q5)
- Currency conversion edge: shopCurrency=SEK, presentment=SEK → equal
- Round-half-to-even edge: 0.5-öre boundaries → banker's rounding
- Empty draft (no lines) → all-zero, no calculator call

**Roadmap update (`draft-orders-roadmap.md`):**
- Tax-2 marked `done` with PR-link placeholder
- Update "next phase" pointer → Tax-3
- Document that `Accommodation.taxRate` BP-field is now LEGACY (deletion
  plan deferred to post-Tax-3)

**Checkpoint:** alla tester gröna; ej regressioner i existing
draft-orders-tests.

---

## C — Filer som RÖRS

### Nya filer
- `app/_lib/draft-orders/calculator/tax-request.ts` + `.test.ts`
- `app/_lib/draft-orders/calculator/fulfillment-country.ts` + `.test.ts`
- `app/_lib/draft-orders/freeze-tax-lines.ts` + `.test.ts`
- `app/_lib/draft-orders/convert-tax-lines.ts` + `.test.ts`
- `app/_lib/draft-orders/calculator/parity-old-vs-new.test.ts`

### Modifierade filer
- `app/_lib/draft-orders/calculator/orchestrator.ts` (~30 rader edit)
- `app/_lib/draft-orders/calculator/core.ts` (~25 rader DELETE)
- `app/_lib/draft-orders/calculator/context.ts` (~20 rader edit, DELETE
  `resolveLineTaxRateBp`)
- `app/_lib/draft-orders/calculator/types.ts` (~10 rader add: `taxLines:
  ComputedTaxLine[]` på `DraftTotalsLineBreakdown`)
- `app/_lib/draft-orders/lifecycle.ts` (~10 rader add för
  persistTaxLinesForDraft-call)
- `app/_lib/draft-orders/convert.ts` (~10 rader add för
  reparentTaxLinesDraftToOrder + ändrad `taxAmount` source)
- `app/_lib/draft-orders/preview-totals.ts` (~30 rader edit, switcha till
  ny orchestrator-shape)

### EJ rörda
- `app/api/checkout/**` — Tax-3
- `_lib/orders/**` — Tax-3
- `_lib/cart/**` — Tax-3
- `prisma/schema.prisma` — INGA schema-changes (TaxLine finns från
  Tax-0; `Accommodation.taxRate` blir LEGACY men raderas inte)
- `_lib/tax/**` — calculator är immutable från Tax-1
- Admin UI för draft-orders — kommande Tax-2.x om alls

---

## D — Q-decisions

### Q1 — Hur mappar `DraftLineItem.lineType` → `TaxCategory`?

**Status:** OPEN — advisory.

**Alternativ:**
- **A: Hardcoded defaults i Tax-2** — ACCOMMODATION → ACCOMMODATION_HOTEL,
  PRODUCT (STANDARD/GIFT_CARD via existing `Product.productType`),
  CUSTOM → FEE_OTHER. Långtidsboende detekteras via nights-formula i
  request-builder. **Camping kan inte särskiljas** från hotel utan
  schema-tillägg.
- **B: Lägg till `Accommodation.taxCategory` enum-kolumn nu** — operatör
  väljer hotel vs camping per produkt.
- **C: Härled camping från `Accommodation.roomType`/tags** — sköra,
  string-baserat.

**Rekommendation A (defer schema):** Tax-2 är "wire calculator into
Drafts" — schema-changes är off-scope. SE+NO+DK+FI har samma rate för
hotel och camping (12%/12%/25%/10%) i alla utom marginal Tax-2.x
edge-case (camping under långtidsuthyrning). A räcker för V1; Tax-2.x
är enkel om operatör behöver särskilja.

### Q2 — `CUSTOM` lineType default category

**Status:** OPEN — advisory.

**Alternativ:**
- **A:** `FEE_OTHER` (default 25% Sverige).
- **B:** `RETAIL_GENERAL` (samma sats men semantiskt annan).
- **C:** Operatör måste set `taxCode` på line (kräver UI-add).

**Rekommendation A.** CUSTOM = "manual fee" är typiskt servicearvode →
moms 25% i SE matchar `FEE_OTHER`. `RETAIL_GENERAL` är retail-specifikt.

### Q3 — Hur härleder vi `fulfillmentLocation.countryCode`?

**Status:** OPEN — advisory + implementation-detalj.

**Alternativ:**
- **A: Tenant.country**-kolumn (verifiera om finns) → "SE" fallback.
- **B: TenantTaxConfig.defaultFulfillmentCountry** (kanske finns i Tax-0).
- **C: Hardcoded "SE"** (acceptabelt V1, single-tenant beta).

**Open:** Måste verifieras under implementation att schema har en lämplig
column. Om inte: implementation-PR adderar default till `"SE"` med
TODO för Tax-4 (Markets) att resolvera per Market.

### Q4 — `presentmentCurrency` i Tax-2

**Status:** LOCKED.

`presentmentCurrency = shopCurrency` i Tax-2. Tax-4 (Markets) wires upp
äkta presentment-resolution. Calculator-API:t accepterar fältet men
builtin-provider behandlar det som echo (presentmentTaxAmount =
taxAmount).

### Q5 — Long-stay / rate=0 lines: emit TaxLine eller inte?

**Status:** OPEN — advisory.

**Alternativ:**
- **A: Emit zero-rate TaxLine** — explicit audit-trail "vi körde
  calculator, det blev rate=0 pga long-stay-rule".
- **B: Skip TaxLine helt** — semantiskt "ingen jurisdiction collectar".

**Rekommendation A.** Audit/recon-trail viktig för revisor. Tax-1 builtin
emitterar en explicit zero-rate TaxLine med jurisdictionTitle
"Momsbefriad (>30 dagar)" — bevara det signalvärdet. Storage-kostnad
trivial.

### Q6 — Idempotency på `freezePrices` re-issue

**Status:** LOCKED.

`persistTaxLinesForDraft` gör `deleteMany` + `createMany` i samma tx.
Detta är defensive eftersom `assertDraftFreezable` redan blockerar
dubbel-freeze på normal-path, men re-issue-flöden (om de tillkommer
senare) får clean state utan duplicates.

### Q7 — Reparent vs delete-recreate vid convert

**Status:** LOCKED.

`UPDATE TaxLine SET orderLineItemId=..., draftLineItemId=NULL`. Bevara
`createdAt`, `source`, `channelLiable`. Audit-trail intakt.

### Q8 — Pre-Tax-2 frozen drafts: hantering vid convert

**Status:** OPEN — advisory.

Drafts som frystes före Tax-2-merge har `totalTaxCents` set men 0
TaxLine-rader. Vid convert blir Order utan TaxLine-rader.

**Alternativ:**
- **A: Lossy backfill i Tax-2** — synthesize 1 TaxLine per
  Draft/Order med `source="legacy_pre_tax2"`, jurisdiction från
  `Tenant.country`, rate = `totalTaxCents / subtotalCents`.
- **B: Defer to Tax-3** — Tax-3 kommer ändå göra Cart/Checkout backfill;
  inkludera Drafts då.
- **C: Accept gap** — pre-Tax-2 orders har bara aggregat-tax, inga
  TaxLine-rader. Inspecting ger empty array.

**Rekommendation B (defer to Tax-3).** Tax-2 fokuserar wire-up; Tax-3
har redan backfill-scope; kombinera i Tax-3 för konsekvens.

### Q9 — `companyTaxExempt`-flagga: behåll eller ersätt?

**Status:** OPEN — advisory.

Idag: orchestrator resolverar `CompanyLocation.taxSetting === "EXEMPT"`
och feed:ar `DraftTotalsInput.companyTaxExempt: boolean` till core, som
sätter `taxableBase=0` per line.

Tax-1 calculator hanterar exemption mer granulärt via
`TaxRequest.companyLocation.taxExemptions: TaxExemptionCode[]` +
`collectMode: TaxCollectMode`.

**Alternativ:**
- **A: Bygg request med `taxExemptions: ["EXEMPT_FOREIGN_DIPLOMAT"]`**
  när taxSetting=EXEMPT — calculator sätter rate=0 per Tax-1's logik.
- **B: Behåll `companyTaxExempt`-flagga PARALLELLT** + skicka åt
  calculator. Defensive double-suppression.
- **C: Fully delegate to calculator** — avlägsna `companyTaxExempt` från
  pure-core.

**Rekommendation A med stöd C.** Single source of truth. Calculator
äger exemption-logik. Pure-core blir tunnare (en flag mindre att
underhålla).

### Q10 — Ska vi ta bort `Accommodation.taxRate` BP-fältet i Tax-2?

**Status:** LOCKED.

NEJ. `Accommodation.taxRate` blir LEGACY men raderas INTE i Tax-2.
Risk: backfill av historic data, andra (oupptäckta) call-sites,
analytics-pipeline references. Tax-3 (Cart/Checkout) raderar fältet
efter cross-team verification med Terminal A.

---

## E — Q-decisions sammanfattning

| Q | Status | Type |
|---|---|---|
| Q1 lineType → TaxCategory mapping | OPEN | advisory |
| Q2 CUSTOM default category | OPEN | advisory |
| Q3 fulfillmentCountry resolution | OPEN | advisory |
| Q4 presentmentCurrency = shopCurrency | LOCKED | — |
| Q5 zero-rate TaxLine emission | OPEN | advisory |
| Q6 freezePrices idempotency | LOCKED | — |
| Q7 convert reparent strategy | LOCKED | — |
| Q8 pre-Tax-2 frozen drafts | OPEN | advisory (defer to Tax-3) |
| Q9 companyTaxExempt flag | OPEN | advisory |
| Q10 Accommodation.taxRate retention | LOCKED | — |

**Totalt öppna:** 6 advisory. 4 LOCKED. Inga operator-actions blocking.

---

## F — Verifieringsplan (innan första push, Terminal Claude)

```bash
cd /workspaces/book-C/admin

# Type check — expect baseline
npx tsc --noEmit 2>&1 | grep -cE "error TS"
# Expected: 3 (project baseline accommodations)

# Tax-2 specific tests
npx vitest run \
  app/_lib/draft-orders/calculator/tax-request.test.ts \
  app/_lib/draft-orders/calculator/fulfillment-country.test.ts \
  app/_lib/draft-orders/calculator/orchestrator.test.ts \
  app/_lib/draft-orders/calculator/parity-old-vs-new.test.ts \
  app/_lib/draft-orders/freeze-tax-lines.test.ts \
  app/_lib/draft-orders/convert-tax-lines.test.ts \
  2>&1 | tail -15
# Expected: all green, +50+ net new

# Existing draft-orders tests (regression check)
npx vitest run app/_lib/draft-orders/ 2>&1 | tail -10
# Expected: all green, no regressions vs main

# Eslint scope
npx eslint \
  app/_lib/draft-orders/calculator/ \
  app/_lib/draft-orders/freeze-tax-lines.ts \
  app/_lib/draft-orders/convert-tax-lines.ts \
  app/_lib/draft-orders/lifecycle.ts \
  app/_lib/draft-orders/convert.ts \
  app/_lib/draft-orders/preview-totals.ts \
  2>&1 | tail -10
# Expected: 0 errors

npm run build
# Expected: TypeScript compiles, Next.js builds clean
```

---

## G — Cross-domain coord checklist

| Item | Status |
|---|---|
| PR #46 (Tax-0) merged | ✅ |
| PR #48 (Tax-1) merged | ✅ |
| `Accommodation.taxRate` retention LOCKED Q10 | ✅ Inga deletes |
| Terminal A informed | INTE krävt — Drafts är Terminal B-only scope |
| Schema migrations | ✅ Inga (TaxLine finns redan från Tax-0) |
| Pre-Tax-2 frozen-drafts backfill | Deferred to Tax-3 (Q8) |

**Coord-rapportering:** Tax-2 levererar utan cross-team-handoff. Status-
update till Terminal A vid merge för visibility, inte coord.

---

## H — PR-strategi

När Tax-2 implementerat + verifierat (Terminal Claude):
- Öppna PR mot main från `claude/tax-2-impl` (separate branch från
  recon-branch — recon-branch mergas separat enligt workflow)
- Titel: `feat(tax-engine): Tax-2 — wire DraftOrder calculator to
  calculateTax()`
- Refererar tillbaka till master plan + Tax-2 recon
- Body:
  - Lista vilka master-plan decisions Tax-2 implementerar (#1, #2, #4,
    #11, #12)
  - Verification-stats (tsc, vitest, eslint, build)
  - Parity-test sammanfattning (12 shapes × 2 path = 24 assertions)
  - Q-decisions resolutioner (vilka togs A vs B vs C)
  - Note: `Accommodation.taxRate` bp-field LEGACY men NOT deleted (Q10
    LOCKED, deletion → Tax-3)
  - Note: Pre-Tax-2 frozen drafts backfill deferred to Tax-3 (Q8)
- Tag operator för review innan merge

Recon-PR (denna doc):
- Titel: `docs(tax-engine): Tax-2 recon — wire DraftOrder calculator
  to new tax engine`
- Liten scope (single .md file)
- Mergas innan implementation börjar

---

## I — Stop-protocol-status

- Branch synced: ✓ from main @ `66c95f3`
- Inga schema-changes: ✓ (TaxLine model från Tax-0 räcker)
- Inga out-of-scope-filer (Cart/Checkout/Orders): ✓
- Tax-1 calculator ej rört: ✓
- `Accommodation.taxRate` ej raderat (Q10): ✓
- Roles split clean (Web Claude = recon, Terminal Claude =
  implementation): ✓
