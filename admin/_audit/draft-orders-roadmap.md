# Draft Orders — Master Roadmap

**Senast uppdaterad:** 2026-05-03
**Ägare (terminal):** B (draft-order / invoice-flow)
**Strikt scope:** allt under `app/_lib/draft-orders/**`,
`app/(admin)/draft-orders/**`, `app/(guest)/invoice/**`, samt
ev. `_lib/email/templates/draft-*` och `api/webhooks/stripe/handle-draft-order-pi.ts`.
**Out-of-scope (Terminal A):** allt under `_lib/analytics/**`,
`app/api/analytics/**`, `inngest/analytics/**`, `_lib/observability/**`.

---

## Stop-protocol — non-negotiable

1. **Innan ändring börjar:** `git status` ska vara clean,
   `git pull origin claude/initial-setup-JVMgE` ska vara no-op
   eller fast-forward.
2. **Aldrig** `git add -A` / `git add .`. Stagea bara filer som matchar
   scope-glob ovan.
3. **Aldrig** röra Terminal A:s territorium ens vid refactor-tillfälle —
   om en gemensam fil kräver ändring (t.ex. `prisma/schema.prisma`,
   `app/api/webhooks/stripe/route.ts`, `CLAUDE.md`), öppna en koordineringspunkt
   i den här filen och vänta på operator-approval.
4. **Per sub-step:** `npx tsc --noEmit` får inte införa nya errors,
   `npm test -- --run` får inte tappa passing tester. Baseline (locked):
   se `_audit/<phase>-recon.md` per fas.
5. **Commit-format:** `feat(draft-orders): FAS X.Y — <kort beskrivning>`
   eller `feat(draft-orders): <component> — <change>` per sub-commit.
   Aldrig `feat(analytics)` från denna terminal.

---

## Klart (locked)

| FAS | Innehåll | Commit |
|---|---|---|
| 6.4 | DraftCalculator (pure core + orchestrator) | `2b02290` |
| 6.5A | Foundation + core CRUD (createDraft, lines, events, sequence) | `5e9ae7c` |
| 6.5B | Discount wiring + freezePrices | `d0f00c7` |
| 6.5C | PMS hold lifecycle (2-phase commit, hold-state machine) | `184db3b` |
| 6.5D | State transitions + sendInvoice + cancelDraft + convertToOrder | `5af5861` |
| 6.5E | Expiry cleanup cron | `84c4e5a` |
| 7.0 | Listing services (listDrafts, getDraft, search-customers, search-accommodations) | `b05628c` |
| 7.1 | `/draft-orders` index page (badge, list, filters) | `fa132b9` |
| 7.2a | Service-fas för `/draft-orders/new` (check-availability, preview-totals, create-with-lines) | `5da9344` |
| 7.2b.1 | `/draft-orders/new` MVP (lines + accommodation picker) | `f145f9f` |
| 7.2b.2 | Customer + discount + live preview på `/new` | `e06c696` |
| 7.2b.3 | `/draft-orders/[id]/konfigurera` route + read-only cards + getDraftAction | `9dea791` |
| 7.2b.4a | Read-only cards (sidebar + main) | inkl. i 7.2b.3 |
| 7.2b.4b | Update-services (customer/notes/tags/expiresAt) + edit-server-actions + PricesFrozenBanner | merged via PR #10/#11 |
| 7.2b.4c | Line-item edit (add/update/remove) | `b60e01d` |
| 7.2b.4d.1 | Email-infra + markDraftAsPaid + lifecycle-actions | `6e78f1d` |
| 7.2b.4d.2 | Lifecycle UI (confirm modal, dropdown, payment actions) | `11caaa7` |
| 7.2b.4e | Timeline rendering | `b9aed38` |

---

## Pending — strikt prioritetsordning

> Varje pending fas öppnas med en egen recon-audit i `admin/_audit/<phase>-recon.md`
> innan implementation startar. Recon-audit är kontraktet — ingen kod skrivs
> innan recon är godkänd.

