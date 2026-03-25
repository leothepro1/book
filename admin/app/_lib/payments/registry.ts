/**
 * Payment Method Registry — platform master list
 * ════════════════════════════════════════════════
 *
 * Single source of truth for all payment methods the platform supports.
 * Tenants cannot add to this list — they can only toggle entries on/off.
 * All methods are provided through Stripe.
 */

import type { PaymentMethodDefinition, PaymentMethodId } from "./types";

// ── SVG brand icons ─────────────────────────────────────────────

const SVG_VISA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="38" height="24"><rect width="48" height="32" rx="4" fill="#1A1F71"/><path d="M19.5 21h-2.7l1.7-10.5h2.7L19.5 21zm11.1-10.2c-.5-.2-1.4-.4-2.4-.4-2.6 0-4.5 1.4-4.5 3.4 0 1.5 1.3 2.3 2.3 2.8 1 .5 1.4.8 1.4 1.3 0 .7-.8 1-1.6 1-1.1 0-1.6-.2-2.5-.5l-.3-.2-.4 2.2c.6.3 1.8.5 3 .5 2.8 0 4.6-1.4 4.6-3.5 0-1.2-.7-2.1-2.2-2.8-.9-.5-1.5-.8-1.5-1.3 0-.4.5-.9 1.5-.9.9 0 1.5.2 2 .4l.2.1.4-2.1zM35.4 21h2.3l-2-10.5H33.4c-.6 0-1.1.3-1.3.9l-3.8 9.6h2.7l.5-1.5h3.3l.3 1.5h.3zm-2.9-3.5l1.4-3.8.8 3.8h-2.2zM16.2 10.5l-2.6 7.2-.3-1.4c-.5-1.6-2-3.4-3.7-4.3l2.3 8.9h2.8l4.2-10.5h-2.7v.1z" fill="#fff"/><path d="M11.5 10.5H7.4l0 .2c3.3.8 5.4 2.9 6.3 5.3l-.9-4.6c-.2-.6-.7-.9-1.3-.9z" fill="#F9A533"/></svg>`;

const SVG_MASTERCARD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="38" height="24"><rect width="48" height="32" rx="4" fill="#252525"/><circle cx="19" cy="16" r="8" fill="#EB001B"/><circle cx="29" cy="16" r="8" fill="#F79E1B"/><path d="M24 10.3a8 8 0 0 1 3 5.7 8 8 0 0 1-3 5.7 8 8 0 0 1-3-5.7 8 8 0 0 1 3-5.7z" fill="#FF5F00"/></svg>`;

const SVG_AMEX = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="38" height="24"><rect width="48" height="32" rx="4" fill="#006FCF"/><path d="M7 14l2.5-6h3l2.5 6h-2.3l-.5-1.2h-2.6L9.1 14H7zm3.4-2.4h1.5l-.7-1.9-.8 1.9zM15.5 14V8h2.8l1.5 3.5L21.3 8h2.7v6h-1.8v-4l-1.7 4h-1.5l-1.7-4v4h-1.8zM25 14V8h5.5v1.5h-3.7v.8h3.6v1.4h-3.6v.8H31V14h-6zm6.5 0l2.5-3-2.3-3h2.3l1.2 1.7L36.5 8h2.2l-2.3 3 2.5 3H36.7l-1.4-1.8L34 14h-2.5z" fill="#fff"/><path d="M7 24v-6h5.5v1.5H8.8v.8h3.6v1.4H8.8v.8H13V24H7zm6.5 0l2.5-3-2.3-3H16l1.2 1.7L18.5 18h2.2l-2.3 3 2.5 3h-2.2l-1.4-1.8L16 24h-2.5zm7 0V18h3.3c1.4 0 2.2.8 2.2 1.8 0 1-.7 1.5-1 1.6l1.3 2.6h-2l-1.1-2.2h-1v2.2h-1.7zm1.7-3.5h1.4c.5 0 .7-.3.7-.6 0-.4-.3-.6-.7-.6h-1.4v1.2zM27 24V18h5.5v1.5h-3.7v.8h3.6v1.4h-3.6v.8H33V24h-6zm6.5 0l1.5-1.5c.8.8 1.8 1.2 2.8 1.2.7 0 1.1-.3 1.1-.7 0-.3-.2-.5-.9-.6l-.9-.1c-1.4-.2-2.2-.9-2.2-2 0-1.3 1.1-2.1 2.7-2.1 1.2 0 2.2.4 2.9 1l-1.3 1.3c-.6-.5-1.3-.8-2-.8-.5 0-.8.2-.8.5 0 .3.2.5.8.6l.9.2c1.5.2 2.3.9 2.3 2 0 1.3-1.1 2.3-2.9 2.3-1.3 0-2.5-.4-3.3-1.2l.3-.1z" fill="#fff"/></svg>`;

const SVG_KLARNA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="38" height="24"><rect width="48" height="32" rx="4" fill="#FFB3C7"/><path d="M12 10h2.7v12H12V10zm3 0h2.5c0 2.5-1 4.8-2.7 6.5l4.6 5.5h-3.3l-4.3-5.2.9-.8c1.5-1.5 2.3-3.6 2.3-6zm6.7 10.3c0-.9.7-1.6 1.6-1.6.9 0 1.6.7 1.6 1.6 0 .9-.7 1.6-1.6 1.6-.9 0-1.6-.7-1.6-1.6zM27 10h2.5v12H27V10zm8 0c0 2.5-1 4.8-2.7 6.5L37 22h-3.2l-4.3-5.2.9-.8c1.5-1.5 2.3-3.6 2.3-6H35z" fill="#0A0B09"/></svg>`;

