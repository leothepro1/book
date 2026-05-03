# FAS 7.4 — Invoice expiry / retry surface (recon)

**Datum:** 2026-05-03
**Branch:** `claude/initial-setup-JVMgE`
**HEAD vid recon-start:** `e75a0ed`
**Författare:** Claude (Terminal B)
**Status:** RECON COMPLETE — implementation pending operator-godkännande
av D Q-decisions.

---

## Mål

Ge operatör verktyget att skicka en ny faktura-länk när den gamla
gått ut, utan att skapa en ny DraftOrder. Idag finns:
- `shareLinkExpiresAt` i schemat (clamped till 1–90 dagar i `sendInvoice`)
- Kund-sida som visar `ExpiredView` (FAS 7.3) när token gått ut
- `sendInvoice` har "idempotent replay"-gren när `status=INVOICED && PI finns`,
  men den **förnyar inte token** — den skickar tillbaka samma URL/PI

Saknas:
1. **Service** som regenererar `shareLinkToken` + `shareLinkExpiresAt` och
   antingen skapar en NY PaymentIntent eller återanvänder den gamla.
2. **Admin-action + UI** som triggar resend, synlig endast när relevant.
3. **Email-resend** så kunden får ny länk i mailen.

---

## Stop-protocol

- Out-of-scope (Terminal A): all analytics-kod.
- Inga schema-ändringar i denna fas. `shareLinkToken` och
  `shareLinkExpiresAt` är redan nullable. Idempotency kan reuse:a
  `metafields` (samma mönster som `sendInvoice` gör för PI-id).
- Inga ändringar i webhook-handlern (`handle-draft-order-pi.ts`) eller
  i `app/api/webhooks/stripe/route.ts`.
- Inga ändringar i `sendInvoice`-grenen — `resendInvoice` är en
  parallell sister-service.

Baseline (locked från FAS 7.3 verification):
- `npx tsc --noEmit` — 0 errors
- `npx vitest run app/_lib/draft-orders app/(guest)/invoice` — 46/46
- `npx eslint` på Terminal B-scope — 0 errors

---

## A — Befintliga byggstenar (locked)

### A.1 — `sendInvoice` (lifecycle.ts:576)
- Redan klart för **förstagångs-send** + **idempotent replay** (samma URL).
- Skapar PI via `initiateOrderPayment(...)` som är idempotent på
  `sessionId=draft.id`. **Konsekvens:** kan vi bara anropa det igen?
  → Nej. PI är redan skapad och bunden till draft.id; en `initiate` med
  samma sessionId returnerar samma PI. För att få en ny token-bunden
  PI behöver vi cancella den gamla först ELLER acceptera att samma PI
  representerar fler tokens över tid.

### A.2 — `tryCancelStripePaymentIntent` (lifecycle.ts:805)
- Best-effort PI-cancel. Tolererar fel (loggar warning).
- **Återanvänd direkt** i `resendInvoice` när vi behöver ett rent skifte.

### A.3 — `getDraftStripePaymentIntentId` (types.ts:560)
- Typad accessor för `metafields.stripePaymentIntentId`.

### A.4 — `transitionDraftStatusInTx` (lifecycle.ts ca 251)
- Generic state-transition helper. **Inte** behövd här eftersom
  resend ska INTE ändra status (`INVOICED → INVOICED` är ingen transition).
  Vi skriver token + expiresAt direkt + emit nytt event.

### A.5 — `INVOICE_SENT`-event (events.ts:36)
- Befintligt event. Q1 nedan: bör resend emit:a en NY event-typ
  (`INVOICE_RESENT`) eller återanvända `INVOICE_SENT` med
  `metadata.resend = true`?

### A.6 — Email-template (`_lib/email/templates/draft-invoice.tsx`)
- Tar `invoiceUrl` som prop. Kan återanvändas as-is.

### A.7 — Admin action `sendDraftInvoiceAction`
- Ligger i `app/(admin)/draft-orders/[id]/actions.ts:280`.
- Pattern att matcha för en ny `resendDraftInvoiceAction`.

### A.8 — `KonfigureraClient.tsx` (Lifecycle UI från 7.2b.4d.2)
- Innehåller `HeaderActionsDropdown` + `ConfirmModal` med befintlig
  pattern. Vi lägger till "Skicka om faktura" där.

