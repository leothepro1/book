# FAS 7.8 — Bulk-actions på `/draft-orders` index (recon)

**Datum:** 2026-05-03
**Branch:** `claude/initial-setup-JVMgE`
**HEAD vid recon-start:** `202a3ad`
**Författare:** Claude (Terminal B, web)
**Status:** RECON COMPLETE — implementation pending operator-godkännande av D Q-decisions.

---

## Mål

Operatör kan idag bara köra lifecycle-actions en draft i taget via
`/draft-orders/[id]/konfigurera`. Vid hög volym (B2B-pipeline med 50+
företag, sommarrush med många reservationsförfrågningar) blir detta
en flaskhals — en enklare bulk-yta gör daglig drift signifikant
snabbare utan att kompromissa state-machine-integriteten.

Selection-state är redan partiellt byggd i `DraftOrdersClient.tsx`
(rad 65: `selectedIds`-Set, rad 215+: header-checkbox, rad 318+:
per-row checkbox). Det som saknas är **bulk-action-bar + actions**
som faktiskt utför något när rader är valda.

---

## Stop-protocol

- Out-of-scope (Terminal A): all analytics-kod
- INGA schema-changes
- INGA ändringar i `state-machine.ts` — bulk operationer ska gå genom
  exakt samma transitions som single-action
- INGA bulk SQL-updates som kringgår `transitionDraftStatusInTx`/
  `cancelDraft`/`sendInvoice`/`resendInvoice` — varje rad måste gå
  genom befintlig service-lager

Baseline (locked från FAS 7.5 verification):
- `npx tsc --noEmit` — 0 errors i Terminal B scope (4 pre-existing baseline)
- Vitest suite — gröna i Terminal B scope
- ESLint — 0 errors i Terminal B scope

---

## A — Befintliga byggstenar (locked)

### A.1 — Selection-state i `DraftOrdersClient.tsx`
- `selectedIds: Set<string>` (rad 65)
- `selectAll()` / `clearAll()` / per-row toggle (rad 122–137)
- Header-checkbox med tri-state UX (`allSelected`/`someSelected`)
- "X valda"-counter + dropdown med "Markera alla" / "Avmarkera alla"
- **Inte använt än** — selection finns men leder ingenstans

### A.2 — Service-lagret (alla redan klara)
- `cancelDraft` (lifecycle.ts) — single-row cancel med hold-release
- `sendInvoice` (lifecycle.ts) — kräver pricesFrozenAt; idempotent replay finns
- `resendInvoice` (resend-invoice.ts, FAS 7.4) — för INVOICED/OVERDUE
- `freezePrices` (lifecycle.ts) — dependency för sendInvoice

### A.3 — Befintliga server actions
- `cancelDraftAction({ draftId, reason? })`
- `sendDraftInvoiceAction({ draftId })` — wrappar freeze+send+email
- `resendDraftInvoiceAction({ draftId, ... })`

### A.4 — UI-mönster att återanvända
- `ConfirmModal` — för confirm-dialogs (textarea för reason etc.)
- Toast/banner-pattern från `KonfigureraClient` — för success/error
- Dropdown-pattern från `HeaderActionsDropdown` — för bulk-action-meny

### A.5 — Concurrency-pool (`_lib/concurrency/pool.ts`)
- `runWithPool` finns — bounded concurrency utan ny dependency
- Använd för server-side bulk-loop (skydda Stripe/PMS från burst)

---

## B — Implementation-plan

> 5 commits, en sammanhållen PR. Hela fasen utvecklas + verifieras
> lokalt innan första push. Ingen mikropush.

### B.1 — Bulk server-actions (4 nya)
**Filer:**
- `app/(admin)/draft-orders/actions.ts` (utökad — 3 nya bulk-actions)
- `app/(admin)/draft-orders/actions.test.ts` (utökad)

**Innehåll — Result-shape (gemensam):**
```ts
export type BulkResult = {
  ok: true;
  total: number;
  succeeded: string[];           // draftIds
  failed: { draftId: string; error: string }[];
  skipped: { draftId: string; reason: string }[];  // pre-condition
};
| { ok: false; error: string };  // fundamental failure (no tenant etc.)
```

