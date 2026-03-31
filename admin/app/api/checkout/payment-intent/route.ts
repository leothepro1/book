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
import { initiateOrderPayment } from "@/app/_lib/payments/providers";
import { getPlatformFeeBps } from "@/app/_lib/payments/platform-fee";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { resolveProduct } from "@/app/_lib/products/resolve";
import { resolveAccommodationPrice, AccommodationPriceError } from "@/app/_lib/accommodations";
import { emitAnalyticsEvent } from "@/app/_lib/analytics";
import { resolveAddonLineItems, AddonValidationError } from "@/app/_lib/accommodations/addons";
import type { ResolvedAddonLineItem } from "@/app/_lib/accommodations/addons";
import { nextOrderNumber } from "@/app/_lib/orders/sequence";
import { getTaxRate } from "@/app/_lib/orders/tax";
import { log } from "@/app/_lib/logger";
import { validateStayDates } from "@/app/_lib/validation/dates";
import { verifyChargesEnabled } from "@/app/_lib/stripe/verify-account";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { claimIdempotencyKey, completeIdempotencyKey, failIdempotencyKey } from "@/app/_lib/checkout/idempotency";
import { resolvePaymentMethods } from "@/app/_lib/payments/resolve";
import type { PaymentMethodConfig } from "@/app/_lib/payments/types";

const SUPPORTED_CURRENCIES = ["SEK", "EUR", "NOK", "DKK"] as const;
const MIN_AMOUNT = 1000;   // 10 SEK — below this, price data is wrong
const MAX_AMOUNT = 10_000_000; // 100,000 SEK — requires manual review

/** Session-based input: CheckoutSession token is the only required field */
const sessionInputSchema = z.object({
  sessionToken: z.string().min(1),
  paymentType: z.enum(["full", "klarna"]),
});

