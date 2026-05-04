# FAS 7.6-lite — PENDING_APPROVAL manual operator-flow (recon)

**Datum:** 2026-05-04
**Branch:** `claude/draft-orders-7-6-lite` (från `main` @ `f8414d1`)
**Författare:** Claude (Web — claude.ai/code, Terminal B prompt-engineer)
**Status:** RECON COMPLETE — implementation pending operator-godkännande av D Q-decisions.
**Föregångare:** PR #35 (FAS 7.3-7.9 invoice domain) öppen mot main, inte mergad än

---

## Kontext + förutsättningar

**Beroende på #35-merge:** Denna fas är INTE blockerad av #35, men landar bättre **efter** att #35 mergats för att undvika divergens. Fall-back: cherry-picka från main när #35 landar.

**State-machine:** `OPEN → PENDING_APPROVAL → APPROVED → INVOICED` finns redan i
`state-machine.ts:24-26` (FAS 6.5D-arbete från historik). Vi behöver **bara**
implementera service + UI + timeline för transitions som redan är legala.

**Lite-avgränsning** (Path B-mönstret från FAS 7.5):
- ✅ Manuell operator-trigger (klick på "Begär godkännande" / "Godkänn" / "Avslå")
- ❌ Auto-tröskel via `TenantConfig.draftApprovalThresholdCents` (kräver schema → 7.6b)
- ❌ Email till godkännare (kräver `EmailEventType` enum-extension → 7.6c, Terminal A koord)
- ❌ Approval-portal (separat admin-yta för icke-org-admins → 7.6d)

Ger ~80% av värdet utan cross-team blockers.

---

## Mål

Stänga gap mellan state-machine (där `PENDING_APPROVAL/APPROVED/REJECTED` finns) och faktisk verklighet (ingen kod använder dem). En operatör med admin-roll ska kunna:

1. Klicka "Begär godkännande" på en `OPEN`-draft → `PENDING_APPROVAL`
2. (Senare) klicka "Godkänn" eller "Avslå" → `APPROVED` eller `REJECTED`
3. Se hela approval-trail i timeline med actor-info
4. Vid `APPROVED` → vanlig `sendInvoice`-flow är tillåten igen (state-machine
   stöder redan `APPROVED → INVOICED`)
5. `REJECTED` är terminal — ingen vidare action

---

## Stop-protocol

- Out-of-scope (Terminal A): all analytics-kod, observability, EmailEventType-enum
- INGA schema-changes (`TenantConfig.draftApprovalThresholdCents` skjuts till 7.6b)
- INGA nya EmailEventType-värden (skjuts till 7.6c)
- INGA ändringar i `state-machine.ts` — transitions finns redan
- Inga ändringar i `app/api/webhooks/**` eller `_lib/email/registry.ts`

Baseline från PR #35 (väntad post-merge):
- tsc 3 errors (project baseline accommodations)
- vitest +700 net new passing (cumulative since FAS 7.3)
- ESLint 0 errors i Terminal B scope (3 pre-existing in LineItemsCard/SaveBar — separate cleanup)

---

## A — Befintliga byggstenar (locked)

### A.1 — State-machine (`state-machine.ts:23-30`)
```ts
OPEN: ["INVOICED", "PENDING_APPROVAL", "CANCELLED"],
PENDING_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
APPROVED: ["INVOICED", "CANCELLED"],
REJECTED: [], // terminal
```
Alla transitions vi behöver är redan tillåtna. ✅

### A.2 — `transitionDraftStatusInTx` (`lifecycle.ts:258`, exporterad som @internal i FAS 7.4)
- Generic helper för status-transitions
- Optimistic-locked via `WHERE status = from` + `version` increment
- Skapar `STATE_CHANGED`-event in-tx
- Använd direkt — ingen ny tx-pattern behövs

### A.3 — `sendInvoice` (`lifecycle.ts`)
- Accepterar redan både `OPEN` och `APPROVED` som starting states (rad 672)
- **Ingen ändring behövs** — när vi tippar draft till `APPROVED`, fortsätter
  send-invoice-flowen exakt som tidigare

### A.4 — `cancelDraft` (`lifecycle.ts`)
- Stöder cancel från `PENDING_APPROVAL` och `APPROVED` (per state-machine)
- Ingen ändring behövs

### A.5 — Konfigurera UI (`KonfigureraClient.tsx`, FAS 7.2b.4d.2)
- `HeaderActionsDropdown` för action-meny — pattern att utöka
- `ConfirmModal` för bekräftelse-dialogs — återanvänd
- `confirmKind`-state union — utöka med nya kinds

