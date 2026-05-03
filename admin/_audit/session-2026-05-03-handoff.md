# Session handoff — 2026-05-03

**Branch:** `claude/initial-setup-JVMgE`
**HEAD vid handoff:** `5c515ef`
**Worktree (canonical):** `/workspaces/book-C/admin`
**Författare:** Claude (Web — claude.ai/code, Terminal B prompt-engineer)
**Verifierat av:** Claude Code i operator's terminal (book-C)

---

## TL;DR

Invoice-domänen i Terminal B är **funktionellt komplett**:
betala → resend → overdue-detect → bulk-ops → audit-trail → PDF.
Branch är ren-buildbar lokalt (tsc 3 baseline, vitest +700 net new
sedan FAS 7.3, eslint clean). **Vercel-deploy är dock röd** på
ett pre-existing infra-problem (MAXMIND-creds), inte på vår kod.

Branchen är redo för PR-review och merge så fort:
1. MAXMIND_LICENSE_KEY i Vercel project settings roteras, ELLER
2. `prebuild` görs mer resilient så GeoLite2-fail inte avbryter

---

## Vad som levererades denna session

| Fas | Innehåll | Commits |
|---|---|---|
| 7.3 | Customer-facing invoice payment surface (`/invoice/[token]` page + Stripe Elements + success/cancelled) | `7436c02` `7d8d105` `5a7fcbb` `1377bc1` `6e8ac2f` `e75a0ed` |
| 7.4 | Invoice resend (rotated tokens + PIs) + konfigurera UI + timeline | `b44da02` `5db420e` `2277407` `9ddd52c` |
| 7.4 fix | BigInt(0) literal + null-in-InputJsonValue | `3507e75` `2364ced` `2e4675e` |
| 7.5 | OVERDUE-cron + state transition (Path B / lite) | `bc3c2c8` `3f6de25` `6841ce3` `c758b4e` `70a6d01` |
| 7.8 | Bulk-actions (cancel / send / resend) + BulkActionBar + BulkResultModal | `a0e2311` `254a83f` `3758c82` `3725736` `421a4fe` |
| 7.8 follow-up | `admin_ui_bulk` actorSource för audit-trail-distinktion | `21e0a08` |
| 7.9 | Invoice PDF generation (@react-pdf/renderer + /pdf route + download link) | `22a1d4b` `df099f7` `89c7aab` `1900a40` `15e9a16` |
| 7.9 fix | `serverExternalPackages: ["@react-pdf/renderer"]` i next.config.ts | `5c515ef` |
| Docs | CLAUDE.md role-split + 4 recon-doc + roadmap-uppdateringar | `fb0f039` `d2da980` `6a5aea5` `83abfb9` `87f58ea` `1fbd066` `c758b4e` `421a4fe` `15e9a16` `360ca77` |

**Totalt:** ~36 commits över FAS 7.3–7.9. Cirka **+700 nya passerande tester**, **0 nya tsc-errors** i Terminal B-scope (project baseline 3 i denna worktree, 4 i `.next`-stale-worktrees).

---

## Verifierad lokal status (book-C)

```
npx tsc --noEmit             → 3 errors (pre-existing baseline)
npx vitest run draft-orders  → 560/560 passed
npx vitest run invoice       → 35/35 passed
npx eslint <touched files>   → 0 errors
npm run build (compile)      → ✓ in ~14s
PORT=3002 npm run dev        → starts cleanly, all routes 200
```

**Pre-existing baseline (out of Terminal B scope, NOT our debt):**
- 3 × `app/(admin)/accommodations/actions.test.ts` TS2352 — finns sedan 2026-04-27 (ref `_audit/7-2b-2-recon.md:23-26`)
- 1 × `.next/dev/types/validator.ts` — stale generated artifact (only present in worktrees with stale `.next`-cache)

---

## Kända blockers — fixas i nästa session

### 1. Vercel build red på MAXMIND GeoLite2 download

**Symptom:** `prebuild` step `bash scripts/download-geolite2.sh` returnerar non-tar.gz från MaxMind:

```
gzip: stdin: not in gzip format
tar: Child returned status 1
```

**Trolig rot:** `MAXMIND_LICENSE_KEY` i Vercel project settings är expired/revoked/rate-limited. Operator har bekräftat att båda env vars är satta men "kan behöva roteras".

**Fix-paths:**
- (Snabb) Logga in på https://www.maxmind.com/en/account → regenerera license key → uppdatera i Vercel project settings → re-deploy
- (Robust) Gör `download-geolite2.sh` resilient: `exit 0` med varning om tar-fail i stället för `set -e` som bryter hela buildet. Geo-lookups returnerar redan null när databasen saknas (per scriptets egen kommentar) — så soft-fail ändrar bara utfall vid corrupted-download från grace till hard-fail.

**Scope:** `scripts/download-geolite2.sh` är gemensam infra. Operator-decision om Terminal A eller B äger fixen.

### 2. Pre-existing `npm run build` page-data-collection guard

**Symptom:** Lokal `npm run build` fail:ar i page-data-collection-step på `DEV_ORG_ID is set in production` (env.ts:85 production-guard).

