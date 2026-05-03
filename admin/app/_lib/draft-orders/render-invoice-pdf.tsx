/**
 * Server-side invoice PDF renderer (FAS 7.9).
 *
 * One entry point — `renderInvoicePdf` — accepts the customer-safe
 * `PublicDraftDTO` (FAS 7.3) plus a thin slice of tenant context
 * (name, optional address, optional brand accent colour) and returns
 * a `Buffer` containing the rendered A4 portrait PDF.
 *
 * Q-decisions encoded here (see `_audit/7-9-recon.md`):
 *   - Q1 React-PDF (no Chromium / Puppeteer / Playwright)
 *   - Q4 default Helvetica (built into React-PDF)
 *   - Q5 no logo in V1 — tenant name as text-only header
 *   - Q6 subtle brand accent on the FAKTURA block + totals separator
 *   - Q7 sv-SE only
 *
 * Pure server module — never imported by client code. The route
 * handler at `app/(guest)/invoice/[token]/pdf/route.ts` is the sole
 * caller in V1.
 */

import type { ReactElement } from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatSek } from "@/app/_lib/money/format";
import type { PublicDraftDTO, PublicDraftLineItem } from "./get-by-share-token";

// ── Public types ────────────────────────────────────────────────

export type RenderInvoicePdfInput = {
  draft: PublicDraftDTO;
  /** Tenant display name. Empty string → header falls back to "Faktura". */
  tenantName: string;
  /** Optional postal address shown in the From-block. */
  tenantAddress?: string;
  /** Optional accent colour (hex). Used on header rule + totals separator. */
  brandColor?: string;
};

// ── Layout tokens ───────────────────────────────────────────────

const COLOR_TEXT = "#1A1A1A";
const COLOR_MUTED = "#6B6B6B";
const COLOR_DIVIDER = "#E5E5E5";
const COLOR_ACCENT_DEFAULT = "#1A1A1A";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLOR_TEXT,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  headerLeft: { flexGrow: 1 },
  tenantName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
  },
  headerRight: { alignItems: "flex-end" },
  fakturaLabel: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },
  displayNumber: {
    marginTop: 2,
    fontSize: 11,
    color: COLOR_MUTED,
  },
  headerRule: {
    height: 2,
    marginTop: 14,
    marginBottom: 18,
  },
  parties: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  party: { flexBasis: "48%" },
  partyLabel: {
    fontSize: 9,
    color: COLOR_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  partyLine: { fontSize: 10, lineHeight: 1.4 },
  meta: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 18,
  },
  metaCol: { marginRight: 24 },
  metaLabel: {
    fontSize: 9,
    color: COLOR_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metaValue: { fontSize: 10, marginTop: 2 },
  table: {
    borderTopWidth: 1,
    borderTopColor: COLOR_DIVIDER,
    borderBottomWidth: 1,
    borderBottomColor: COLOR_DIVIDER,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLOR_DIVIDER,
  },
  tableHeaderCell: {
    fontSize: 9,
    color: COLOR_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLOR_DIVIDER,
  },
  rowLast: { borderBottomWidth: 0 },
  cellDescription: { flexBasis: "62%", paddingRight: 8 },
  cellQty: { flexBasis: "12%", textAlign: "right" },
  cellAmount: { flexBasis: "26%", textAlign: "right" },
  lineTitle: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  lineMeta: { fontSize: 9, color: COLOR_MUTED, marginTop: 2 },
  totalsBlock: {
    marginTop: 18,
    alignSelf: "flex-end",
    width: "55%",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalLabel: { fontSize: 10, color: COLOR_MUTED },
  totalValue: { fontSize: 10 },
  totalSeparator: {
    height: 1,
    marginVertical: 8,
  },
  totalGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  totalGrandLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  totalGrandValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  note: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLOR_DIVIDER,
  },
  noteLabel: {
    fontSize: 9,
    color: COLOR_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  noteBody: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 9,
    color: COLOR_MUTED,
    textAlign: "center",
  },
});

// ── Component ───────────────────────────────────────────────────

