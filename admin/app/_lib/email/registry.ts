/**
 * Email Event Registry
 * ════════════════════
 *
 * Single source of truth for all email event types.
 * Equivalent to PAGE_REGISTRY for pages — all event metadata,
 * default content, and variable definitions live here.
 *
 * To add a new email event:
 *   1. Add the value to EmailEventType in prisma/schema.prisma
 *   2. Add the type to the EmailEventType union below
 *   3. Add a definition to EMAIL_EVENT_REGISTRY
 *   4. Run prisma migrate dev
 *   5. Create the react-email template component (Phase 3)
 */

// ── Types ───────────────────────────────────────────────────────

/** String literal union — must match Prisma EmailEventType enum exactly */
export type EmailEventType =
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "CHECK_IN_CONFIRMED"
  | "CHECK_OUT_CONFIRMED"
  | "MAGIC_LINK"
  | "SUPPORT_REPLY";

export interface EmailEventDefinition {
  type: EmailEventType;
  label: string;
  description: string;
  variables: string[];
  defaultSubject: string;
  defaultPreviewText: string;
}

// ── Registry ────────────────────────────────────────────────────

export const EMAIL_EVENT_REGISTRY: readonly EmailEventDefinition[] = [
  {
    type: "BOOKING_CONFIRMED",
    label: "Bokning bekräftad",
    description: "Skickas när en bokning har bekräftats.",
    variables: [
      "guestName",
      "hotelName",
      "checkIn",
      "checkOut",
      "roomType",
      "bookingRef",
      "portalUrl",
    ],
    defaultSubject: "Din bokning på {{hotelName}} är bekräftad",
    defaultPreviewText:
      "Välkommen, {{guestName}}! Här är dina bokningsdetaljer.",
  },
  {
    type: "BOOKING_CANCELLED",
    label: "Bokning avbokad",
    description: "Skickas när en bokning har avbokats.",
    variables: [
      "guestName",
      "hotelName",
      "bookingRef",
      "cancellationReason",
    ],
    defaultSubject: "Din bokning på {{hotelName}} är avbokad",
    defaultPreviewText: "Information om din avbokning.",
  },
  {
    type: "CHECK_IN_CONFIRMED",
    label: "Incheckning bekräftad",
    description: "Skickas när gästen har checkat in.",
    variables: [
      "guestName",
      "hotelName",
      "roomNumber",
      "checkIn",
      "checkOut",
      "portalUrl",
    ],
    defaultSubject: "Incheckning bekräftad – välkommen till {{hotelName}}",
    defaultPreviewText: "Ditt rum är redo, {{guestName}}.",
  },
  {
    type: "CHECK_OUT_CONFIRMED",
    label: "Utcheckning bekräftad",
    description: "Skickas när gästen har checkat ut.",
    variables: ["guestName", "hotelName", "checkOut"],
    defaultSubject: "Tack för ditt besök på {{hotelName}}",
    defaultPreviewText: "Vi ser fram emot att välkomna dig igen.",
  },
  {
    type: "MAGIC_LINK",
    label: "Inloggningslänk",
    description: "Skickas när gästen begär en inloggningslänk till portalen.",
    variables: ["guestName", "hotelName", "magicLink", "expiresIn"],
    defaultSubject: "Din inloggningslänk till {{hotelName}}",
    defaultPreviewText: "Klicka för att logga in på din gästportal.",
  },
  {
    type: "SUPPORT_REPLY",
    label: "Svar från support",
    description: "Skickas när hotellet har svarat på ett supportärende.",
    variables: ["guestName", "hotelName", "supportMessage", "ticketUrl"],
    defaultSubject: "Svar från {{hotelName}}",
    defaultPreviewText: "Hotellet har svarat på ditt ärende.",
  },
] as const;

// ── Helpers ─────────────────────────────────────────────────────

const registryMap = new Map<EmailEventType, EmailEventDefinition>(
  EMAIL_EVENT_REGISTRY.map((def) => [def.type, def]),
);

/**
 * Look up an event definition by type.
 * Throws if the type is not found — never returns undefined.
 */
export function getEventDefinition(type: EmailEventType): EmailEventDefinition {
  const def = registryMap.get(type);
  if (!def) {
    throw new Error(
      `[email] Unknown email event type: "${type}". ` +
        `Valid types: ${EMAIL_EVENT_REGISTRY.map((d) => d.type).join(", ")}`,
    );
  }
  return def;
}