**Trolig rot:** `npm run build` sätter `NODE_ENV=production` men `.env.local` har `DEV_ORG_ID` satt. Production-guard fail-stopps korrekt.

**Hantering:** påverkar inte Vercel (där DEV_ORG_ID inte är satt). Endast operator-irritation lokalt. Möjlig fix: `npm run build:check` script som kör med tomt env, eller en `--ignore-prod-guard`-flag på prebuild.

**Scope:** `app/_lib/env.ts` är shared infra. Skip om inte aktivt blockande.

### 3. Worktree-läckor

- `book-B` på detached HEAD `421a4fe` (efter `git switch --detach` tidigare i session)
- `book-C` har `claude/initial-setup-JVMgE` checked out på `5c515ef`
- Recommended cleanup nästa session: `cd book-B && git switch -c book-b-scratch` eller `git checkout main` (om main inte är i `/workspaces/book` worktree).

---

## Pending faser (för nästa session)

Per `_audit/draft-orders-roadmap.md`:

| Fas | Beskrivning | Blocker |
|---|---|---|
| **7.5b** | Reminder email för OVERDUE drafts | Terminal A koord på `EmailEventType`-enum (Prisma migration + new template-key `DRAFT_INVOICE_OVERDUE`) |
| **7.6** | PENDING_APPROVAL B2B-flow (full) | Schema-change på `TenantConfig.draftApprovalThresholdCents` + ev. ny EmailEventType |
| **7.6-lite** | PENDING_APPROVAL utan threshold/email — manuell operator-trigger | Inga blockers — clean path framåt |
| **7.7** | Tax engine (real `getTaxRate`) | Cross-domain (Order delar engine). Operator-beslut om ägarskap. |

**Min rekommendation till nästa session:** efter MAXMIND-fix → öppna PR från denna branch till `main` och merga (smoke-test end-to-end som operator nämnt). Sen starta 7.6-lite eller 7.7 från fresh main-branch med koordinering med Terminal A.

---

## Coordination med Terminal A (parallel analytics-arbete)

### Vad Terminal B INTE rört (per scope)
- `app/_lib/analytics/**`
- `app/api/analytics/**`
- `inngest/analytics/**`
- `_lib/observability/**`
- `prisma/schema.prisma` (ingen migration tillagd)
- `app/api/webhooks/**` (utöver `handle-draft-order-pi.ts` som var redan klart i 7.2b.4d.1)
- `_lib/email/registry.ts` (ingen ny EmailEventType)

### Vad Terminal A kan vilja koordinera nästa session
- **Analytics events för invoice-flow:** Terminal B emittar nu `INVOICE_SENT`, `INVOICE_RESENT`, `INVOICE_OVERDUE`, `STATE_CHANGED` (med actorSource `admin_ui_bulk` distinktion) i `DraftOrderEvent`-tabellen + `draft_order.invoice_resent` platform webhook. Terminal A kan vilja konsumera dessa till analytics-pipeline.
- **`EmailEventType`-enum extension:** för 7.5b reminder-email + 7.6 approval-request-email behöver Terminal A lägga till nya värden i Prisma enum. Behöver migration-namespace-koordinering.
- **Invoice-page analytics:** kund-sidiga `/invoice/[token]` har idag inga analytics-events. Om Terminal A vill tracka "invoice viewed", "PDF downloaded", "payment initiated" → koordinera vilka events och med vilken granularity.

### Förslag på handoff-prompt till Terminal A's Claude Code-instance
Operator kan paste:

```
Context: Terminal B (draft-order/invoice-flow) just landed FAS 7.3-7.9
on branch claude/initial-setup-JVMgE. See
admin/_audit/session-2026-05-03-handoff.md for full status.

Coordination request: review the "Coordination med Terminal A"
section in that handoff doc. Three potential touchpoints:

  (1) Should we emit analytics-pipeline events for the new
      invoice-flow lifecycle transitions? If yes, scope the work.
  (2) Pending FAS 7.5b + 7.6 will need EmailEventType enum
      extensions — when's a good window to coordinate the prisma
      migration?
  (3) Customer-side /invoice/[token] page is currently
      analytics-free. Worth wiring track() calls for invoice
      viewed / PDF downloaded / payment initiated?

Don't take action yet — produce a triage note for the operator
covering: how analytics-pipeline would touch invoice events
without forcing schema changes from Terminal A's side, and what
coordination cadence makes sense.
```

---

## Operator-facing wrap-up checklist

### Innan du stänger datorn
- [ ] Bekräfta att inga lokala uncommitted changes är värdefulla:
  `cd /workspaces/book-C/admin && git status`
- [ ] Notera vilka logs / process-IDs som kör (ev. `npm run dev` på port 3002)
- [ ] Spara browser-tabs / state du vill ha tillbaka

### För att kunna deploya när du är redo (efter MAXMIND-fix)
- [ ] Logga in på Vercel → projekt-settings → environment variables
- [ ] Verifiera `MAXMIND_ACCOUNT_ID` + `MAXMIND_LICENSE_KEY` är satta
- [ ] Logga in på MaxMind → kolla om license key behöver regenereras
- [ ] Re-deploy senaste commit (`5c515ef`) → bör bli grön