const SVG_SWISH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="38" height="24"><rect width="48" height="32" rx="4" fill="#fff" stroke="#ddd" stroke-width=".5"/><path d="M31.2 9.5c-2.8-1.5-6.1-1.3-8.6.5l-4.2 3c-1.7 1.2-4 1.4-5.9.4l-.8-.5c-.3-.2-.6.1-.5.4.7 2.1 2.2 3.8 4.3 4.7 2.8 1.2 6 .8 8.4-1l4-3.1c1.7-1.3 4-1.5 5.9-.5l.6.3c.3.2.6-.1.5-.4-.7-1.8-2-3.2-3.7-3.8z" fill="#ED1C24"/><path d="M16.8 22.5c2.8 1.5 6.1 1.3 8.6-.5l4.2-3c1.7-1.2 4-1.4 5.9-.4l.8.5c.3.2.6-.1.5-.4-.7-2.1-2.2-3.8-4.3-4.7-2.8-1.2-6-.8-8.4 1l-4 3.1c-1.7 1.3-4 1.5-5.9.5l-.6-.3c-.3-.2-.6.1-.5.4.7 1.8 2 3.2 3.7 3.8z" fill="#52B5E1"/></svg>`;

const SVG_PAYPAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="38" height="24"><rect width="48" height="32" rx="4" fill="#fff" stroke="#ddd" stroke-width=".5"/><path d="M17.1 24.3h-2.8c-.2 0-.3-.1-.3-.3L16 11.7c0-.1.1-.2.3-.2h2.8c2.3 0 3.9 1.2 3.6 3.3-.4 2.5-2.3 3.7-4.6 3.7h-1.1c-.2 0-.3.1-.3.3l-.6 3.6v.1c0 .1-.2.2-.3.2l.3-.4z" fill="#003087"/><path d="M28.5 11.4c.4-2.1-1.3-3.3-3.6-3.3h-4.7c-.3 0-.5.2-.6.5l-2 12.7c0 .2.1.4.4.4h2.9l.7-4.5c0-.2.3-.4.5-.4h1.1c2.7 0 4.9-1.6 5.4-4.5l-.1-.9z" fill="#002F86"/><path d="M21 15.4l.7-4.2c0-.2.3-.4.5-.4h4.7c.5 0 1 .1 1.4.2-.4 2.9-2.7 4.5-5.4 4.5h-1.1c-.3 0-.5.2-.6.4l-.2-.5z" fill="#009CDE"/></svg>`;

