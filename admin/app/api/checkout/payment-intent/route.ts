export const dynamic = "force-dynamic";

/**
 * Create Payment Intent
 * ═════════════════════
 *
 * Creates a Stripe PaymentIntent for the checkout flow.
 * Returns clientSecret for Stripe Elements on the frontend.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/app/_lib/stripe/client";
import { prisma } from "@/app/_lib/db/prisma";

const inputSchema = z.object({
  tenantId: z.string().min(1),
  amount: z.number().int().min(1), // ören
  currency: z.string().default("SEK"),
  paymentType: z.enum(["full", "klarna"]),
  metadata: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof inputSchema>;
  try {
    body = inputSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: body.tenantId },
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });

  const stripe = getStripe();

  // Determine payment method types based on payment type
  const paymentMethodTypes: string[] =
    body.paymentType === "klarna"
      ? ["klarna"]
      : ["card", "paypal"];

  try {
    // If tenant has Stripe Connect, create on their account
    // Otherwise create on platform account (dev/test)
    const connectParams = tenant?.stripeAccountId && tenant.stripeOnboardingComplete
      ? { stripeAccount: tenant.stripeAccountId }
      : undefined;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: body.amount,
        currency: body.currency.toLowerCase(),
        payment_method_types: paymentMethodTypes,
        metadata: {
          tenantId: body.tenantId,
          ...body.metadata,
        },
      },
      connectParams,
    );

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error("[payment-intent] Failed:", err);
    return NextResponse.json(
      { error: "PAYMENT_FAILED", message: err instanceof Error ? err.message : "Betalning misslyckades" },
      { status: 503 },
    );
  }
}
