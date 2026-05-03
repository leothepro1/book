# FAS 7.3 — Customer-facing invoice payment surface (recon)

**Datum:** 2026-05-03
**Branch:** `claude/initial-setup-JVMgE`
**HEAD vid recon-start:** `88d7881`
**Författare:** Claude (Terminal B)
**Status:** RECON in progress — implementation pending operator-godkännande av D Q-decisions.

---

## Mål

Skapa kundens betal-yta. Idag skickar `sendInvoice` ett mail med länk till
`{portalSlug}.rutgr.com/invoice/{shareLinkToken}` — men rutten finns inte.
Kund klickar → 404. Webhook-handlern är klar och väntar på en lyckad
payment_intent.succeeded från denna sida.

## Stop-protocol

- Baseline (förväntat innan ändring): `npx tsc --noEmit` + `npm test -- --run`
  ska vara dokumenterad i ett pre-commit run innan B.1 startar. Alla
  efterföljande sub-step kräver "no new errors / no test regressions".
- Aldrig röra `app/_lib/analytics/**`, `app/api/analytics/**` eller
  `inngest/analytics/**` (Terminal A).
- Aldrig röra `app/api/webhooks/stripe/route.ts` eller
  `handle-draft-order-pi.ts` i denna fas — webhook-flödet är redan klart
  och betraktas som immutable här.
- Inga schema-ändringar i denna fas (`shareLinkToken` finns redan).

---

## A — Befintliga byggstenar (locked)

### A.1 — Service-lager (`_lib/draft-orders/lifecycle.ts`)

`sendInvoice()` skapar:
- `shareLinkToken` (opaque, 32 bytes hex), unique-indexed på `DraftOrder.shareLinkToken`
- `shareLinkExpiresAt` (Date, default 7 dagar via `clampShareLinkTtl`)
- `invoiceUrl = {portalSlug}.rutgr.com/invoice/{token}` (via `buildInvoiceUrl`,
  lifecycle.ts:480)
- Stripe PaymentIntent via `initiateOrderPayment(...)`:
  - `mode: "embedded"` (verifierad invariant — kastar om annat returneras)
  - `clientSecret` returneras men sparas INTE i DraftOrder — bara
    `stripePaymentIntentId` lagras i metafields
  - `metadata.kind = "draft_order_invoice"`, `metadata.draftOrderId`,
    `metadata.tenantId` (krävs av webhook-handlern, line 27–32)
  - Connect: PI skapas på tenantens connected account via
    `initiateOrderPayment` → `getStripe()` med `stripeAccount` param
- Status: `OPEN | APPROVED → INVOICED`

**Konsekvens för 7.3:** Customer-page måste hämta `clientSecret` på nytt
genom Stripe API (PI är redan skapad och idempotent per `sessionId=draft.id`).
Alternativ: ändra `sendInvoice` att lagra `clientSecret`. Avråds — `clientSecret`
roterar inte (det är knutet till PI), men att lagra det utökar attack-ytan
(secret läcker via shareLink → tar över PI). **Beslut: hämta clientSecret
runtime via Stripe SDK retrieve(pi).** Se Q1.

### A.2 — Webhook-handler (`api/webhooks/stripe/handle-draft-order-pi.ts`)

Förväntar `payment_intent.succeeded` med:
- `pi.metadata.draftOrderId` + `pi.metadata.tenantId`
- `pi.metadata.kind === "draft_order_invoice"`
- Transitionar `INVOICED → PAID`, sedan auto-konverterar via `convertDraftToOrder`
- Emit `draft_order.paid` event

**Konsekvens för 7.3:** Customer-page behöver INTE confirma sidan på server-side.
Stripe Elements `confirmPayment` (client-side) → Stripe POST → webhook → state
transition. Success-sidan visar bara bekräftelse-text och pollar status om
det behövs.

### A.3 — DraftOrder data (Prisma)

```
shareLinkToken     String?  @unique
shareLinkExpiresAt DateTime?
invoiceUrl         String?
invoiceSentAt      DateTime?
status             DraftOrderStatus  // OPEN | INVOICED | PAID | …
```

`shareLinkToken` är unik i hela DB (inte per tenant) → tenant-resolution
genom `resolveTenantFromHost()` är redundant för draftens identitet, men
KRÄVS för security: vi vill verifiera att tokens host-subdomain matchar
draftens tenant. Annars: cross-tenant XSS (oklart om Cloudflare cachar
404-svar mellan subdomäner, men billigt att skydda).

### A.4 — `resolveTenantFromHost()` (`app/(guest)/_lib/tenant/resolveTenantFromHost.ts`)

