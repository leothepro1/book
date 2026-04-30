/**
 * Payment Provider Protocol — Type Definitions
 * ═════════════════════════════════════════════
 *
 * Single source of truth for the payment provider abstraction.
 * No other file in the codebase should define payment provider types.
 *
 * Architecture: identical to Shopify's payment extensions.
 * Bedfront owns the Order and its state machine.
 * Payment providers are external services that report a single outcome
 * (resolved | rejected | pending). A provider NEVER touches an Order.
 */

import type { PrismaClient } from "@prisma/client";

// ── Context — passed to every adapter method ────────────────────

export interface PaymentAdapterContext {
  tenantId: string;
  /** Decrypted from TenantPaymentConfig.credentials. Empty for providers using env vars. */
  credentials: Record<string, string>;
}

// ── Session request (Bedfront → Provider) ───────────────────────

export interface PaymentSessionRequest {
  /** Bedfront's Order.id — the source of truth */
  sessionId: string;
  tenantId: string;
  /** Smallest currency unit (öre) */
  amount: number;
  /** ISO 4217, e.g. "SEK" */
  currency: string;
  guestEmail: string;
  guestName: string;
  /** e.g. "sv-SE" */
  locale: string;
  /** Where provider redirects after successful offsite payment */
  returnUrl: string;
  /** Where provider redirects if guest cancels offsite payment */
  cancelUrl?: string;
  /** Platform application fee in basis points, calculated by caller */
  platformFeeBps?: number;
  /**
   * Stripe-level idempotency key. When set, adapters that wrap Stripe
   * forward this verbatim to the Stripe SDK call (`{ idempotencyKey }`
   * second-arg). Required for Phase E lazy `DraftCheckoutSession`
   * creation per `draft-orders-invoice-flow.md` v1.3 §6.4 — without
   * it, a lost network response on `paymentIntents.create` would
   * allow a duplicate PI on retry. D2C callers may omit it; the
   * adapter then relies on its own DB-level dedup (`paymentSession`
   * upsert keyed by `sessionId`), which is sufficient for that path.
   */
  idempotencyKey?: string;
  /** Provider may use for reconciliation */
  metadata: Record<string, string>;
}

// ── Session init (Provider → Bedfront) ──────────────────────────

export type PaymentSessionInit =
  | { mode: "redirect"; redirectUrl: string; providerSessionId?: string }
  | { mode: "embedded"; clientSecret: string; providerSessionId?: string };

// ── Webhook event (normalized from any provider) ────────────────

export interface PaymentWebhookEvent {
  /** "bedfront_payments" | "swedbank_pay" | "nets" */
  providerKey: string;
  /** Provider's own event ID for idempotency */
  externalEventId: string;
  /** Bedfront Order.id — resolved by adapter (from metadata or DB lookup) */
  orderId: string;
  /** Original body, stored for audit */
  rawPayload: unknown;
}

// ── Outcome ─────────────────────────────────────────────────────

export type PaymentSessionOutcome =
  | { status: "resolved" }
  | { status: "rejected"; reason: PaymentSessionRejectedReason }
  | { status: "pending"; expiresAt: Date };

export type PaymentSessionRejectedReason =
  | "INSUFFICIENT_FUNDS"
  | "CARD_DECLINED"
  | "FRAUD"
  | "PROVIDER_ERROR"
  | "CONFIRMATION_REJECTED"
  | "EXPIRED";

// ── Payment status (for reconciliation polling) ─────────────────

export interface PaymentStatusResult {
  orderId: string;
  outcome: PaymentSessionOutcome;
}

// ── Adapter interface ───────────────────────────────────────────

export interface PaymentAdapter {
  /** Stable identifier, never changes. Stored in DB. */
  readonly providerKey: string;
  /** Shown in admin UI */
  readonly displayName: string;

  /**
   * Initiate a payment session. Called when Order is PENDING.
   * Must be idempotent: same sessionId = same result.
   * Adapter decides mode (embedded vs redirect) based on request.metadata.
   */
  initiatePayment(
    request: PaymentSessionRequest,
    ctx: PaymentAdapterContext,
  ): Promise<PaymentSessionInit>;

  /**
   * Verify and normalize an incoming webhook.
   * Returns null if the webhook is not from this provider or not relevant.
   * prisma is passed so adapter can look up orderId from externalSessionId.
   */
  parseWebhook(
    rawBody: string,
    headers: Record<string, string>,
    prisma: PrismaClient,
  ): Promise<PaymentWebhookEvent | null>;

  /**
   * Report the outcome of a payment session.
   * Called by the webhook handler after parseWebhook().
   */
  resolveOutcome(event: PaymentWebhookEvent): Promise<PaymentSessionOutcome>;

  /**
   * Check payment status by polling the provider (for reconciliation).
   * Returns null if provider doesn't support polling or status unknown.
   * Optional — providers that rely purely on webhooks can omit this.
   */
  checkPaymentStatus?(
    externalSessionId: string,
    ctx: PaymentAdapterContext,
  ): Promise<PaymentStatusResult | null>;

  /**
   * Handle guest return from offsite payment page.
   * Called server-side when guest lands on returnUrl.
   * Returns null if adapter doesn't use offsite redirects.
   * Optional — embedded-only providers can omit this.
   */
  handleReturn?(
    searchParams: Record<string, string>,
    ctx: PaymentAdapterContext,
  ): Promise<PaymentSessionOutcome | null>;

  /**
   * Trigger a refund. Amount in smallest currency unit.
   */
  refund(params: {
    sessionId: string;
    amount: number;
    reason: string;
    ctx: PaymentAdapterContext;
  }): Promise<{ success: boolean; providerRefundId: string }>;
}
