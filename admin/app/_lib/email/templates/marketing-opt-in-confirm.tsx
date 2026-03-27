import { Text, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";
import type { EmailBranding } from "../branding";

type Props = Record<string, string> & { branding?: EmailBranding };

const body: React.CSSProperties = { fontSize: "16px", lineHeight: "26px", color: "#1a1a1a" };
const ctaButton: React.CSSProperties = { backgroundColor: "#1a1a1a", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: 600, padding: "12px 24px", textDecoration: "none", textAlign: "center" as const, marginTop: "16px" };
const disclaimerStyle: React.CSSProperties = { fontSize: "13px", lineHeight: "22px", color: "#999999", marginTop: "24px" };
const unsubStyle: React.CSSProperties = { fontSize: "13px", color: "#666666", textDecoration: "underline", display: "block", marginTop: "8px", textAlign: "center" as const };

export default function MarketingOptInConfirm(props: Props) {
  const { guestName, hotelName = "hotellet", confirmUrl, unsubscribeUrl, branding } = props;
  const btnStyle = { ...ctaButton, ...(branding?.accentColor ? { backgroundColor: branding.accentColor } : {}) };

  return (
    <EmailLayout hotelName={hotelName} branding={branding}>
      <Text style={h1Style}>Bekräfta din prenumeration</Text>
      <Text style={body}>Hej {guestName},</Text>
      <Text style={body}>
        Klicka på knappen nedan för att bekräfta att du vill ta emot nyheter och erbjudanden från {hotelName}.
      </Text>
      {confirmUrl && (
        <Link href={confirmUrl} style={btnStyle} data-branding="cta">Bekräfta prenumeration →</Link>
      )}
      {unsubscribeUrl && (
        <Link href={unsubscribeUrl} style={unsubStyle}>Avregistrera dig</Link>
      )}
      <Text style={disclaimerStyle}>
        Om du inte har begärt detta kan du ignorera detta mejl. Ingen prenumeration aktiveras utan din bekräftelse.
      </Text>
    </EmailLayout>
  );
}
