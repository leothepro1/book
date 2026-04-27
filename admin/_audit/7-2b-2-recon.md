# FAS 7.2b.2 — Recon Audit

**Datum:** 2026-04-27
**Branch:** main
**HEAD:** `fa3c5197cb54ad9f4de0221c47df20bbbbfe5473` (= origin/main; PR #6 merge för 7.2b.1)
**Författare av recon:** Claude (auto)
**Status:** RECON COMPLETE — implementation pending operator-godkännande av D.6 Q-decisions.

---

## Baseline (locked)

```
NEW BASELINE LOCKED: 21 failed / 2547 passed / 4 skipped, 3 tsc errors
```

**Baseline-discrepancy noted**: +21 passed vs handoff-spec (2526 → 2547),
no failure delta, no tsc delta, no commits i `**/draft-orders/**` mellan
7.2b.1 close och denna recon. Klassificerat harmlöst — sannolikt
parallell-terminal-tester landade i andra territorier (7.0/URL-konsolidering).
HEAD = origin/main = `fa3c519`, ingen drift på `main`.

**Samma 3 tsc-errors som handoff:**
- `app/(admin)/accommodations/actions.test.ts:145` — TS2352 null→{seo}
- `app/(admin)/accommodations/actions.test.ts:313` — TS2352 null→{seo}
- `app/(admin)/accommodations/actions.test.ts:364` — TS2352 null→{seo}

**Checkpoint efter varje sub-step:** `npx tsc --noEmit` ⇒ exakt dessa 3,
`npm test -- --run` ⇒ 21 failed / ≥2547 passed / 4 skipped.

---

## Pattern-recon-summary (evidens från §C)

### Modal-pattern (paritet-källa korrigerad efter handoff-feedback)

**Locked:** `app/(admin)/draft-orders/new/_components/AccommodationPickerModal.tsx`
(7.2b.1, canon per CLAUDE.md). DiscountForm är OUTLIER (inline-styles +
`createPortal` + multi-select checkboxes) och används INTE som källa.

Konkret modal-pattern att kopiera:
- Wrapper: `<div className="am-overlay am-overlay--visible" onClick={onClose}>`
- Inner: `<div className="am-modal" onClick={(e) => e.stopPropagation()}>`
- Header: `am-modal__header` + `am-modal__title` + `<button className="am-modal__close" aria-label="Stäng">×</button>`
- Body: `am-modal__body`
- Footer: `am-modal__footer` (ej använt i CustomerPicker — single-select stänger på rad-klick)
- CSS-källa: `app/(admin)/gift-cards/gift-cards.css:206-280` — redan importerad i `NewDraftOrderClient.tsx:6`

Debounce-pattern (från `AccommodationPickerModal.tsx:32-50`):
```ts
useEffect(() => {
  const timer = setTimeout(() => setDebouncedQuery(query), 300);
  return () => clearTimeout(timer);
}, [query]);

useEffect(() => {
  let cancelled = false;
  (async () => {
    setIsSearching(true);
    const r = await searchAccommodationsAction(debouncedQuery);
    if (!cancelled) { setResults(r); setIsSearching(false); }
  })();
  return () => { cancelled = true; };
}, [debouncedQuery]);
```

**Stale-response guard:** `cancelled`-flag i cleanup-funktionen. Ingen
explicit `AbortController` — pattern är "ignorera sen response" snarare
än "abort fetch", vilket räcker för server-actions.

### Service-kontrakt

**`searchCustomers(tenantId, q, opts?)`** (`app/_lib/draft-orders/search-customers.ts`):
- `q.trim().length === 0` → returnerar `[]` (line 72) — INTE "nyligen aktiva"
- DTO: `{ id, email, name: string|null, phone: string|null, draftOrderCount, orderCount }`
- Default limit: 10. Sort: `[{ updatedAt: "desc" }, { id: "asc" }]`
- Phone visas men söks inte (`T-no-phone-search`)

**`previewDraftTotals(input)`** (`app/_lib/draft-orders/preview-totals.ts`):
- Input: `{ tenantId, lines: PreviewLineInput[], discountCode?, currency? }`
- `PreviewLineInput`: `{ accommodationId, fromDate: Date, toDate: Date, guestCount, ratePlanId?, addons? }`
- `PreviewResult`: alla pengar `bigint` (`subtotal`, `discountAmount`, `taxAmount`, `total`)
- `lineBreakdown[i]`: `{ lineIndex, accommodationId, nights, pricePerNight: bigint, lineSubtotal: bigint, addonsTotal: bigint, unavailable?, unavailableReason? }`
- Tomma lines → all-zero result (line 116). Cross-tenant accommodation → fail-closed all-zero.
- **Discount soft-fail**: ogiltig kod kastar INTE — `discountApplicable: false` + `discountError: string` (line 234-281)
- Currency-källa: `params.currency ?? accommodations[0]?.currency ?? "SEK"`

### Befintlig UI i 7.2b.1 (C.4)

Grep `CustomerCard|CustomerPicker|DiscountCard|PricingSummary` mot
`app/(admin)/draft-orders/new/` ⇒ **0 träffar**. `customerId`/`guestAccountId` finns inte i
`NewDraftOrderClient.tsx` eller `_components/types.ts`.
`NewDraftOrderClient.tsx:72`: `<div className="pf-sidebar">{/* 7.2b.2/.3 territory */}</div>` —
explicit placeholder. Ren mark.

### CSS + utils inventory (C.5)

Befintliga `.ndr-*` i `new-draft-order.css`:
`ndr-line-list`, `ndr-line-row`, `ndr-line-row--problem`,
`ndr-line-row__main`, `ndr-line-row__title`, `ndr-line-row__meta`,
`ndr-line-row__status`, `ndr-line-row__reason`, `ndr-line-row__badge`,
`ndr-empty`, `ndr-acc-results`, `ndr-acc-results__status`,
`ndr-acc-result-row`, `ndr-acc-result-row__name`,
`ndr-acc-result-row__meta`, `ndr-field-label`.

`am-overlay`/`am-modal` definierade i `app/(admin)/gift-cards/gift-cards.css:206-280`,
importerade via `NewDraftOrderClient.tsx:6` (`"../../gift-cards/gift-cards.css"`). ✓

`formatSek` location: `app/_lib/money/format.ts`. Signatur (verifierad):
```ts
export function formatSek(
  value: bigint | number | null | undefined,
  opts?: { showDecimals?: boolean; currency?: string },
): string
```
**Tar `bigint` natively** — ingen `Number()`-cast behövs för
`PreviewResult.subtotal/discountAmount/taxAmount/total`. Q stryken.

### actions.ts wiring (C.6)

Existerande exports i `app/(admin)/draft-orders/new/actions.ts`:
- `searchAccommodationsAction(query) → Promise<AccommodationSearchResult[]>`
- `checkAvailabilityAction(accommodationId, fromDate, toDate)`
- `createDraftWithLinesAction(input)`

`searchCustomersAction` och `previewDraftTotalsAction` finns INTE.

**Tenant-resolution-pattern att matcha** (lines 15-23):
```ts
async function getTenantId(): Promise<string | null> {
  const { orgId } = await getAuth();
  if (!orgId) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  return tenant?.id ?? null;
}
```

### Discount-input casing (C.6 addendum)

`app/_lib/discounts/codes.ts:20-21`:
```ts
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}
```
DiscountCode lagras alltid normaliserad (CLAUDE.md "Discount invariants" #9).
DiscountForm-precedent (line 469): uppercase-on-keystroke (`setCodeInput(e.target.value.toUpperCase())`)
men ingen `trim` förrän submit. Vi följer DiscountForm för UX-konsistens —
se Q3 nedan för det slutliga valet.

### LocalLineItem date-shape (handoff addendum)

`_components/types.ts:9-10`:
```ts
fromDate: Date;
toDate: Date;
```
**Date-objekt redan** — ingen `new Date(line.fromDate)`-konvertering behövs i
preview-wiring. LineItemRow producerar Date direkt från `<input type="date">`-värden
i AccommodationPickerModal step 2 (lines 57-64). Skip preview-call när
`lines.length === 0`; varje line har redan `fromDate < toDate`-guard via canSave-logiken.

---

## D.1 — Component plan

| Komponent | Path | LOC-estimat | Ansvar |
|---|---|---|---|
| `CustomerCard.tsx` | `app/(admin)/draft-orders/new/_components/CustomerCard.tsx` | ~80 | Visa vald kund som rad (namn, email, badge med order-count) eller tom-state med "Lägg till kund"-knapp som öppnar `CustomerPickerModal`. |
| `CustomerPickerModal.tsx` | `app/(admin)/draft-orders/new/_components/CustomerPickerModal.tsx` | ~120 | Sök kunder via `searchCustomersAction`. Single-select: rad-klick = välj + close. Återanvänder `am-overlay`/`am-modal` + paritetsmodellerar `AccommodationPickerModal`. |
| `DiscountCard.tsx` | `app/(admin)/draft-orders/new/_components/DiscountCard.tsx` | ~90 | Input för rabattkod + "Tillämpa"-knapp. Visar tillämpad kod som pill med X. Visar inline error om `preview.discountApplicable === false`. |
| `PricingSummaryCard.tsx` | `app/(admin)/draft-orders/new/_components/PricingSummaryCard.tsx` | ~70 | Renderar `preview` (subtotal, discountAmount, taxAmount, total) via `formatSek(bigint)`. Pre-preview tom-state. Loading-state under fetch. |

**Total beräknat tillägg:** ~360 LOC + tester per komponent (~250 LOC).

---

## D.2 — UI-design per komponent

### CustomerCard

```
┌─ Kund ───────────────────────────────────┐ (pf-card-title)
│  [Tom-state]                             │
│   ┌──────────────────────────────────┐   │
│   │ + Lägg till kund                 │   │  (settings-btn--outline, full bredd)
│   └──────────────────────────────────┘   │
│                                          │
│  [Vald-state]                            │
│   ▶ Anna Andersson                       │  (ndr-line-row-style)
│     anna@example.se · 3 ordrar           │
│                            [Byt] [×]     │
└──────────────────────────────────────────┘
```

States:
- **empty**: knapp "+ Lägg till kund" (`settings-btn--outline`)
- **selected**: rad med namn + email + `(N ordrar)`-badge, X-ikon för rensa, "Byt"-länk för öppna modal igen
- **loading**: ej tillämpligt — selection är synkron
- **error**: ej tillämpligt — kund antingen vald eller ej

Klassnamn-användning:
- Nya: `.ndr-customer-card`, `.ndr-customer-card__row`, `.ndr-customer-card__name`, `.ndr-customer-card__meta`, `.ndr-customer-card__actions`
- Reuse: `.settings-btn--outline`, `.pf-card-title`, `.admin-text-muted`

### CustomerPickerModal

```
am-overlay
└─ am-modal (am-modal__title="Välj kund")
   ├─ am-modal__header
   │    Välj kund            [×]
   ├─ am-modal__body
   │    [admin-input] Sök på namn eller e-post...
   │    ┌── ndr-customer-results ────┐
   │    │ (q="" → hint, q≠"" → list/empty/loading) │
   │    └────────────────────────────┘
   └─ am-modal__footer
        [Avbryt]
```

States:
- **empty (q="")**: `<div className="ndr-customer-results__hint">Sök på namn eller e-post</div>`
- **loading (q≠"" && isSearching)**: `<div className="ndr-acc-results__status">Söker…</div>` (matcha AccommodationPicker text)
- **empty results (q≠"" && !isSearching && results.length === 0)**: `<div className="ndr-acc-results__status">Inga matchningar</div>`
- **selected (rad-klick)**: anropa `onSelect(customer)` + `onClose()` synkront, ingen Klar-knapp

Klassnamn:
- Nya: `.ndr-customer-results`, `.ndr-customer-results__hint`, `.ndr-customer-result-row`, `.ndr-customer-result-row__name`, `.ndr-customer-result-row__meta` (parallellt med `.ndr-acc-*`-pattern)
- Reuse: `am-overlay`, `am-modal`, `am-modal__header/__title/__close/__body/__footer`, `admin-input`, `admin-btn admin-btn--ghost`

### DiscountCard

```
┌─ Rabatt ─────────────────────────────────┐
│  [Tom-state]                             │
│   [admin-input "Rabattkod"] [Tillämpa]   │
│                                          │
│  [Tillämpad + ok]                        │
│    SOMMAR2026   −500 kr             [×]  │  (pill med belopp från preview.discountAmount)
│                                          │
│  [Tillämpad + ogiltig (soft-fail)]       │
│    SOMMAR2026                       [×]  │
│    ↳ "Koden är inte längre giltig"       │  (preview.discountError, röd text)
└──────────────────────────────────────────┘
```

States:
- **empty (discountApplied=false, discountCode=""**): input + Tillämpa-knapp
- **applying** (transient): visa input som disabled, Tillämpa-knapp visar "..."
- **applied + ok (discountApplied=true && preview.discountApplicable)**: pill med kod + belopp, X-knapp
- **applied + invalid (discountApplied=true && !preview.discountApplicable)**: pill med kod + X, röd error-text under pill från `preview.discountError`
- **error (server-action throw)**: `<div className="pf-error-banner">Kunde inte verifiera rabatt</div>` (osannolikt — service kastar inte)

Klassnamn:
- Nya: `.ndr-discount-card`, `.ndr-discount-pill`, `.ndr-discount-pill__amount`, `.ndr-discount-pill__remove`, `.ndr-discount-error`
- Reuse: `.admin-input`, `.settings-btn--connect` (för Tillämpa)

### PricingSummaryCard

```
┌─ Sammanfattning ─────────────────────────┐
│  [Pre-preview tom-state]                 │
│   "Lägg till boende för att se totalsumma" │
│                                          │
│  [Loaded + no discount]                  │
│   Delsumma                    1 250 kr   │
│   Moms                          150 kr   │
│   ─────────────────────────────────────  │
│   Totalt                      1 400 kr   │
│                                          │
│  [Loaded + discount]                     │
│   Delsumma                    1 250 kr   │
│   Rabatt (SOMMAR2026)         −250 kr   │
│   Moms                          150 kr   │
│   ─────────────────────────────────────  │
│   Totalt                      1 150 kr   │
│                                          │
│  [Loading (preview in-flight)]           │
│   (rader visade men dim:0.5)             │
└──────────────────────────────────────────┘
```

States:
- **pre-preview (lines=[] || preview === null)**: placeholder-text
- **loading (isPreviewing)**: dim totals (opacity 0.5), behåll layout, ingen spinner
- **loaded ok**: render rader
- **loaded with discount-error**: render utan discount-rad, visa error inline i DiscountCard
- **error (server kastar — sällsynt)**: `<div className="pf-error-banner">Kunde inte beräkna totaler</div>`

Klassnamn:
- Nya: `.ndr-pricing`, `.ndr-pricing--loading`, `.ndr-pricing__row`, `.ndr-pricing__label`, `.ndr-pricing__amount`, `.ndr-pricing__total`, `.ndr-pricing__placeholder`
- Reuse: `formatSek` för all formatering

---

## D.3 — Live-preview wiring

### Trigger-källor
`useEffect` med deps:
```ts
[
  JSON.stringify(lines.map(l => ({
    id: l.accommodation.id,
    f: l.fromDate.getTime(),
    t: l.toDate.getTime(),
    g: l.guestCount,
  }))),
  customerId,
  discountApplied ? discountCode : null,  // ignorera otillämpad kod
]
```

`JSON.stringify`-cache-key krävs eftersom `lines` är array av objekt — ref-jämförelse triggar för ofta. Alternativ: explicit memo-hash via `useMemo`.

### Debounce
**500ms** (per handoff-spec). Längre än modal-search (300ms) eftersom preview slår tunga PMS-anrop. Implementeras med `setTimeout` i useEffect.

### useEffect cleanup-pattern
```ts
useEffect(() => {
  if (lines.length === 0 || lines.some(l => !l.fromDate || !l.toDate)) {
    setPreview(null);
    return;
  }
  let cancelled = false;
  const reqId = ++requestIdRef.current;
  const timer = setTimeout(async () => {
    setIsPreviewing(true);
    setPreviewError(null);
    try {
      const result = await previewDraftTotalsAction({
        lines: lines.map(l => ({
          accommodationId: l.accommodation.id,
          fromDate: l.fromDate,
          toDate: l.toDate,
          guestCount: l.guestCount,
        })),
        discountCode: discountApplied ? discountCode : undefined,
      });
      if (!cancelled && reqId === requestIdRef.current) {
        setPreview(result);
      }
    } catch (err) {
      if (!cancelled && reqId === requestIdRef.current) {
        setPreviewError(err instanceof Error ? err.message : "Preview misslyckades");
      }
    } finally {
      if (!cancelled && reqId === requestIdRef.current) {
        setIsPreviewing(false);
      }
    }
  }, 500);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}, [/* deps som ovan */]);
```

### Stale-response guard
`requestIdRef = useRef<number>(0)` inkrementeras vid varje fetch. Response
jämförs mot `requestIdRef.current` — discardas om stale (Leo redigerar
snabbt och två fetches är in-flight). Plus `cancelled`-flag som backup
om unmount sker mitt i fetchet.

### UI under fetch
**Beslut: dim totals + behåll layout** (Q5 advisory, default-rekommendation).
Ingen spinner i hörnet — för stökigt med 500ms debounce + tunga payloads.

### Error-handling
Om `previewDraftTotalsAction` kastar (t.ex. Zod-validation, DB-fel):
- `setPreviewError(message)`
- PricingSummaryCard renderar `<div className="pf-error-banner">{previewError}</div>`
- Save förblir möjligt om lines är giltiga (preview är hjälpmedel, inte gating)

### Cross-tenant fail-closed
Om service returnerar `emptyResult()` pga cross-tenant accommodationId:
PricingSummaryCard ser `subtotal === 0n && lines.length > 0` → visa
`"Kunde inte beräkna totaler"`-banner. Ska inte hända i normal flow
(LineItemsCard filtrerar redan på tenant) men UI får inte krascha.

---

## D.4 — State-shape i `NewDraftOrderClient`

```ts
// Befintligt (oförändrat)
const [lines, setLines] = useState<LocalLineItem[]>([]);
const [saveError, setSaveError] = useState<string | null>(null);
const [conflictingLineTempIds, setConflictingLineTempIds] = useState<string[]>([]);
const [isSaving, startSaveTransition] = useTransition();

// Tillkommer i 7.2b.2
const [customerId, setCustomerId] = useState<string | null>(null);
const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
const [discountCode, setDiscountCode] = useState<string>("");          // input value, ej trimmad
const [discountApplied, setDiscountApplied] = useState<boolean>(false); // true efter "Tillämpa"-klick
const [preview, setPreview] = useState<PreviewResult | null>(null);
const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
const [previewError, setPreviewError] = useState<string | null>(null);

// Refs för stale-response guard
const requestIdRef = useRef<number>(0);
```

**Typer importeras från:**
- `CustomerSearchResult` från `@/app/_lib/draft-orders` (re-export från `search-customers.ts`)
- `PreviewResult` från `@/app/_lib/draft-orders` (re-export från `preview-totals.ts`)

`createDraftWithLinesAction` payload utökas i **7.2b.3** (inte i denna fas) med
`customerId` + `discountCode`. För 7.2b.2 är preview READ-ONLY — ingen
mutation-action ändras. Detta håller diff-ytan minimal.

---

## D.5 — Sub-step plan B.1 → B.6

### B.1 — Action-skelett: `searchCustomersAction` + `previewDraftTotalsAction`
- **Filer:** `app/(admin)/draft-orders/new/actions.ts`
- **Innehåll:** två nya server-actions som anropar service-funktionerna,
  matchar `getTenantId()`-pattern, returnerar `[]` resp. `null` vid ingen tenant.
- **Test:** `actions.test.ts` — 2 nya tester per action (success + no-tenant)
- **Checkpoint:** tsc ⇒ 3 baseline, tests ⇒ 21 failed / ≥2549 passed / 4 skipped

### B.2 — `CustomerPickerModal` + `CustomerCard`
- **Filer:**
  - `_components/CustomerPickerModal.tsx` (ny)
  - `_components/CustomerPickerModal.test.tsx` (ny)
  - `_components/CustomerCard.tsx` (ny)
  - `_components/CustomerCard.test.tsx` (ny)
  - `_components/types.ts` (utökad — `LocalCustomer` om vi vill ha lokal subset, annars använd `CustomerSearchResult` direkt)
  - `new-draft-order.css` (utökad — `.ndr-customer-*` classes)
- **Innehåll:** modal söker via `searchCustomersAction` med 300ms debounce;
  rad-klick = `onSelect(customer)` + `onClose()`; CustomerCard visar tom-state
  eller vald-state med Byt/X.
- **Wiring i NewDraftOrderClient:** lägg till `customerId`, `customer` state +
  rendera CustomerCard i `pf-sidebar`.
- **Test:** modal: empty/loading/results/select. card: empty/selected/byt/remove.
- **Checkpoint:** tsc ⇒ 3, tests ⇒ ≥2553 passed.

### B.3 — `DiscountCard`
- **Filer:**
  - `_components/DiscountCard.tsx` (ny)
  - `_components/DiscountCard.test.tsx` (ny)
  - `new-draft-order.css` (utökad — `.ndr-discount-*` classes)
- **Innehåll:** input + Tillämpa-knapp → `setDiscountCode` (uppercase-on-keystroke
  med slutlig `trim()` vid Tillämpa). När tillämpad: pill med X. Error från
  `preview.discountError` visas inline.
- **Wiring i NewDraftOrderClient:** lägg till `discountCode`, `discountApplied`
  state + rendera DiscountCard i `pf-sidebar`. (Beror på B.4 för error-display.)
- **Test:** input/apply/remove/error-display.
- **Checkpoint:** tsc ⇒ 3, tests ⇒ ≥2557 passed.

### B.4 — `PricingSummaryCard` + preview wiring
- **Filer:**
  - `_components/PricingSummaryCard.tsx` (ny)
  - `_components/PricingSummaryCard.test.tsx` (ny)
  - `NewDraftOrderClient.tsx` (utökad — preview useEffect + state)
  - `new-draft-order.css` (utökad — `.ndr-pricing-*` classes)
- **Innehåll:** preview-effect med 500ms debounce + stale-response guard;
  PricingSummaryCard renderar `formatSek(bigint)` direkt; tom-state, loading,
  loaded states.
- **Test:** preview useEffect (mockad action), card states.
- **Checkpoint:** tsc ⇒ 3, tests ⇒ ≥2561 passed.

### B.5 — Integration test för NewDraftOrderClient
- **Filer:** `NewDraftOrderClient.test.tsx` (utökad)
- **Innehåll:** 4 nya scenarier:
  - lägg till boende → preview-fetch triggas
  - lägg till kund → renderas i CustomerCard
  - tillämpa rabatt → pill visas, preview re-fetchas med discountCode
  - ogiltig rabatt → preview returnerar `discountApplicable: false`, error-text visas under pill
- **Checkpoint:** tsc ⇒ 3, tests ⇒ ≥2565 passed.

### B.6 — Smoke + commit
- **Filer:** ingen kod, bara körning
- **Innehåll:** `npm run dev` på port 3000, manuell rökgang i browser:
  - lägg till boende → preview visas
  - lägg till kund → CustomerCard renderas
  - tillämpa rabatt → preview uppdateras
  - lägg till ogiltig rabatt → error visas
  - rensa allt → tom-state
- **Checkpoint:** tsc ⇒ 3, tests ⇒ ≥2565 passed, dev-server svarar 200,
  ingen console error / hydration warning. Commit som `feat(draft-orders): FAS 7.2b.2: customer + discount + live preview`.

### Naturliga grupperingar (alternativ packaging)
Om 6 steg känns för mycket för en singel PR:
- **PR-A (B.1 + B.2):** "Customer picker" — minimum koherent enhet
- **PR-B (B.3 + B.4 + B.5 + B.6):** "Discount + live preview" — hänger ihop tight, splitting bryter integrationen

Rekommendation: **en PR, sex commits** (matchar 7.2b.1 cadence och håller
diff-ytan reviewable).

---

## D.6 — Q-decisions

### Q1 — Modal-pattern
**LOCKED — ingen Q.** Locked till `AccommodationPickerModal`-pattern (am-overlay/am-modal,
single-step, BEM-klassnamn, useEffect-debounce 300ms med cancelled-flag).

### Q2 — Customer empty-search-beteende
**LOCKED — ingen Q.** Servicen returnerar `[]` vid `q.trim() === ""`. UI visar
hint-text "Sök på namn eller e-post".

### Q3 — Discount-input casing (advisory)
**Rekommendation:** uppercase-on-keystroke (`setDiscountCode(e.target.value.toUpperCase())`),
final `trim()` vid Tillämpa-klick. Matchar DiscountForm-precedent och `normalizeCode()`-output.

**Evidens:** `app/_lib/discounts/codes.ts:20-21` definierar
`normalizeCode = trim().toUpperCase()`. DiscountForm:469 implementerar
uppercase-on-keystroke utan trim under typing.

**Alternativ:** lämna ifred under typing, normalisera bara vid Tillämpa.
Risk: visuell inkonsistens (lower-case input + UPPERCASE pill). Avråds.

**Beslut:** advisory — gå med rekommendation om inget annat sägs.

### Q4 — Preview-loading UI (advisory)
**Rekommendation:** dim totals (opacity 0.5) + behåll layout. Ingen spinner.

**Motivering:** 500ms debounce gör att fetch inte triggas vid varje keystroke;
spinner skulle blinka snabbt. Dim är subtilare och behåller informationen.

**Alternativ:** spinner i hörnet av kortet (Shopify-style). Mer explicit men
visuellt brusigare i en sidopanel.

**Beslut:** advisory — gå med rekommendation om inget annat sägs.

### Q5 — Customer remove-UX (advisory)
**Rekommendation:** **Båda** — pill-X (snabb rensa) + "Byt"-länk (öppna modal igen utan att rensa val först).
Matchar både discount-pill-pattern (X) och bättre UX för "av misstag valde fel kund".

**Alternativ A:** bara pill-X. Renare men kräver dubbelklick (rensa + lägg till) för byte.
**Alternativ B:** bara "Byt"-länk. Tvingar fram modal även om man bara vill rensa.

**Beslut:** advisory — gå med rekommendation om inget annat sägs.

### Q6 — PricingSummary pre-preview tom-state (advisory)
**Rekommendation:** placeholder-text *"Lägg till boende för att se totalsumma"* —
INGEN noll-rader (`0 kr × 4`).

**Motivering:** noll-rader signalerar att totaler är beräknade men noll, vilket
är vilseledande. Placeholder klargör att preview kommer när det finns input.

**Alternativ:** noll-rader (kompaktare layout-skiftning).

**Beslut:** advisory — gå med rekommendation om inget annat sägs.

### Q7 — Pre-preview currency-suffix (advisory, ny)
**Rekommendation:** dölj currency-suffix tills första preview kommer.
Placeholder-staten har ingen `formatSek`-call, så frågan löses av sig själv.

**Beslut:** advisory — automatiskt löst av Q6.

### Q8 — formatSek bigint-support
**RESOLVED — ingen Q.** `formatSek(value: bigint | number | null | undefined)`
verifierad — tar bigint natively. Ingen cast behövs.

### Q9 — LocalLineItem date-shape
**RESOLVED — ingen Q.** `types.ts:9-10` bekräftar `fromDate: Date, toDate: Date`
(Date-objekt, inte ISO-strings). Direkt mappning till `PreviewLineInput.fromDate`.
Skip preview-call när `lines.length === 0`. Inga invalid-date-edge cases att
hantera (LineItemsCard säkrar `fromDate < toDate` redan).

### Q10 — ny: LocalCustomer-typ vs CustomerSearchResult direkt (advisory)
Ska vi ha en lokal subset-typ `LocalCustomer = Pick<CustomerSearchResult, "id"|"email"|"name">`
i `_components/types.ts` (matchar `LocalLineItem`-pattern) eller använda
`CustomerSearchResult` direkt?

**Rekommendation:** använd `CustomerSearchResult` direkt. Skälet `LocalLineItem`
existerar är att den lägger till `tempId` + `availability` lokalt; för kund finns
inget motsvarande behov. Spar en typ-definition.

**Beslut:** advisory — gå med rekommendation om inget annat sägs.

---

### Sammanfattning Q-decisions

| Q | Status | Type |
|---|---|---|
| Q1 modal-pattern | LOCKED | — |
| Q2 customer empty-search | LOCKED | — |
| Q3 discount casing | OPEN | advisory |
| Q4 preview-loading UI | OPEN | advisory |
| Q5 customer remove-UX | OPEN | advisory |
| Q6 pricing pre-preview tom-state | OPEN | advisory |
| Q7 pre-preview currency-suffix | RESOLVED | — |
| Q8 formatSek bigint | RESOLVED | — |
| Q9 LocalLineItem date-shape | RESOLVED | — |
| Q10 LocalCustomer-typ | OPEN | advisory |

**Totalt öppna:** 5 advisory, 0 blocking.

Alla 5 advisories har default-rekommendationer ovan. Om operator inte
opponerar kör vi rekommendationen utan ytterligare check-in.

---

## Stop-protocol-status

- §A oväntat state → ✓ resolved (extra `../.claude/settings.local.json` klassad HARNESS-ONLY av operator)
- §B baseline avviker → ✓ resolved (operator lockat 2547 passed; harmlöst tillägg utanför vårt territorium)
- §C divergens från handoff (modal-pattern) → ✓ resolved (locked till AccommodationPickerModal-pattern)
- Ny commit på origin/main mellan §A-fetch och audit-skrivning → not detected (HEAD oförändrat)

**Inga halts kvar.** Implementation kan starta efter operator godkänner D.6 advisories
eller godkänner default-rekommendationerna.
