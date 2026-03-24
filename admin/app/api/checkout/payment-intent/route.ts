export const dynamic = "force-dynamic";

/**
 * Create Payment Intent (Order-First)
 * ════════════════════════════════════
 *
 * Unified checkout pattern: creates an Order FIRST, then a Stripe
 * PaymentIntent. Price is derived server-side — never from client.
 *
 * Used by the accommodation checkout (Stripe Elements flow).
 * The cart/shop flow uses /api/checkout/create (Checkout Session).
 *
 * Returns: { clientSecret, orderId }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/app/_lib/stripe/client";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { resolveProduct } from "@/app/_lib/products/resolve";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { nextOrderNumber } from "@/app/_lib/orders/sequence";
import { getTaxRate } from "@/app/_lib/orders/tax";
import { log } from "@/app/_lib/logger";
import { validateStayDates } from "@/app/_lib/validation/dates";
import { verifyChargesEnabled } from "@/app/_lib/stripe/verify-account";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";

const SUPPORTED_CURRENCIES = ["SEK", "EUR", "NOK", "DKK"] as const;
const MIN_AMOUNT = 1000;   // 10 SEK — below this, price data is wrong
const MAX_AMOUNT = 10_000_000; // 100,000 SEK — requires manual review

const inputSchema = z.object({
  productSlug: z.string().min(1).max(100),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().min(1).max(99),
  ratePlanId: z.string().max(200).nullable().optional(),
  paymentType: z.enum(["full", "klarna"]),
});

export async function POST(req: Request) {
  // ── Rate limit ──────────────────────────────────────────────
  if (!(await checkRateLimit("pi", 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // ── Resolve tenant from host — never from request body ──────
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  }

  // ── Parse + validate input ──────────────────────────────────
  let body: z.infer<typeof inputSchema>;
  try {
    body = inputSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  const { productSlug, checkIn, checkOut, guests, ratePlanId, paymentType } = body;

  // ── Validate dates ────────────────────────────────────────────
  const dateCheck = validateStayDates(checkIn, checkOut);
  if (!dateCheck.valid) {
    return NextResponse.json({ error: "INVALID_PARAMS", message: dateCheck.error }, { status: 400 });
  }

  // ── Fetch product ───────────────────────────────────────────
  const product = await prisma.product.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: productSlug } },
    include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });

  if (!product || product.status !== "ACTIVE") {
    return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
  }

  const resolved = resolveProduct(product);

  // ── Derive price server-side — NEVER trust client ───────────
  let totalPrice = resolved.price;
  let currency = resolved.currency;
  let ratePlanName: string | null = null;

  if (product.productType === "PMS_ACCOMMODATION" && product.pmsSourceId) {
    try {
      const adapter = await resolveAdapter(tenant.id);
      const availability = await adapter.getAvailability(tenant.id, {
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        guests,
      });

      const entry = availability.categories.find(
        (e) => e.category.externalId === product.pmsSourceId,
      );

      if (entry && entry.ratePlans.length > 0) {
        const ratePlan = ratePlanId
          ? entry.ratePlans.find((rp) => rp.externalId === ratePlanId)
          : entry.ratePlans[0];

        if (ratePlan) {
          totalPrice = ratePlan.totalPrice;
          currency = ratePlan.currency;
          ratePlanName = ratePlan.name;
        }
      }
    } catch (err) {
      log("error", "checkout.pms_price_failed", { tenantId: tenant.id, productSlug, error: String(err) });
      return NextResponse.json(
        { error: "PMS_UNAVAILABLE", message: "Kunde inte hämta pris från bokningssystemet." },
        { status: 503 },
      );
    }
  }

  // ── Amount bounds check ────────────────────────────────────
  if (totalPrice < MIN_AMOUNT || totalPrice > MAX_AMOUNT) {
    log("error", "checkout.amount_out_of_bounds", {
      amount: totalPrice, tenantId: tenant.id, productSlug,
    });
    return NextResponse.json(
      { error: "INVALID_PRICE", message: "Ogiltigt belopp. Kontakta hotellet direkt." },
      { status: 400 },
    );
  }

  // ── Validate currency ─────────────────────────────────────
  if (!SUPPORTED_CURRENCIES.includes(currency as typeof SUPPORTED_CURRENCIES[number])) {
    return NextResponse.json(
      { error: "INVALID_CURRENCY", message: "Valutan stöds inte." },
      { status: 400 },
    );
  }

  const nights = dateCheck.nights;

  // ── Verify Stripe Connect account is active ─────────────────
  const tenantStripe = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });

  if (tenantStripe?.stripeAccountId) {
    const chargesOk = await verifyChargesEnabled(tenantStripe.stripeAccountId);
    if (!chargesOk) {
      return NextResponse.json(
        { error: "STRIPE_NOT_ACTIVE", message: "Betalning är inte aktiverad för detta hotell. Kontakta hotellet direkt." },
        { status: 400 },
      );
    }
  }

  // ── Create Order FIRST — before any Stripe call ─────────────
  const orderNumber = await nextOrderNumber(tenant.id);

  // TODO: derive taxRate from product.taxCategory once tax engine is implemented
  const taxRate = getTaxRate(product.productType, "SE");
  const taxAmount = taxRate > 0 ? Math.round(totalPrice * taxRate / 10000) : 0;

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        tenantId: tenant.id,
        orderNumber,
        status: "PENDING",
        paymentMethod: "STRIPE_ELEMENTS",
        guestEmail: "",
        guestName: "",
        subtotalAmount: totalPrice,
        taxRate,
        taxAmount,
        totalAmount: totalPrice + taxAmount,
        currency,
        metadata: {
          checkIn,
          checkOut,
          guests,
          nights,
          ratePlanId: ratePlanId ?? null,
          ratePlanName,
          productSlug,
          productType: product.productType,
          pmsSourceId: product.pmsSourceId ?? null,
        },
        lineItems: {
          create: {
            productId: product.id,
            variantId: null,
            title: resolved.displayTitle,
            variantTitle: ratePlanName,
            sku: null,
            imageUrl: product.media[0]?.url ?? null,
            quantity: 1,
            unitAmount: totalPrice,
            totalAmount: totalPrice,
            currency,
          },
        },
        events: {
          create: {
            type: "CREATED",
            message: `Order #${orderNumber} skapad — ${resolved.displayTitle}, ${checkIn} → ${checkOut}`,
          },
        },
      },
    });
    return newOrder;
  });

  // ── Create Stripe PaymentIntent ─────────────────────────────
  const stripe = getStripe();

  const paymentMethodTypes: string[] =
    paymentType === "klarna" ? ["klarna"] : ["card", "paypal"];

  const connectParams =
    tenantStripe?.stripeAccountId && tenantStripe.stripeOnboardingComplete
      ? { stripeAccount: tenantStripe.stripeAccountId }
      : undefined;

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalPrice,
        currency: currency.toLowerCase(),
        payment_method_types: paymentMethodTypes,
        metadata: {
          tenantId: tenant.id,
          orderId: order.id,
          orderNumber: String(orderNumber),
          productSlug,
        },
      },
      connectParams,
    );

    // Link PaymentIntent to Order
    await prisma.order.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: paymentIntent.id },
    });

    log("info", "checkout.payment_intent_created", {
      tenantId: tenant.id, orderId: order.id, orderNumber,
      amount: totalPrice + taxAmount, currency, paymentIntentId: paymentIntent.id,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      orderId: order.id,
    });
  } catch (err) {
    log("error", "checkout.stripe_pi_failed", { tenantId: tenant.id, orderId: order.id, error: String(err) });

    // Clean up: cancel the orphaned order
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: "CANCELLED",
        message: "Stripe PaymentIntent creation failed — order cancelled",
      },
    });

    return NextResponse.json(
      { error: "PAYMENT_FAILED", message: err instanceof Error ? err.message : "Betalning misslyckades" },
      { status: 503 },
    );
  }
}