**Actions:**
1. `bulkCancelDraftsAction({ draftIds: string[], reason?: string })`
   - Per row: `cancelDraft({ tenantId, draftOrderId, reason, actorSource: "admin_ui_bulk" })`
   - Pool concurrency: 4 (recon Q3)
   - Pre-condition skip: status ∈ {CANCELLED, COMPLETED, REJECTED} → skip with reason
   - PAID with no reason → skip ("PAID requires reason")

2. `bulkResendInvoiceAction({ draftIds: string[] })`
   - Per row: `resendInvoice({ tenantId, draftOrderId, actorUserId })` + best-effort email
   - Pool concurrency: 4 (Stripe rate-limit hänsyn)
   - Pre-condition skip: status ∉ {INVOICED, OVERDUE}

3. `bulkSendInvoiceAction({ draftIds: string[] })`
   - Per row: same auto-freeze+send+email pattern as sendDraftInvoiceAction
   - Pool concurrency: 4
   - Pre-condition skip: status ∉ {OPEN, APPROVED} OR
     (status=OPEN AND no line items) OR (totalCents <= 0)

**Common pattern per row:**
```ts
try {
  await service({ ... });
  return { kind: "ok", draftId };
} catch (err) {
  if (err instanceof ValidationError) return { kind: "skip", draftId, reason: err.message };
  if (err instanceof ConflictError)   return { kind: "skip", draftId, reason: err.message };
  return { kind: "fail", draftId, error: err.message };
}
```

**Tests (15+ cases):**
- Per action: empty array, single-item, mixed-status, all-skip, all-fail, partial
- Tenant-scoping: verifierar att andra tenants drafts INTE behandlas
- Concurrency: ingen "all serial" race-baked test, men verifierar att pool anropas
- ValidationError + ConflictError mappas till skipped, andra till failed

**Checkpoint:** tsc 0 i scope, vitest +15 passerande.

---

### B.2 — `BulkActionBar`-komponent
**Filer:**
- `app/(admin)/draft-orders/_components/BulkActionBar.tsx` (ny)
- `app/(admin)/draft-orders/_components/BulkActionBar.test.tsx` (ny)
- `app/(admin)/draft-orders/_components/BulkActionBar.css` (ny — eller utökad i existerande draft-orders.css)

**Innehåll:**
- Sticky bar som visas när `selectedIds.size > 0`
- Vänster: "{N} valda • [Avmarkera]"
- Höger: action-knappar (kontextkänsliga eller alltid synliga; recon Q1)
  - "Skicka faktura"
  - "Skicka om faktura"
  - "Avbryt utkast" (danger)
- Klick → öppnar ConfirmModal (delegeras till parent via callbacks)
- Nedan: progressbar/banner under exekvering (recon Q4)

**Props:**
```ts
type BulkActionBarProps = {
  selectedCount: number;
  onClearSelection: () => void;
  onSendInvoice: () => void;
  onResendInvoice: () => void;
  onCancel: () => void;
  pending: boolean;
};
```

**Tests:** snapshot, callback-trigger, pending-state knappar disabled.

**Checkpoint:** tsc 0 i scope, vitest stabilt.

---

### B.3 — `BulkResultModal`-komponent
**Filer:**
- `app/(admin)/draft-orders/_components/BulkResultModal.tsx` (ny)
- `app/(admin)/draft-orders/_components/BulkResultModal.test.tsx` (ny)

**Innehåll:**
- Modal som visas efter bulk-action slutförts
- Header: "Bulk-resultat: X lyckade, Y skippade, Z fel"
- Lista per-row outcome (utkast-nummer + status/reason/error)
- "Stäng"-CTA + ev. "Försök igen för fel" om failed > 0
- Återanvänder modal-pattern (am-overlay/am-modal) från andra
  draft-order-modaler

**Tests:** snapshot för (all-ok / mixed / all-fail), close-callback.

**Checkpoint:** tsc 0 i scope, vitest stabilt.

---

### B.4 — Wiring i `DraftOrdersClient.tsx`
**Filer:**
- `app/(admin)/draft-orders/DraftOrdersClient.tsx` (utökad)
- `app/(admin)/draft-orders/DraftOrdersClient.test.tsx` (utökad)

