"use client";

import { useState, type CSSProperties } from "react";
import type { DraftOrder } from "@prisma/client";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { DraftBadge } from "@/app/(admin)/_components/draft-orders/DraftBadge";

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

type StatusCardDraft = Pick<
  DraftOrder,
  | "status"
  | "createdAt"
  | "expiresAt"
  | "invoiceSentAt"
  | "pricesFrozenAt"
  | "invoiceUrl"
  | "completedAt"
  | "cancelledAt"
  | "cancellationReason"
>;

interface StatusCardProps {
  draft: StatusCardDraft;
  stripePaymentIntent: { id: string; status: string } | null;
}

function fmtDateTime(d: Date): string {
  return format(d, "d MMM yyyy 'kl' HH:mm", { locale: sv });
}

function fmtDate(d: Date): string {
  return format(d, "d MMM yyyy", { locale: sv });
}

const COPY_BUTTON: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 13,
  color: "var(--admin-link, #0070d2)",
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "underline",
};

const REASON_ROW: CSSProperties = {
  ...ROW,
  alignItems: "flex-start",
  fontSize: 12,
  color: "var(--admin-text-muted)",
};

export function StatusCard({ draft, stripePaymentIntent }: StatusCardProps) {
  const [urlCopied, setUrlCopied] = useState(false);

  const handleCopy = async () => {
    if (!draft.invoiceUrl) return;
    await navigator.clipboard.writeText(draft.invoiceUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Status</span>
      </div>
      <div style={{ marginBottom: 4 }}>
        <DraftBadge status={draft.status} />
      </div>
      <div style={ROW}>
        <span style={LABEL}>Skapad</span>
        <span>{fmtDateTime(draft.createdAt)}</span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>Utgår</span>
        <span>{fmtDate(draft.expiresAt)}</span>
      </div>
      {draft.invoiceSentAt !== null && (
        <div style={ROW}>
          <span style={LABEL}>Faktura skickad</span>
          <span>{fmtDateTime(draft.invoiceSentAt)}</span>
        </div>
      )}
      {draft.pricesFrozenAt !== null && (
        <div style={ROW}>
          <span style={LABEL}>Priser låsta</span>
          <span>{fmtDateTime(draft.pricesFrozenAt)}</span>
        </div>
      )}
      {draft.invoiceUrl !== null && (
        <div style={ROW}>
          <span style={LABEL}>Fakturalänk</span>
          <button
            type="button"
            style={COPY_BUTTON}
            onClick={() => {
              void handleCopy();
            }}
          >
            {urlCopied ? "Kopierat!" : "Kopiera"}
          </button>
        </div>
      )}
      {stripePaymentIntent !== null && (
        <div style={ROW}>
          <span style={LABEL}>Betalning</span>
          <span>{stripePaymentIntent.status}</span>
        </div>
      )}
      {draft.completedAt !== null && (
        <div style={ROW}>
          <span style={LABEL}>Genomfört</span>
          <span>{fmtDateTime(draft.completedAt)}</span>
        </div>
      )}
      {draft.cancelledAt !== null && (
        <>
          <div style={ROW}>
            <span style={LABEL}>Avbruten</span>
            <span>{fmtDateTime(draft.cancelledAt)}</span>
          </div>
          {draft.cancellationReason !== null &&
            draft.cancellationReason.length > 0 && (
              <div style={REASON_ROW}>
                <span>Anledning: {draft.cancellationReason}</span>
              </div>
            )}
        </>
      )}
    </div>
  );
}
