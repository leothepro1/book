# FAS 7.5 — OVERDUE-cron (Path B / 7.5-lite) (recon)

**Datum:** 2026-05-03
**Branch:** `claude/initial-setup-JVMgE`
**HEAD vid recon-start:** `2e4675e`
**Författare:** Claude (Terminal B)
**Status:** RECON COMPLETE — implementation pending operator-godkännande av D Q-decisions.

---

## Mål

Ge operatör automatisk synlighet i fakturor som inte betalats i tid. Idag
finns `INVOICED → OVERDUE`-transition i state-machine men ingen kod
triggar den. Operatör måste manuellt scanna list-vyn för att hitta
försenade fakturor.

**Path B (7.5-lite) avgränsning** — bekräftad med operatör:
- INGEN schema-change (ingen `dueDate`-fält, ingen ny EmailEventType)
- INGEN automatisk reminder-mail (kräver enum-utökning → Terminal A-koord)
- ENBART cron + state transition + event emission

Reminder-emails kommer i 7.5b när vi har bandbredd att koordinera. Idag
löser FAS 7.4 manuell resend.

---

## Stop-protocol

- Out-of-scope (Terminal A): all analytics-kod
- INGA schema-changes (`prisma/schema.prisma` orörd)
- INGA Prisma enum-utökningar (`EmailEventType`, etc.)
- Ingen ändring i `app/api/webhooks/stripe/**`
- Ingen ändring i `lifecycle.ts` core (sendInvoice/cancelDraft)

Baseline (locked från FAS 7.4 verification):
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` på 4 nya test-filer — 177/177 passed
- `npx eslint` på 6 modified/new filer — 0 errors

---

## A — Befintliga byggstenar (locked)

### A.1 — State-machine (`state-machine.ts:29`)
```
INVOICED: ["PAID", "OVERDUE", "CANCELLED"]
OVERDUE:  ["PAID", "CANCELLED"]
```
`canTransition("INVOICED", "OVERDUE")` returnerar `true`. ✓

### A.2 — `transitionDraftStatusInTx` (`lifecycle.ts:258`)
- Redan exporterad
- Tar `from`/`to`/`actorSource: "cron"` + extra metadata
- Optimistic-locked via WHERE-status match (returns `transitioned: false` om race)
- Skapar `STATE_CHANGED`-event in-tx

### A.3 — `INVOICE_OVERDUE`-event (`events.ts:37`)
- Redan i `DraftEventType`-union
- Inte använt än — vi första-konsumenten

### A.4 — Cron pattern (`api/cron/expire-draft-orders/route.ts`)
- 60-rader pattern att spegla:
  - `Bearer CRON_SECRET`-auth
  - `ROUTE_WALL_BUDGET_MS = 55_000`
  - Kallar service som returnerar `SweepResult`
  - Loggar + returnerar JSON med counters

### A.5 — `sweepExpiredDrafts` (`expire.ts`)
- Existing service som FAS 7.5-cron speglar designen efter:
  - `BATCH_SIZE = 200`
  - `runWithPool`-concurrency
  - Wall-budget-aware deadline
  - Per-row try/catch — en bad row aldrig aborterar sweep
  - Aldrig kastar — service returnerar counters

### A.6 — `runWithPool` (`concurrency/pool.ts`)
- Zero-dep, bounded concurrency
- Isolerar errors: tasks throws fångas i `PoolItemResult.error`
- Wall-deadline-aware (skippa new-launch när tid slut)

### A.7 — `vercel.json` cron-entries
- 33 befintliga, inkl. `/api/cron/expire-draft-orders` (10 min)
- Lägg till en till — ingen koordinering krävs

---

## B — Implementation-plan

> 3 commits på en branch, en sammanhållen PR. Allt verifieras lokalt
> innan första push.

### B.1 — `markOverdueDrafts` service
**Filer:**
- `app/_lib/draft-orders/overdue.ts` (ny)
- `app/_lib/draft-orders/overdue.test.ts` (ny)
- `app/_lib/draft-orders/index.ts` (utökad — barrel)

**Innehåll:**
```ts
export type OverdueResult = {
  examined: number;
  marked: number;
  /** Race-on-terminal — draft moved out of INVOICED between SELECT
   *  and tx (e.g. webhook landed PAID first). Expected; counted
   *  separately from `failed`. */
  skipped: number;
  failed: number;
  durationMs: number;
  partial: boolean;  // wall-budget exhausted
};

export type MarkOverdueOptions = {
  now?: Date;
  deadline?: number;
  batchSize?: number;
  concurrency?: number;
  /** Days past shareLinkExpiresAt before flipping to OVERDUE. Default 3. */
  graceDays?: number;
};

