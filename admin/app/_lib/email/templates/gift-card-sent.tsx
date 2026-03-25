import { Text, Section, Img } from "@react-email/components";
import * as React from "react";
import { EmailLayout, h1Style } from "./_layout";

import type { EmailBranding } from "../branding";

type GiftCardSentProps = Record<string, string> & { branding?: EmailBranding };

const body: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#1a1a1a",
};

const codeBox: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 700,
  fontFamily: "monospace",
  letterSpacing: "4px",
  textAlign: "center" as const,
  color: "#1a1a1a",
  backgroundColor: "#f6f6f6",
  borderRadius: "8px",
  padding: "20px 24px",
  margin: "24px 0",
};

const messageBox: React.CSSProperties = {
  backgroundColor: "#fafafa",
  borderLeft: "3px solid #e5e5e5",
  borderRadius: "0 8px 8px 0",
  padding: "16px 20px",
  margin: "20px 0",
  fontStyle: "italic" as const,
  fontSize: "15px",
  lineHeight: "24px",
  color: "#444444",
};

const detailsBox: React.CSSProperties = {
  backgroundColor: "#f9f9f9",
  borderRadius: "8px",
  padding: "16px 20px",
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
  width: "80px",
};

const instruction: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#666666",
  marginTop: "24px",
};

const giftCardImage: React.CSSProperties = {
  width: "100%",
  maxWidth: "520px",
  height: "auto",
  borderRadius: "16px",
  margin: "0 0 24px",
  display: "block",
};

export default function GiftCardSent(props: GiftCardSentProps) {
  const { recipientName, senderName, message, amount, code, hotelName, portalUrl, giftCardImageUrl, branding } = props;

  return (
    <EmailLayout hotelName={hotelName || "hotellet"} branding={branding}>
      <Text style={h1Style}>Du har fått ett presentkort!</Text>

      <Text style={body}>
        Hej {recipientName},
      </Text>

      <Text style={body}>
        {senderName} har skickat ett presentkort till dig från {hotelName}.
      </Text>

      {/* Gift card design image — the visual centerpiece */}
      {giftCardImageUrl && (
        <Img
          src={giftCardImageUrl}
          alt="Presentkort"
          width={520}
          style={giftCardImage}
        />
      )}

      {/* Gift card code — the most important element */}
      <Text style={codeBox}>{code}</Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>Värde</span> {amount} kr
        </Text>
      </Section>

      {/* Personal message if present */}
      {message && (
        <Section style={messageBox}>
          <Text style={{ margin: 0, fontSize: "15px", lineHeight: "24px", color: "#444" }}>
            &ldquo;{message}&rdquo;
          </Text>
          <Text style={{ margin: "8px 0 0", fontSize: "13px", color: "#888" }}>
            — {senderName}
          </Text>
        </Section>
      )}

      <Text style={instruction}>
        Ange koden vid bokning på {portalUrl || hotelName} för att använda
        ditt presentkort. Koden kan användas vid ett eller flera tillfällen
        tills hela beloppet är förbrukat.
      </Text>
    </EmailLayout>
  );
}
