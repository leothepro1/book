import { Text, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type MagicLinkProps = Record<string, string>;

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

const securityNote: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#999999",
  marginTop: "24px",
};

export default function MagicLink(props: MagicLinkProps) {
  const { guestName, hotelName, magicLink, expiresIn } = props;
  return (
    <EmailLayout hotelName={hotelName}>
      <Text style={body}>Hej {guestName},</Text>
      <Text style={body}>
        Klicka på knappen nedan för att logga in på din gästportal
        på {hotelName}.
      </Text>
      <Link href={magicLink} style={ctaButton}>
        Logga in
      </Link>
      <Text style={securityNote}>
        Länken är giltig i {expiresIn}. Om du inte begärde denna länk
        kan du ignorera detta mail.
      </Text>
    </EmailLayout>
  );
}