export async function markOverdueDrafts(
  options?: MarkOverdueOptions,
): Promise<OverdueResult>;
```

**Algoritm:**
1. Compute `cutoff = now - graceDays * 24h`
2. Query: `findMany` where `status: "INVOICED"` AND
   `shareLinkExpiresAt: { lt: cutoff }` ORDER BY `shareLinkExpiresAt` ASC
   LIMIT `batchSize`
3. `runWithPool({ concurrency, deadline })` → per-row:
   - Open tx
   - Re-validate `status === INVOICED` inside tx (race guard)
   - `transitionDraftStatusInTx({ from: "INVOICED", to: "OVERDUE",
     actorSource: "cron", metadata: { graceDays, cutoff: cutoff.toISOString(),
     overdueAt: now.toISOString() } })`
   - If `transitioned: false` → counts as `skipped`
   - Emit `INVOICE_OVERDUE`-event in-tx (separate from `STATE_CHANGED` —
     gives timeline a dedicated marker)
4. Aggregate counters into `OverdueResult`
5. **Aldrig kasta** — alla per-row errors fångas och räknas som `failed`

**Concurrency:** 8 (matchar existing draft-cron pattern)
**Wall-budget:** route ger deadline; service respekterar

**Tests (10+ cases):**
- happy: 3 invoiced rows past cutoff → 3 marked
- happy: shareLinkExpiresAt null → not selected
- happy: shareLinkExpiresAt nyligen (inom grace) → not selected
- race: row flips from INVOICED to PAID mid-tx → counts as skipped
- partial: wall-budget exhausted halfway → partial: true, examined < found
- per-row error → counts as failed, sweep continues
- empty result → all-zero counters
- graceDays default = 3
- cutoff calc = now - graceDays
- emit INVOICE_OVERDUE event with correct metadata
- tenant-scoped query (no cross-tenant leakage)
- batchSize bounded

**Checkpoint:** tsc clean, vitest stabilt + 10+ new passing.

---

### B.2 — Cron route + vercel.json
**Filer:**
- `app/api/cron/overdue-drafts/route.ts` (ny)
- `app/api/cron/overdue-drafts/route.test.ts` (ny)
- `vercel.json` (utökad — en cron-entry)

**Innehåll:**
- Spegla `expire-draft-orders/route.ts` 1:1 — bara byt service-call
- `Bearer ${env.CRON_SECRET}`-auth
- `ROUTE_WALL_BUDGET_MS = 55_000`
- Schedule: `"15 6 * * *"` — varje dag kl 06:15 UTC (en gång per dygn räcker;
  cutoff är 3 dygn så vi tappar inget på dygns-granularitet)

**Tests (4 cases):**
- 401 utan Bearer
- 401 med fel Bearer
- 200 med counters
- 500 om service kastar (defense — service ska aldrig kasta)

**vercel.json:**
```json
{ "path": "/api/cron/overdue-drafts", "schedule": "15 6 * * *" }
```

**Checkpoint:** tsc clean, vitest stabilt.

---

### B.3 — Timeline-rendering för `INVOICE_OVERDUE`
**Filer:**
- `app/(admin)/draft-orders/[id]/_components/TimelineCard.tsx` (utökad)
- `app/(admin)/draft-orders/[id]/_components/TimelineCard.test.tsx` (utökad)

**Innehåll:**
- Title: "Faktura förfallen" (redan finns i map)
- Icon: `schedule` (redan finns)
- Subtitle: "Markerad förfallen efter {graceDays} dagar" eller bara
  "Förfallodatum passerat"
- Title-mapping är redan klar — bara subtitle-handler behöver utökas

**Tests (2 cases):**
- INVOICE_OVERDUE renderas med korrekt subtitle
- malformed metadata → no crash

**Checkpoint:** tsc clean, vitest stabilt.

---

### B.4 — Roadmap-update
**Filer:**
- `_audit/draft-orders-roadmap.md`

**Innehåll:**
- Markera 7.5 som "implementerad (Path B / 7.5-lite)"
- Lägg till `7.5b — Reminder-mail (kräver Terminal A enum-koord)` som
  pending sub-fas

---

## C — Filer som RÖRS

### Nya filer
- `app/_lib/draft-orders/overdue.ts`
- `app/_lib/draft-orders/overdue.test.ts`
- `app/api/cron/overdue-drafts/route.ts`
- `app/api/cron/overdue-drafts/route.test.ts`

### Modifierade filer
- `app/_lib/draft-orders/index.ts` (barrel)
- `app/(admin)/draft-orders/[id]/_components/TimelineCard.tsx`
- `app/(admin)/draft-orders/[id]/_components/TimelineCard.test.tsx`
- `vercel.json` (en ny cron-rad)
- `_audit/draft-orders-roadmap.md`

### EJ rörda
- `prisma/schema.prisma`
- `app/_lib/email/registry.ts`
- `app/_lib/draft-orders/lifecycle.ts` core
- `app/_lib/draft-orders/state-machine.ts`
- `app/_lib/draft-orders/events.ts` (INVOICE_OVERDUE redan finns)
- `app/api/webhooks/**`
- All analytics-kod

---

## D — Q-decisions

### Q1 — Grace period default
**Rekommendation:** 3 dygn efter `shareLinkExpiresAt`.
**Motivering:** ger kunden buffert att betala efter länken gått ut
(operator har kanske skickat resend manuellt redan). Konfigurerbart
via service-input, men cron ger ingen override = 3 dygn i V1.
**Beslut:** advisory.

### Q2 — Cron-frekvens
**Rekommendation:** **1× per dygn kl 06:15 UTC** (`"15 6 * * *"`).
**Motivering:** OVERDUE är ingen tids-kritisk transition. Dygns-granularitet
räcker. Off-peak schemaläggning matchar `close-billing-periods`-pattern.
Mer frekvent = onödig DB-belastning.
**Alternativ:** varje 15 min (matchar `expire-draft-orders`). För dyrt
för så lågt-frekvent transition.
**Beslut:** advisory.

### Q3 — Event-typ
**Rekommendation:** emit BÅDE `STATE_CHANGED` (via transitionDraftStatusInTx)
OCH `INVOICE_OVERDUE` (separat event för timeline). Två events i samma tx.
**Motivering:** STATE_CHANGED är generiska state-machine-trail. INVOICE_OVERDUE
är timeline-specifikt. FAS 7.4 INVOICE_RESENT etablerade denna pattern
(separat dedicated event).
**Alternativ:** bara STATE_CHANGED, låt timeline parse `from→to`. Minskar
event-count men förlorar dedicated-event-search-index.
**Beslut:** advisory.

### Q4 — Tenant-scoping
**LOCKED:** query är ALLTID `findMany` UTAN tenantId-filter (cron
kör cross-tenant). Per-row tx scopas med `WHERE id AND tenantId` så
ingen cross-tenant write kan smita igenom.

### Q5 — Reminder-mail i V1
**LOCKED:** **NEJ** i 7.5-lite (Path B). Kräver `EmailEventType` enum-utökning
→ Terminal A migration coordination. Skjuts till 7.5b.

### Q6 — `dueDate`-fält
**LOCKED:** **NEJ** i 7.5-lite. Skjuts till 7.5c efter Terminal A-koord.
V1 använder `shareLinkExpiresAt + grace` som proxy.

### Q7 — INVOICE_OVERDUE i existing TimelineCard title-map
**RESOLVED:** redan finns på `TimelineCard.tsx:107` ("Faktura förfallen") +
`:151` (icon "schedule"). Bara subtitle-handler behöver utökas i B.3.

### Q8 — Cron-route auth
**LOCKED:** `Bearer ${env.CRON_SECRET}` — matchar all befintlig cron-pattern.

### Q9 — `transitioned: false` (race) klassifisering
**Rekommendation:** counts som `skipped`, inte `failed`. Matchar
`sweepExpiredDrafts` race-classification (`expire.ts:96`).
**Beslut:** advisory.

---

## E — Q-decisions sammanfattning

| Q | Status | Type |
|---|---|---|
| Q1 grace-period default | OPEN | advisory |
| Q2 cron-frekvens | OPEN | advisory |
| Q3 event-typ | OPEN | advisory |
| Q4 tenant-scoping | LOCKED | — |
| Q5 reminder-mail V1 | LOCKED | — |
| Q6 dueDate-fält | LOCKED | — |
| Q7 timeline title-map | RESOLVED | — |
| Q8 cron auth | LOCKED | — |
| Q9 race-klassifisering | OPEN | advisory |

**Totalt öppna:** 4 advisory, 0 blocking. Default-rekommendationer
listade ovan.

---

## F — Verifieringsplan (innan första push)

Operator-run lokalt (sandbox blockerad):
```bash
cd /workspaces/book-B/admin
git fetch origin claude/initial-setup-JVMgE
git checkout claude/initial-setup-JVMgE
git pull

# 1. Type-check
npx tsc --noEmit 2>&1 | grep -E "draft-orders|cron/overdue" | head -30

# 2. New tests
npx vitest run \
  app/_lib/draft-orders/overdue.test.ts \
  app/api/cron/overdue-drafts/route.test.ts \
  "app/(admin)/draft-orders/[id]/_components/TimelineCard.test.tsx"

# 3. Lint
npx eslint \
  app/_lib/draft-orders/overdue.ts \
  app/_lib/draft-orders/overdue.test.ts \
  app/api/cron/overdue-drafts/route.ts \
  "app/(admin)/draft-orders/[id]/_components/TimelineCard.tsx"
```

**Endast efter alla tre grönt → push.** En sammanhållen kommit-grupp,
inga mikropushes.

---

## G — Stop-protocol-status

- Branch synced: ✓ HEAD = `2e4675e` = origin
- Inga schema-changes: ✓
- Inga out-of-scope-filer: ✓
- Terminal A koordinering: inte krävt för 7.5-lite
- FAS 7.4 verifierad: ✓ (tsc 0, tests 177/177, eslint 0)
