import { Text, Section, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";

import type { EmailBranding } from "../branding";

type BookingConfirmedProps = Record<string, string> & { branding?: EmailBranding };

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

const closing: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#666666",
  marginTop: "24px",
};

export default function BookingConfirmed(props: BookingConfirmedProps) {
  const { guestName, hotelName, checkIn, checkOut, roomType, bookingRef, portalUrl, branding } = props;
  const btnStyle = { ...ctaButton, ...(branding?.accentColor ? { backgroundColor: branding.accentColor } : {}) };
  return (
    <EmailLayout hotelName={hotelName} branding={branding}>
      <Text style={h1Style}>Välkommen till din vistelse hos {hotelName}</Text>
      <Text style={body}>Hej {guestName},</Text>
      <Text style={body}>
        Din bokning är bekräftad.
      </Text>
      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>Ankomst</span> {checkIn}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Avresa</span> {checkOut}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Rumstyp</span> {roomType}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Bokningsnr</span> {bookingRef}
        </Text>
      </Section>
      <Link href={portalUrl} style={btnStyle} data-branding="cta">
        Visa din portal
      </Link>
      <Text style={closing}>
        Vi ser fram emot att välkomna dig.
      </Text>
    </EmailLayout>
  );
}
