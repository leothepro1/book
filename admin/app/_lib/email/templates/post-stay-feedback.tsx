import { Text, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";
import type { EmailBranding } from "../branding";

type Props = Record<string, string> & { branding?: EmailBranding };

const body: React.CSSProperties = { fontSize: "16px", lineHeight: "26px", color: "#1a1a1a" };
const ctaButton: React.CSSProperties = { backgroundColor: "#1a1a1a", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: 600, padding: "12px 24px", textDecoration: "none", textAlign: "center" as const, marginTop: "16px" };
const closing: React.CSSProperties = { fontSize: "16px", lineHeight: "26px", color: "#666666", marginTop: "24px" };

export default function PostStayFeedback(props: Props) {
  const { guestName, hotelName = "hotellet", feedbackUrl, branding } = props;
  const btnStyle = { ...ctaButton, ...(branding?.accentColor ? { backgroundColor: branding.accentColor } : {}) };

  return (
    <EmailLayout hotelName={hotelName} branding={branding}>
      <Text style={h1Style}>Tack för att du valde oss</Text>
      <Text style={body}>Hej {guestName},</Text>
      <Text style={body}>
        Vi hoppas att du hade en trevlig vistelse på {hotelName}. Din åsikt är viktig för oss — det tar bara en minut.
      </Text>
      {feedbackUrl && (
        <Link href={feedbackUrl} style={btnStyle} data-branding="cta">Dela din upplevelse →</Link>
      )}
      <Text style={closing}>
        Tack för ditt besök. Vi ser fram emot att välkomna dig igen.
      </Text>
    </EmailLayout>
  );
}