/** Legacy input: used by shop/cart flow — retained for backward compatibility */
const legacyInputSchema = z.object({
  productSlug: z.string().min(1).max(100),
  accommodationId: z.string().min(1).max(100).optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().min(1).max(99),
  ratePlanId: z.string().max(200).nullable().optional(),
  paymentType: z.enum(["full", "klarna"]),
  gclid: z.string().max(200).optional(),
  customerNote: z.string().max(1000).optional(),
  addons: z.array(z.object({
    productId: z.string(),
    variantId: z.string().nullable(),
    quantity: z.number().int().min(1).max(99),
  })).optional().default([]),
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

  // ── Idempotency key ────────────────────────────────────────
  const idempotencyKey = req.headers.get("x-idempotency-key");
  if (!idempotencyKey) {
    return NextResponse.json({ error: "MISSING_IDEMPOTENCY_KEY", message: "x-idempotency-key header required" }, { status: 400 });
  }

  const claim = await claimIdempotencyKey(tenant.id, idempotencyKey, "payment-intent");
  if (!claim.claimed) {
    if (claim.status === "COMPLETED") {
      return NextResponse.json(claim.responsePayload);
    }
    return NextResponse.json(
      { error: "DUPLICATE_REQUEST", message: "Duplicate request in progress, retry after 2 seconds" },
      { status: 409 },
    );
  }

  // ── Parse body once ─────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    await failIdempotencyKey(tenant.id, idempotencyKey, "payment-intent");
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  // ── Session-based flow (CheckoutSession) ───────────────────
  const sessionParsed = sessionInputSchema.safeParse(rawBody);
  if (sessionParsed.success) {
    return handleSessionPaymentIntent(req, tenant.id, sessionParsed.data, idempotencyKey);
  }

  // ── Legacy flow (shop/cart — productSlug-based) ────────────
  let body: z.infer<typeof legacyInputSchema>;
  try {
    body = legacyInputSchema.parse(rawBody);
  } catch {
    await failIdempotencyKey(tenant.id, idempotencyKey, "payment-intent");
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
  // DEV fallback: use product base price even if 0, PMS will override
  let totalPrice = resolved.price || (process.env.NODE_ENV === "development" ? product.price : 0);
  let currency = resolved.currency;
  let ratePlanName: string | null = null;
  let accommodationExternalId: string | null = null;

  if (body.accommodationId) {
    try {
      const priceResult = await resolveAccommodationPrice({
        tenantId: tenant.id,
        accommodationId: body.accommodationId,
        ratePlanId: ratePlanId ?? undefined,
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        guests,
      });
      totalPrice = priceResult.totalPrice;
      currency = priceResult.currency;
      ratePlanName = priceResult.ratePlan.name;
      accommodationExternalId = priceResult.externalId;
    } catch (err) {
      if (err instanceof AccommodationPriceError) {
        const status = err.code === "PMS_UNAVAILABLE" ? 503 : 400;
        await failIdempotencyKey(tenant.id, idempotencyKey, "payment-intent");
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status },
        );
      }
      log("error", "checkout.pms_price_failed", { tenantId: tenant.id, productSlug, error: String(err) });
      await failIdempotencyKey(tenant.id, idempotencyKey, "payment-intent");
      return NextResponse.json(
        { error: "PMS_UNAVAILABLE", message: "Kunde inte hämta pris från bokningssystemet." },
        { status: 503 },
      );
    }
  }

  // ── Resolve addon line items ────────────────────────────────
  let addonLineItems: ResolvedAddonLineItem[] = [];
  if (body.addons && body.addons.length > 0 && body.accommodationId) {
    try {
      addonLineItems = await resolveAddonLineItems(
        tenant.id,
        body.accommodationId,
        body.addons,
      );
    } catch (err) {
      if (err instanceof AddonValidationError) {
        await failIdempotencyKey(tenant.id, idempotencyKey, "payment-intent");
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: 400 },
        );
      }
      throw err;
    }
  }

  // Add addon totals to the accommodation price
  const addonTotal = addonLineItems.reduce((sum, item) => sum + item.totalAmount, 0);
  totalPrice = totalPrice + addonTotal;

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
    select: { stripeAccountId: true, stripeOnboardingComplete: true, paymentMethodConfig: true, subscriptionPlan: true, platformFeeBps: true },
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
        sourceChannel: "direct",
        customerNote: body.customerNote ?? null,
        metadata: {
          checkIn,
          checkOut,
          guests,
          nights,
          ratePlanId: ratePlanId ?? null,
          ratePlanName,
          productSlug,
          productType: product.productType,
          accommodationId: body.accommodationId ?? null,
          ...(body.gclid ? { gclid: body.gclid } : {}),
        },
        lineItems: {
          create: [
            // Line item #1: accommodation
            {
              productId: product.id,
              variantId: null,
              title: resolved.displayTitle,
              variantTitle: ratePlanName,
              sku: null,
              imageUrl: product.media[0]?.url ?? null,
              quantity: 1,
              unitAmount: totalPrice - addonTotal,
              totalAmount: totalPrice - addonTotal,
              currency,
            },
            // Line items #2+: addons
            ...addonLineItems.map((addon) => ({
              productId: addon.productId,
              variantId: addon.variantId,
              title: addon.title,
              variantTitle: addon.variantTitle,
              sku: addon.sku,
              imageUrl: addon.imageUrl,
              quantity: addon.quantity,
              unitAmount: addon.unitAmount,
              totalAmount: addon.totalAmount,
              currency: addon.currency,
            })),
          ],
        },
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: newOrder.id,
        tenantId: tenant.id,
        type: "ORDER_CREATED",
        message: `Order #${orderNumber} skapad — ${resolved.displayTitle}, ${checkIn} → ${checkOut}`,
        metadata: { checkIn, checkOut, guests, nights, ratePlanName },
      },
    });

    // Create linked Booking record for accommodation orders
    if (body.accommodationId) {
      await tx.booking.create({
        data: {
          tenantId: tenant.id,
          orderId: newOrder.id,
          accommodationId: body.accommodationId,
          firstName: "",    // Collected later via update-guest
          lastName: "",
          guestEmail: "",
          arrival: new Date(checkIn),
          departure: new Date(checkOut),
          checkIn: new Date(checkIn),
          checkOut: new Date(checkOut),
          guestCount: guests,
          ratePlanId: ratePlanId ?? null,
          unit: accommodationExternalId ?? body.productSlug,
          status: "PRE_CHECKIN",
        },
      });
    }

    return newOrder;
  });

  // Emit analytics event — fire-and-forget, OUTSIDE transaction
  void emitAnalyticsEvent({
    tenantId: tenant.id,
    eventType: "ORDER_CREATED",
    payload: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderType: "ACCOMMODATION",
      totalAmount: order.totalAmount,
      currency: order.currency,
      sourceChannel: "direct",
    },
  });

  // ── Calculate platform fee ────────────────────────────────────
  const feeBps = tenantStripe
    ? getPlatformFeeBps(tenantStripe.subscriptionPlan, tenantStripe.platformFeeBps)
    : 500; // fallback to BASIC if tenant query failed

  // Snapshot fee on order for audit
  await prisma.order.update({
    where: { id: order.id },
    data: { platformFeeBps: feeBps },
  });

  // ── Initiate payment via provider adapter ────────────────────
  try {
    const init = await initiateOrderPayment({
      order: {
        id: order.id,
        tenantId: tenant.id,
        totalAmount: totalPrice + taxAmount,
        currency,
      },
      guest: { email: "", name: "" }, // Collected later via update-guest
      locale: "sv-SE",
      returnUrl: `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("host") ?? "localhost:3000"}/checkout/success`,
      platformFeeBps: feeBps,
      metadata: {
        orderNumber: String(orderNumber),
        productSlug,
        orderType: "ACCOMMODATION",
      },
    });

    if (init.mode !== "embedded") {
      throw new Error("Expected embedded payment mode");
    }

    log("info", "checkout.payment_initiated", {
      tenantId: tenant.id,
      orderId: order.id,
      orderNumber,
      amount: totalPrice + taxAmount,
      currency,
    });

    const successPayload = { clientSecret: init.clientSecret, orderId: order.id };
    await completeIdempotencyKey(tenant.id, idempotencyKey, "payment-intent", successPayload);
    return NextResponse.json(successPayload);
  } catch (err) {
    log("error", "checkout.payment_failed", {
      tenantId: tenant.id,
      orderId: order.id,
      error: String(err),
    });

    // Clean up: cancel the orphaned order
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", financialStatus: "VOIDED", fulfillmentStatus: "CANCELLED", cancelledAt: new Date() },
    });
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        tenantId: tenant.id,
        type: "ORDER_CANCELLED",
        message: "Betalningsinitiering misslyckades — order avbokad automatiskt",
      },
    });

    await failIdempotencyKey(tenant.id, idempotencyKey, "payment-intent");
    return NextResponse.json(
      { error: "PAYMENT_FAILED", message: err instanceof Error ? err.message : "Betalning misslyckades" },
      { status: 503 },
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// SESSION-BASED PAYMENT INTENT
// ═══════════════════════════════════════════════════════════════

/**
 * Creates an Order + PaymentIntent entirely from CheckoutSession snapshot.
 * No prices from client. No PMS re-fetch. Session is the source of truth.
 */
async function handleSessionPaymentIntent(
  req: Request,
  tenantId: string,
  input: { sessionToken: string; paymentType: string },
  idempotencyKey: string,
) {
  const session = await prisma.checkoutSession.findUnique({
    where: { token: input.sessionToken },
    select: {
      id: true,
      tenantId: true,
      status: true,
      expiresAt: true,
      accommodationId: true,
      accommodationName: true,
      accommodationSlug: true,
      ratePlanId: true,
      ratePlanName: true,
      pricePerNight: true,
      totalNights: true,
      accommodationTotal: true,
      currency: true,
      checkIn: true,
      checkOut: true,
      adults: true,
      selectedAddons: true,
      accommodation: {
        select: {
          id: true,
          slug: true,
          externalId: true,
          media: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
        },
      },
    },
  });

  if (!session || session.tenantId !== tenantId) {
    await failIdempotencyKey(tenantId, idempotencyKey, "payment-intent");
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  if (session.expiresAt < new Date()) {
    await failIdempotencyKey(tenantId, idempotencyKey, "payment-intent");
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 409 });
  }

  if (session.status !== "CHECKOUT") {
    await failIdempotencyKey(tenantId, idempotencyKey, "payment-intent");
    return NextResponse.json(
      { error: "INVALID_SESSION_STATUS", message: `Session har status ${session.status}` },
      { status: 409 },
    );
  }

  // ── Compute totals from frozen snapshot ──────────────────────
  const addons = (session.selectedAddons ?? []) as Array<{
    productId: string; variantId: string | null; title: string; variantTitle: string | null;
    quantity: number; unitAmount: number; totalAmount: number; pricingMode: string; currency: string;
  }>;
  const addonTotal = addons.reduce((sum, a) => sum + a.totalAmount, 0);
  const totalPrice = session.accommodationTotal + addonTotal;
  const currency = session.currency;

  if (totalPrice < MIN_AMOUNT || totalPrice > MAX_AMOUNT) {
    log("error", "checkout.session_amount_out_of_bounds", { amount: totalPrice, tenantId });
    await failIdempotencyKey(tenantId, idempotencyKey, "payment-intent");
    return NextResponse.json(
      { error: "INVALID_PRICE", message: "Ogiltigt belopp." },
      { status: 400 },
    );
  }

  // ── Create Order from session snapshot ──────────────────────
  const orderNumber = await nextOrderNumber(tenantId);
  const taxRate = getTaxRate("STANDARD", "SE");
  const taxAmount = taxRate > 0 ? Math.round(totalPrice * taxRate / 10000) : 0;

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        tenantId,
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
        sourceChannel: "direct",
        metadata: {
          sessionToken: input.sessionToken,
          checkIn: session.checkIn.toISOString().split("T")[0],
          checkOut: session.checkOut.toISOString().split("T")[0],
          guests: session.adults,
          nights: session.totalNights,
          ratePlanId: session.ratePlanId,
          ratePlanName: session.ratePlanName,
          accommodationSlug: session.accommodationSlug,
        },
        lineItems: {
          create: [
            // Accommodation line item
            {
              productId: session.accommodation.id,
              variantId: null,
              title: session.accommodationName,
              variantTitle: session.ratePlanName,
              sku: null,
              imageUrl: session.accommodation.media[0]?.url ?? null,
              quantity: 1,
              unitAmount: session.accommodationTotal,
              totalAmount: session.accommodationTotal,
              currency,
            },
            // Addon line items from frozen snapshots
            ...addons.map((addon) => ({
              productId: addon.productId,
              variantId: addon.variantId,
              title: addon.title,
              variantTitle: addon.variantTitle,
              sku: null,
              imageUrl: null,
              quantity: addon.quantity,
              unitAmount: addon.unitAmount,
              totalAmount: addon.totalAmount,
              currency: addon.currency,
            })),
          ],
        },
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: newOrder.id,
        tenantId,
        type: "ORDER_CREATED",
        message: `Order #${orderNumber} — ${session.accommodationName}, ${session.totalNights} nätter`,
        metadata: {
          sessionToken: input.sessionToken,
          checkIn: session.checkIn.toISOString().split("T")[0],
          checkOut: session.checkOut.toISOString().split("T")[0],
        },
      },
    });

    // Create linked Booking
    await tx.booking.create({
      data: {
        tenantId,
        orderId: newOrder.id,
        accommodationId: session.accommodationId,
        firstName: "",
        lastName: "",
        guestEmail: "",
        arrival: session.checkIn,
        departure: session.checkOut,
        checkIn: session.checkIn,
        checkOut: session.checkOut,
        guestCount: session.adults,
        ratePlanId: session.ratePlanId,
        unit: session.accommodation.externalId ?? session.accommodationSlug,
        status: "PRE_CHECKIN",
      },
    });

    // Transition session to COMPLETED — release dedupKey so same booking can be made again
    await tx.checkoutSession.update({
      where: { id: session.id },
      data: { status: "COMPLETED", dedupKey: null },
    });

    return newOrder;
  });

  log("info", "checkout.session_order_created", {
    tenantId,
    sessionId: session.id,
    orderId: order.id,
    orderNumber,
    amount: totalPrice + taxAmount,
    currency,
    addonCount: addons.length,
  });

  // ── Calculate platform fee ────────────────────────────────────
  const tenantStripe = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeAccountId: true, subscriptionPlan: true, platformFeeBps: true },
  });

  const feeBps = tenantStripe
    ? getPlatformFeeBps(tenantStripe.subscriptionPlan, tenantStripe.platformFeeBps)
    : 500;

  await prisma.order.update({
    where: { id: order.id },
    data: { platformFeeBps: feeBps },
  });

  // ── Initiate payment ──────────────────────────────────────────
  try {
    const init = await initiateOrderPayment({
      order: {
        id: order.id,
        tenantId,
        totalAmount: totalPrice + taxAmount,
        currency,
      },
      guest: { email: "", name: "" },
      locale: "sv-SE",
      returnUrl: `${new URL(req.url).origin}/checkout/success`,
      platformFeeBps: feeBps,
      metadata: {
        orderNumber: String(orderNumber),
        sessionToken: input.sessionToken,
        orderType: "ACCOMMODATION",
      },
    });

    if (init.mode !== "embedded") {
      throw new Error("Expected embedded payment mode");
    }

    const successPayload = { clientSecret: init.clientSecret, orderId: order.id };
    await completeIdempotencyKey(tenantId, idempotencyKey, "payment-intent", successPayload);
    return NextResponse.json(successPayload);
  } catch (err) {
    log("error", "checkout.session_payment_failed", {
      tenantId,
      orderId: order.id,
      error: String(err),
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", financialStatus: "VOIDED", fulfillmentStatus: "CANCELLED", cancelledAt: new Date() },
    });

    await failIdempotencyKey(tenantId, idempotencyKey, "payment-intent");
    return NextResponse.json(
      { error: "PAYMENT_FAILED", message: err instanceof Error ? err.message : "Betalning misslyckades" },
      { status: 503 },
    );
  }
}