**Innehåll:**
- Importera `BulkActionBar` + `BulkResultModal` + bulk-actions
- Lägg till state: `confirmKind: "bulk-cancel" | "bulk-send" | "bulk-resend" | null`
- `bulkPending: boolean`, `bulkResult: BulkResult | null`
- Render `<BulkActionBar />` när `selectedIds.size > 0`
- ConfirmModal per bulk-kind (cancel kräver textarea för reason)
- On-confirm: anropa rätt action med `Array.from(selectedIds)` → spara
  resultatet → öppna `BulkResultModal` → `clearAll()` + `router.refresh()`
  efter close
- Wire ConfirmModal-cancel → bara stäng, behåll selection

**Tests (4 nya cases):**
- BulkActionBar visas när selection > 0, döljs när 0
- Klick "Skicka faktura" → confirm modal → mock confirm → action triggas med rätt array
- Bulk-result modal renderas efter action
- selection rensas efter close

**Checkpoint:** tsc 0 i scope, vitest stabilt + 4 nya passerande.

---

### B.5 — Roadmap-update
**Filer:**
- `_audit/draft-orders-roadmap.md`

**Innehåll:**
- Markera 7.8 som "implementerad" med commit-shas + verification

---

## C — Filer som RÖRS

### Nya filer
- `app/(admin)/draft-orders/_components/BulkActionBar.tsx`
- `app/(admin)/draft-orders/_components/BulkActionBar.test.tsx`
- `app/(admin)/draft-orders/_components/BulkResultModal.tsx`
- `app/(admin)/draft-orders/_components/BulkResultModal.test.tsx`
- (CSS-fil eller utökad existerande draft-orders-styles)

### Modifierade filer
- `app/(admin)/draft-orders/actions.ts` (+ test)
- `app/(admin)/draft-orders/DraftOrdersClient.tsx` (+ test)
- `_audit/draft-orders-roadmap.md`

### EJ rörda
- `_lib/draft-orders/**` (alla services oförändrade)
- `_lib/draft-orders/state-machine.ts`
- Schema, webhooks, email-registry, analytics-kod, allt under `(guest)/`

---

## D — Q-decisions

### Q1 — Action-knapparnas synlighet i BulkActionBar
**Rekommendation:** alltid synliga, men gråa när inget i selection
matchar pre-conditions.
**Motivering:** Shopify-pattern. Operatör vet vilka actions som finns
även när inget kan göras just nu — minskar surprise när knappen
"plötsligt" dyker upp efter selection-byte.
**Alternativ:** dynamiskt visa/dölja per selection-kompatibilitet.
Mer JS-logik, mer flicker-risk, mindre intuitivt.
**Beslut:** advisory.

### Q2 — Bulk-actions för V1
**Rekommendation:** **3 actions** — bulk-cancel, bulk-send-invoice,
bulk-resend-invoice.
**Skip för V1:**
- Bulk-mark-as-paid (multi-tenant safety, kräver per-row reference)
- Bulk-delete (drafts är append-only; expire-cron handlar)
- Bulk-export-CSV (separat fas, rör list-API)
- Bulk-freeze-prices (sendInvoice gör det automatiskt)
**Beslut:** advisory.

### Q3 — Concurrency-pool concurrency
**Rekommendation:** **4** parallel.
**Motivering:** Stripe API har default rate-limit på 100 req/sek per
account, men vi vill inte sluka hela budgeten. 4 parallel ger ~30
req/sek peak under bulk vilket är komfortabelt.
**Alternativ:** 8 (matchar cron-pattern). För aggressivt för
operator-action-flow.
**Beslut:** advisory.

### Q4 — UI under bulk-exekvering
**Rekommendation:** disable BulkActionBar-knappar + visa progress-text
("Bearbetar 12 av 50…") — INGEN spinner-overlay som blockerar listan.
Operatör kan fortfarande scrolla.
**Alternativ:** full-page spinner. För störande för operator-flow.
**Beslut:** advisory.

### Q5 — Resultat-presentation
**Rekommendation:** modal med per-row outcome (utkast-nummer +
status/reason). "Stäng"-CTA. Om failed > 0: ev. "Försök igen för X fel"
som re-kör endast failed-listan. Selection rensas vid close.
**Alternativ:** toast (för tunt vid 50+ rader).
**Beslut:** advisory.