### A.6 — Timeline (`TimelineCard.tsx`)
- Title + icon + subtitle map för varje `DraftEventType`
- Mönster att följa: `INVOICE_RESENT` (FAS 7.4) etablerade pattern för
  dual events (STATE_CHANGED + dedicated event)

### A.7 — `DraftEventType`-union (`events.ts:20-45`)
- Vi utökar denna med 3 nya värden (Terminal B scope, ej Prisma-enum)

### A.8 — `Clerk` org-roll
- `ADMIN_ROLE` checks kan användas för approval-rättigheter
- För 7.6-lite: alla org-admins kan både request OCH approve (samma user kan
  inte godkänna sin egen request — Q1 nedan). Mer granulär RBAC kommer i 7.6d.

---

## B — Implementation-plan

> 5 commits, en sammanhållen PR. Hela fasen utvecklas + verifieras lokalt
> innan första push.

### B.1 — Approval-services (3 nya)
**Filer:**
- `app/_lib/draft-orders/approval.ts` (ny — sambo-fil för 3 services)
- `app/_lib/draft-orders/approval.test.ts` (ny)
- `app/_lib/draft-orders/index.ts` (utökad — barrel)
- `app/_lib/draft-orders/types.ts` (utökad — Schema + Result-typer)
- `app/_lib/draft-orders/events.ts` (utökad — 3 nya event-typer)

**Public API:**
```ts
// submitForApproval: OPEN → PENDING_APPROVAL
export type SubmitForApprovalInput = {
  tenantId: string;
  draftOrderId: string;
  /** Optional reason/note for the approver. Max 500 chars. */
  requestNote?: string;
  actorUserId: string;  // REQUIRED — must be tracked for audit
};

export type SubmitForApprovalResult = { draft: DraftOrder };

// approveDraft: PENDING_APPROVAL → APPROVED
export type ApproveDraftInput = {
  tenantId: string;
  draftOrderId: string;
  /** Optional approver note. */
  approvalNote?: string;
  actorUserId: string;  // REQUIRED
};

export type ApproveDraftResult = { draft: DraftOrder };

// rejectDraft: PENDING_APPROVAL → REJECTED
export type RejectDraftInput = {
  tenantId: string;
  draftOrderId: string;
  /** REQUIRED — reason shown in timeline + audit. */
  rejectionReason: string;
  actorUserId: string;  // REQUIRED
};

export type RejectDraftResult = { draft: DraftOrder };
```

**Algoritm (alla tre services följer samma mönster):**

```
1. Parse + validate input (zod)
2. Pre-tx: load draft, assert status matches expected `from`
3. Tx (fast):
   - Re-validate status inside tx
   - For approveDraft: assert actorUserId !== draft.createdByUserId (Q1)
   - transitionDraftStatusInTx({ from, to, actorSource: "admin_ui",
     metadata: { requestNote / approvalNote / rejectionReason } })
   - If transitioned:false → throw ConflictError (race lost)
   - Emit dedicated event in-tx:
     - submitForApproval → APPROVAL_REQUESTED with metadata.requestNote
     - approveDraft → APPROVAL_GRANTED with metadata.approvalNote
     - rejectDraft → APPROVAL_REJECTED with metadata.rejectionReason
4. Log + emit platform webhook (draft_order.approval_requested /
   approved / rejected)
5. Return { draft }
```

**Tests (15+ cases):**

submitForApproval (5 cases):
- happy: OPEN → PENDING_APPROVAL with requestNote in event metadata
- status=INVOICED → ValidationError
- status=PENDING_APPROVAL (already requested) → ValidationError
- race-on-status: tx-internal status changed → ConflictError
- missing actorUserId → ValidationError (zod)

approveDraft (6 cases):
- happy: PENDING_APPROVAL → APPROVED, dedicated APPROVAL_GRANTED event
- status=OPEN → ValidationError
- status=APPROVED (double-approve) → ValidationError
- self-approval (actorUserId === draft.createdByUserId) → ValidationError per Q1
- race → ConflictError
- approvalNote properly stored in event metadata

rejectDraft (5 cases):
- happy: PENDING_APPROVAL → REJECTED with rejectionReason
- missing rejectionReason → ValidationError (required)
- status=OPEN → ValidationError
- self-rejection allowed (Q1 — only approval has self-restriction)
- race → ConflictError

**Checkpoint:** tsc 0 nya i scope, vitest +15 nya passing.

