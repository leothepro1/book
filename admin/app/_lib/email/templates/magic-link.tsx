import { Text, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";

import type { EmailBranding } from "../branding";

type MagicLinkProps = Record<string, string> & { branding?: EmailBranding };

const body: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#1a1a1a",
};

const ctaButton: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 600,
  padding: "12px 32px",
  textDecoration: "none",
  textAlign: "center" as const,
  marginTop: "8px",
};

const securityNote: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#999999",
  marginTop: "24px",
};

export default function MagicLink(props: MagicLinkProps) {
  const { guestName, hotelName, magicLink, expiresIn, branding } = props;
  const greeting = guestName ? `Hej ${guestName},` : "Hej,";
  const btnStyle = { ...ctaButton, ...(branding?.accentColor ? { backgroundColor: branding.accentColor } : {}) };
  return (
    <EmailLayout hotelName={hotelName} branding={branding}>
      <Text style={h1Style}>Logga in på din gästportal</Text>
      <Text style={body}>{greeting}</Text>
      <Text style={body}>
        Klicka på knappen nedan för att logga in på din gästportal
        på {hotelName}.
      </Text>
      <Link href={magicLink} style={btnStyle} data-branding="cta">
        Logga in
      </Link>
      <Text style={securityNote}>
        Länken är giltig i {expiresIn}. Om du inte begärde denna länk
        kan du ignorera detta mail.
      </Text>
    </EmailLayout>
  );
}