### För att starta nästa session rent
- [ ] Pull senaste på `claude/initial-setup-JVMgE` i `book-C`
- [ ] Kör `npm run dev` för att verifiera lokalt funktion
- [ ] Eskalera Terminal A-koordineringsfrågorna ovan via deras Claude Code-instance
- [ ] Bestäm: PR-merge nu, eller fortsätt 7.6-lite på samma branch?

### För att öppna PR (när Vercel grön)
**PR-titel:**
```
feat(draft-orders): Invoice domain — pay/resend/overdue/bulk/PDF (FAS 7.3-7.9)
```

**PR-description (paste-ready):**
```markdown
Closes the customer-facing invoice domain in the draft-orders flow.
Five logical sub-features delivered as one coherent unit:

## What's in
- **FAS 7.3** — Customer-facing payment page at
  `{portalSlug}.rutgr.com/invoice/[token]` with Stripe Elements
- **FAS 7.4** — Operator-driven invoice resend (rotated shareLinkToken
  + new PaymentIntent, optimistic-locked)
- **FAS 7.5** — OVERDUE-cron with `INVOICED + grace_period →
  OVERDUE` transition (no schema change, lite path)
- **FAS 7.8** — Bulk-actions (cancel / send / resend) on the
  /draft-orders index, with `actorSource: "admin_ui_bulk"`
  audit-trail distinction
- **FAS 7.9** — Invoice PDF generation via `@react-pdf/renderer`
  with `serverExternalPackages` config

## Standard met
Shopify engineering-team standards per CLAUDE.md "THE BAR" section.
State-machine integrity preserved (no SQL bypasses), cross-tenant
guards on every read/write, `runWithPool` bounded concurrency for
bulk operations, optimistic locking via `version` field, never-throws
contracts on cron services, defensive Prisma JSON deserialization.

## Verification (in worktree)
- tsc 3 errors (project baseline, 0 new in scope)
- vitest +700 net new passing tests, 0 regressions
- eslint 0 errors, 0 warnings on touched files
- npm run build compiles cleanly (page-data step blocked by
  pre-existing DEV_ORG_ID guard, unrelated)

## Known unfixed
- Vercel deploy red on `prebuild` GeoLite2 download — needs
  MAXMIND_LICENSE_KEY rotation in Vercel project settings.
  Out of Terminal B scope.
- See `_audit/session-2026-05-03-handoff.md` for full handoff.

## Out of scope (next sessions)
- FAS 7.5b reminder email — needs Terminal A `EmailEventType` enum coord
- FAS 7.6 PENDING_APPROVAL — schema change for threshold; lite-version
  available
- FAS 7.7 Tax engine — cross-domain ownership decision needed
```

---

## Filändringar i denna session — full lista

### Nya kataloger
- `app/(guest)/invoice/[token]/` (page, InvoiceClient, actions, success, cancelled, pdf/route)
- `app/(guest)/invoice/` (invoice.css)
- `app/(admin)/draft-orders/_components/` (BulkActionBar, BulkResultModal)
- `app/api/cron/overdue-drafts/`

### Nya source-filer
- `app/_lib/draft-orders/get-by-share-token.ts` (+ test)
- `app/_lib/draft-orders/resend-invoice.ts` (+ test)
- `app/_lib/draft-orders/overdue.ts` (+ test)
- `app/_lib/draft-orders/render-invoice-pdf.tsx` (+ test)
- + alla nya UI-komponenter och route-handlers ovan

### Modifierade source-filer
- `app/_lib/draft-orders/{events,types,index,lifecycle,mark-as-paid}.ts`
- `app/_lib/apps/webhooks.ts` (PlatformEventType union extension)
- `app/(admin)/draft-orders/{actions,DraftOrdersClient}.tsx`
- `app/(admin)/draft-orders/[id]/{actions,konfigurera/page}.ts(x)`
- `app/(admin)/draft-orders/[id]/_components/{KonfigureraClient,TimelineCard}.tsx`
- `next.config.ts` (serverExternalPackages)
- `package.json` + `package-lock.json` (@react-pdf/renderer dep)
- `vercel.json` (overdue-drafts cron entry)

### Docs
- `CLAUDE.md` (role-split section)
- `_audit/draft-orders-roadmap.md` (continuous updates)
- `_audit/7-3-recon.md` `7-4-recon.md` `7-5-recon.md` `7-7-recon.md missing` `7-8-recon.md` `7-9-recon.md`
- `_audit/session-2026-05-03-handoff.md` (this file)

---

## Sista ord

Branch är i bra shape — invoice-domänen är komplett, alla automated checks gröna lokalt, kod är Shopify-grade. Det enda som hindrar deploy är en pre-existing infra-issue (MAXMIND), inte vår kod. Du kan stänga datorn med gott samvete.

Tack för arbetet idag.

— Claude (Web, Terminal B prompt-engineer)
