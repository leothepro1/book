import { Text, Section, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";

import type { EmailBranding } from "../branding";

type OrderConfirmedProps = Record<string, string> & { branding?: EmailBranding };

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
  width: "120px",
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

const secondaryLink: React.CSSProperties = {
  fontSize: "13px",
  color: "#666666",
  textDecoration: "underline",
  display: "block",
  marginTop: "12px",
  textAlign: "center" as const,
};

const closing: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#666666",
  marginTop: "24px",
};

export default function OrderConfirmed(props: OrderConfirmedProps) {
  const { guestName, orderNumber, orderTotal, tenantName, orderStatusUrl, portalUrl, branding } = props;
  const hotelName = tenantName || "hotellet";
  const btnStyle = { ...ctaButton, ...(branding?.accentColor ? { backgroundColor: branding.accentColor } : {}) };

  return (
    <EmailLayout hotelName={hotelName} branding={branding}>
      <Text style={h1Style}>Tack för din beställning!</Text>
      <Text style={body}>Hej {guestName},</Text>
      <Text style={body}>
        Din beställning har bekräftats och betalningen är genomförd.
      </Text>
      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>Ordernummer</span> #{orderNumber}
        </Text>
        <Text style={totalRow}>
          <span style={detailLabel}>Totalt</span> {orderTotal}
        </Text>
      </Section>
      {orderStatusUrl && (
        <Link href={orderStatusUrl} style={btnStyle} data-branding="cta">
          Se din order →
        </Link>
      )}
      {portalUrl && (
        <Link href={portalUrl} style={secondaryLink}>
          Logga in på ditt konto
        </Link>
      )}
      <Text style={closing}>
        Tack för ditt köp. Har du frågor, kontakta oss så hjälper vi dig.
      </Text>
    </EmailLayout>
  );
}
