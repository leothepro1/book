import { Text, Section, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";

import type { EmailBranding } from "../branding";

type DraftInvoiceProps = Record<string, string> & { branding?: EmailBranding };

const body: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#1a1a1a",
};

const detailsBox: React.CSSProperties = {
  backgroundColor: "#f9f9f9",
  borderRadius: "8px",
  padding: "20px 24px",
  margin: "24px 0",
};

const detailRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "28px",
  color: "#1a1a1a",
  margin: "0",
};

const detailLabel: React.CSSProperties = {
  color: "#666666",
  display: "inline-block",
  width: "140px",
};

const totalRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "28px",
  color: "#1a1a1a",
  margin: "0",
  fontWeight: 600,
  borderTop: "1px solid #e5e5e5",
  paddingTop: "8px",
  marginTop: "8px",
};

const ctaButton: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 600,
  padding: "12px 24px",
  textDecoration: "none",
  textAlign: "center" as const,
  marginTop: "8px",
};

const fallbackLink: React.CSSProperties = {
  fontSize: "13px",
  color: "#666666",
  textDecoration: "underline",
  display: "block",
  marginTop: "12px",
  wordBreak: "break-all" as const,
};

const closing: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#666666",
  marginTop: "24px",
};

export default function DraftInvoice(props: DraftInvoiceProps) {
  const {
    guestName,
    hotelName,
    displayNumber,
    totalAmount,
    expiresAt,
    invoiceUrl,
    branding,
  } = props;
  const safeHotelName = hotelName || "hotellet";
  const btnStyle = {
    ...ctaButton,
    ...(branding?.accentColor ? { backgroundColor: branding.accentColor } : {}),
  };

  return (
    <EmailLayout hotelName={safeHotelName} branding={branding}>
      <Text style={h1Style}>Din faktura är klar</Text>
      <Text style={body}>Hej {guestName},</Text>
      <Text style={body}>
        Här är din faktura från {safeHotelName}. Klicka på knappen nedan för
        att granska och betala.
      </Text>
      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>Fakturanummer</span> {displayNumber}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Förfaller</span> {expiresAt}
        </Text>
        <Text style={totalRow}>
          <span style={detailLabel}>Att betala</span> {totalAmount}
        </Text>
      </Section>
      {invoiceUrl && (
        <>
          <Link href={invoiceUrl} style={btnStyle} data-branding="cta">
            Betala faktura →
          </Link>
          <Link href={invoiceUrl} style={fallbackLink}>
            Eller öppna länken: {invoiceUrl}
          </Link>
        </>
      )}
      <Text style={closing}>
        Frågor om fakturan? Kontakta {safeHotelName} så hjälper vi dig.
      </Text>
    </EmailLayout>
  );
}
