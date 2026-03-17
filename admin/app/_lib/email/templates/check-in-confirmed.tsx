import { Text, Section, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type CheckInConfirmedProps = Record<string, string>;

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

export default function CheckInConfirmed(props: CheckInConfirmedProps) {
  const { guestName, hotelName, roomNumber, checkIn, checkOut, portalUrl } = props;
  return (
    <EmailLayout hotelName={hotelName}>
      <Text style={body}>Välkommen, {guestName}!</Text>
      <Text style={body}>
        Du är incheckad på {hotelName}.
      </Text>
      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>Rum</span> {roomNumber}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Incheckning</span> {checkIn}
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Utcheckning</span> {checkOut}
        </Text>
      </Section>
      <Link href={portalUrl} style={ctaButton}>
        Öppna din portal
      </Link>
    </EmailLayout>
  );
}
