"use client";

import { useState, type CSSProperties } from "react";
import type { DraftOrder } from "@prisma/client";
import { formatSek } from "@/app/_lib/money/format";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const ROW: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 13,
  marginTop: 8,
  color: "var(--admin-text)",
};

const LABEL: CSSProperties = {
  color: "var(--admin-text-muted)",
};

const TOTAL_ROW: CSSProperties = {
  ...ROW,
  borderTop: "1px solid var(--admin-border)",
  paddingTop: 10,
  marginTop: 12,
  fontSize: 14,
  fontWeight: 600,
};

const ACTIONS_ROW: CSSProperties = {
  marginTop: 16,
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const PROCESSING_TEXT: CSSProperties = {
  fontSize: 13,
  color: "var(--admin-text-muted)",
};

type PaymentCardEditableDraft = Pick<
  DraftOrder,
  | "id"
  | "status"
  | "subtotalCents"
  | "orderDiscountCents"
  | "shippingCents"
  | "totalTaxCents"
  | "totalCents"
  | "currency"
  | "guestAccountId"
  | "contactEmail"
  | "invoiceUrl"
>;

interface PaymentCardEditableProps {
  draft: PaymentCardEditableDraft;
  /** Lookup-customer email used for the missing-email gate (Q9 fallback). */
  customerEmail: string | null;
  onSendInvoice: () => void;
  onMarkAsPaid: () => void;
}

export function PaymentCardEditable({
  draft,
  customerEmail,
  onSendInvoice,
  onMarkAsPaid,
}: PaymentCardEditableProps) {
  const [copied, setCopied] = useState(false);

  const showDiscount = draft.orderDiscountCents > BigInt(0);
  const showShipping = draft.shippingCents > BigInt(0);
  const showTax = draft.totalTaxCents > BigInt(0);

  const showSendInvoice = ["OPEN", "APPROVED"].includes(draft.status);
  const showMarkAsPaid = ["INVOICED", "OVERDUE"].includes(draft.status);
  const showCopyInvoiceUrl = showMarkAsPaid && draft.invoiceUrl !== null;
  const showProcessing = ["PAID", "COMPLETING"].includes(draft.status);
  const hasActionRow =
    showSendInvoice || showMarkAsPaid || showCopyInvoiceUrl || showProcessing;

  const hasCustomer = draft.guestAccountId !== null;
  const hasEmail =
    (draft.contactEmail !== null && draft.contactEmail.length > 0) ||
    (customerEmail !== null && customerEmail.length > 0);
  const sendInvoiceDisabled = !hasCustomer || !hasEmail;
  const sendInvoiceTooltip = !hasCustomer
    ? "Lägg till kund först"
    : !hasEmail
      ? "Kunden saknar e-postadress"
      : undefined;

  const handleCopy = async () => {
    if (!draft.invoiceUrl) return;
    await navigator.clipboard.writeText(draft.invoiceUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Betalning</span>
      </div>

      <div style={ROW}>
        <span style={LABEL}>Delsumma</span>
        <span>{formatSek(draft.subtotalCents)}</span>
      </div>
      {showDiscount && (
        <div style={ROW}>
          <span style={LABEL}>Rabatt</span>
          <span>−{formatSek(draft.orderDiscountCents)}</span>
        </div>
      )}
      {showShipping && (
        <div style={ROW}>
          <span style={LABEL}>Frakt</span>
          <span>{formatSek(draft.shippingCents)}</span>
        </div>
      )}
      {showTax && (
        <div style={ROW}>
          <span style={LABEL}>Moms</span>
          <span>{formatSek(draft.totalTaxCents)}</span>
        </div>
      )}
      <div style={TOTAL_ROW}>
        <span>Totalt</span>
        <span>{formatSek(draft.totalCents)}</span>
      </div>

      {hasActionRow && (
        <div style={ACTIONS_ROW}>
          {showSendInvoice && (
            <button
              type="button"
              className="admin-btn admin-btn--accent"
              onClick={onSendInvoice}
              disabled={sendInvoiceDisabled}
              title={sendInvoiceTooltip}
            >
              Skicka faktura
            </button>
          )}
          {showMarkAsPaid && (
            <button
              type="button"
              className="admin-btn admin-btn--accent"
              onClick={onMarkAsPaid}
            >
              Markera som betald
            </button>
          )}
          {showCopyInvoiceUrl && (
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => {
                void handleCopy();
              }}
            >
              {copied ? "Kopierat!" : "Kopiera fakturalänk"}
            </button>
          )}
          {showProcessing && (
            <span style={PROCESSING_TEXT}>
              {draft.status === "PAID"
                ? "Konverterar till order…"
                : "Genomförs…"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
