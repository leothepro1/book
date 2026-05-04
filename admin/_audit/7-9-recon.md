# FAS 7.9 — Invoice PDF generation (recon)

**Datum:** 2026-05-03
**Branch:** `claude/initial-setup-JVMgE`
**HEAD vid recon-start:** `21e0a08` (FAS 7.8 + admin_ui_bulk follow-up)
**Författare:** Claude (Terminal B, web)
**Status:** RECON COMPLETE — implementation pending operator-godkännande av D Q-decisions, **särskilt Q1 (dependency-val)**.

---

## Mål

Stänga kund-sidan av invoice-flowen genom att leverera en nedladdningsbar
PDF av fakturan. För B2B är PDF inte valfritt — kunder behöver det för
sin egen bokföring (faktura-arkiv, attest, scanning till ekonomisystem).
Saknas det = inte en seriös B2B-produkt.

Detta stänger också invoice-domänen i Terminal B helt: 7.3 (pay) → 7.4
(resend) → 7.5 (overdue-detect) → 7.8 (bulk-ops) → 7.9 (PDF).

---

## Stop-protocol

- Out-of-scope (Terminal A): all analytics-kod, observability
- INGA schema-changes (PDF genereras runtime, inte lagras)
- INGA ändringar i `state-machine.ts`, webhook-handlers, email-registry
- Kund-sidan PDF-route reuses samma `shareLinkToken`-auth som
  `/invoice/[token]/page.tsx` (FAS 7.3) — ingen ny auth-yta

Baseline från FAS 7.8 + follow-up:
- tsc 0 i Terminal B scope (project baseline 3 i denna worktree, 4 i `.next`-stale-worktrees)
- Vitest +132 net new sedan FAS 7.5
- ESLint clean

---

## A — Befintliga byggstenar (locked)

### A.1 — `getDraftByShareToken` (`_lib/draft-orders/get-by-share-token.ts`, FAS 7.3)
- Returnerar customer-safe `PublicDraftDTO` med tenant-skydd och status-gate
- **Återanvänd direkt** för PDF-route — exakt samma data, exakt samma
  åtkomstkontroll. Ingen ny service behöver byggas.

### A.2 — `app/(guest)/invoice/[token]/page.tsx` (FAS 7.3)
- Ger oss layout-mall (header, line items, totals, customer note)
- Vi rebuildar **inte** HTML i PDF — vi gör en separat React-PDF-mall
  (per Q1 nedan). Men data-mappningen är identisk → vi mockar layout
  direkt från `PublicDraftDTO`.

### A.3 — `formatSek` (`_lib/money/format.ts`)
- Tar bigint native — kan kallas från PDF-mall utan cast.

### A.4 — `playwright` redan installerad (devDep)
- Används för E2E-tester. **INTE** för runtime PDF (Q1).

### A.5 — Tenant-data (`Tenant.name`, `Tenant.settings`)
- För branding på PDF (logo, address, color) kommer från `tenant.settings`
  (samma form som booking-engine-rendering läser).

---

## B — Implementation-plan

> 5 commits, en sammanhållen PR. Alla checks lokalt innan första push.

### B.1 — Dependency add: `@react-pdf/renderer` + `@react-pdf/types`
**Filer:**
- `package.json` (utökad)
- `package-lock.json` (auto-genererad)

**Innehåll:**
```bash
npm install @react-pdf/renderer
```

Senaste stable är `@react-pdf/renderer@4.x`. Bundle-impact: ~200KB
gzipped i server-bundle (klient nås aldrig — PDF renderas server-side
endast).

**Test/checkpoint:** `npm install` klar utan E403, `npm run build`
fortfarande grön (no breaking change).

### B.2 — PDF-renderingsservice + mall
**Filer:**
- `app/_lib/draft-orders/render-invoice-pdf.tsx` (ny — `.tsx` pga JSX)
- `app/_lib/draft-orders/render-invoice-pdf.test.tsx` (ny)
- `app/_lib/draft-orders/index.ts` (utökad — barrel)

**Public API:**
```ts
export type RenderInvoicePdfInput = {
  draft: PublicDraftDTO;       // från getDraftByShareToken
  tenantName: string;
  tenantAddress?: string;       // valfri, från tenant.settings.property
  brandColor?: string;          // valfri, från tenant.settings.theme
};

export async function renderInvoicePdf(
  input: RenderInvoicePdfInput,
): Promise<Buffer>;
```

