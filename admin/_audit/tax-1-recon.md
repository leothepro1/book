# Tax-1 — Calculator Core + Builtin Provider (recon)

**Master plan reference:** `_audit/tax-engine-master-plan.md` §5 (Tax-1)
**Branch:** `claude/tax-1-recon` (från `main` @ `0415cee`)
**Datum:** 2026-05-04
**Författare:** Claude (Web — claude.ai/code, Terminal B prompt-engineer)
**Status:** RECON — pending operator-godkännande av D Q-decisions.

---

## Mål

Implementera den **single calculator** som Cart, Checkout, DraftOrder
och Order alla kommer kalla från Tax-2 + Tax-3. Calculator är pure
orchestration över registered providers; `builtin`-provider är första
(och pre-Avalara-eran enda) implementation.

Nordic V1 scope per Q7 LOCKED: SE, NO, DK, FI rate-seed.

**Per master plan §5 (Tax-1):** "No callers wired yet. Calculator
exists, returns valid responses, no side-effects."

---

## Stop-protocol

- Out-of-scope: callers (`previewDraftTotals`, `freezePrices`,
  `app/api/checkout/**`) — det är Tax-2 + Tax-3
- INGA schema-changes
- INGA UI-changes
- INGA edits till draft-orders calculator (`_lib/draft-orders/calculator/**`) —
  Tax-2 wiras dit
- INGA edits till `process-paid-side-effects.ts` — Tax-3 + analytics
- All tax-math lever i `_lib/tax/` (Decision 1)
- Failure-mode: aldrig kasta från `calculateTax` (Decision 10)

