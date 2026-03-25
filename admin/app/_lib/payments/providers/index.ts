/**
 * Payment Providers — Public API
 * ══════════════════════════════
 *
 * This file is the entry point for the payment provider module.
 * Import this wherever the app needs payment provider functionality.
 *
 * Adding a new provider:
 *   1. Create adapter file in adapters/
 *   2. Add registerPaymentAdapter() call below
 *   3. Done — checkout engine picks it up automatically
 */

import { registerPaymentAdapter } from "./registry";
import { BedfrontPaymentsAdapter } from "./adapters/bedfront-payments";
import { FakePaymentAdapter } from "./adapters/fake-payments";

// ── Register all adapters at boot ───────────────────────────────

registerPaymentAdapter(new BedfrontPaymentsAdapter());

// Fake adapter — dev/test only. Never in production.
if (process.env.NODE_ENV !== "production") {
  registerPaymentAdapter(new FakePaymentAdapter());
}

// Future providers:
// registerPaymentAdapter(new SwedbankPayAdapter());
// registerPaymentAdapter(new NetsAdapter());

// ── Re-exports ──────────────────────────────────────────────────

export { getAdapterForTenant, getAdapterAndContextForTenant } from "./config";
export { initiateOrderPayment } from "./initiate";
export { handlePaymentWebhook } from "./webhook";
export { getPaymentAdapter, listPaymentAdapters } from "./registry";
export type {
  PaymentAdapter,
  PaymentAdapterContext,
  PaymentSessionRequest,
  PaymentSessionInit,
  PaymentSessionOutcome,
  PaymentWebhookEvent,
  PaymentStatusResult,
} from "./types";