### Q6 — Selection persistens vid pagination/sort/filter
**Rekommendation:** **rensa selection** vid pagination/sort/filter-byte.
**Motivering:** Shopify gör så. Cross-page selection är komplex och
felfrekvent UX. Operatör som vill agera på 100+ drafts ändrar
page-size i stället.
**Beslut:** LOCKED — för komplext för V1.

### Q7 — URL-state för selection
**Rekommendation:** **NEJ**. Pure client-state.
**Motivering:** Selection är ephemerial workflow-state, inte
shareable. Att seralisera 50 ID:n i URL skulle vara fult.
**Beslut:** LOCKED.

### Q8 — Audit-trail för bulk
**Rekommendation:** varje rad får ett individuellt event från sin
service (ex. STATE_CHANGED via cancelDraft) — inget dedicated
"bulk-event". Timeline blir konsistent med single-action.
`actorSource: "admin_ui_bulk"` skiljer i metadata om vi vill
filtrera senare.
**Beslut:** advisory.

### Q9 — Cross-tenant safety
**LOCKED:** varje action-call måste resolva tenant från Clerk-context
INNAN den loopar — INGA tenantId i client-payloaden. Per-row
service-call scopas med `tenantId AND draftOrderId`. Samma pattern
som existing single-action.

### Q10 — Pre-condition skip vs error
**Rekommendation:** Pre-conditions som inte uppfylls (status etc.)
→ classified `skipped` med läsbar reason. Bara genuina runtime-errors
→ `failed`.
**Motivering:** matchar `sweepExpiredDrafts`-mönstret från cron.
Operator ser tydligt skillnaden mellan "kunde inte" (skip) och
"något gick fel" (fail).
**Beslut:** advisory.

---

## E — Q-decisions sammanfattning

| Q | Status | Type |
|---|---|---|
| Q1 action-knappars synlighet | OPEN | advisory |
| Q2 bulk-actions för V1 | OPEN | advisory |
| Q3 concurrency=4 | OPEN | advisory |
| Q4 UI under exekvering | OPEN | advisory |
| Q5 resultat-presentation | OPEN | advisory |
| Q6 selection-persistens | LOCKED | — |
| Q7 URL-state | LOCKED | — |
| Q8 audit-trail | OPEN | advisory |
| Q9 cross-tenant | LOCKED | — |
| Q10 skip vs error | OPEN | advisory |

**Totalt öppna:** 7 advisory, 0 blocking. Default-rekommendationer
listade ovan.

---

## F — Verifieringsplan (innan första push, Terminal Claude)

```bash
cd admin

npx tsc --noEmit 2>&1 | grep -E "draft-orders" | head -30
# Förväntat: 0 errors i Terminal B scope (project baseline 4 oförändrad)

npx vitest run \
  app/\(admin\)/draft-orders/actions.test.ts \
  app/\(admin\)/draft-orders/_components/BulkActionBar.test.tsx \
  app/\(admin\)/draft-orders/_components/BulkResultModal.test.tsx \
  app/\(admin\)/draft-orders/DraftOrdersClient.test.tsx
# Förväntat: alla gröna, +20 net new

npx eslint \
  app/\(admin\)/draft-orders/actions.ts \
  app/\(admin\)/draft-orders/DraftOrdersClient.tsx \
  app/\(admin\)/draft-orders/_components/BulkActionBar.tsx \
  app/\(admin\)/draft-orders/_components/BulkActionBar.test.tsx \
  app/\(admin\)/draft-orders/_components/BulkResultModal.tsx \
  app/\(admin\)/draft-orders/_components/BulkResultModal.test.tsx
# Förväntat: 0 errors

# Smoke i dev-server (manuell, golden path):
# 1. /draft-orders → välj 3 INVOICED → klicka "Skicka om faktura" →
#    confirm → resultmodal visar 3 succeeded
# 2. Mixed selection (2 OPEN + 1 INVOICED) → "Skicka faktura" →
#    1 skipped (status fel), 2 succeeded
# 3. Bulk-cancel → reason krävs → modal stannar tills reason ifylld
```

---

## G — Stop-protocol-status

- Branch synced: ✓ HEAD = `202a3ad`
- Inga schema-changes: ✓
- Inga out-of-scope-filer: ✓
- Terminal A koordinering: inte krävt
- FAS 7.5 verifierad: ✓ (tsc 0 i Terminal B scope, +21 tests, eslint 0)
