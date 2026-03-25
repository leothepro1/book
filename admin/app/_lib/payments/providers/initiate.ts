/**
 * Unified Payment Initiation
 * ══════════════════════════
 *
 * initiateOrderPayment() is the ONLY function checkout routes
 * should call to start a payment. It replaces direct Stripe calls.
 *
 * Flow:
 *   1. Resolve adapter + credentials for tenant
 *   2. Build session request
 *   3. Initiate via adapter (idempotent)
 *   4. Return { mode, clientSecret | redirectUrl }
 */

import { getAdapterAndContextForTenant } from "./config";
import type { PaymentSessionRequest, PaymentSessionInit } from "./types";

export async function initiateOrderPayment(params: {
  order: {
    id: string;
    tenantId: string;
    totalAmount: number;
    currency: string;
  };
  guest: { email: string; name: string };
  locale: string;
  returnUrl: string;
  cancelUrl?: string;
  /** Platform fee in basis points — passed to adapter for application_fee_amount */
  platformFeeBps?: number;
  metadata?: Record<string, string>;
}): Promise<PaymentSessionInit> {
  const { order, guest, locale, returnUrl, cancelUrl, platformFeeBps, metadata } = params;

  // 1. Get the adapter + decrypted credentials for this tenant
  const { adapter, ctx } = await getAdapterAndContextForTenant(order.tenantId);

  // 2. Build the session request
  const request: PaymentSessionRequest = {
    sessionId: order.id,
    tenantId: order.tenantId,
    amount: order.totalAmount,
    currency: order.currency,
    guestEmail: guest.email,
    guestName: guest.name,
    locale,
    returnUrl,
    cancelUrl,
    platformFeeBps,
    metadata: {
      orderId: order.id,
      tenantId: order.tenantId,
      ...metadata,
    },
  };

  // 3. Initiate via adapter (idempotent — same sessionId = same result)
  return adapter.initiatePayment(request, ctx);
}