### A.9 — Customer-sida `ExpiredView` (FAS 7.3 page.tsx:159)
- Visar redan "Länken har gått ut. Kontakta säljaren för en ny."
- **Inget UI-arbete behövs** här. Kunden kommer mejla → operatör triggar
  resend → ny länk i nytt mail.

---

## B — Implementation-plan

> 5 commits, en PR.

### B.1 — `resendInvoice` service
**Filer:**
- `app/_lib/draft-orders/resend-invoice.ts` (ny)
- `app/_lib/draft-orders/resend-invoice.test.ts` (ny)
- `app/_lib/draft-orders/index.ts` (utökad — barrel + types)
- `app/_lib/draft-orders/types.ts` (utökad — Schema + Result-typer)
- `app/_lib/draft-orders/events.ts` (utökad — `INVOICE_RESENT` event-typ)

**Innehåll:**
```ts
ResendInvoiceInput = {
  tenantId: string;
  draftOrderId: string;
  /** Override for the regenerated token's TTL (ms). Clamped 1d..90d. */
  shareLinkTtlMs?: number;
  /** Optional new email subject/message overriding stored values. */
  invoiceEmailSubject?: string;
  invoiceEmailMessage?: string;
  actorUserId?: string;
};

ResendInvoiceResult = {
  draft: DraftOrder;
  invoiceUrl: string;
  shareLinkToken: string;
  shareLinkExpiresAt: Date;
  clientSecret: string;
  stripePaymentIntentId: string;
  /** True when we cancelled the previous PI and minted a new one. */
  rotatedPaymentIntent: boolean;
};
```

**Pre-conditions:**
- `draft.status ∈ {INVOICED, OVERDUE}` (Q2 — accept OVERDUE for forward
  compatibility with FAS 7.5)
- `draft.tenant.portalSlug !== null` (matches sendInvoice S7)
- Tenant Stripe-ready (matches sendInvoice S7)

