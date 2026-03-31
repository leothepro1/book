/**
 * Bedfront Payments Adapter (Stripe)
 * ═══════════════════════════════════
 *
 * Primary payment adapter. Wraps Stripe Connect infrastructure.
 * providerKey: "bedfront_payments" — stored in DB, never changes.
 *
 * Supports both embedded (Stripe Elements) and redirect (Checkout Session) modes.
 * Mode determined by request.metadata.checkoutMode:
 *   "session" → Stripe Checkout Session (redirect)
 *   default   → Stripe PaymentIntent (embedded)
 */

import { prisma } from "@/app/_lib/db/prisma";
import { getStripe } from "@/app/_lib/stripe/client";
import { verifyChargesEnabled } from "@/app/_lib/stripe/verify-account";
import { getPlatformFeeBps, calculateApplicationFee } from "@/app/_lib/payments/platform-fee";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";
import type {
  PaymentAdapter,
  PaymentAdapterContext,
  PaymentSessionRequest,
  PaymentSessionInit,
  PaymentWebhookEvent,
  PaymentSessionOutcome,
  PaymentSessionRejectedReason,
  PaymentStatusResult,
} from "../types";
import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";

// ── Error code mapping ──────────────────────────────────────────

function mapStripeDeclineCode(code?: string | null): PaymentSessionRejectedReason {
  switch (code) {
    case "insufficient_funds":
      return "INSUFFICIENT_FUNDS";
    case "card_declined":
    case "do_not_honor":
    case "generic_decline":
    case "lost_card":
    case "stolen_card":
      return "CARD_DECLINED";
    case "fraudulent":
      return "FRAUD";
    default:
      return "PROVIDER_ERROR";
  }
}

// ── Adapter ─────────────────────────────────────────────────────

export class BedfrontPaymentsAdapter implements PaymentAdapter {
  readonly providerKey = "bedfront_payments" as const;
  readonly displayName = "Bedfront Payments";

  async initiatePayment(
    request: PaymentSessionRequest,
    _ctx: PaymentAdapterContext,
  ): Promise<PaymentSessionInit> {
    const checkoutMode = request.metadata.checkoutMode;

    if (checkoutMode === "session") {
      return this._initiateCheckoutSession(request);
    }

    return this._initiatePaymentIntent(request);
  }

  // ── PaymentIntent mode (embedded / Stripe Elements) ────────────

  private async _initiatePaymentIntent(
    request: PaymentSessionRequest,
  ): Promise<PaymentSessionInit> {
    const { sessionId, tenantId, amount, currency, metadata } = request;

    // DB-level lock: upsert placeholder PaymentSession to prevent
    // concurrent PI creation for the same sessionId (race condition fix).
    const existing = await prisma.paymentSession.upsert({
      where: { orderId: sessionId },
      create: {
        orderId: sessionId,
        tenantId,
        providerKey: this.providerKey,
        amount,
        currency,
        status: "INITIATED",
      },
      update: {},
    });

    if (existing.externalSessionId) {
      const stripe = getStripe();
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { stripeAccountId: true },
      });
      const connectParams = tenant?.stripeAccountId
        ? { stripeAccount: tenant.stripeAccountId }
        : undefined;

      const pi = await stripe.paymentIntents.retrieve(
        existing.externalSessionId,
        connectParams,
      );