const SVG_GPAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="38" height="24"><rect width="48" height="32" rx="4" fill="#fff" stroke="#ddd" stroke-width=".5"/><path fill="#4285F4" d="M23.8 16.5v3h-1.1v-7.4h2.8c.7 0 1.3.2 1.8.7.5.5.7 1 .7 1.6s-.3 1.2-.7 1.6c-.5.5-1.1.7-1.8.7h-1.7zm0-3.4v2.4h1.8c.4 0 .7-.2 1-.5.5-.5.5-1.4 0-1.9-.3-.3-.6-.5-1-.4h-1.8z"/><path fill="#EA4335" d="M31.2 14c.8 0 1.4.2 1.9.7.5.4.7 1 .7 1.8v3.1h-1v-.7c-.4.6-1 .9-1.7.9-.6 0-1.1-.2-1.5-.5-.4-.4-.6-.8-.6-1.3s.2-1 .7-1.4c.4-.3 1-.5 1.7-.5.6 0 1.1.1 1.5.4v-.2c0-.4-.2-.7-.4-1a1.5 1.5 0 0 0-1-.4c-.6 0-1.1.3-1.3.8l-1-.4c.4-.8 1-1.3 2-1.3zm-1.3 4.1c0 .3.1.5.4.7.2.2.5.3.8.3.4 0 .9-.2 1.2-.5.3-.3.5-.7.5-1.2-.3-.3-.8-.4-1.4-.4-.4 0-.8.1-1.1.3-.3.2-.4.5-.4.8z"/><path fill="#4285F4" d="M38.5 14.2l-3.5 8.1h-1.1l1.3-2.9-2.3-5.2h1.2l1.6 4 1.6-4h1.2z"/><path fill="#4285F4" d="M18.4 15.7c0-.3 0-.6-.1-.9h-4.5v1.7h2.6c-.1.6-.4 1.1-1 1.4v1.2h1.5a4.6 4.6 0 0 0 1.5-3.4z"/><path fill="#34A853" d="M13.8 19.4c1.3 0 2.3-.4 3.1-1.1l-1.5-1.2c-.4.3-1 .5-1.6.5-1.2 0-2.3-.8-2.6-2h-1.6v1.2a4.6 4.6 0 0 0 4.2 2.6z"/><path fill="#FBBC04" d="M11.2 15.6c-.1-.3-.2-.7-.2-1s.1-.7.2-1v-1.2H9.6a4.6 4.6 0 0 0 0 4.2l1.6-1z"/><path fill="#EA4335" d="M13.8 11.6c.7 0 1.3.2 1.8.7l1.3-1.3a4.4 4.4 0 0 0-3.1-1.2 4.6 4.6 0 0 0-4.2 2.6l1.6 1.2c.3-1.2 1.4-2 2.6-2z"/></svg>`;

const SVG_APPLEPAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="38" height="24"><rect width="48" height="32" rx="4" fill="#000"/><path d="M15.3 11.3c-.4.5-1 .8-1.6.8-.1-.6.2-1.3.5-1.7.4-.5 1-.8 1.5-.8.1.7-.2 1.3-.4 1.7zm.4.9c-.9 0-1.6.5-2 .5s-1.1-.5-1.8-.5c-.9 0-1.8.5-2.3 1.4-1 1.7-.3 4.2.7 5.6.5.7 1 1.5 1.8 1.4.7 0 1-.5 1.8-.5s1.1.5 1.8.5c.8 0 1.2-.7 1.7-1.4.5-.8.7-1.5.7-1.6-.7-.3-1.3-1.1-1.3-2.1 0-.9.5-1.7 1.2-2-.6-.8-1.5-1.3-2.3-1.3zm7.2-.7v9h1.3v-3.1h1.8c1.6 0 2.8-1.1 2.8-2.9 0-1.9-1.1-3-2.7-3h-3.2zm1.3 1.1h1.5c1.1 0 1.7.6 1.7 1.6 0 1.1-.6 1.7-1.7 1.7h-1.5v-3.3zm7 8c.8 0 1.6-.4 2-.1.1h0v-1c-.4.2-.8.4-1.3.4-.9 0-1.4-.5-1.5-1.3h4.2v-.5c0-2-1.1-3.2-2.8-3.2s-3 1.3-3 3.3c0 2 1.1 3.2 2.9 3.2l.5.2zm-.4-5.2c.7 0 1.2.5 1.2 1.3h-2.6c.1-.8.6-1.3 1.4-1.3zm4.4 6.4c.7 1 2.1 1.7 3.3 1.7 1.9 0 3.1-1 3.1-2.5 0-1.2-.7-1.9-2.3-2.3l-.9-.2c-.8-.2-1.2-.5-1.2-1 0-.6.6-1 1.3-1 .7 0 1.3.4 1.6.8l.8-.7c-.5-.7-1.3-1.2-2.4-1.2-1.7 0-2.8 1-2.8 2.4 0 1.2.7 1.9 2.2 2.3l.9.3c.9.2 1.3.5 1.3 1.1 0 .7-.6 1.1-1.5 1.1-.9 0-1.6-.4-2-1.1l-.9.6.5.7z" fill="#fff"/></svg>`;