---

### B.2 — Server-actions (3 nya)
**Filer:**
- `app/(admin)/draft-orders/[id]/actions.ts` (utökad)
- `app/(admin)/draft-orders/[id]/actions.test.ts` (utökad)

**Innehåll:**
```ts
export async function submitDraftForApprovalAction(input: {
  draftId: string;
  requestNote?: string;
}): Promise<DraftMutationResult>;

export async function approveDraftAction(input: {
  draftId: string;
  approvalNote?: string;
}): Promise<DraftMutationResult>;

export async function rejectDraftAction(input: {
  draftId: string;
  rejectionReason: string;
}): Promise<DraftMutationResult>;
```

Pattern matchar `cancelDraftAction` / `markDraftAsPaidAction`:
- `getActor()` → tenantId + userId
- Wrap service-call i try/catch
- Map NotFoundError / ValidationError / ConflictError → `{ ok: false, error }`
- Return `{ ok: true, draft }`

Pass `actorUserId: actor.userId` till service.

**Tests (9 cases):**
- 3 happy paths (en per action)
- 3 ValidationError mappings
- 3 ConflictError mappings
- + missing-tenant-id-test för approve

**Checkpoint:** tsc 0 nya, vitest +9 nya passing.

---

### B.3 — KonfigureraClient UI
**Filer:**
- `app/(admin)/draft-orders/[id]/_components/KonfigureraClient.tsx` (utökad)
- `app/(admin)/draft-orders/[id]/_components/KonfigureraClient.test.tsx` (utökad)

**Innehåll:**

Utöka `confirmKind`-state union:
```ts
const [confirmKind, setConfirmKind] = useState<
  | "send-invoice"
  | "resend-invoice"
  | "submit-for-approval"
  | "approve-draft"
  | "reject-draft"
  | "mark-paid"
  | "cancel"
  | null
>(null);
```

Nya state-fält:
- `requestNote: string` (för submitForApproval modal — optional textarea)
- `approvalNote: string` (för approveDraft modal — optional textarea)
- `rejectionReason: string` (för rejectDraft modal — REQUIRED textarea)

Nya handlers (3 st) följer befintligt mönster
(setActionPending → action call → setConfirmKind(null) → router.refresh).

Dropdown-items (utökas):
```ts
// Endast synliga vid rätt status
if (draft.status === "OPEN" && draft.lineItems.length > 0) {
  dropdownItems.push({
    key: "submit-for-approval",
    label: "Begär godkännande",
    onClick: () => setConfirmKind("submit-for-approval"),
  });
}

if (draft.status === "PENDING_APPROVAL") {
  // Self-approval block: hide approve button if current user is the requester
  // (server enforces this too — UI-hide is just a UX nicety)
  if (currentUserId !== draft.createdByUserId) {
    dropdownItems.push({
      key: "approve-draft",
      label: "Godkänn",
      onClick: () => setConfirmKind("approve-draft"),
    });
  }
  dropdownItems.push({
    key: "reject-draft",
    label: "Avslå",
    danger: true,
    onClick: () => setConfirmKind("reject-draft"),
  });
}
```

**Critical:** behöver `currentUserId` prop till komponenten — pass från
konfigurera/page.tsx via getActor() context. Mindre props-drilling, men
nödvändig för UI-self-approval-gate.

3 nya `<ConfirmModal>` instanser:
- "Begär godkännande" — optional textarea för note, "Begär"-knapp
- "Godkänn utkast" — optional textarea, primary "Godkänn"
- "Avslå utkast" — REQUIRED textarea, danger "Avslå"

**Tests (10 cases):**
- Dropdown-items synlighet per status (5 cases)
- Self-approval-button hidden when currentUserId === createdByUserId
- Confirm-modal opens per kind (3 cases)
- Reject without reason — submit-button disabled

**Checkpoint:** tsc 0 nya, vitest +10 nya passing.

---

### B.4 — Timeline rendering för 3 nya events
**Filer:**
- `app/(admin)/draft-orders/[id]/_components/TimelineCard.tsx` (utökad)
- `app/(admin)/draft-orders/[id]/_components/TimelineCard.test.tsx` (utökad)

**Innehåll:**

Title-map utökning:
```ts
case "APPROVAL_REQUESTED":
  return "Godkännande begärt";
case "APPROVAL_GRANTED":
  return "Godkänt";
case "APPROVAL_REJECTED":
  return "Avslagit";
```

