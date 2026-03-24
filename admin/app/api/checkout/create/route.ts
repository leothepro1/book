export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { getStripe } from "@/app/_lib/stripe/client";
import { validateCart } from "@/app/_lib/cart/validate";
import { nextOrderNumber } from "@/app/_lib/orders/sequence";
import { reserveInventoryForTenant } from "@/app/_lib/products/inventory";
import { guestInfoSchema } from "@/app/_lib/orders/types";
import type { CartItem } from "@/app/_lib/cart/types";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { getTaxRate } from "@/app/_lib/orders/tax";
import { log } from "@/app/_lib/logger";
import { verifyChargesEnabled } from "@/app/_lib/stripe/verify-account";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { headers } from "next/headers";

const checkoutInputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      productId: z.string(),
      variantId: z.string().nullable(),
      quantity: z.number().int().min(1),
      title: z.string(),
      variantTitle: z.string().nullable(),
      imageUrl: z.string().nullable(),
      unitAmount: z.number().int(),
      currency: z.enum(["SEK", "EUR", "NOK", "DKK"]),
      addedAt: z.string(),
    }),
  ).min(1, "Varukorgen är tom"),
  guestInfo: guestInfoSchema.optional(),
});

export async function POST(req: Request) {
  // ── Rate limit ──────────────────────────────────────────────
  if (!(await checkRateLimit("co", 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  let body: z.infer<typeof checkoutInputSchema>;
  try {
    const raw = await req.json();
    body = checkoutInputSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Ogiltig begäran" },
      { status: 400 },
    );
  }

  const { items } = body;

  // Resolve tenant from host header — never from request body
  const resolvedTenant = await resolveTenantFromHost();
  if (!resolvedTenant) {
    return NextResponse.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  }
  const tenantId = resolvedTenant.id;

  // Verify tenant has Stripe connected
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      portalSlug: true,
      name: true,
    },
  });

  if (!tenant) {
    return NextResponse.json(
      { error: "Organisationen hittades inte" },
      { status: 404 },
    );
  }

  if (!tenant.stripeOnboardingComplete || !tenant.stripeAccountId) {
    return NextResponse.json(
      { error: "STRIPE_NOT_CONFIGURED", message: "Betalning är inte konfigurerad för detta hotell." },
      { status: 503 },
    );
  }

  // ── Verify Connect account can accept charges (cached 60s) ──
  const chargesOk = await verifyChargesEnabled(tenant.stripeAccountId);
  if (!chargesOk) {
    return NextResponse.json(
      { error: "STRIPE_NOT_ACTIVE", message: "Betalning är inte aktiverad för detta hotell. Kontakta hotellet direkt." },
      { status: 400 },
    );
  }

  // Validate cart server-side — re-compute prices
  const validation = await validateCart(tenantId, items as CartItem[]);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Varukorgen innehåller ogiltiga artiklar", errors: validation.errors },
      { status: 409 },
    );
  }

  // Calculate totals using server-validated prices
  const subtotalAmount = validation.validatedItems.reduce(
    (sum, item) => sum + item.validatedUnitAmount * item.quantity,
    0,
  );
  // TODO: derive taxRate from product.taxCategory once tax engine is implemented
  const taxRate = getTaxRate("STANDARD", "SE");
  const taxAmount = taxRate > 0 ? Math.round(subtotalAmount * taxRate / 10000) : 0;
  const totalAmount = subtotalAmount + taxAmount;
  const currency = validation.validatedItems[0]?.currency ?? "SEK";

  // Get sequential order number
  const orderNumber = await nextOrderNumber(tenantId);

  // Create order in a transaction
  const order = await prisma.$transaction(async (tx) => {
    // Create order with line items
    const newOrder = await tx.order.create({
      data: {
        tenantId,
        orderNumber,
        status: "PENDING",
        guestEmail: body.guestInfo?.email ?? "",
        guestName: body.guestInfo?.name ?? "",
        guestPhone: body.guestInfo?.phone,
        subtotalAmount,
        taxRate,
        taxAmount,
        totalAmount,
        currency,
        lineItems: {
          create: validation.validatedItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            title: item.title,
            variantTitle: item.variantTitle,
            sku: null,
            imageUrl: item.imageUrl,
            quantity: item.quantity,
            unitAmount: item.validatedUnitAmount,
            totalAmount: item.validatedUnitAmount * item.quantity,
            currency: item.currency,
          })),
        },
        events: {
          create: {
            type: "CREATED",
            message: `Order #${orderNumber} skapad`,
            metadata: {},
          },
        },
      },
    });

    return newOrder;
  });

  // Reserve inventory for each line item
  for (const item of validation.validatedItems) {
    if (item.quantity > 0) {
      try {
        await reserveInventoryForTenant({
          tenantId,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          sessionId: order.id,
          ttlMinutes: 30,
        });
      } catch {
        // Reservation failure shouldn't block checkout —
        // the product may not track inventory
      }
    }
  }

  // Create Stripe Checkout Session on tenant's connected account
  // Build base URL from tenant subdomain (production) or host header (dev)
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const isDev = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const protocol = isDev ? "http" : "https";
  const baseUrl = isDev
    ? `${protocol}://${host}`
    : `${protocol}://${tenant.portalSlug}.bedfront.com`;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: validation.validatedItems.map((item) => ({
        price_data: {
          currency: item.currency.toLowerCase(),
          product_data: {
            name: item.title,
            ...(item.variantTitle ? { description: item.variantTitle } : {}),
            ...(item.imageUrl ? { images: [item.imageUrl] } : {}),
          },
          unit_amount: item.validatedUnitAmount,
        },
        quantity: item.quantity,
      })),
      customer_email: body.guestInfo?.email || undefined,
      success_url: `${baseUrl}/shop/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/shop/checkout/cancel`,
      metadata: {
        tenantId,
        orderId: order.id,
        orderNumber: String(orderNumber),
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
    },
    { stripeAccount: tenant.stripeAccountId },
  );

  // Update order with Stripe session ID
  await prisma.order.update({
    where: { id: order.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return NextResponse.json({ url: session.url });
}
