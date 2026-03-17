import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Img,
} from "@react-email/components";
import * as React from "react";
import type { EmailBranding } from "../branding";

interface EmailLayoutProps {
  hotelName: string;
  children: React.ReactNode;
  branding?: EmailBranding;
}

const outer: React.CSSProperties = {
  backgroundColor: "#f6f6f6",
  fontFamily: "Arial, Helvetica, sans-serif",
  padding: "40px 0",
};

const card: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  maxWidth: "600px",
  margin: "0 auto",
  padding: "40px 32px",
};

const headerStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#1a1a1a",
  letterSpacing: "0.5px",
  textTransform: "uppercase" as const,
  paddingBottom: "24px",
  borderBottom: "1px solid #e5e5e5",
  marginBottom: "32px",
};

const footerStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#999999",
  lineHeight: "20px",
  textAlign: "center" as const,
  marginTop: "32px",
  paddingTop: "24px",
  borderTop: "1px solid #e5e5e5",
};

export function EmailLayout({ hotelName, children, branding }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Body style={outer}>
        <Container style={card}>
          {branding?.logoUrl && (
            <Img
              src={branding.logoUrl}
              alt={hotelName}
              height="48"
              style={{ maxHeight: "48px", width: "auto", marginBottom: "24px" }}
            />
          )}
          <Text style={headerStyle}>{hotelName}</Text>
          <Section>{children}</Section>
          <Text style={footerStyle}>
            Du får detta mail eftersom du har en bokning hos {hotelName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