**Mall-layout (ren A4-portrait, svart-vit + brand-accent):**
```
┌─────────────────────────────────────────┐
│  [Logo eller Tenant Name]    FAKTURA    │
│                              D-2026-0001│
├─────────────────────────────────────────┤
│  Från:                  Till:           │
│  Tenant Name            Anna Andersson  │
│  Tenant Address         buyer@example.com│
│                                         │
│  Faktura-datum: 25 april 2026           │
│  Förfallodatum: 10 maj 2026             │
├─────────────────────────────────────────┤
│  Beskrivning            Antal  Belopp   │
├─────────────────────────────────────────┤
│  Strandvilla            1      7 500 kr │
│  2026-06-01 – 2026-06-04                │
│  3 nätter                               │
├─────────────────────────────────────────┤
│                       Delsumma 8 000 kr │
│                       Rabatt   −500 kr  │
│                       Moms     1 500 kr │
│                       ─────────────────  │
│                       TOTALT   9 000 kr │
├─────────────────────────────────────────┤
│  Meddelande: [customerNote om finns]    │
│                                         │
│  Frågor? Kontakta tenant@example.com    │
└─────────────────────────────────────────┘
```

**Renderingspattern (React-PDF):**
```tsx
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";

const styles = StyleSheet.create({ ... });

const InvoiceDocument = ({ draft, tenantName, ... }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      ...
    </Page>
  </Document>
);

export async function renderInvoicePdf(input): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument {...input} />);
}
```

**Fonts:** Default `Helvetica` (built-in i React-PDF). Inga external font
fetches → ingen network round-trip. Q4 nedan om custom fonts.

**Tests (8+ cases):**
- Returnerar Buffer (instanceof Buffer)
- Buffer börjar med PDF magic bytes (`%PDF-`)
- Renderar utan throw för minimal-draft (tomma optional fält)
- Renderar med fullständig draft (line items, discount, tax, customer note)
- displayNumber syns i output (parse PDF text via library? eller bara
  buffer-check att vissa strings finns) — eller: skip text-content-test,
  täck via integration-test
- TenantName fallback: när tenantName tom → "Faktura"
- BrandColor används i header om satt
- Tom lineItems-lista → mall renderar ändå (graceful)
- Empty customerNote → meddelande-section utelämnas

**Checkpoint:** tsc 0 ny i scope, vitest +8 passerande.

### B.3 — Route handler `/invoice/[token]/pdf`
**Filer:**
- `app/(guest)/invoice/[token]/pdf/route.ts` (ny)
- `app/(guest)/invoice/[token]/pdf/route.test.ts` (ny)

**Innehåll:**
```ts
import { NextResponse } from "next/server";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { getDraftByShareToken } from "@/app/_lib/draft-orders";
import { renderInvoicePdf } from "@/app/_lib/draft-orders";
import { prisma } from "@/app/_lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;

  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return new Response("Not found", { status: 404 });
  }

  const result = await getDraftByShareToken(token, tenant.id);
  if (!result) {
    return new Response("Not found", { status: 404 });
  }

  // Gate på status: PDF tillgänglig för INVOICED/OVERDUE/PAID/COMPLETED.
  // Expired token → 410 Gone (samma logik som invoice-page; PDF är
  // informational efter pay men ska inte gå att ladda om token expirerat
  // pre-pay).
  if (result.expired && result.draft.status !== "PAID" &&
      result.draft.status !== "COMPLETED") {
    return new Response("Gone", { status: 410 });
  }

  const tenantData = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { name: true, settings: true },
  });

  const pdf = await renderInvoicePdf({
    draft: result.draft,
    tenantName: tenantData?.name ?? "",
    tenantAddress: extractAddress(tenantData?.settings),
    brandColor: extractBrandColor(tenantData?.settings),
  });

  const filename = `Faktura-${result.draft.displayNumber}.pdf`;
  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      // Cache: 0 — PDF kan ändras mellan resends (rotated artifacts).
      // Token-baserad URL räcker ej för cache-busting.
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",  // matcha invoice-page
    },
  });
}
```

**Tests (5 cases):**
- 404 när tenant ej resolvar
- 404 när draft ej hittas (cross-tenant token, missing token)
- 410 när token expirerat OCH status=INVOICED
- 200 med Content-Type "application/pdf" + Content-Disposition
- 200 även när status=PAID + token expirerat (informational)

**Checkpoint:** tsc 0 ny i scope, vitest +5 passerande.

### B.4 — "Ladda ner PDF"-knapp i invoice-page
**Filer:**
- `app/(guest)/invoice/[token]/page.tsx` (utökad)
- `app/(guest)/invoice/[token]/page.test.tsx` (utökad — 1 ny case)
- `app/(guest)/invoice/invoice.css` (utökad — `.inv-pdf-link` style)

**Innehåll:**
- `<a href={\`/invoice/${token}/pdf\`} download>Ladda ner PDF</a>`
  i top-right av header eller botten av summary-section