Icon-map utökning:
```ts
case "APPROVAL_REQUESTED":
  return "pending";
case "APPROVAL_GRANTED":
  return "verified";
case "APPROVAL_REJECTED":
  return "block";
```

Subtitle-handler för 3 nya cases (visar note/reason från metadata).

**Tests (3 cases):** title-mapping för 3 typer + subtitle-rendering med
metadata + utan metadata (graceful).

**Checkpoint:** tsc 0 nya, vitest +3 nya passing.

---

### B.5 — Roadmap-update
**Filer:**
- `_audit/draft-orders-roadmap.md` (utökad)

Markera 7.6-lite som implementerad. Lägg till `7.6b` (threshold-schema +
Terminal A koord), `7.6c` (approval-mail), `7.6d` (approval-portal RBAC) som
pending sub-fases.

---

## C — Filer som RÖRS

### Nya filer
- `app/_lib/draft-orders/approval.ts`
- `app/_lib/draft-orders/approval.test.ts`

### Modifierade filer
- `app/_lib/draft-orders/index.ts` (barrel)
- `app/_lib/draft-orders/events.ts` (3 nya event-typer)
- `app/_lib/draft-orders/types.ts` (3 nya Input-schemas + Result-types)
- `app/_lib/apps/webhooks.ts` (3 nya `draft_order.approval_*` event-typer)
- `app/(admin)/draft-orders/[id]/actions.ts` (+ test)
- `app/(admin)/draft-orders/[id]/_components/KonfigureraClient.tsx` (+ test)
- `app/(admin)/draft-orders/[id]/_components/TimelineCard.tsx` (+ test)
- `app/(admin)/draft-orders/[id]/konfigurera/page.tsx` (pass currentUserId)
- `_audit/draft-orders-roadmap.md`

### EJ rörda
- `prisma/schema.prisma`
- `_lib/email/registry.ts`
- `app/api/webhooks/**`
- `state-machine.ts`
- All analytics-kod
- `CLAUDE.md`

---

## D — Q-decisions

### Q1 — Self-approval blockad
**Rekommendation:** **JA**, blocka. En user som submit:ade approval kan inte
också godkänna den. Server-side enforcement i `approveDraft`-service
(`actorUserId !== draft.createdByUserId`).
**Motivering:** standard governance-pattern. Två par ögon. Förhindrar att
en operatör kringgår syftet med approval-flowen.
**Edge case:** vad om `createdByUserId` är `null` (skapad pre-FAS-7.0)?
Tillåt approval i det fallet (graceful degradation). Q3 hanterar det.
**Beslut:** advisory.

### Q2 — Reject utan reason
**Rekommendation:** **NEJ**, kräv `rejectionReason`. Reject är terminal —
operatör måste motivera.
**Motivering:** terminal-state utan trail = dålig audit. Cancel kräver
inte reason (Q-decision tidigare), men cancel är inte terminal i samma
mening — drafts kan startas om.
**Beslut:** LOCKED.

### Q3 — Drafts utan `createdByUserId` (legacy)
**Rekommendation:** Tillåt all approval/rejection när `createdByUserId === null`.
Self-approval-check skippas. Logg en warning.
**Motivering:** dev-seed-tenant + pre-7.0-drafts saknar createdByUserId.
Vi vill inte blocka dem. Strict-mode kommer när alla legacy data är fixed.
**Beslut:** advisory.

### Q4 — Re-submit efter REJECTED
**Rekommendation:** **NEJ i V1** — REJECTED är terminal. Operatör måste
skapa ny draft (kopiera kan komma som separat feature).
**Motivering:** state-machine säger så (`REJECTED: []`). Att lägga till
`REJECTED → OPEN` skulle vara state-machine-utökning, inte 7.6-lite scope.
**Beslut:** LOCKED — state-machine-konsistens.

### Q5 — `metadata.requestNote` / `approvalNote` / `rejectionReason` max-length
**Rekommendation:** 500 chars. Matchar `cancelDraft.reason` precedent.
**Beslut:** advisory.

### Q6 — Email-notifiering vid approval-state-change
**LOCKED:** **NEJ i 7.6-lite**. Kräver `EmailEventType` enum-extension →
Terminal A koord → 7.6c sub-fas.

### Q7 — Threshold-baserad auto-approval-trigger
**LOCKED:** **NEJ i 7.6-lite**. Kräver schema-change → 7.6b sub-fas.