**Algoritm:**
1. Pre-tx: load draft + tenant
2. Read existing PI id from metafields
3. **PI-rotation decision:** retrieve old PI status:
   - `succeeded` → throw `ConflictError("ALREADY_PAID")`
     (operator should mark-as-paid, not resend)
   - `requires_*` / `processing` → cancel old PI, create new PI
     (rotates so old token's clientSecret stops working)
   - `canceled` → no cancel needed, create new PI
4. Generate new `shareLinkToken` + `shareLinkExpiresAt`
5. Tx (fast):
   - Re-validate status
   - Update DraftOrder: new token, new expiresAt, optional new
     subject/message, merge new PI id into metafields
   - Emit `INVOICE_RESENT` event with metadata
6. Emit platform webhook `draft_order.invoice_resent`
7. Return result (action layer handles email send, mirroring sendInvoice)

**Test-coverage (12+ cases):**
- happy path — status=INVOICED, PI requires_payment_method → rotate
- happy path — status=OVERDUE → rotate
- status=OPEN → ValidationError
- status=PAID → ConflictError("ALREADY_PAID")
- PI status=succeeded → ConflictError("ALREADY_PAID")
- PI status=canceled → no cancel call, mint new PI
- missing portalSlug → ValidationError
- missing PI id (corrupt metafields) → ValidationError
- Stripe.cancel throws → tolerated, log warning, continue with new PI
- Stripe.initiate throws → propagates as ValidationError
- new shareLinkTtlMs clamped to 1d..90d
- token rotates (old token returns null in subsequent reads)
- event emitted with correct metadata

**Checkpoint:** tsc clean, vitest 12+ new passing.

---

### B.2 — `resendDraftInvoiceAction`
**Filer:**
- `app/(admin)/draft-orders/[id]/actions.ts` (utökad — ny export)
- `app/(admin)/draft-orders/[id]/actions.test.ts` (utökad — nya tester)

**Innehåll:**
- Server action som matchar `sendDraftInvoiceAction`-pattern
- Anropar `resendInvoice` → fångar errors → mappar till
  `DraftMutationResult`-shape
- Best-effort email-resend (samma `sendEmailEvent("DRAFT_INVOICE", ...)`-call
  som sendInvoiceAction)
- `revalidatePath` på konfigurera-sidan

**Test-coverage:**
- happy path — returnerar ok + invoiceUrl
- ConflictError("ALREADY_PAID") → `{ ok: false, error: "..." }`
- email send fail → action lyckas men `emailStatus` reflekterar
- inget tenant → `{ ok: false, error: "Inget tenant" }`

**Checkpoint:** tsc clean, vitest stabilt.

---

### B.3 — UI: "Skicka om faktura" i konfigurera
**Filer:**
- `app/(admin)/draft-orders/[id]/_components/HeaderActionsDropdown.tsx` (utökad)
- `app/(admin)/draft-orders/[id]/_components/HeaderActionsDropdown.test.tsx` (utökad)
- `app/(admin)/draft-orders/[id]/_components/KonfigureraClient.tsx` (utökad —
  ny handler + ConfirmModal-state)
- `app/(admin)/draft-orders/[id]/_components/KonfigureraClient.test.tsx` (utökad)

**Innehåll:**
- Ny menyrad i dropdown: "Skicka om faktura". Synlig **endast** när:
  - `status ∈ {INVOICED, OVERDUE}`
  - PI inte succeeded (här räcker `status !== PAID && !== COMPLETED`)
- Klick → ConfirmModal (matchar mark-as-paid-pattern)
- Confirm → `resendDraftInvoiceAction` → toast + revalidate
- I expired-state visa raden med ett "(länken har gått ut)"-suffix för UX-tydlighet

**Test-coverage:**
- raden synlig vid INVOICED → klick → modal → confirm → action triggas
- raden dold vid PAID
- raden visas men suffix vid expired
- toast vid lyckat resend

**Checkpoint:** tsc clean, vitest stabilt.

---

### B.4 — Timeline rendering för `INVOICE_RESENT`
**Filer:**
- `app/(admin)/draft-orders/[id]/_components/TimelineCard.tsx` (utökad —
  ny event-rendering)
- `app/(admin)/draft-orders/[id]/_components/TimelineCard.test.tsx` (utökad)

**Innehåll:**
- Lägg till `INVOICE_RESENT` i timeline-formattern: ikon, label
  ("Faktura skickad om"), metadata (visar nytt expiresAt + om PI roterades).

**Checkpoint:** tsc clean, vitest stabilt.

---

### B.5 — Smoke + roadmap-update
**Innehåll:**
- Manuell rökgang:
  1. Skapa draft → freeze → send invoice (befintlig flow)
  2. Manuell DB-update: `shareLinkExpiresAt = now() - 1 day` för draften
  3. Öppna `/invoice/{token}` på portal → ska visa ExpiredView
  4. I admin: öppna konfigurera → dropdown → "Skicka om faktura" → confirm
  5. Verifiera: nytt mail till kund med ny URL
  6. Öppna nya URL:en → InvoiceClient laddas → 4242 → success
  7. Öppna gamla URL:en igen → ExpiredView (token roterad)
  8. Verifiera timeline: `INVOICE_RESENT`-rad synlig
- Roadmap-uppdatering: flytta 7.4 till "Klart".

---

## C — Filer som RÖRS

### Nya filer
- `app/_lib/draft-orders/resend-invoice.ts`
- `app/_lib/draft-orders/resend-invoice.test.ts`

### Modifierade filer
- `app/_lib/draft-orders/index.ts` (barrel)
- `app/_lib/draft-orders/types.ts` (Schema + Result-typer)
- `app/_lib/draft-orders/events.ts` (`INVOICE_RESENT` event-typ)
- `app/(admin)/draft-orders/[id]/actions.ts` (+ test-fil)
- `app/(admin)/draft-orders/[id]/_components/HeaderActionsDropdown.tsx` (+ test)
- `app/(admin)/draft-orders/[id]/_components/KonfigureraClient.tsx` (+ test)
- `app/(admin)/draft-orders/[id]/_components/TimelineCard.tsx` (+ test)
- `_audit/draft-orders-roadmap.md`

### EJ rörda
- `lifecycle.ts` (sendInvoice förblir oförändrad — resend är parallell service)
- `prisma/schema.prisma` (inga schema-ändringar)
- `app/api/webhooks/stripe/**`
- `app/(guest)/invoice/**` (kund-UI redan klart i 7.3)

---

## D — Q-decisions

### Q1 — Event-typ: ny eller återanvänd?
**Rekommendation:** ny event-typ `INVOICE_RESENT`.
**Motivering:** Timeline visar exakta operationen — viktigt för audit
("vi skickade om fakturan 3 ggr"). `INVOICE_SENT` med
`metadata.resend = true` är subtilare och kräver att UI alltid
inspekterar metadata.
**Beslut:** advisory.

### Q2 — Tillåt resend när status=OVERDUE?
**Rekommendation:** JA. När 7.5 lägger till OVERDUE-cron är resend det
naturliga svaret på "fakturan har gått fucken förbi".
**Alternativ:** kräv att operatör först cancellar och skapar ny draft.
För dyrt — vi bygger för operatörens normalvardag.
**Beslut:** advisory.

### Q3 — Vad händer med gamla PI:n när vi skapar ny?
**Rekommendation:** best-effort cancel via `tryCancelStripePaymentIntent`.
Om Stripe är nere → logga warning, fortsätt med ny PI. Den gamla PI:n
auto-expirerar enligt Stripes default (24h för uncaptured).
**Motivering:** matchar `cancelDraft`-mönstret. Användaren accepterar
risken att två PI:er finns parallellt en kort stund.
**Beslut:** advisory.

### Q4 — clientSecret-rotation
**LOCKED:** ja, ny PI = ny clientSecret. Detta är hela poängen — gamla
URL:ens `getInvoiceClientSecretAction` ska sluta fungera direkt.
Token rotation + PI rotation går hand i hand. Inte negotierbart.

### Q5 — Email subject/message-override
**Rekommendation:** acceptera optionella `invoiceEmailSubject` och
`invoiceEmailMessage` på service-input. UI tar inte med dem i V1
(bara default-mailen). Service-input ger framtidssäkring för en
"redigera mail före resend"-modal i 7.4.x.
**Beslut:** advisory.

### Q6 — Idempotency-nyckel
**Rekommendation:** ingen explicit idempotency-nyckel i V1.
Operator-action trycks via en disabled-knapp under processing →
double-click skyddas av UI-state. På service-nivå är race-skyddet
optimistic locking via `version`-fältet i tx.
**Alternativ:** kräv `idempotencyKey` på input. För komplext för 7.4 —
ingen klient anropar service-lagret direkt.
**Beslut:** advisory.

### Q7 — TTL-default för rotated token
**Rekommendation:** matcha `sendInvoice` default (7 dagar via
`clampShareLinkTtl`). Operator får override via service-input om
nödvändigt.
**Beslut:** LOCKED — symmetri med send.

### Q8 — Webhook-event-typ
**Rekommendation:** `draft_order.invoice_resent` (ny). Spegelbild
av `draft_order.invoiced` från sendInvoice.
**Beslut:** advisory.

### Q9 — `pricesFrozenAt`
**LOCKED:** kräv att den fortfarande är satt (samma invariant som
sendInvoice). Resend ska inte hjälpa till att kringgå freeze-kravet.

---

## E — Q-decisions sammanfattning

| Q | Status | Type |
|---|---|---|
| Q1 event-typ | OPEN | advisory |
| Q2 OVERDUE-acceptans | OPEN | advisory |
| Q3 gamla PI:n | OPEN | advisory |
| Q4 clientSecret-rotation | LOCKED | — |
| Q5 email-override | OPEN | advisory |
| Q6 idempotency | OPEN | advisory |
| Q7 TTL-default | LOCKED | — |
| Q8 webhook-event | OPEN | advisory |
| Q9 pricesFrozenAt | LOCKED | — |

**Totalt öppna:** 6 advisory, 0 blocking. Alla 6 har default-rekommendation.

---

## F — Stop-protocol-status

- Branch synced: ✓ HEAD = `e75a0ed` = origin
- Inga schema-changes: ✓
- Inga out-of-scope-filer: ✓
- Terminal A koordinering: inte krävt
- FAS 7.3 verifierad: ✓ (tsc 0, tests 46/46, lint clean)
