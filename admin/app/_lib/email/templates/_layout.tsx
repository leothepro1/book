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

const responsiveStyles = `
  @media only screen and (max-width: 620px) {
    .email-card { padding: 32px 17px !important; }
  }
`;

const brandZone: React.CSSProperties = {
  paddingBottom: "24px",
  borderBottom: "1px solid #e5e5e5",
  marginBottom: "32px",
};

const brandText: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 700,
  color: "#1a1a1a",
  lineHeight: "36px",
  margin: "0",
};

export const h1Style: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  color: "#1a1a1a",
  lineHeight: "32px",
  margin: "0 0 16px 0",
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
      <Head>
        <style dangerouslySetInnerHTML={{ __html: responsiveStyles }} />
      </Head>
      <Body style={outer}>
        <Container style={card} className="email-card">
          <Section style={brandZone}>
            {branding?.logoUrl && (
              <Img
                data-branding="logo"
                src={branding.logoUrl}
                alt={hotelName}
                style={{
                  width: `${branding.logoWidth ?? 120}px`,
                  height: "auto",
                }}
              />
            )}
            {!branding?.logoUrl && (
              <Img
                data-branding="logo"
                src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                alt=""
                width={1}
                height={1}
                style={{ display: "none" }}
              />
            )}
            <Text
              data-branding="brand-text"
              style={{
                ...brandText,
                display: branding?.logoUrl ? "none" : "",
              }}
            >
              {hotelName}
            </Text>
          </Section>
          <Section>{children}</Section>
          <Text style={footerStyle}>
            Du får detta mail eftersom du har en bokning hos {hotelName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
