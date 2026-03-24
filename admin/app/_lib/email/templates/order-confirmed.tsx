import { Text, Section } from "@react-email/components";
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

const closing: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#666666",
  marginTop: "24px",
};

export default function OrderConfirmed(props: OrderConfirmedProps) {
  const { guestName, orderNumber, orderTotal, tenantName, branding } = props;
  const hotelName = tenantName || "hotellet";

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
      <Text style={closing}>
        Tack för ditt köp. Har du frågor, kontakta oss så hjälper vi dig.
      </Text>
    </EmailLayout>
  );
}
