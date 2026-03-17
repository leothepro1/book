import { Text, Section } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";

import type { EmailBranding } from "../branding";

type BookingCancelledProps = Record<string, string> & { branding?: EmailBranding };

const body: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#1a1a1a",
};

const reasonBox: React.CSSProperties = {
  backgroundColor: "#f9f9f9",
  borderRadius: "8px",
  padding: "16px 24px",
  margin: "24px 0",
};

const reasonLabel: React.CSSProperties = {
  fontSize: "12px",
  color: "#666666",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 4px 0",
};

const reasonText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#1a1a1a",
  margin: "0",
};

const closing: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#666666",
  marginTop: "24px",
};

export default function BookingCancelled(props: BookingCancelledProps) {
  const { guestName, hotelName, bookingRef, cancellationReason, branding } = props;
  return (
    <EmailLayout hotelName={hotelName} branding={branding}>
      <Text style={h1Style}>Din bokning har avbokats</Text>
      <Text style={body}>Hej {guestName},</Text>
      <Text style={body}>
        Din bokning på {hotelName} (nr {bookingRef}) har avbokats.
      </Text>
      {cancellationReason && (
        <Section style={reasonBox}>
          <Text style={reasonLabel}>Anledning</Text>
          <Text style={reasonText}>{cancellationReason}</Text>
        </Section>
      )}
      <Text style={closing}>
        Kontakta oss om du har frågor.
      </Text>
    </EmailLayout>
  );
}
