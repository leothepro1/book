import { Text, Section, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";
import type { EmailBranding } from "../branding";

type Props = Record<string, string> & { branding?: EmailBranding };

const body: React.CSSProperties = { fontSize: "16px", lineHeight: "26px", color: "#1a1a1a" };
const detailsBox: React.CSSProperties = { backgroundColor: "#f9f9f9", borderRadius: "8px", padding: "20px 24px", margin: "24px 0" };
const detailRow: React.CSSProperties = { fontSize: "14px", lineHeight: "28px", color: "#1a1a1a", margin: "0" };
const detailLabel: React.CSSProperties = { color: "#666666", display: "inline-block", width: "120px" };
const ctaButton: React.CSSProperties = { backgroundColor: "#1a1a1a", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: 600, padding: "12px 24px", textDecoration: "none", textAlign: "center" as const, marginTop: "8px" };
const closing: React.CSSProperties = { fontSize: "16px", lineHeight: "26px", color: "#666666", marginTop: "24px" };

export default function AbandonedCheckout(props: Props) {
  const { guestName, hotelName = "hotellet", checkIn, checkOut, roomType, resumeUrl, branding } = props;
  const btnStyle = { ...ctaButton, ...(branding?.accentColor ? { backgroundColor: branding.accentColor } : {}) };

  return (
    <EmailLayout hotelName={hotelName} branding={branding}>
      <Text style={h1Style}>Du har en ofullständig bokning</Text>
      <Text style={body}>Hej {guestName},</Text>
      <Text style={body}>
        Du påbörjade en bokning hos oss men slutförde den inte. Dina valda datum kan fortfarande vara tillgängliga.
      </Text>
      <Section style={detailsBox}>
        {roomType && <Text style={detailRow}><span style={detailLabel}>Boende</span> {roomType}</Text>}
        {checkIn && <Text style={detailRow}><span style={detailLabel}>Incheckning</span> {checkIn}</Text>}
        {checkOut && <Text style={detailRow}><span style={detailLabel}>Utcheckning</span> {checkOut}</Text>}
      </Section>
      {resumeUrl && (
        <Link href={resumeUrl} style={btnStyle} data-branding="cta">Slutför din bokning →</Link>
      )}
      <Text style={closing}>
        Populära datum bokas snabbt — slutför din bokning innan någon annan hinner före.
      </Text>
    </EmailLayout>
  );
}
