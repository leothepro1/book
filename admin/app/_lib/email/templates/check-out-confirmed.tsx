import { Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

import type { EmailBranding } from "../branding";

type CheckOutConfirmedProps = Record<string, string> & { branding?: EmailBranding };

const body: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#1a1a1a",
};

const closing: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#666666",
  marginTop: "24px",
};

export default function CheckOutConfirmed(props: CheckOutConfirmedProps) {
  const { guestName, hotelName, branding } = props;
  return (
    <EmailLayout hotelName={hotelName} branding={branding}>
      <Text style={body}>Tack för ditt besök, {guestName}.</Text>
      <Text style={body}>
        Vi hoppas att du trivdes på {hotelName}.
      </Text>
      <Text style={closing}>Välkommen tillbaka.</Text>
    </EmailLayout>
  );
}
