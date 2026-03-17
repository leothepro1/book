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
  portalUrl: "https://portal.grandhotel.se/p/abc123",
  roomNumber: "412",
  magicLink: "https://portal.grandhotel.se/auth/magic/xyz",
  expiresIn: "24 timmar",
  cancellationReason: "Gästen avbokade via portalen",
  supportMessage: "Tack för din förfrågan. Ditt rum är på 4:e våningen.",
  ticketUrl: "https://portal.grandhotel.se/support/ticket/99",
};

const eventTypes: EmailEventType[] = [
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "CHECK_IN_CONFIRMED",
  "CHECK_OUT_CONFIRMED",
  "MAGIC_LINK",
  "SUPPORT_REPLY",
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