### Q8 — UI-currentUserId-prop drilling
**Rekommendation:** **JA**, drill `currentUserId: string | null` från
konfigurera/page.tsx → KonfigureraClient. För self-approval UI-gate.
**Alternativ:** server-component-only kontroll. Server enforces redan,
så UI-skydd är cosmetic. MEN: visar inte knappen för en user är bättre
UX än att visa-och-fail.
**Beslut:** advisory.

### Q9 — Action-button labels på svenska
**Rekommendation:** "Begär godkännande" / "Godkänn" / "Avslå" — kort + tydligt.
Modaler får längre beskrivningar.
**Beslut:** advisory.

### Q10 — Audit-trail metadata
**Rekommendation:** Varje event registrerar:
- `actorUserId` (vem)
- `requestNote`/`approvalNote`/`rejectionReason` (motivation)
- timestamp (auto via DraftOrderEvent.createdAt)
**INTE registrera:** Clerk-roll (kan ändras), e-post (PII, lookup vid behov).
**Beslut:** LOCKED — minimum-PII princip.

---

## E — Q-decisions sammanfattning

| Q | Status | Type |
|---|---|---|
| Q1 self-approval block | OPEN | advisory |
| Q2 reject reason required | LOCKED | — |
| Q3 legacy createdByUserId | OPEN | advisory |
| Q4 REJECTED-resubmit | LOCKED | — |
| Q5 metadata max-length | OPEN | advisory |
| Q6 email V1 | LOCKED | — |
| Q7 threshold V1 | LOCKED | — |
| Q8 currentUserId prop drill | OPEN | advisory |
| Q9 action labels | OPEN | advisory |
| Q10 audit-trail metadata | LOCKED | — |

**Totalt öppna:** 5 advisory, 0 blocking. Default-rekommendationer listade.

---

## F — Verifieringsplan (innan första push, Terminal Claude)

```bash
cd /workspaces/book-C/admin
git checkout claude/draft-orders-7-6-lite
git pull origin claude/draft-orders-7-6-lite

# 1. Type-check FULL
npx tsc --noEmit 2>&1 | tee /tmp/tsc-7-6-lite.log
echo "Total errors:"
grep -cE "error TS" /tmp/tsc-7-6-lite.log
# Förväntat: 3 (project baseline accommodations)

# 2. New tests
npx vitest run \
  app/_lib/draft-orders/approval.test.ts \
  "app/(admin)/draft-orders/[id]/actions.test.ts" \
  "app/(admin)/draft-orders/[id]/_components/KonfigureraClient.test.tsx" \
  "app/(admin)/draft-orders/[id]/_components/TimelineCard.test.tsx"

# 3. Lint
npx eslint \
  app/_lib/draft-orders/approval.ts \
  app/_lib/draft-orders/approval.test.ts \
  "app/(admin)/draft-orders/[id]/actions.ts" \
  "app/(admin)/draft-orders/[id]/_components/KonfigureraClient.tsx" \
  "app/(admin)/draft-orders/[id]/_components/TimelineCard.tsx"

# 4. Smoke i dev:
PORT=3002 npm run dev
# Open: http://localhost:3002/draft-orders/<id>/konfigurera
# - OPEN draft → klick "Begär godkännande" → confirm → status PENDING_APPROVAL
# - PENDING_APPROVAL från annan user → "Godkänn"-knapp synlig → confirm → APPROVED
# - PENDING_APPROVAL från samma user → "Godkänn" GÖMD (self-approval-block)
# - PENDING_APPROVAL → "Avslå" → reason krävs → confirm → REJECTED
# - APPROVED → "Skicka faktura" funkar (oförändrad sendInvoice-flow)
# - Timeline visar APPROVAL_REQUESTED → APPROVAL_GRANTED-rader med notes
```

---

## G — PR-strategi

När 7.6-lite klart:
- Öppna PR mot main (efter att #35 mergats)
- Titel: `feat(draft-orders): FAS 7.6-lite — manual operator approval flow`
- Liten + fokuserad (~300-500 LOC) — Shopify-grade scope
- Body refererar till denna recon

Om #35 fortfarande inte mergad när 7.6-lite klar:
- Öppna PR ändå mot main — git auto-handles
- Notera i PR-body att den staplar logiskt på #35:s `APPROVED → INVOICED`-arv
  (men inte tekniskt — båda PR:erna är independenta)

---

## H — Stop-protocol-status

- Branch synced: ✓ från main @ `f8414d1`
- Inga schema-changes: ✓
- Inga out-of-scope-filer: ✓
- Terminal A koordinering: inte krävt för lite-version
- PR #35 status: öppen, ej mergad — ej blocker för denna recon