### FAS 7.3 — Customer-facing invoice payment surface  ⚡ NEXT
**Recon:** `admin/_audit/7-3-recon.md` (skrivs härnäst)

**Problem:** `sendInvoice` (`_lib/draft-orders/lifecycle.ts:608`) skapar
`invoiceUrl = {portalSlug}.rutgr.com/invoice/{shareLinkToken}` och skickar
e-post till kund — men rutten finns inte. Webhook-handlern
(`api/webhooks/stripe/handle-draft-order-pi.ts`) förväntar att kunden betalar
via Stripe Elements på den sidan. Idag dödläge: kund klickar länk → 404.

**Scope:**
- `app/(guest)/invoice/[token]/page.tsx` — server-side render, hämtar draft
  via `shareLinkToken`, validerar `shareLinkExpiresAt`, läser `clientSecret`
  från PaymentIntent.
- `app/(guest)/invoice/[token]/InvoiceClient.tsx` — Stripe Elements embedded,
  visar line items + totals + discount, "Betala"-knapp.
- `app/(guest)/invoice/[token]/success/page.tsx` — bekräftelsesida efter
  redirect från Stripe (`returnUrl`).
- `app/(guest)/invoice/[token]/cancelled/page.tsx` — efter `cancelUrl`.
- `_lib/draft-orders/get-by-share-token.ts` — ny service som validerar
  token + tenant + expiry och returnerar customer-safe DTO (ingen
  `internalNote`, ingen `actorUserId`-info).
- CSS: `app/(guest)/invoice/invoice.css` — egen scope, återanvänd
  guest-tokens från `app/(guest)/guest.css`.

**Out-of-scope för 7.3:**
- Stripe webhook-flödet (redan implementerat i 7.2b.4d.1).
- E-postmallen (redan klar i `_lib/email/templates/draft-invoice.tsx`).
- Mark-as-paid (redan klart för B2B bank-transfer).

**Estimat:** 1 PR, 5–7 commits, 4–6 nya filer + 4–6 nya tester.

---

### FAS 7.4 — Invoice expiry / retry surface
**Beroende:** 7.3 stängd.

**Problem:** `shareLinkExpiresAt` finns men ingen UI/UX när token gått ut.
Operatör behöver kunna skicka en NY invoice (regenerera token + PI) utan
att skapa en ny draft.

**Scope:**
- `_lib/draft-orders/resend-invoice.ts` — ny service som bygger ny
  `shareLinkToken` + ny PaymentIntent (cancellar gammal PI om PENDING).
  Idempotency på `(draftOrderId, idempotencyKey)`.
- "Skicka om faktura"-action i `KonfigureraClient` (visas när
  `status=INVOICED` OCH `shareLinkExpiresAt < now`).
- "Faktura har gått ut"-screen i `app/(guest)/invoice/[token]/page.tsx`
  (hänger ihop med 7.3).

**Estimat:** 1 PR, 3–4 commits.

---

### FAS 7.5 — OVERDUE-cron + reminder-flow
**Beroende:** 7.3 stängd.

**Problem:** State-machine har `INVOICED → OVERDUE` men ingen kod
triggar denna transition. Behövs cron som flyggar drafts där
`shareLinkExpiresAt + grace_period < now` eller där en operatörs-
satt `dueDate < now`.

**Scope:**
- `prisma/schema.prisma`: lägg till `DraftOrder.dueDate DateTime?`
  (separat från `shareLinkExpiresAt` som styr token-livslängd).
  **⚠ Schema-change — kräver Terminal A koordinering** (migration namespace).
- `api/cron/overdue-drafts/route.ts` — kör en gång per dygn,
  flippa `INVOICED → OVERDUE`, emit event.
- Reminder-mail (återanvänder `draft-invoice.tsx` template med ny copy).
- `vercel.json` cron-entry.

**Estimat:** 1 PR, 4–5 commits.

---

### FAS 7.6 — PENDING_APPROVAL-flow (B2B-godkännande)
**Beroende:** Inget hårt beroende, men logiskt efter 7.3–7.5.

