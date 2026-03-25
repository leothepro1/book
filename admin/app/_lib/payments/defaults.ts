/**
 * Payment Method Defaults
 * ═══════════════════════
 *
 * Sensible defaults for the Scandinavian market.
 * Seeded on first Stripe Connect completion.
 */

import type { PaymentMethodConfig } from "./types";

export const DEFAULT_PAYMENT_METHOD_CONFIG: PaymentMethodConfig = {
  version: 1,
  methods: {
    card: true,        // always-on — Visa & Mastercard
    amex: true,        // American Express
    google_pay: true,  // wallet
    apple_pay: true,   // wallet
    klarna: true,      // BNPL — popular in Scandinavia
    swish: true,       // Sweden's dominant mobile payment
    paypal: false,     // opt-in
  },
};
