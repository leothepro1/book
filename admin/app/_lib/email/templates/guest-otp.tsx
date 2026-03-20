import { Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";

import type { EmailBranding } from "../branding";

type GuestOtpProps = Record<string, string> & { branding?: EmailBranding };

const body: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#1a1a1a",
};

const codeBox: React.CSSProperties = {
  fontSize: "32px",
  fontWeight: 700,
  fontFamily: "monospace",
  letterSpacing: "6px",
  textAlign: "center" as const,
  color: "#1a1a1a",
  backgroundColor: "#f6f6f6",
  borderRadius: "8px",
  padding: "16px 24px",
  margin: "24px 0",
};

const securityNote: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#999999",
  marginTop: "24px",
};

export default function GuestOtp(props: GuestOtpProps) {
  const { guestName, hotelName, otpCode, expiresInMinutes, branding } = props;
  const greeting = guestName ? `Hej ${guestName},` : "Hej,";
  return (
    <EmailLayout hotelName={hotelName} branding={branding}>
      <Text style={h1Style}>Din inloggningskod</Text>
      <Text style={body}>{greeting}</Text>
      <Text style={body}>
        Använd koden nedan för att logga in på din gästportal
        på {hotelName}.
      </Text>
      <Text style={codeBox}>{otpCode}</Text>
      <Text style={securityNote}>
        Koden är giltig i {expiresInMinutes} minuter. Om du inte begärde
        denna kod kan du ignorera detta mail.
      </Text>
    </EmailLayout>
  );
}