**Problem:** State-machine har `OPEN → PENDING_APPROVAL → APPROVED → INVOICED`
men flow är inte implementerat i UI eller services. Företagskund med
högre belopp ska kunna kräva intern approval innan faktura skickas.

**Scope:**
- `_lib/draft-orders/approve.ts` + `reject.ts` (nya services).
- Tröskelvärde i `TenantConfig.draftApprovalThresholdCents` — ny
  schema-fält. **⚠ Schema-change.**
- "Begär godkännande"-knapp i `KonfigureraClient` när belopp >= tröskel.
- Email till godkännare (ny template `draft-approval-request.tsx`).
- Approval-portal: minimal admin-yta för godkännare (ev. egen route).

**Estimat:** 2 PRs, ~10 commits.

---

### FAS 7.7 — Tax engine (gemensam med Order, men draft-konsument)
**Beroende:** Inget — men koordineras med Terminal A om de äger Order tax.

**Problem:** `getTaxRate()` returnerar 0 (stub). Draft visar "inkl. moms"
men taxraten är 0. Behöver per-tenant + per-line momsregler.

**⚠ Cross-domain:** Order tax delas. Förslag: Terminal B implementerar
draft-konsumenten, Terminal A äger själva tax engine. Koordineringspunkt.

**Estimat:** TBD efter operator-besked om ägarskap.

---

### FAS 7.8 — Bulk-actions på `/draft-orders` index
**Beroende:** Inget.

**Problem:** Index visar drafts men man kan bara göra actions en-i-taget
via `[id]/konfigurera`. Bulk = "expire X drafts", "cancel Y drafts",
"send invoice for these N drafts".

**Estimat:** 1 PR, 5–6 commits.

---

### FAS 7.9 — Invoice PDF generation
**Beroende:** 7.3 stängd.

**Problem:** Kund vill spara/skriva ut faktura. Email innehåller bara
en betal-länk; ingen PDF.

**Scope:**
- `_lib/draft-orders/render-invoice-pdf.ts` — server-side PDF (väg:
  React-PDF eller Puppeteer-on-Vercel).
- `app/(guest)/invoice/[token]/pdf/route.ts` — endpoint som streamar PDF.
- "Ladda ner PDF"-knapp på invoice-sidan.

**Estimat:** 1 PR, 4 commits + dependency-eval.

---

## Cross-domain koordineringspunkter

| Trigger | Terminal A behöver veta | Status |
|---|---|---|
| Schema-change i `DraftOrder` (FAS 7.5, 7.6) | Migration-namespace + analytics-event-namnändring? | Öppen — skickas inför start |
| Ny `draft_order.*` event-typ (alla framtida fasers webhooks) | Kanonisk event-katalog ligger under analytics scope | Öppen — Terminal A äger event-katalogen |
| Tax engine (7.7) | Order äger samma motor | Öppen — operator-decision behövs |
| `app/api/webhooks/stripe/route.ts` ändringar | Order-handler ligger där också | Stäng PR-by-PR; varje gång B rör filen → A informeras |

---

## Tester — invarianter

1. Varje ny service har en test-fil bredvid sig (`<service>.test.ts`).
2. Varje ny page-komponent har en test (`<component>.test.tsx`).
3. **Aldrig** röra `__mocks__/` utanför draft-order-scope.
4. Vitest-baseline ska aldrig sjunka. Varje fas anger sin nya baseline
   i recon-dokumentet.

---

## Definition of Done — per fas

- [ ] Recon-audit i `admin/_audit/<phase>-recon.md` är skriven och har D.x Q-decisions resolved.
- [ ] Alla sub-step-checkpoints passerade (tsc + tests).
- [ ] Manuell rökgang i browser för UI-faser (`npm run dev`, golden path + edge cases).
- [ ] Inga nya `console.error`/hydration-warnings.
- [ ] Commit-meddelanden följer `feat(draft-orders): FAS X.Y — <desc>`.
- [ ] PR-beskrivning länkar till recon-dokumentet.
- [ ] Denna roadmap-fil uppdaterad: fasen flyttad från Pending → Klart.
