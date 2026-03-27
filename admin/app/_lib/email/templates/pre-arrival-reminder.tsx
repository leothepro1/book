import { Text, Section, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";
import type { EmailBranding } from "../branding";

type Props = Record<string, string> & { branding?: EmailBranding };

const body: React.CSSProperties = { fontSize: "16px", lineHeight: "26px", color: "#1a1a1a" };
const detailsBox: React.CSSProperties = { backgroundColor: "#f9f9f9", borderRadius: "8px", padding: "20px 24px", margin: "24px 0" };
const detailRow: React.CSSProperties = { fontSize: "14px", lineHeight: "28px", color: "#1a1a1a", margin: "0" };
const detailLabel: React.CSSProperties = { color: "#666666", display: "inline-block", width: "120px" };
const checkInHighlight: React.CSSProperties = { fontSize: "18px", fontWeight: 600, color: "#1a1a1a", margin: "0 0 4px 0" };
const ctaButton: React.CSSProperties = { backgroundColor: "#1a1a1a", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: 600, padding: "12px 24px", textDecoration: "none", textAlign: "center" as const, marginTop: "8px" };
const closing: React.CSSProperties = { fontSize: "16px", lineHeight: "26px", color: "#666666", marginTop: "24px" };

export default function PreArrivalReminder(props: Props) {
  const { guestName, hotelName = "hotellet", checkIn, checkOut, roomType, checkInTime, portalUrl, daysUntilArrival, branding } = props;
  const btnStyle = { ...ctaButton, ...(branding?.accentColor ? { backgroundColor: branding.accentColor } : {}) };
  const daysText = daysUntilArrival === "1" ? "imorgon" : `om ${daysUntilArrival} dagar`;

  return (
    <EmailLayout hotelName={hotelName} branding={branding}>
      <Text style={h1Style}>Din vistelse börjar {daysText}!</Text>
      <Text style={body}>Hej {guestName},</Text>
      <Text style={body}>
        Vi ser fram emot att välkomna dig till {hotelName}. Här är en sammanfattning av din bokning.
      </Text>
      <Section style={detailsBox}>
        {checkInTime && <Text style={checkInHighlight}>Incheckning kl {checkInTime}</Text>}
        {checkIn && <Text style={detailRow}><span style={detailLabel}>Ankomst</span> {checkIn}</Text>}
        {checkOut && <Text style={detailRow}><span style={detailLabel}>Avresa</span> {checkOut}</Text>}
        {roomType && <Text style={detailRow}><span style={detailLabel}>Boende</span> {roomType}</Text>}
      </Section>
      {portalUrl && (
        <Link href={portalUrl} style={btnStyle} data-branding="cta">Visa din bokning →</Link>
      )}
      <Text style={closing}>
        Har du frågor inför din vistelse? Kontakta oss så hjälper vi dig.
      </Text>
    </EmailLayout>
  );
}