Baseline (post-Tax-0 #46 merge):
- tsc 3 errors (project baseline accommodations)
- vitest 58 new from Tax-0 + existing suites
- eslint clean

---

## A — Vilka master-plan lock-in decisions Tax-1 implementerar

| Decision | Tax-1 deliverable |
|---|---|
| #1 Single calculator, multiple callers | `calculateTax(req: TaxRequest): Promise<TaxResponse>` |
| #4 Banker's rounding på line × jurisdiction | Calculator anropar `roundHalfToEven` per rad |
| #6 Hospitality TaxCategory enum + rate-lookup | `_lib/tax/seed-rates.ts` Nordic-table |
| #9 Provider abstraction från day 1 | `builtin`-provider registrerar sig med `registerTaxProvider` |
| #10 Failure mode: always quote, never block | 3-tier fallback (provider → tier-3 zero) |
| #11 Inclusive vs exclusive = display contract | Calculator stores net, applies inclusive-formula vid display-need |

Andra decisions (#2 TaxLine persistence, #3 MoneyBag, #5 TaxRegistration,
#7 overrides, #8 TaxExemption, #12 drafts use same calculator) wires
upp i Tax-2..7.

---

## B — Implementation-plan (5 commits, ONE PR)

### B.1 — Rate seed data (Nordic V1)

**Filer:**
- `app/_lib/tax/seed-rates.ts` (ny)
- `app/_lib/tax/seed-rates.test.ts` (ny)

**Innehåll:**
```typescript
import type { TaxCategory } from "./taxonomy";

/**
 * Nordic V1 tax-rate seed table. Per master plan Q7 LOCKED.
 * Keyed by (countryCode, taxCategory). Region (sub-country) NOT
 * supported in V1 — added in future phases for US/CA local taxes.
 *
 * Rates are fact-checked at recon time (2026-05). Rate changes
 * occur in country tax legislation and require operator/legal
 * review before update. NOT auto-pulled from external source —
 * Tax-8 (Avalara adapter) handles dynamic rates for jurisdictions
 * outside Nordic.
 *
 * Format: Decimal as fraction (0.25 = 25%). NOT basis points.
 * Matches master plan Decision 1 + Tax-0 TaxLine.rate Decimal(7,6).
 */
export type RateSeedEntry = {
  rate: number;              // 0.25 = 25%
  jurisdictionTitle: string; // "Moms", "VAT", "MVA"
  notes?: string;            // legislative context, exemption rules
};

export const NORDIC_TAX_RATES: Record<
  string,                              // ISO countryCode
  Partial<Record<TaxCategory, RateSeedEntry>>
> = {
  SE: {
    // Standard 25%
    RETAIL_GENERAL:        { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    RETAIL_SOUVENIR:       { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    BEVERAGE_ALCOHOLIC:    { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    EXPERIENCE_SPA:        { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FEE_BOOKING:           { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FEE_OTHER:             { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    // Reduced 12%
    ACCOMMODATION_HOTEL:   { rate: 0.12, jurisdictionTitle: "Moms 12% (hotell)" },
    ACCOMMODATION_CAMPING: { rate: 0.12, jurisdictionTitle: "Moms 12% (camping)" },
    FOOD_RESTAURANT:       { rate: 0.12, jurisdictionTitle: "Moms 12% (restaurang)" },
    FOOD_GROCERY:          { rate: 0.12, jurisdictionTitle: "Moms 12% (livsmedel)" },
    FOOD_BREAKFAST:        { rate: 0.12, jurisdictionTitle: "Moms 12% (frukost)" },
    BEVERAGE_NON_ALCOHOLIC:{ rate: 0.12, jurisdictionTitle: "Moms 12%" },
    FEE_CLEANING:          { rate: 0.12, jurisdictionTitle: "Moms 12%" },
    // Reduced 6%
    TRANSPORT_LOCAL:       { rate: 0.06, jurisdictionTitle: "Moms 6% (resor)" },
    EXPERIENCE_TOUR:       { rate: 0.06, jurisdictionTitle: "Moms 6% (kultur)" },
    // Tax-exempt (handled via TaxExemptionCode flow, not rate=0 here)
    ACCOMMODATION_LONG_STAY: {
      rate: 0,
      jurisdictionTitle: "Momsbefriad (>30 dagar)",
      notes: "Långtidsuthyrning >30 dagar är momsbefriad enl. SKV."
    },
  },
  NO: {
    // Standard 25%
    RETAIL_GENERAL:        { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    RETAIL_SOUVENIR:       { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    BEVERAGE_ALCOHOLIC:    { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    EXPERIENCE_SPA:        { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    FEE_BOOKING:           { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    FEE_OTHER:             { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    // Reduced 15% (food)
    FOOD_RESTAURANT:       { rate: 0.15, jurisdictionTitle: "MVA 15% (mat)" },
    FOOD_GROCERY:          { rate: 0.15, jurisdictionTitle: "MVA 15%" },
    FOOD_BREAKFAST:        { rate: 0.15, jurisdictionTitle: "MVA 15%" },
    BEVERAGE_NON_ALCOHOLIC:{ rate: 0.15, jurisdictionTitle: "MVA 15%" },
    FEE_CLEANING:          { rate: 0.15, jurisdictionTitle: "MVA 15%" },
    // Reduced 12% (transport, accommodation)
    ACCOMMODATION_HOTEL:   { rate: 0.12, jurisdictionTitle: "MVA 12% (overnatting)" },
    ACCOMMODATION_CAMPING: { rate: 0.12, jurisdictionTitle: "MVA 12% (camping)" },
    TRANSPORT_LOCAL:       { rate: 0.12, jurisdictionTitle: "MVA 12% (transport)" },
    // Reduced 6% (cultural events)
    EXPERIENCE_TOUR:       { rate: 0.06, jurisdictionTitle: "MVA 6% (kultur)" },
    // Tax-exempt
    ACCOMMODATION_LONG_STAY: {
      rate: 0,
      jurisdictionTitle: "MVA-fritak (>30 dagar)",
      notes: "Langtidsutleie >30 dager er MVA-fritatt."
    },
  },
  DK: {
    // Flat 25% — Denmark has no reduced VAT rates
    RETAIL_GENERAL:        { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    RETAIL_SOUVENIR:       { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    BEVERAGE_ALCOHOLIC:    { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    BEVERAGE_NON_ALCOHOLIC:{ rate: 0.25, jurisdictionTitle: "Moms 25%" },
    EXPERIENCE_SPA:        { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    EXPERIENCE_TOUR:       { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FEE_BOOKING:           { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FEE_OTHER:             { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FEE_CLEANING:          { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    ACCOMMODATION_HOTEL:   { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    ACCOMMODATION_CAMPING: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FOOD_RESTAURANT:       { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FOOD_GROCERY:          { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FOOD_BREAKFAST:        { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    TRANSPORT_LOCAL:       { rate: 0,    jurisdictionTitle: "Momsfri (passagertransport)" },
    // Tax-exempt
    ACCOMMODATION_LONG_STAY: {
      rate: 0,
      jurisdictionTitle: "Momsfri (>30 dage)",
    },
  },
  FI: {
    // Standard 25.5% (raised Sept 2024 from 24%)
    RETAIL_GENERAL:        { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    RETAIL_SOUVENIR:       { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    BEVERAGE_ALCOHOLIC:    { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    EXPERIENCE_SPA:        { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    FEE_BOOKING:           { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    FEE_OTHER:             { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    FEE_CLEANING:          { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    // Reduced 14%
    FOOD_RESTAURANT:       { rate: 0.14, jurisdictionTitle: "ALV 14% (ravintola)" },
    FOOD_GROCERY:          { rate: 0.14, jurisdictionTitle: "ALV 14%" },
    FOOD_BREAKFAST:        { rate: 0.14, jurisdictionTitle: "ALV 14%" },
    BEVERAGE_NON_ALCOHOLIC:{ rate: 0.14, jurisdictionTitle: "ALV 14%" },
    // Reduced 10%
    ACCOMMODATION_HOTEL:   { rate: 0.10, jurisdictionTitle: "ALV 10% (majoitus)" },
    ACCOMMODATION_CAMPING: { rate: 0.10, jurisdictionTitle: "ALV 10%" },
    TRANSPORT_LOCAL:       { rate: 0.10, jurisdictionTitle: "ALV 10% (kuljetus)" },
    EXPERIENCE_TOUR:       { rate: 0.10, jurisdictionTitle: "ALV 10% (kulttuuri)" },
    // Tax-exempt
    ACCOMMODATION_LONG_STAY: {
      rate: 0,
      jurisdictionTitle: "ALV-vapaa (>30 päivää)",
    },
  },
};

export function lookupRate(
  countryCode: string,
  taxCategory: TaxCategory,
): RateSeedEntry | null {
  const country = NORDIC_TAX_RATES[countryCode.toUpperCase()];
  if (!country) return null;
  return country[taxCategory] ?? null;
}
```

**Tests (15+ cases):**
- Per Nordic country: at least one happy-path lookup per major category-group
- Standard rate per country (RETAIL_GENERAL → expected rate)
- Reduced-rate cases per country
- Country not in seed (e.g. `"US"`) → `null`
- Category not in country (theoretical — Q4 advisory below)
- Long-stay accommodation always rate=0 with explanatory notes
- Case-insensitive country code (lowercase `"se"` works)
- ALCOHOLIC vs NON_ALCOHOLIC distinction in SE/NO/FI

**Checkpoint:** tsc 0 nya, vitest +15 nya passing.

---

### B.2 — Builtin provider

**Filer:**
- `app/_lib/tax/providers/builtin.ts` (ny)
- `app/_lib/tax/providers/builtin.test.ts` (ny)

**Innehåll:**

```typescript
import type {
  TaxProvider,
  TaxProviderContext,
} from "./interface";
import type {
  TaxRequest,
  TaxResponse,
  TaxResponseLine,
  ComputedTaxLine,
} from "../types";
import { roundTaxAmount } from "@/app/_lib/money/round";
import { lookupRate } from "../seed-rates";

const PROVIDER_KEY = "builtin";

/**
 * Builtin tax provider. Static rate-seed lookup per master plan
 * Decision 6 + Q7 LOCKED (Nordic V1).
 *
 * - Pure function (no DB access here — TenantTaxConfig was already
 *   resolved by the calculator orchestrator).
 * - Banker's rounding per line × jurisdiction (Decision 4).
 * - Honors company-location collectMode (DO_NOT_COLLECT skips).
 * - Honors customer/company taxExemptions (handles
 *   EU_REVERSE_CHARGE_EXEMPTION_RULE explicitly).
 * - Throws nothing — calculator orchestrator wraps in try/catch.
 *
 * For non-Nordic jurisdictions, returns warnings.no_rate_for_country
 * with rate=0 lines (calculator surfaces these for operator
 * visibility; aim is "always quote, never block").
 */
export const builtinTaxProvider: TaxProvider = {
  key: PROVIDER_KEY,
  displayName: "Built-in (Nordic V1)",

  async calculate(
    req: TaxRequest,
    _ctx: TaxProviderContext,
  ): Promise<TaxResponse> {
    const warnings: string[] = [];
    const country = req.fulfillmentLocation.countryCode.toUpperCase();

    // Honor B2B collectMode: DO_NOT_COLLECT → all rate=0
    const skipAllTax =
      req.companyLocation?.collectMode === "DO_NOT_COLLECT";

    // Honor EU reverse-charge: when companyLocation/customer has
    // EU_REVERSE_CHARGE_EXEMPTION_RULE AND fulfillment country differs
    // from buyer country → all rate=0 with reverse-charge note
    const hasReverseCharge =
      (req.companyLocation?.taxExemptions ?? [])
        .includes("EU_REVERSE_CHARGE_EXEMPTION_RULE") ||
      (req.customer?.taxExemptions ?? [])
        .includes("EU_REVERSE_CHARGE_EXEMPTION_RULE");
    const reverseChargeApplies =
      hasReverseCharge &&
      req.buyerLocation.countryCode.toUpperCase() !==
        req.fulfillmentLocation.countryCode.toUpperCase();

    if (skipAllTax) warnings.push("collect_mode_do_not_collect");
    if (reverseChargeApplies)
      warnings.push("eu_reverse_charge_applied");

    const responseLines: TaxResponseLine[] = req.lines.map((line) => {
      if (!line.taxable || skipAllTax || reverseChargeApplies) {
        return { lineId: line.lineId, taxLines: [] };
      }

      const seed = lookupRate(country, line.taxCategory);
      if (!seed) {
        if (!warnings.includes(`no_rate_for_country:${country}`)) {
          warnings.push(`no_rate_for_country:${country}`);
        }
        return { lineId: line.lineId, taxLines: [] };
      }
      if (seed.rate === 0) {
        // Explicit rate=0 still emits a TaxLine for audit/timeline
        return {
          lineId: line.lineId,
          taxLines: [
            {
              title: seed.jurisdictionTitle,
              jurisdiction: country,
              rate: 0,
              taxableAmount: line.taxableAmount,
              taxAmount: BigInt(0),
              presentmentTaxAmount: BigInt(0),
              source: PROVIDER_KEY,
              channelLiable: true,
            },
          ],
        };
      }

      // Compute tax — banker's rounding per line × jurisdiction
      // (Decision 4). We have ONE jurisdiction in Nordic V1; future
      // US/CA support will iterate multiple jurisdictions per line.
      const taxableNumber = Number(line.taxableAmount);
      const rawTax = taxableNumber * seed.rate;
      const taxAmount = BigInt(roundTaxAmount(rawTax));

      const taxLine: ComputedTaxLine = {
        title: seed.jurisdictionTitle,
        jurisdiction: country,
        rate: seed.rate,
        taxableAmount: line.taxableAmount,
        taxAmount,
        // Tax-1 V1: presentment = shop (Tax-4 introduces FX
        // conversion when Markets resolves localCurrencies)
        presentmentTaxAmount: taxAmount,
        source: PROVIDER_KEY,
        channelLiable: true,
      };

      return { lineId: line.lineId, taxLines: [taxLine] };
    });

    // Shipping lines — Tax-1 stub: zero-tax. Tax-7 wires merchant
    // shipping-tax overrides + per-jurisdiction shipping rates.
    const shippingLines = req.shippingLines.map((s) => ({
      shippingLineId: s.shippingLineId ?? "shipping",
      taxLines: [],
    }));

    return {
      lines: responseLines,
      shippingLines,
      source: PROVIDER_KEY,
      estimated: true, // calculator orchestrator overrides for
                       // finalized orders (Tax-3 wires this)
      warnings,
    };
  },
};
```

**Tests (25+ cases):**
- **Happy paths per Nordic country (×4):**
  - SE accommodation 12%, food 12%, retail 25%
  - NO accommodation 12%, food 15%, retail 25%
  - DK accommodation 25% (flat), transport 0% exempt
  - FI accommodation 10%, food 14%, retail 25.5%
- **Multi-line orders:**
  - Mixed categories (hotel + restaurant + alcohol) sum correctly
  - Each line gets its own TaxLine with correct rate
- **Banker's rounding parity:**
  - Tax of 12% on 8.50 SEK → 1 SEK (round half-to-even, 1.02 → 1)
  - Tax of 25% on 12.30 SEK → 3.08 SEK (round half-to-even)
  - Sum of line rounding != round of sum (positive case demonstrating
    why line-level matters)
- **Edge cases:**
  - `line.taxable: false` → no taxLines emitted
  - Non-Nordic country (`countryCode: "US"`) → warnings, no taxLines
  - Country in seed but category missing → warnings, no taxLines
  - Long-stay accommodation → emits rate=0 TaxLine with
    "Momsbefriad" title (audit trail preserved)
- **B2B collectMode:**
  - `DO_NOT_COLLECT` → all lines empty taxLines, warning emitted
  - `COLLECT_UNLESS_EXEMPT` + no exemptions → tax applied normally
  - `COLLECT_UNLESS_EXEMPT` + has exemption → exempt path
- **EU reverse charge:**
  - SE-tenant fulfilling to DE company with VAT + EU_REVERSE_CHARGE_EXEMPTION_RULE
    → all lines empty, warning "eu_reverse_charge_applied"
  - SE → SE company with reverse-charge code → does NOT apply (intra-country)
  - Customer-level exemption (not just company-location) also triggers
- **Source field:**
  - Every TaxLine emitted has `source: "builtin"`
  - `channelLiable: true` always (we are the channel)
- **Shipping:**
  - Shipping lines passed through with empty taxLines
- **Never throws:**
  - Pass garbage data → returns response with warnings, doesn't throw

**Checkpoint:** tsc 0 nya, vitest +25 nya passing.

---

### B.3 — Calculator core (orchestrator)

**Filer:**
- `app/_lib/tax/calculate.ts` (ny)
- `app/_lib/tax/calculate.test.ts` (ny)
- `app/_lib/tax/providers/registry.ts` (utökad — auto-register builtin)
- `app/_lib/tax/index.ts` (utökad — export `calculateTax`)

**Innehåll:**

```typescript
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import type { TaxRequest, TaxResponse } from "./types";
import {
  getTaxProvider,
  registerTaxProvider,
} from "./providers/interface";
import { builtinTaxProvider } from "./providers/builtin";

// Auto-register builtin on module load. Idempotent — registry
// rejects duplicates which we catch silently for hot-reload safety.
try {
  registerTaxProvider(builtinTaxProvider);
} catch {
  /* already registered (HMR / re-import) */
}

/**
 * Single calculator entry-point per master plan Decision 1.
 * Cart, Checkout, DraftOrder, Order all call this.
 *
 * Failure-mode tier (Decision 10 — always quote, never block):
 *   1. Resolved provider succeeds → return its response
 *   2. Resolved provider throws → log + tier-3
 *   3. Tier-3: zero-rate response with `source: "fallback_zero"`,
 *      warnings list explains why
 *
 * NEVER throws to caller. Caller can trust `await calculateTax(...)`
 * always returns a valid TaxResponse.
 */
export async function calculateTax(
  req: TaxRequest,
): Promise<TaxResponse> {
  // Resolve TenantTaxConfig for this region (or GLOBAL fallback)
  const fulfillmentCountry =
    req.fulfillmentLocation.countryCode.toUpperCase();
  const config = await resolveTaxConfig(
    req.tenantId,
    fulfillmentCountry,
  );

  const providerKey = config?.providerKey ?? "builtin";
  const provider = getTaxProvider(providerKey);

  if (!provider) {
    log("warn", "tax.calculate.provider_not_found", {
      tenantId: req.tenantId,
      providerKey,
      fulfillmentCountry,
    });
    return tierThreeFallback(
      req,
      `provider_not_registered:${providerKey}`,
    );
  }

  try {
    const result = await provider.calculate(req, {
      tenantId: req.tenantId,
      credentials: extractCredentials(config),
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "tax.calculate.provider_threw", {
      tenantId: req.tenantId,
      providerKey,
      error: msg,
    });
    return tierThreeFallback(req, `provider_threw:${msg}`);
  }
}

async function resolveTaxConfig(
  tenantId: string,
  countryCode: string,
): Promise<{ providerKey: string; credentials: unknown } | null> {
  // Try region-specific first, fall back to GLOBAL
  const config =
    (await prisma.tenantTaxConfig.findFirst({
      where: { tenantId, regionScope: countryCode, active: true },
    })) ??
    (await prisma.tenantTaxConfig.findFirst({
      where: { tenantId, regionScope: "GLOBAL", active: true },
    }));

  if (!config) return null;
  return { providerKey: config.providerKey, credentials: config.credentials };
}

function extractCredentials(
  config: { credentials: unknown } | null,
): Record<string, string> {
  if (!config?.credentials) return {};
  if (typeof config.credentials !== "object") return {};
  // TODO Tax-8 (Avalara): decrypt via INTEGRATION_ENCRYPTION_KEY
  return config.credentials as Record<string, string>;
}

function tierThreeFallback(
  req: TaxRequest,
  reason: string,
): TaxResponse {
  return {
    lines: req.lines.map((l) => ({ lineId: l.lineId, taxLines: [] })),
    shippingLines: req.shippingLines.map((s) => ({
      shippingLineId: s.shippingLineId ?? "shipping",
      taxLines: [],
    })),
    source: "fallback_zero",
    estimated: true,
    warnings: [`tier3_fallback:${reason}`],
  };
}
```

**Tests (15+ cases):**
- **Happy path:**
  - Builtin provider resolves + succeeds → response.source === "builtin"
  - Multi-tenant isolation (different tenant configs resolve different providers)
- **Tenant config resolution:**
  - Region-specific config beats GLOBAL
  - GLOBAL fallback works when no region-specific
  - No config at all → defaults to "builtin"
  - `active: false` → falls through (region-specific inactive → use GLOBAL)
- **Failure-mode tier-3:**
  - Provider key references unregistered provider → tier-3, source=fallback_zero, warning
  - Provider throws → tier-3, source=fallback_zero, warning includes error message
  - calculateTax NEVER throws (test: stubbed provider throws → no exception leaks)
- **TenantTaxConfig stored credentials:**
  - JSON object credentials passed through to provider context
  - Null credentials → empty object passed
  - Non-object credentials defensively → empty object
- **Builtin auto-registered:**
  - After module-load, getTaxProvider("builtin") returns provider
  - Re-import doesn't throw on duplicate registration

**Checkpoint:** tsc 0 nya, vitest +15 nya passing.

---

### B.4 — 12-decision parity tests

**Filer:**
- `app/_lib/tax/parity.test.ts` (ny — comprehensive integration test)

**Innehåll:**
A single test file that exercises all 12 master-plan lock-in decisions
end-to-end via `calculateTax()`. Each decision gets ≥1 dedicated test
with fixture explicitly demonstrating the contract.

Example structure:
```typescript
describe("Tax-1 parity — 12 lock-in decisions", () => {
  describe("Decision 1: single calculator, multiple callers", () => {
    it("same shape works for cart-style request (estimated=true)", ...);
    it("same shape works for order-style request (could be finalized)", ...);
  });

  describe("Decision 4: banker's rounding at line-level", () => {
    it("Shopify fixture: 2.685 → 2.68 öre (half-to-even down)", ...);
    it("Shopify fixture: 2.6982 → 2.70 öre (half-to-even up)", ...);
    it("multi-line: line-rounding sum differs from round-of-sum", ...);
  });

  describe("Decision 6: TaxCategory drives rate lookup", () => {
    it("ACCOMMODATION_HOTEL in SE → 12%", ...);
    it("RETAIL_GENERAL in SE → 25%", ...);
    it("FOOD_RESTAURANT in NO → 15%", ...);
  });

  describe("Decision 9: provider abstraction", () => {
    it("builtin auto-registered", ...);
    it("calculator dispatches to provider via key", ...);
    it("future provider can override via TenantTaxConfig", ...);
  });

  describe("Decision 10: failure mode — always quote", () => {
    it("provider throws → tier-3 fallback, calculator returns valid response", ...);
    it("unregistered provider → tier-3 fallback", ...);
    it("calculator never throws", ...);
  });

  describe("Decision 11: storage net, display formula", () => {
    it("calculator returns net values; inclusive math is caller's job", ...);
  });
});
```

**Why a separate parity-file?** Master plan §9 invariants. If a
future PR breaks any decision, this single file fails loud — easier
than auditing per-component tests.

**Checkpoint:** tsc 0 nya, vitest +15 nya passing.

---

### B.5 — Roadmap update

**Filer:**
- `_audit/draft-orders-roadmap.md` (utökad — Tax Engine section)

Update the Tax Engine table with Tax-1 row referencing PR commit-shas
+ verification stats.

---

## C — Filer som RÖRS

### Nya filer
- `app/_lib/tax/seed-rates.ts` + test
- `app/_lib/tax/providers/builtin.ts` + test
- `app/_lib/tax/calculate.ts` + test
- `app/_lib/tax/parity.test.ts`

### Modifierade filer
- `app/_lib/tax/providers/registry.ts` (auto-register builtin)
- `app/_lib/tax/index.ts` (barrel export `calculateTax`)
- `_audit/draft-orders-roadmap.md`

### EJ rörda
- `app/_lib/draft-orders/calculator/**` (Tax-2)
- `app/api/checkout/**` (Tax-3)
- `app/_lib/orders/process-paid-side-effects.ts` (Tax-3 + analytics)
- `prisma/schema.prisma`
- All UI
- All analytics-kod
- `CLAUDE.md`

---

## D — Q-decisions

### Q1 — Auto-register vs explicit-register builtin?

**Rekommendation:** **Auto-register on module load** (top of `calculate.ts`).
Idempotent (registry rejects duplicates, we catch silently for HMR).

**Motivering:** Calculator's first call must always have builtin
available. Forcing explicit-register at app-bootstrap couples tax
to lifecycle hooks we don't own.

**Alternativ:** Explicit `registerBuiltinProvider()` called from app
bootstrap. More predictable but adds dependency knot.

**Beslut:** advisory.

### Q2 — `calculateTax` async even though builtin is sync?

**Rekommendation:** **JA, async always.** TaxProvider interface is
already `Promise<TaxResponse>` (Q9 LOCKED in Tax-0). Future Avalara
adapter is async (HTTP). Better to commit to async surface from day 1.

**Beslut:** LOCKED — matches provider interface contract.

### Q3 — Region-scope fallback strategy

**Rekommendation:** **`countryCode` → `GLOBAL` → `"builtin"`-default**.
Region-specific (e.g. `SE`) wins over GLOBAL. GLOBAL wins over no-config
default.

**Motivering:** Multi-tenant SaaS where one tenant uses Avalara for US
but builtin for EU. Per-region config is the future Tax-8 deployment
shape; building it correctly now avoids refactor.

**Beslut:** LOCKED — matches master plan Decision 9.

### Q4 — Missing category in seed table → warning vs error?

**Rekommendation:** **Warning + zero tax for that line.** Consistent
with Decision 10 ("always quote, never block").

**Alternativ:** Throw → calculator catches in tier-3. Same end-result,
but warning-level surfaces operator earlier (line-level vs response-level).

**Beslut:** advisory.

### Q5 — Long-stay accommodation: rate=0 TaxLine vs no TaxLine?

**Rekommendation:** **Emit rate=0 TaxLine** with explanatory title.
Audit trail visible in timeline + tax reports.

**Motivering:** A row with rate=0 says "we considered tax for this
category, decision was zero by jurisdiction-rule". An empty taxLines[]
implies "we forgot or this is non-taxable input". Different semantics.

**Beslut:** advisory.

### Q6 — `lookupRate` case-sensitivity on country code

**Rekommendation:** **Normalize to uppercase** in `lookupRate`. Both
caller-provided lower/mixed-case and seed-table keys uppercase.
Helper does `.toUpperCase()` on input.

**Beslut:** LOCKED — defensive-by-default for ISO codes.

### Q7 — Reverse-charge sub-condition (intra-EU)

**Rekommendation:** Apply only when `buyerLocation.countryCode !==
fulfillmentLocation.countryCode`. Per Shopify's enum doc:
*"This customer is exempt from VAT for purchases within the EU that is
shipping from outside of customer's country."*

**Beslut:** LOCKED — matches Shopify spec.

### Q8 — `ACCOMMODATION_LONG_STAY` detection

**Rekommendation:** **Caller responsibility (Tax-2)** to map line into
LONG_STAY when stay > 30 days. Tax-1 just looks up the category.

**Motivering:** Days-calculation requires line-level dates which we
don't pass to calculator (master plan Decision 1: simple types). Caller
classifies; calculator computes.

**Beslut:** advisory.

### Q9 — `presentmentTaxAmount` in Tax-1 = `taxAmount` always?

**Rekommendation:** **JA i Tax-1.** Markets/FX wired in Tax-4.
Tax-0 backfill semantic preserved: `presentment* = shop *` until
real Markets-resolution lands.

**Beslut:** LOCKED — Tax-4 is when this can diverge.

### Q10 — Fact-check Nordic rates pre-implementation?

**Rekommendation:** **Operator confirms rates** before merge. Rate-
table is hand-curated from public tax-authority sources (Skatteverket,
Skatteetaten, Skat, Vero). Errors are legal-liability risk.

**Specific rates to verify:**
- SE: hospitality 12% (correct as of 2026-05)
- SE: long-stay >30d exempt (correct)
- NO: hospitality 12% (verify — may have changed)
- DK: flat 25% (correct, no reduced rates)
- FI: 25.5% standard (raised Sept 2024 from 24%, verify current)
- FI: hospitality 10% (verify)

**Beslut:** **operator-action required before merge.**

---

## E — Q-decisions sammanfattning

| Q | Status | Type |
|---|---|---|
| Q1 auto vs explicit register | OPEN | advisory |
| Q2 async always | LOCKED | — |
| Q3 region-scope fallback | LOCKED | — |
| Q4 missing category | OPEN | advisory |
| Q5 long-stay rate=0 emission | OPEN | advisory |
| Q6 case-insensitive country | LOCKED | — |
| Q7 reverse-charge sub-condition | LOCKED | — |
| Q8 long-stay detection at caller | OPEN | advisory |
| Q9 presentment = shop in Tax-1 | LOCKED | — |
| **Q10 rate fact-check** | **operator-action** | **before merge** |

**Totalt öppna:** 4 advisory, 1 operator-action. 5 LOCKED.

---

## F — Verifieringsplan (innan första push, Terminal Claude)

```bash
cd /workspaces/book-C/admin

npx tsc --noEmit 2>&1 | grep -cE "error TS"
# Expected: 3 (project baseline)

npx vitest run \
  app/_lib/tax/seed-rates.test.ts \
  app/_lib/tax/providers/builtin.test.ts \
  app/_lib/tax/calculate.test.ts \
  app/_lib/tax/parity.test.ts \
  2>&1 | tail -15
# Expected: all green, +70+ net new

npx eslint \
  app/_lib/tax/seed-rates.ts \
  app/_lib/tax/providers/builtin.ts \
  app/_lib/tax/calculate.ts \
  app/_lib/tax/providers/registry.ts \
  app/_lib/tax/index.ts \
  2>&1 | tail -10
# Expected: 0 errors

npm run build
# Expected: TypeScript compiles
```

---

## G — Cross-domain coord checklist

| Item | Status |
|---|---|
| PR #46 (Tax-0) merged | ✅ |
| Operator fact-checks Nordic rates per Q10 | ⚠ Pending — required before merge |
| Terminal A informed | Not required for Tax-1 (no schema, no analytics surface yet) |

---

## H — PR-strategi

När Tax-1 implementerat + verifierat:
- Öppna PR mot main
- Titel: `feat(tax-engine): Tax-1 — calculator core + builtin provider (Nordic V1)`
- Refererar tillbaka till master plan + Tax-1 recon
- Body:
  - Lista alla 12 lock-in-decisions och var i koden de implementeras
  - Verification-stats
  - Q10 rate-table — explicit "operator confirmed rates fact-checked"
- Tag operator för rate-review innan merge

---

## I — Stop-protocol-status

- Branch synced: ✓ from main @ `0415cee`
- Inga schema-changes: ✓
- Inga out-of-scope-filer: ✓
- Tax-0 merged: ✓
- Q10 operator-action: pending
