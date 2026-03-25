/**
 * Fake Payment Adapter (Testing)
 * ══════════════════════════════
 *
 * Bedfront's equivalent of Shopify's "Bogus Gateway".
 * Used in local development and all tests. Never loaded in production.
 *
 * No external calls, no signature verification. Always succeeds.
 */

import type {
  PaymentAdapter,
  PaymentAdapterContext,
  PaymentSessionRequest,
  PaymentSessionInit,
  PaymentWebhookEvent,
  PaymentSessionOutcome,
  PaymentStatusResult,
} from "../types";
import type { PrismaClient } from "@prisma/client";

export class FakePaymentAdapter implements PaymentAdapter {
  readonly providerKey = "fake_payments" as const;
  readonly displayName = "Fake Payments (testing)";

  async initiatePayment(
    request: PaymentSessionRequest,
    _ctx: PaymentAdapterContext,
  ): Promise<PaymentSessionInit> {
    return {
      mode: "embedded",
      clientSecret: `fake_secret_${request.sessionId}`,
    };
  }

  async parseWebhook(
    rawBody: string,
    _headers: Record<string, string>,
    db: PrismaClient,
  ): Promise<PaymentWebhookEvent | null> {
    let parsed: { eventId?: string; sessionId?: string; outcome?: string; providerSessionId?: string };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }

    if (!parsed.eventId || !parsed.outcome) {
      return null;
    }

    // Resolve orderId: try DB lookup first, fall back to sessionId for test compat
    let orderId = parsed.sessionId;
    if (parsed.providerSessionId) {
      const ps = await db.paymentSession.findFirst({
        where: { externalSessionId: parsed.providerSessionId },
        select: { orderId: true },
      });
      if (ps) orderId = ps.orderId;
    }

    if (!orderId) return null;

    return {
      providerKey: this.providerKey,
      externalEventId: parsed.eventId,
      orderId,
      rawPayload: parsed,
    };
  }

  async resolveOutcome(event: PaymentWebhookEvent): Promise<PaymentSessionOutcome> {
    const payload = event.rawPayload as { outcome: string };

    switch (payload.outcome) {
      case "resolved":
        return { status: "resolved" };
      case "rejected":
        return { status: "rejected", reason: "PROVIDER_ERROR" };
      case "pending":
        return {
          status: "pending",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        };
      default:
        return { status: "rejected", reason: "PROVIDER_ERROR" };
    }
  }

  async checkPaymentStatus(
    externalSessionId: string,
    _ctx: PaymentAdapterContext,
  ): Promise<PaymentStatusResult | null> {
    return {
      orderId: externalSessionId,
      outcome: { status: "resolved" },
    };
  }

  async handleReturn(
    searchParams: Record<string, string>,
    _ctx: PaymentAdapterContext,
  ): Promise<PaymentSessionOutcome | null> {
    if (searchParams.outcome === "success") {
      return { status: "resolved" };
    }
    return { status: "rejected", reason: "PROVIDER_ERROR" };
  }

  async refund(params: {
    sessionId: string;
    amount: number;
    reason: string;
    ctx: PaymentAdapterContext;
  }): Promise<{ success: boolean; providerRefundId: string }> {
    return {
      success: true,
      providerRefundId: `fake_refund_${Date.now()}`,
    };
  }
}