- Visas på alla varianter (INVOICED/OVERDUE/PAID/COMPLETED), inte i
  ExpiredView
- `download` attribute föreslår filnamn, men `Content-Disposition`
  i route-handler är auktoritativ

**Tests (1 case):** länken renderas med korrekt href.

**Checkpoint:** tsc 0 ny i scope, vitest +1 passerande.

### B.5 — Roadmap-update
**Filer:**
- `_audit/draft-orders-roadmap.md`

Markera 7.9 som implementerad. Noter att invoice-domänen i Terminal B
nu är komplett — naturlig point för merge-till-main när Terminal A är
redo.

---

## C — Filer som RÖRS

### Nya filer
- `app/_lib/draft-orders/render-invoice-pdf.tsx`
- `app/_lib/draft-orders/render-invoice-pdf.test.tsx`
- `app/(guest)/invoice/[token]/pdf/route.ts`
- `app/(guest)/invoice/[token]/pdf/route.test.ts`

### Modifierade filer
- `package.json` (+ `package-lock.json` auto)
- `app/_lib/draft-orders/index.ts` (barrel)
- `app/(guest)/invoice/[token]/page.tsx` (+ test)
- `app/(guest)/invoice/invoice.css`
- `_audit/draft-orders-roadmap.md`

### EJ rörda
- `prisma/schema.prisma`
- `app/api/webhooks/**`
- `_lib/email/registry.ts`
- `state-machine.ts`
- All analytics-kod
- `CLAUDE.md`

---

## D — Q-decisions

### Q1 — PDF-renderingsbibliotek (KRITISK)
**Rekommendation:** `@react-pdf/renderer`.

**Motivering:**
- Shopify-pattern. Native React, server-side rendering, no headless
  browser, no cold-start penalty.
- Streamable, fast (~50–200ms typisk render-tid för en faktura).
- Ingen Chromium binary behövs — fungerar perfekt på Vercel/Lambda.
- Mature (4.x line, used in production by tusentals projekt).

**Alternativ A: Puppeteer-on-Vercel.**
- Renderar `/invoice/[token]` direkt → pixel-perfect. Men: Vercel-fientligt.
  Cold starts 5–10s, kräver Lambda-layer för Chromium, runtime instability.
  **Inte** Shopify-grade på serverless.

**Alternativ B: Stripe Invoice PDF.**
- Endast tillgänglig för Stripe Invoice-objekt. Vi använder PaymentIntent.
  Skip.

**Alternativ C: Playwright (redan installerad som devDep).**
- Som Puppeteer — runtime-Chromium på Vercel = ej rekommendabelt.
  Behåll för E2E-tester, ej runtime.

**Beslut:** advisory — gå med React-PDF om inget annat sägs. Detta är
det enda Q som påverkar dependency-yta, så viktigt att operator
godkänner.

### Q2 — Auth-modell för PDF-route
**Rekommendation:** **identisk med invoice-page**: `shareLinkToken`-baserad,
ingen auth utöver. Cross-tenant-skydd via `getDraftByShareToken` återanvänt.
**Motivering:** symmetri med /invoice-page. Kund som har länken kan både
visa och ladda. Operator kan dela samma URL.
**Beslut:** LOCKED — symmetri med 7.3.

### Q3 — Caching
**Rekommendation:** **ingen cache** (`Cache-Control: no-store`).
**Motivering:** PDF kan ändras mellan resends (rotated PI, ny shareLinkToken
implicerar nytt token-värde i URL → faktiskt cache-busting redan, men
expires-värden i datum ändras inte mellan rotations när priser frusna).
För säkerhetsmarginal: no-store. Render är snabb nog att inte motivera CDN.
**Alternativ:** ETag baserat på `draft.version`. Lite mer komplexitet,
liten reward. Skjut till V2.
**Beslut:** advisory.

### Q4 — Custom fonts vs default
**Rekommendation:** **default `Helvetica`** (built-in React-PDF) för V1.
**Motivering:** custom fonts kräver font-files på filesystem, hot-reload-
trubbel under dev, deploy-pipeline-arbete. För V1 är Helvetica standard
för fakturor — perfekt acceptabelt. Brand-customization kan komma senare
(tenant-config + Cloudinary-fontupload eller liknande).
**Beslut:** advisory.

### Q5 — Logo i PDF
**Rekommendation:** **NEJ i V1** (skip image-rendering). Använd tenant.name
som text-header.
**Motivering:** logo kräver image-fetching från Cloudinary i request-time
→ ev. timeout-bekymmer + URL-resolution-komplexitet. V2 kan plocka in
logo via tenant.settings.theme.header.logoUrl.
**Beslut:** advisory.