      if (pi.status === "canceled" || pi.status === "succeeded") {
        await prisma.paymentSession.update({
          where: { orderId: sessionId },
          data: { externalSessionId: null },
        });
      } else {
        log("info", "payment.idempotent_retrieve", {
          sessionId,
          paymentIntentId: pi.id,
        });
        return { mode: "embedded", clientSecret: pi.client_secret! };
      }
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        stripeAccountId: true,
        stripeOnboardingComplete: true,
        subscriptionPlan: true,
        platformFeeBps: true,
      },
    });

    // If Connect onboarding is not complete, process on platform account directly
    const useConnect = tenant.stripeAccountId && tenant.stripeOnboardingComplete;

    if (useConnect) {
      const chargesOk = await verifyChargesEnabled(tenant.stripeAccountId!);
      if (!chargesOk) {
        throw new Error("Stripe account cannot accept charges");
      }
    }

    const feeBps = request.platformFeeBps
      ?? getPlatformFeeBps(tenant.subscriptionPlan, tenant.platformFeeBps);
    const applicationFeeAmount = useConnect ? calculateApplicationFee(amount, feeBps) : 0;

    const stripe = getStripe();

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount,
        currency: currency.toLowerCase(),
        payment_method_types: ["card"],
        ...(useConnect && { application_fee_amount: applicationFeeAmount }),
        receipt_email: request.guestEmail || undefined,
        metadata: {
          ...metadata,
          providerKey: this.providerKey,
          sessionId,
          feeBps: String(feeBps),
        },
      },
      useConnect ? { stripeAccount: tenant.stripeAccountId! } : undefined,
    );

    await prisma.paymentSession.upsert({
      where: { orderId: sessionId },
      create: {
        orderId: sessionId,
        tenantId,
        providerKey: this.providerKey,
        amount,
        currency,
        externalSessionId: paymentIntent.id,
        rawInitResponse: {
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
        },
      },
      update: {
        externalSessionId: paymentIntent.id,
      },
    });

    log("info", "payment.initiated", {
      sessionId,
      tenantId,
      paymentIntentId: paymentIntent.id,
      amount,
      currency,
      applicationFeeAmount,
      feeBps,
    });

    return { mode: "embedded", clientSecret: paymentIntent.client_secret! };
  }

  // ── Checkout Session mode (redirect / Stripe hosted page) ──────

  private async _initiateCheckoutSession(
    request: PaymentSessionRequest,
  ): Promise<PaymentSessionInit> {
    const { sessionId, tenantId, amount, currency, metadata } = request;

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        stripeAccountId: true,
        stripeOnboardingComplete: true,
        subscriptionPlan: true,
        platformFeeBps: true,
        portalSlug: true,
      },
    });

    const useConnect = tenant.stripeAccountId && tenant.stripeOnboardingComplete;

    if (useConnect) {
      await verifyChargesEnabled(tenant.stripeAccountId!);
    }

    const feeBps = request.platformFeeBps
      ?? getPlatformFeeBps(tenant.subscriptionPlan, tenant.platformFeeBps);
    const applicationFeeAmount = useConnect ? calculateApplicationFee(amount, feeBps) : 0;

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_intent_data: {
          ...(useConnect && { application_fee_amount: applicationFeeAmount }),
          metadata: {
            sessionId,
            tenantId,
            providerKey: this.providerKey,
            feeBps: String(feeBps),
          },
        },
        line_items: [{
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: amount,
            product_data: {
              name: metadata.productName ?? "Beställning",
            },
          },
          quantity: 1,
        }],
        customer_email: request.guestEmail || undefined,
        success_url: request.returnUrl,
        cancel_url: request.cancelUrl ?? request.returnUrl,
        metadata: {
          sessionId,
          tenantId,
          providerKey: this.providerKey,
        },
      },
      useConnect ? { stripeAccount: tenant.stripeAccountId! } : undefined,
    );

    await prisma.paymentSession.upsert({
      where: { orderId: sessionId },
      create: {
        orderId: sessionId,
        tenantId,
        providerKey: this.providerKey,
        amount,
        currency,
        externalSessionId: session.id,
        rawInitResponse: { sessionId: session.id, url: session.url },
      },
      update: { externalSessionId: session.id },
    });

    log("info", "payment.session_initiated", {
      sessionId,
      tenantId,
      stripeSessionId: session.id,
      amount,
      currency,
      applicationFeeAmount,
      feeBps,
    });

    return {
      mode: "redirect",
      redirectUrl: session.url!,
      providerSessionId: session.id,
    };
  }

  // ── Webhook parsing ────────────────────────────────────────────

  async parseWebhook(
    rawBody: string,
    headers: Record<string, string>,
    db: PrismaClient,
  ): Promise<PaymentWebhookEvent | null> {
    const stripe = getStripe();
    const signature = headers["stripe-signature"];

    if (!signature) return null;

    const connectedAccountId = headers["stripe-account"];
    const secret = connectedAccountId && env.STRIPE_CONNECT_WEBHOOK_SECRET
      ? env.STRIPE_CONNECT_WEBHOOK_SECRET
      : env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      return null;
    }

    if (connectedAccountId) {
      const tenant = await db.tenant.findFirst({
        where: { stripeAccountId: connectedAccountId },
        select: { id: true },
      });
      if (!tenant) {
        log("warn", "webhook.unknown_connect_account", {
          stripeAccount: connectedAccountId,
        });
        return null;
      }
    }

    const handledTypes = [
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "payment_intent.canceled",
      "checkout.session.completed",
      "checkout.session.expired",
    ];
    if (!handledTypes.includes(event.type)) return null;

    // Extract orderId: try metadata first, then DB lookup via externalSessionId
    const obj = event.data.object as Stripe.PaymentIntent | Stripe.Checkout.Session;
    let orderId: string | undefined;

    if ("metadata" in obj && obj.metadata?.sessionId) {
      orderId = obj.metadata.sessionId;
    } else if ("metadata" in obj && obj.metadata?.orderId) {
      orderId = obj.metadata.orderId;
    }

    // Fallback: look up via PaymentSession.externalSessionId
    if (!orderId) {
      const externalId = obj.id;
      const ps = await db.paymentSession.findFirst({
        where: { externalSessionId: externalId },
        select: { orderId: true },
      });
      orderId = ps?.orderId ?? undefined;
    }

    if (!orderId) return null;

    return {
      providerKey: this.providerKey,
      externalEventId: event.id,
      orderId,
      rawPayload: event,
    };
  }

  // ── Outcome resolution ─────────────────────────────────────────

  async resolveOutcome(
    event: PaymentWebhookEvent,
  ): Promise<PaymentSessionOutcome> {
    const stripeEvent = event.rawPayload as Stripe.Event;

    switch (stripeEvent.type) {
      case "payment_intent.succeeded":
      case "checkout.session.completed":
        return { status: "resolved" };

      case "payment_intent.payment_failed": {
        const pi = stripeEvent.data.object as Stripe.PaymentIntent;
        const reason = mapStripeDeclineCode(
          pi.last_payment_error?.decline_code ??
            pi.last_payment_error?.code,
        );
        return { status: "rejected", reason };
      }

      case "payment_intent.canceled":
      case "checkout.session.expired":
        return { status: "rejected", reason: "EXPIRED" };

      default:
        return { status: "rejected", reason: "PROVIDER_ERROR" };
    }
  }

  // ── Reconciliation polling ─────────────────────────────────────

  async checkPaymentStatus(
    externalSessionId: string,
    _ctx: PaymentAdapterContext,
  ): Promise<PaymentStatusResult | null> {
    // Look up the PaymentSession to get orderId and tenant info
    const session = await prisma.paymentSession.findFirst({
      where: { externalSessionId },
      select: { orderId: true, tenantId: true },
    });
    if (!session) return null;

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { stripeAccountId: true },
    });

    const stripe = getStripe();
    const connectParams = tenant?.stripeAccountId
      ? { stripeAccount: tenant.stripeAccountId }
      : undefined;

    // PaymentIntent IDs start with pi_, Checkout Sessions with cs_
    if (externalSessionId.startsWith("pi_")) {
      const pi = await stripe.paymentIntents.retrieve(externalSessionId, connectParams);
      if (pi.status === "succeeded") {
        return { orderId: session.orderId, outcome: { status: "resolved" } };
      }
      if (pi.status === "canceled") {
        return { orderId: session.orderId, outcome: { status: "rejected", reason: "EXPIRED" } };
      }
      // requires_payment_method, requires_action, processing — still pending
      return null;
    }

    if (externalSessionId.startsWith("cs_")) {
      const cs = await stripe.checkout.sessions.retrieve(externalSessionId, connectParams);
      if (cs.payment_status === "paid") {
        return { orderId: session.orderId, outcome: { status: "resolved" } };
      }
      if (cs.status === "expired") {
        return { orderId: session.orderId, outcome: { status: "rejected", reason: "EXPIRED" } };
      }
      return null;
    }

    return null;
  }

  // ── Refund ─────────────────────────────────────────────────────

  async refund(params: {
    sessionId: string;
    amount: number;
    reason: string;
    ctx: PaymentAdapterContext;
  }): Promise<{ success: boolean; providerRefundId: string }> {
    const { sessionId, amount } = params;

    const session = await prisma.paymentSession.findUnique({
      where: { orderId: sessionId },
    });
    if (!session?.externalSessionId) {
      throw new Error("No PaymentIntent found for session");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { stripeAccountId: true },
    });

    const stripe = getStripe();
    const connectParams = tenant?.stripeAccountId
      ? { stripeAccount: tenant.stripeAccountId }
      : undefined;

    const pi = await stripe.paymentIntents.retrieve(
      session.externalSessionId,
      connectParams,
    );
    const chargeId = pi.latest_charge as string;

    if (!chargeId) {
      throw new Error("No charge found on PaymentIntent");
    }

    const refund = await stripe.refunds.create(
      {
        charge: chargeId,
        amount,
        reason: "requested_by_customer",
      },
      connectParams,
    );

    await prisma.paymentSession.update({
      where: { orderId: sessionId },
      data: {
        status: "REFUNDED",
        externalRefundId: refund.id,
      },
    });

    log("info", "payment.refunded", {
      sessionId,
      refundId: refund.id,
      amount,
    });

    return { success: true, providerRefundId: refund.id };
  }
}
