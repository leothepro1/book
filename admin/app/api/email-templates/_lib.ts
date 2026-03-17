import { EMAIL_EVENT_REGISTRY } from "@/app/_lib/email";
import type { EmailEventType } from "@/app/_lib/email";

/**
 * Validate that a string is a valid EmailEventType.
 * Returns the typed value or null if invalid.
 */
export function parseEventType(param: string): EmailEventType | null {
  const valid = EMAIL_EVENT_REGISTRY.map((e) => e.type) as string[];
  return valid.includes(param) ? (param as EmailEventType) : null;
}

export const SAMPLE_VARIABLES: Record<string, string> = {
  guestName: "Anna Lindgren",
  hotelName: "Grand Hotel Stockholm",
  checkIn: "2025-08-15",
  checkOut: "2025-08-18",
  roomType: "Dubbelrum Deluxe",
  bookingRef: "BK-20250001",
  portalUrl: "https://portal.example.com/p/abc123",
  roomNumber: "412",
  magicLink: "https://portal.example.com/auth/magic/xyz",
  expiresIn: "24 timmar",
  cancellationReason: "Gästen avbokade via portalen",
  supportMessage: "Tack för din förfrågan. Ditt rum är på 4:e våningen.",
  ticketUrl: "https://portal.example.com/support/ticket/99",
};
