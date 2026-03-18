import { Text, Section, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";

import type { EmailBranding } from "../branding";

type SupportReplyProps = Record<string, string> & { branding?: EmailBranding };

const body: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#1a1a1a",
};

const messageBox: React.CSSProperties = {
  borderLeft: "3px solid #e5e5e5",
  padding: "12px 20px",
  margin: "24px 0",
};

const messageText: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#1a1a1a",
  margin: "0",
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

export default function SupportReply(props: SupportReplyProps) {
  const { guestName, hotelName, supportMessage, ticketUrl, branding } = props;
  const btnStyle = { ...ctaButton, ...(branding?.accentColor ? { backgroundColor: branding.accentColor } : {}) };
  return (
    <EmailLayout hotelName={hotelName} branding={branding}>
      <Text style={h1Style}>Svar på ditt ärende</Text>
      <Text style={body}>Hej {guestName},</Text>
      <Text style={body}>
        {hotelName} har svarat på ditt ärende:
      </Text>
      <Section style={messageBox}>
        <Text style={messageText}>{supportMessage}</Text>
      </Section>
      <Link href={ticketUrl} style={btnStyle} data-branding="cta">
        Visa ärendet
      </Link>
    </EmailLayout>
  );
}
