export const dynamic = "force-dynamic";

/**
 * Provider-Agnostic Payment Webhook Endpoint
 * ═══════════════════════════════════════════
 *
 * /api/webhooks/payments/[provider]
 *
 * Swedbank Pay → POST /api/webhooks/payments/swedbank_pay
 * Nets         → POST /api/webhooks/payments/nets
 *
 * Bedfront Payments (Stripe) keeps /api/webhooks/stripe for backwards
 * compatibility, but can also use /api/webhooks/payments/bedfront_payments.
 */

import { NextResponse } from "next/server";
import { handlePaymentWebhook } from "@/app/_lib/payments/providers/webhook";
import { log } from "@/app/_lib/logger";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerKey } = await params;
  const rawBody = await req.text();

  // Flatten headers into a plain object for the adapter
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  try {
    const result = await handlePaymentWebhook(providerKey, rawBody, headers);
    return NextResponse.json({ ok: result.handled });
  } catch (err) {
    log("error", "webhook.provider_error", {
      providerKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse("Internal error", { status: 500 });
  }
}
