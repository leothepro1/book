import { describe, it, expect } from "vitest";
import { renderDefaultTemplate } from "./index";
import type { EmailEventType } from "../registry";

const sampleVars: Record<string, string> = {
  guestName: "Anna Lindgren",
  hotelName: "Grand Hotel Stockholm",
  checkIn: "2025-08-15",
  checkOut: "2025-08-18",
  roomType: "Dubbelrum Deluxe",
  bookingRef: "BK-20250001",
  loginUrl: "https://portal.grandhotel.se/login",
  roomNumber: "412",
  magicLink: "https://portal.grandhotel.se/auth/magic/xyz",
  expiresIn: "24 timmar",
  cancellationReason: "Gästen avbokade via portalen",
  supportMessage: "Tack för din förfrågan. Ditt rum är på 4:e våningen.",
  ticketUrl: "https://portal.grandhotel.se/support/ticket/99",
  // Draft-invoice vars
  displayNumber: "D-2026-0042",
  totalAmount: "1 234 kr",
  currency: "SEK",
  invoiceUrl: "https://grand-hotel-stockholm.rutgr.com/portal/invoice/abc123",
  expiresAt: "31 maj 2026",
};

const eventTypes: EmailEventType[] = [
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "CHECK_IN_CONFIRMED",
  "CHECK_OUT_CONFIRMED",
  "MAGIC_LINK",
  "SUPPORT_REPLY",
  "DRAFT_INVOICE",
];

describe("renderDefaultTemplate", () => {
  for (const eventType of eventTypes) {
    describe(eventType, () => {
      it("renders a non-empty HTML string", async () => {
        const html = await renderDefaultTemplate(eventType, sampleVars);
        expect(html.length).toBeGreaterThan(0);
      });

      it("contains hotelName", async () => {
        const html = await renderDefaultTemplate(eventType, sampleVars);
        expect(html).toContain("Grand Hotel Stockholm");
      });

      it("contains guestName", async () => {
        const html = await renderDefaultTemplate(eventType, sampleVars);
        expect(html).toContain("Anna Lindgren");
      });

      it("is valid HTML", async () => {
        const html = await renderDefaultTemplate(eventType, sampleVars);
        expect(html).toContain("<html");
        expect(html).toContain("</html>");
      });
    });
  }
});

// ── VerifySender template ─────────────────────────────────────

import { render } from "@react-email/components";
import VerifySender from "./verify-sender";

describe("VerifySender email template", () => {
  it("renders confirm URL as a link", async () => {
    const html = await render(
      VerifySender({
        confirmUrl: "https://rutgr.com/api/email-sender/verify/confirm?token=abc123",
        platformName: "Bedfront",
      }),
    );
    expect(html).toContain("confirm?token=abc123");
    expect(html).toContain("Verifiera e-postadress");
  });

  it("renders heading and expiry notice", async () => {
    const html = await render(
      VerifySender({ confirmUrl: "https://example.com", platformName: "Bedfront" }),
    );
    expect(html).toContain("Bekräfta din e-postadress");
    expect(html).toContain("24 timmar");
  });

  it("renders platform name in layout", async () => {
    const html = await render(
      VerifySender({ confirmUrl: "https://example.com", platformName: "My Platform" }),
    );
    expect(html).toContain("My Platform");
  });

  it("is valid HTML", async () => {
    const html = await render(
      VerifySender({ confirmUrl: "https://example.com", platformName: "Test" }),
    );
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });
});
