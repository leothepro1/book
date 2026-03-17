import { Text, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type VerifySenderProps = Record<string, string>;

const body: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#1a1a1a",
};

const ctaButton: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 600,
  padding: "12px 32px",
  textDecoration: "none",
  textAlign: "center" as const,
  marginTop: "8px",
};

const expiryNote: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#999999",
  marginTop: "24px",
};

export default function VerifySender(props: VerifySenderProps) {
  const { confirmUrl, platformName } = props;
  return (
    <EmailLayout hotelName={platformName || "Bedfront"}>
      <Text style={{ ...body, fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>
        Bekräfta din e-postadress
      </Text>
      <Text style={body}>
        Bekräfta den här e-postadressen för att skydda ditt varumärke och
        se till att du får kundsvar. Detta verifierar att du har tillgång
        till det här e-postkontot.
      </Text>
      <Link href={confirmUrl} style={ctaButton}>
        Verifiera e-postadress
      </Link>
      <Text style={expiryNote}>
        Den här länken upphör att gälla om 24 timmar.
      </Text>
      <Text style={{ ...expiryNote, marginTop: "16px" }}>
        Om du har frågor finns vi här för att hjälpa till.
      </Text>
    </EmailLayout>
  );
}
