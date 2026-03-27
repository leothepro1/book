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
 *   5. Create the react-email template component
 */

// ── Types ───────────────────────────────────────────────────────

export type EmailCategory =
  | "bokningar"
  | "vistelse"
  | "ordrar"
  | "konto"
  | "support"
  | "presentkort";

/** String literal union — must match Prisma EmailEventType enum exactly */
export type EmailEventType =
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "CHECK_IN_CONFIRMED"
  | "CHECK_OUT_CONFIRMED"
  | "MAGIC_LINK"
  | "SUPPORT_REPLY"
  | "GUEST_OTP"
  | "ORDER_CONFIRMED"
  | "GIFT_CARD_SENT"
  | "PAYMENT_FAILED"
  | "ABANDONED_CHECKOUT"
  | "PRE_ARRIVAL_REMINDER"
  | "POST_STAY_FEEDBACK"
  | "MARKETING_OPT_IN_CONFIRM";

export interface EmailEventDefinition {
  type: EmailEventType;
  label: string;
  category: EmailCategory;
  description: string;
  canDisable: boolean;
  variables: string[];
  defaultSubject: string;
  defaultPreviewText: string;
}

// ── Registry ────────────────────────────────────────────────────

export const EMAIL_EVENT_REGISTRY: readonly EmailEventDefinition[] = [
  // ── Bokningar ─────────────────────────────────────────────────
  {
    type: "BOOKING_CONFIRMED",
    label: "Bokning bekräftad",
    category: "bokningar",
    description: "Skickas när en bokning bekräftas av hotellet eller PMS",
    canDisable: false,
    variables: ["guestName", "hotelName", "checkIn", "checkOut", "roomType", "bookingRef", "loginUrl"],
    defaultSubject: "Din bokning på {{hotelName}} är bekräftad",
    defaultPreviewText: "Välkommen, {{guestName}}! Här är dina bokningsdetaljer.",
  },
  {
    type: "BOOKING_CANCELLED",
    label: "Bokning avbokad",
    category: "bokningar",
    description: "Skickas när en bokning avbokas",
    canDisable: false,
    variables: ["guestName", "hotelName", "bookingRef", "cancellationReason"],
    defaultSubject: "Din bokning på {{hotelName}} är avbokad",
    defaultPreviewText: "Information om din avbokning.",
  },
  {
    type: "ABANDONED_CHECKOUT",
    label: "Övergiven bokning",
    category: "bokningar",
    description: "Skickas när en gäst påbörjat men inte slutfört en bokning",
    canDisable: true,
    variables: ["guestName", "hotelName", "checkIn", "checkOut", "roomType", "resumeUrl"],
    defaultSubject: "Du har en ofullständig bokning på {{hotelName}}",
    defaultPreviewText: "Du påbörjade en bokning – slutför den innan datumen bokats av någon annan.",
  },

  // ── Vistelse ──────────────────────────────────────────────────
  {
    type: "CHECK_IN_CONFIRMED",
    label: "Incheckning bekräftad",
    category: "vistelse",
    description: "Skickas när gästen checkar in",
    canDisable: true,
    variables: ["guestName", "hotelName", "roomNumber", "checkIn", "checkOut", "loginUrl"],
    defaultSubject: "Incheckning bekräftad – välkommen till {{hotelName}}",
    defaultPreviewText: "Ditt rum är redo, {{guestName}}.",
  },
  {
    type: "CHECK_OUT_CONFIRMED",
    label: "Utcheckning bekräftad",
    category: "vistelse",
    description: "Skickas när gästen checkar ut",
    canDisable: true,
    variables: ["guestName", "hotelName", "checkOut"],
    defaultSubject: "Tack för ditt besök på {{hotelName}}",
    defaultPreviewText: "Vi ser fram emot att välkomna dig igen.",
  },
  {
    type: "PRE_ARRIVAL_REMINDER",
    label: "Ankomstpåminnelse",
    category: "vistelse",
    description: "Skickas automatiskt 3 dagar och 1 dag före incheckning",
    canDisable: true,
    variables: ["guestName", "hotelName", "checkIn", "checkOut", "roomType", "checkInTime", "portalUrl", "daysUntilArrival"],
    defaultSubject: "Din vistelse på {{hotelName}} börjar snart",
    defaultPreviewText: "{{guestName}}, om {{daysUntilArrival}} dagar checkar du in!",
  },
  {
    type: "POST_STAY_FEEDBACK",
    label: "Feedback efter vistelse",
    category: "vistelse",
    description: "Skickas automatiskt 24 timmar efter utcheckning",
    canDisable: true,
    variables: ["guestName", "hotelName", "checkIn", "checkOut", "feedbackUrl"],
    defaultSubject: "Hur var din vistelse på {{hotelName}}?",
    defaultPreviewText: "Vi vill gärna höra vad du tyckte, {{guestName}}.",
  },

  // ── Ordrar ────────────────────────────────────────────────────
  {
    type: "ORDER_CONFIRMED",
    label: "Orderbekräftelse",
    category: "ordrar",
    description: "Skickas när en betalning genomförts",
    canDisable: false,
    variables: ["guestName", "orderNumber", "orderTotal", "currency", "tenantName"],
    defaultSubject: "Tack för din beställning #{{orderNumber}}",
    defaultPreviewText: "Hej {{guestName}}, din beställning #{{orderNumber}} är bekräftad.",
  },
  {
    type: "PAYMENT_FAILED",
    label: "Betalning misslyckades",
    category: "ordrar",
    description: "Skickas när en betalning inte kan genomföras",
    canDisable: true,
    variables: ["guestName", "hotelName", "orderNumber", "failureReason", "retryUrl"],
    defaultSubject: "Betalning misslyckades – {{hotelName}}",
    defaultPreviewText: "Din betalning kunde inte genomföras. Prova igen.",
  },

  // ── Konto ─────────────────────────────────────────────────────
  {
    type: "MAGIC_LINK",
    label: "Inloggningslänk",
    category: "konto",
    description: "Skickas när gästen begär en inloggningslänk till portalen",
    canDisable: false,
    variables: ["guestName", "hotelName", "magicLink", "expiresIn"],
    defaultSubject: "Din inloggningslänk till {{hotelName}}",
    defaultPreviewText: "Klicka för att logga in på din gästportal.",
  },
  {
    type: "GUEST_OTP",
    label: "Inloggningskod",
    category: "konto",
    description: "Skickas när gästen begär en engångskod",
    canDisable: false,
    variables: ["guestName", "otpCode", "hotelName", "expiresInMinutes"],
    defaultSubject: "Din inloggningskod — {{hotelName}}",
    defaultPreviewText: "Din kod är giltig i {{expiresInMinutes}} minuter.",
  },
  {
    type: "MARKETING_OPT_IN_CONFIRM",
    label: "Bekräfta marknadsföringsprenumeration",
    category: "konto",
    description: "Skickas vid double opt-in för marknadsföringsmejl",
    canDisable: false,
    variables: ["guestName", "hotelName", "confirmUrl", "unsubscribeUrl"],
    defaultSubject: "Bekräfta din prenumeration – {{hotelName}}",
    defaultPreviewText: "Bekräfta att du vill ta emot nyheter och erbjudanden.",
  },

  // ── Support ───────────────────────────────────────────────────
  {
    type: "SUPPORT_REPLY",
    label: "Svar från support",
    category: "support",
    description: "Skickas när hotellet svarar på ett supportärende",
    canDisable: true,
    variables: ["guestName", "hotelName", "supportMessage", "ticketUrl"],
    defaultSubject: "Svar från {{hotelName}}",
    defaultPreviewText: "Hotellet har svarat på ditt ärende.",
  },

  // ── Presentkort ───────────────────────────────────────────────
  {
    type: "GIFT_CARD_SENT",
    label: "Presentkort skickat",
    category: "presentkort",
    description: "Skickas när ett presentkort levereras till mottagaren",
    canDisable: false,
    variables: ["recipientName", "senderName", "message", "amount", "code", "hotelName", "portalUrl", "giftCardImageUrl"],
    defaultSubject: "{{senderName}} har skickat ett presentkort till dig",
    defaultPreviewText: "Du har fått ett presentkort på {{amount}} kr från {{hotelName}}",
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