function InvoiceDocument({
  draft,
  tenantName,
  tenantAddress,
  brandColor,
}: RenderInvoicePdfInput) {
  const accent = brandColor ?? COLOR_ACCENT_DEFAULT;
  const headerName = tenantName.length > 0 ? tenantName : "Faktura";
  const buyerName = formatBuyerName(draft);
  const showDiscount = draft.orderDiscountCents > BigInt(0);
  const showTax = draft.totalTaxCents > BigInt(0);

  return (
    <Document
      title={`Faktura ${draft.displayNumber}`}
      author={tenantName.length > 0 ? tenantName : undefined}
      creator="rutgr"
      producer="rutgr"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            <Text style={styles.tenantName}>{headerName}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={[styles.fakturaLabel, { color: accent }]}>
              FAKTURA
            </Text>
            <Text style={styles.displayNumber}>{draft.displayNumber}</Text>
          </View>
        </View>

        <View
          style={[styles.headerRule, { backgroundColor: accent }]}
          fixed
        />

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Från</Text>
            {tenantName.length > 0 ? (
              <Text style={styles.partyLine}>{tenantName}</Text>
            ) : null}
            {tenantAddress !== undefined && tenantAddress.length > 0 ? (
              <Text style={styles.partyLine}>{tenantAddress}</Text>
            ) : null}
          </View>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Till</Text>
            {buyerName !== null ? (
              <Text style={styles.partyLine}>{buyerName}</Text>
            ) : null}
            {draft.contactEmail !== null ? (
              <Text style={styles.partyLine}>{draft.contactEmail}</Text>
            ) : null}
            {draft.contactPhone !== null ? (
              <Text style={styles.partyLine}>{draft.contactPhone}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.meta}>
          {draft.invoiceSentAt !== null ? (
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Faktura-datum</Text>
              <Text style={styles.metaValue}>
                {formatLongDate(draft.invoiceSentAt)}
              </Text>
            </View>
          ) : null}
          {draft.shareLinkExpiresAt !== null ? (
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Förfallodatum</Text>
              <Text style={styles.metaValue}>
                {formatLongDate(draft.shareLinkExpiresAt)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.cellDescription]}>
              Beskrivning
            </Text>
            <Text style={[styles.tableHeaderCell, styles.cellQty]}>Antal</Text>
            <Text style={[styles.tableHeaderCell, styles.cellAmount]}>
              Belopp
            </Text>
          </View>
          {draft.lineItems.map((line, idx) => (
            <View
              key={line.id}
              style={[
                styles.row,
                idx === draft.lineItems.length - 1 ? styles.rowLast : {},
              ]}
              wrap={false}
            >
              <View style={styles.cellDescription}>
                <Text style={styles.lineTitle}>{line.title}</Text>
                {line.variantTitle !== null ? (
                  <Text style={styles.lineMeta}>{line.variantTitle}</Text>
                ) : null}
                {renderLineDates(line)}
              </View>
              <Text style={styles.cellQty}>{line.quantity}</Text>
              <Text style={styles.cellAmount}>
                {formatSek(line.totalCents, { currency: draft.currency })}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock} wrap={false}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Delsumma</Text>
            <Text style={styles.totalValue}>
              {formatSek(draft.subtotalCents, { currency: draft.currency })}
            </Text>
          </View>
          {showDiscount ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Rabatt
                {draft.appliedDiscountCode !== null
                  ? ` (${draft.appliedDiscountCode})`
                  : ""}
              </Text>
              <Text style={styles.totalValue}>
                −
                {formatSek(draft.orderDiscountCents, {
                  currency: draft.currency,
                })}
              </Text>
            </View>
          ) : null}
          {showTax ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Moms{draft.taxesIncluded ? " (ingår)" : ""}
              </Text>
              <Text style={styles.totalValue}>
                {formatSek(draft.totalTaxCents, { currency: draft.currency })}
              </Text>
            </View>
          ) : null}

          <View
            style={[styles.totalSeparator, { backgroundColor: accent }]}
          />

          <View style={styles.totalGrand}>
            <Text style={styles.totalGrandLabel}>Totalt</Text>
            <Text style={styles.totalGrandValue}>
              {formatSek(draft.totalCents, { currency: draft.currency })}
            </Text>
          </View>
        </View>

        {draft.customerNote !== null && draft.customerNote.length > 0 ? (
          <View style={styles.note} wrap={false}>
            <Text style={styles.noteLabel}>Meddelande</Text>
            <Text style={styles.noteBody}>{draft.customerNote}</Text>
          </View>
        ) : null}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Sida ${pageNumber} av ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function formatBuyerName(draft: PublicDraftDTO): string | null {
  const first = draft.contactFirstName ?? "";
  const last = draft.contactLastName ?? "";
  const combined = `${first} ${last}`.trim();
  return combined.length > 0 ? combined : null;
}

function formatLongDate(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function renderLineDates(line: PublicDraftLineItem): ReactElement | null {
  if (line.checkInDate === null || line.checkOutDate === null) return null;
  const range = `${formatShortDate(line.checkInDate)} – ${formatShortDate(
    line.checkOutDate,
  )}`;
  const nights =
    line.nights !== null
      ? ` · ${line.nights} ${line.nights === 1 ? "natt" : "nätter"}`
      : "";
  return <Text style={styles.lineMeta}>{`${range}${nights}`}</Text>;
}

// ── Public service ──────────────────────────────────────────────

export async function renderInvoicePdf(
  input: RenderInvoicePdfInput,
): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument {...input} />);
}