Befintlig pattern. Tar `host` header, returnerar Tenant eller null.
Production: extraherar `portalSlug` från `{slug}.rutgr.com`. Dev fallback
via `DEV_ORG_ID`.

### A.5 — Stripe Elements pattern (`app/(guest)/checkout/CheckoutClient.tsx`)

Existerande pattern att följa:
- `loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)` på modul-nivå
- `<Elements stripe={stripePromise} options={{ clientSecret }}>` wrapper
- Inuti: PaymentMethodAccordion (Card / PayPal / Klarna / wallets)
- Confirm-knapp: `useStripe().confirmPayment({ elements, confirmParams: { return_url } })`

**Connect-detalj:** Befintliga checkout använder `loadStripe()` UTAN
`stripeAccount`-param. Det fungerar för PI som skapats med Connect-account
eftersom `clientSecret` redan är scopad till det accountet. Men best practice
enligt Stripe: använd `loadStripe(pk, { stripeAccount: connectedAccountId })`
för Direct Charges. **Beslut: matcha existerande pattern (utan stripeAccount
i Elements) såvida inte test visar problem. Se Q2.**

### A.6 — Email-template (`_lib/email/templates/draft-invoice.tsx`)

CTA-knapp länkar till `invoiceUrl`. Klart. Ingen ändring i 7.3.

---

## B — Implementation-plan

> 6 commits, en PR. Mappar 1:1 mot 7.2b.2-cadence.

### B.1 — `getDraftByShareToken` service
**Filer:**
- `app/_lib/draft-orders/get-by-share-token.ts` (ny)
- `app/_lib/draft-orders/get-by-share-token.test.ts` (ny)
- `app/_lib/draft-orders/index.ts` (utökad — barrel export)

**Innehåll:**
- Input: `{ shareLinkToken: string, hostTenantId: string }`
  (`hostTenantId` = från `resolveTenantFromHost()`)
- Returnerar customer-safe DTO: `{ draft: PublicDraftDTO, expired: boolean }`
- PublicDraftDTO innehåller INTE: `internalNote`, `actorUserId`, `events[].metadata.actorUserId`,
  `metafields.stripePaymentIntentId` etc. — bara: id, displayNumber, status,
  contact*, totalCents, currency, lineItems (snapshot), appliedDiscountCode/Amount,
  paymentTermsFrozen, invoiceSentAt, shareLinkExpiresAt
- Cross-tenant-skydd: om `draft.tenantId !== hostTenantId` → returnera
  null (samma som not-found, ingen oracle).
- Expiry: om `shareLinkExpiresAt < now` → return draft + `expired: true`
  (inte error — page visar "expired" UI).
- Status-gate: ENDAST `INVOICED | OVERDUE | PAID | COMPLETED`. Andra statusar
  → return null (draft "finns inte" för kunden).

**Test:**
- happy-path INVOICED-draft
- token utgånget → `expired: true`
- cross-tenant token → null
- status=OPEN → null
- status=PAID → returns draft (visa "betalad" UI)
- status=CANCELLED → null
- non-existent token → null

**Checkpoint:** tsc + test suite stabilt.

### B.2 — `getDraftClientSecret` server action
**Filer:**
- `app/(guest)/invoice/[token]/actions.ts` (ny)
- `app/(guest)/invoice/[token]/actions.test.ts` (ny)

**Innehåll:**
- Action: `getInvoiceClientSecretAction(token: string) → Promise<{ clientSecret: string } | { error: string }>`
- Resolverar tenant via `resolveTenantFromHost()`
- Hämtar draft via `getDraftByShareToken(token, tenantId)`
- Hämtar `stripePaymentIntentId` från `draft.metafields`
- Anropar `getStripe(...).paymentIntents.retrieve(pi.id, { stripeAccount: tenant.stripeAccountId })`
- Returnerar `pi.client_secret`
- Rate-limit: 5 req / 10 min per IP (samma pattern som checkout)

**Test:**
- happy-path → returnerar clientSecret
- expired-token → error
- status=PAID → error "ALREADY_PAID"

**Checkpoint:** tsc + test suite stabilt.

### B.3 — Server-page `app/(guest)/invoice/[token]/page.tsx`
**Filer:**
- `app/(guest)/invoice/[token]/page.tsx` (ny)
- `app/(guest)/invoice/[token]/page.test.tsx` (ny)