// ── Registry ────────────────────────────────────────────────────

export const PAYMENT_METHOD_REGISTRY: PaymentMethodDefinition[] = [
  // ── Card Networks ─────────────────────────────────────────────
  {
    id: "card",
    category: "card_networks",
    name: "Visa & Mastercard",
    description: "Kredit- och betalkort",
    icon: null,
    svgIcon: `<span style="display:inline-flex;gap:4px">${SVG_VISA}${SVG_MASTERCARD}</span>`,
    stripeTypes: ["card"],
    alwaysOn: true,
    clientDetected: false,
    defaultEnabled: true,
    availableCountries: null,
  },
  {
    id: "amex",
    category: "card_networks",
    name: "American Express",
    description: "American Express-kort",
    icon: null,
    svgIcon: SVG_AMEX,
    stripeTypes: ["card"],
    alwaysOn: false,
    clientDetected: false,
    defaultEnabled: true,
    availableCountries: null,
  },

  // ── Wallets ───────────────────────────────────────────────────
  {
    id: "google_pay",
    category: "wallets",
    name: "Google Pay",
    description: "Betala med Google Pay",
    icon: null,
    svgIcon: SVG_GPAY,
    stripeTypes: ["card"], // Wallets go through card payment_method_type
    alwaysOn: false,
    clientDetected: true,
    defaultEnabled: true,
    availableCountries: null,
  },
  {
    id: "apple_pay",
    category: "wallets",
    name: "Apple Pay",
    description: "Betala med Apple Pay",
    icon: null,
    svgIcon: SVG_APPLEPAY,
    stripeTypes: ["card"],
    alwaysOn: false,
    clientDetected: true,
    defaultEnabled: true,
    availableCountries: null,
  },

  // ── Buy Now Pay Later ─────────────────────────────────────────
  {
    id: "klarna",
    category: "bnpl",
    name: "Klarna",
    description: "Köp nu, betala senare",
    icon: null,
    svgIcon: SVG_KLARNA,
    stripeTypes: ["klarna"],
    alwaysOn: false,
    clientDetected: false,
    defaultEnabled: true,
    availableCountries: ["SE", "NO", "FI", "DK", "DE", "AT", "NL", "BE", "GB", "US"],
  },

  // ── Local Methods ─────────────────────────────────────────────
  {
    id: "swish",
    category: "local",
    name: "Swish",
    description: "Betala direkt med Swish",
    icon: null,
    svgIcon: SVG_SWISH,
    stripeTypes: ["swish"],
    alwaysOn: false,
    clientDetected: false,
    defaultEnabled: true,
    availableCountries: ["SE"],
  },

  // ── Redirect Methods ──────────────────────────────────────────
  {
    id: "paypal",
    category: "redirect",
    name: "PayPal",
    description: "Betala via PayPal",
    icon: null,
    svgIcon: SVG_PAYPAL,
    stripeTypes: ["paypal"],
    alwaysOn: false,
    clientDetected: false,
    defaultEnabled: false,
    availableCountries: null,
  },
];

// ── Lookup helpers ──────────────────────────────────────────────

export const PAYMENT_METHOD_MAP = new Map<PaymentMethodId, PaymentMethodDefinition>(
  PAYMENT_METHOD_REGISTRY.map((m) => [m.id, m]),
);

export function getMethodDefinition(id: PaymentMethodId): PaymentMethodDefinition {
  const def = PAYMENT_METHOD_MAP.get(id);
  if (!def) throw new Error(`Unknown payment method: ${id}`);
  return def;
}

/** Group registry entries by category, preserving insertion order. */
export function getMethodsByCategory(): Map<string, PaymentMethodDefinition[]> {
  const groups = new Map<string, PaymentMethodDefinition[]>();
  for (const def of PAYMENT_METHOD_REGISTRY) {
    const list = groups.get(def.category) ?? [];
    list.push(def);
    groups.set(def.category, list);
  }
  return groups;
}

/** Swedish labels for category groups. */
export const CATEGORY_LABELS: Record<string, string> = {
  card_networks: "Kort",
  wallets: "Plånböcker",
  bnpl: "Köp nu, betala senare",
  local: "Lokala metoder",
  redirect: "Omdirigering",
};