### Q6 — Branding/färger
**Rekommendation:** **subtil V1**: tenant.settings.theme.colors.buttonBg
(om finns) blir accent-färg på header-rule och total-row. Annars default
svart.
**Beslut:** advisory.

### Q7 — Multilingual
**Rekommendation:** **sv-SE only V1**. Hardcoded labels på svenska.
**Motivering:** invoice-page (FAS 7.3) är också sv-SE only. Konsistens.
Locale-flow är en bredare diskussion.
**Beslut:** advisory.

### Q8 — Operator-side: kan admin-användare ladda ner PDF för en draft?
**Rekommendation:** **ja, men senare fas** (sub-7.9.x). Lägg knapp på
konfigurera-page som öppnar `{portalSlug}.rutgr.com/invoice/{token}/pdf`.
Kräver att admin-page känner till portalSlug + token (har redan båda
i invoiceUrl).
**För V1:** skip — den kund-sidiga PDF-länken är primär. Admin kan klicka
i emailen eller ut "kopiera invoice-URL" som redan finns i konfigurera.
**Beslut:** advisory — om operator vill ha admin-knappen i V1, säg till.

### Q9 — Stora drafts (50+ line items)
**Rekommendation:** React-PDF hanterar pagination automatiskt. Men:
verify under test att drafts med 100+ rader inte timeout:ar route
(>10s = problem).
**V1-action:** ingen limit, men test-case med 50 rader + monitorering.
**Beslut:** LOCKED — natural test-coverage punkt.

### Q10 — Email-attachment
**Rekommendation:** **NEJ i V1**. PDF är download-only via /pdf-route.
**Motivering:** PDF-attachment i email blåser email-storlek (~50–100KB
per faktura), gör email-deliverability sämre, kräver email-infra-ändring.
Länken `Ladda ner PDF` i email-template räcker.
**Beslut:** LOCKED.

---

## E — Q-decisions sammanfattning

| Q | Status | Type |
|---|---|---|
| Q1 PDF-bibliotek | **OPEN — kritisk** | advisory |
| Q2 auth-modell | LOCKED | — |
| Q3 caching | OPEN | advisory |
| Q4 custom fonts | OPEN | advisory |
| Q5 logo i V1 | OPEN | advisory |
| Q6 branding | OPEN | advisory |
| Q7 multilingual | OPEN | advisory |
| Q8 admin-knapp i V1 | OPEN | advisory |
| Q9 stora drafts | LOCKED | — |
| Q10 email-attachment | LOCKED | — |

**Totalt öppna:** 7 advisory, 0 blocking. **Q1 är den enda som kräver
operator-bekräftelse innan B.1** (dependency-add). Övriga går default.

---

## F — Verifieringsplan (innan första push, Terminal Claude)

```bash
cd /workspaces/book-C/admin

# 1. Type-check FULL
npx tsc --noEmit 2>&1 | tee /tmp/tsc-7-9.log
echo "Total errors:"
grep -cE "error TS" /tmp/tsc-7-9.log
# Förväntat: 3 (baseline i denna worktree, 0 nya i scope)

# 2. New tests
npx vitest run \
  app/_lib/draft-orders/render-invoice-pdf.test.tsx \
  "app/(guest)/invoice/[token]/pdf/route.test.ts" \
  "app/(guest)/invoice/[token]/page.test.tsx"

# 3. Lint
npx eslint \
  app/_lib/draft-orders/render-invoice-pdf.tsx \
  app/_lib/draft-orders/render-invoice-pdf.test.tsx \
  "app/(guest)/invoice/[token]/pdf/route.ts" \
  "app/(guest)/invoice/[token]/pdf/route.test.ts" \
  "app/(guest)/invoice/[token]/page.tsx"

# 4. Build (verify React-PDF doesn't break Next.js build)
npm run build

# 5. Smoke i dev:
PORT=3002 npm run dev
# → Open: http://localhost:3002/draft-orders/<id>/konfigurera
# → Skicka faktura → öppna invoice-länk
# → Klicka "Ladda ner PDF" → PDF laddar i ny flik / sparas
# → Verifiera att line items, totals, datum syns korrekt
# → Test stora drafts: skapa draft med 10+ rader, verifiera flersida-
#   pagination
```

---

## G — Stop-protocol-status

- Branch synced: ✓ HEAD = `21e0a08`
- Inga schema-changes: ✓
- Inga out-of-scope-filer: ✓
- Terminal A koordinering: inte krävt
- FAS 7.8 (+ admin_ui_bulk follow-up) verifierad: ✓
- Dependency-add (`@react-pdf/renderer`): kräver operator-godkännande av Q1