**Innehåll:**
- Server component. Async params (Next 15).
- Resolverar tenant via `resolveTenantFromHost()` → 404 om null
- Hämtar draft via `getDraftByShareToken`
- Branch:
  - `null` → `notFound()`
  - `expired: true` → render ExpiredView
  - `status === "INVOICED" | "OVERDUE"` → render InvoiceClient
    (passar token + draft DTO som props)
  - `status === "PAID" | "COMPLETED"` → render PaidView (länk till ev.
    order-status om vi har den)
- Metadata-export: `<title>Faktura {displayNumber} — {tenantName}</title>`,
  `robots: noindex`
- Branding: hämta `tenant.brandColor` etc. via befintlig branding-helper

**Test:**
- snapshot för varje branch (happy, expired, paid, not-found)
- cross-tenant token → notFound

**Checkpoint:** tsc + test suite stabilt.

### B.4 — Client-component `InvoiceClient.tsx`
**Filer:**
- `app/(guest)/invoice/[token]/InvoiceClient.tsx` (ny)
- `app/(guest)/invoice/[token]/InvoiceClient.test.tsx` (ny)
- `app/(guest)/invoice/invoice.css` (ny — scoped, BEM, återanvänd guest-tokens)

**Innehåll:**
- `<Elements stripe={stripePromise} options={{ clientSecret }}>` wrapper
- ClientSecret hämtas via `getInvoiceClientSecretAction(token)` i useEffect
  (server kan inte hålla det stale cache:at i HTML — SSR skickar bara token)
- Layout (Shopify invoice-style):
  - Header: tenant-logo + "Faktura {displayNumber}"
  - Line items lista (read-only, fryst pricing)
  - Totals-block: subtotal, discount, moms, total
  - PaymentMethodAccordion (matchar checkout-pattern)
  - Confirm-knapp → `confirmPayment({ confirmParams: { return_url: '{invoiceUrl}/success' } })`
- States: loading, error, processing, success-redirect

**Test:**
- mount → renderar line items + total
- confirmPayment-flow (mockad) → `processing` state
- error från confirmPayment → error-banner

**Checkpoint:** tsc + test suite stabilt.

### B.5 — Success + cancelled-pages
**Filer:**
- `app/(guest)/invoice/[token]/success/page.tsx` (ny)
- `app/(guest)/invoice/[token]/cancelled/page.tsx` (ny)
- (Test-filer för båda)

**Innehåll:**
- Success: server component. Hämtar draft via token. Visar "Tack för
  betalning, faktura {displayNumber} markerad som betald". Polling med
  `useTransition` om status fortfarande är INVOICED (webhook race). Max
  3 polls med 2s mellanrum.
- Cancelled: enkel "Betalning avbruten — försök igen"-sida med länk
  tillbaka till `/invoice/{token}`.

**Checkpoint:** tsc + test suite stabilt.

### B.6 — Smoke + commit
**Filer:** ingen kod, bara körning.

**Innehåll:**
- `npm run dev` (Terminal B port 3000 ledig)
- Manuell rökgang:
  1. Skapa draft med totals i admin → freeze → send invoice
  2. Öppna `invoiceUrl` i privat fönster (subdomän måste resolvas — använd `DEV_ORG_ID` fallback)
  3. Verifiera line-items renderas
  4. Verifiera Stripe Elements laddas
  5. Använd Stripe test-card 4242 → success-page renderas
  6. Verifiera webhook fired (logga i terminal)
  7. Verifiera draft → PAID → COMPLETED i admin
  8. Bonus: testa expired-token (manuell DB-update av `shareLinkExpiresAt`)
- Commit-batch: 5 feat-commits + 1 docs-update av roadmap

**Checkpoint:** tsc clean, tests stabila, dev-server svarar 200, ingen
hydration-warning, webhook-flow funkar end-to-end.

---

## C — Filer som RÖRS

### Nya filer (alla under draft-order/invoice scope)
- `app/_lib/draft-orders/get-by-share-token.ts`
- `app/_lib/draft-orders/get-by-share-token.test.ts`
- `app/(guest)/invoice/[token]/page.tsx`
- `app/(guest)/invoice/[token]/page.test.tsx`
- `app/(guest)/invoice/[token]/InvoiceClient.tsx`
- `app/(guest)/invoice/[token]/InvoiceClient.test.tsx`
- `app/(guest)/invoice/[token]/actions.ts`
- `app/(guest)/invoice/[token]/actions.test.ts`
- `app/(guest)/invoice/[token]/success/page.tsx`
- `app/(guest)/invoice/[token]/success/page.test.tsx`
- `app/(guest)/invoice/[token]/cancelled/page.tsx`
- `app/(guest)/invoice/[token]/cancelled/page.test.tsx`
- `app/(guest)/invoice/invoice.css`

### Modifierade filer
- `app/_lib/draft-orders/index.ts` — barrel export tillkommer

### EJ rörda
- Schema (Prisma)
- Webhook-handler
- `lifecycle.ts` (sendInvoice förblir oförändrad)
- `app/api/**` utöver vad som listas
- All analytics-kod

---

## D — Q-decisions (öppna för operator)

### Q1 — clientSecret-storage
**Rekommendation:** hämta runtime via `paymentIntents.retrieve()`. INTE
lagra i DB.
**Motivering:** clientSecret roterar inte (live för PI:s livstid), men
lagring → läcka via shareLinkToken → tar över PI utan auth. Retrieve är
en cachebar Stripe-call; latency ~150ms acceptabel på initial page-load.
**Alternativ:** lagra i `DraftOrder.metafields.invoiceClientSecret`. Snabbare
sida men säkerhetsförsämring.
**Beslut:** advisory — gå med rekommendation om inget annat sägs.

### Q2 — `loadStripe(stripeAccount)` för Connect
**Rekommendation:** matcha existerande checkout (ingen `stripeAccount`-param
till `loadStripe`). PI:s `clientSecret` är redan scoped, fungerar.
**Motivering:** befintlig pattern i `(guest)/checkout/CheckoutClient.tsx:20`
gör samma. Stripes egna docs säger att `clientSecret` är tillräckligt
för att Elements ska fungera mot Connect-account.
**Alternativ:** explicit `loadStripe(pk, { stripeAccount: tenant.stripeAccountId })`
för korrekthet. Kräver att vi serializar `stripeAccountId` ner till klienten —
inte hemligt men ökar yta.
**Beslut:** advisory — gå med rekommendation om inget annat sägs.

### Q3 — PaymentMethodAccordion vs PaymentElement
**Rekommendation:** börja med Stripes `PaymentElement` (single component
som auto-detect:ar tillgängliga metoder från PI:s `payment_method_types`).
Skippa custom accordion i 7.3.
**Motivering:** `PaymentElement` är Stripes rekommenderade approach 2024+.
Kort kod. Befintliga checkout-flow använder custom accordion (legacy från
för-PaymentElement-eran). Inget skäl att replikera den komplexiteten i
draft-invoice-flow.
**Alternativ:** kopiera PaymentMethodAccordion-pattern från CheckoutClient.tsx.
Konsekvent UI men 3x mer kod.
**Beslut:** advisory — gå med rekommendation om inget annat sägs.

### Q4 — Locale på faktura-sidan
**Rekommendation:** härleda från tenant-locale eller `Accept-Language`,
default `sv-SE`. Stripe Elements har inbyggt locale-stöd.
**Beslut:** advisory.

### Q5 — Polling-strategi på /success
**Rekommendation:** server-render initialt med `status` från DB, om
`status === INVOICED` (webhook race) → render client-component som
pollar `getDraftStatusAction` 3x med 2s mellanrum, sen "kontrollera
status manuellt"-knapp.
**Beslut:** advisory.

### Q6 — Robot indexering
**Rekommendation:** `noindex, nofollow` på alla `/invoice/[token]/**`-sidor.
Innehåller PII, ska aldrig till SERPs.
**Beslut:** LOCKED — inte negotierbar.

### Q7 — Branding
**Rekommendation:** använd befintlig `tenant-branding`-helper om sådan
existerar; annars hard-coded "powered by rutgr" footer.
**Beslut:** advisory — verifierar i B.3 om helper finns.

---

## E — Sammanfattning Q-decisions

| Q | Status | Type |
|---|---|---|
| Q1 clientSecret-storage | OPEN | advisory |
| Q2 loadStripe(stripeAccount) | OPEN | advisory |
| Q3 PaymentElement vs accordion | OPEN | advisory |
| Q4 Locale | OPEN | advisory |
| Q5 Polling-strategi | OPEN | advisory |
| Q6 Robot indexering | LOCKED | — |
| Q7 Branding | OPEN | advisory (verifieras i B.3) |

**Totalt öppna:** 6 advisory, 0 blocking.

Alla advisories har default-rekommendationer ovan. Om operator inte
opponerar kör vi rekommendationen utan ytterligare check-in.

---

## F — Stop-protocol-status

- Branch synced med origin: ✓ verifierat (`git status` clean, HEAD = origin)
- Inga schema-changes krävs: ✓
- Inga out-of-scope-filer: ✓ (alla nya filer ligger under draft-order/invoice)
- Terminal A koordinering: inte krävt för 7.3
