// DEPRECATED: Cart checkout now uses /api/portal/checkout/session/cart
// This route can be deleted after verifying no external integrations depend on it.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { validateCart } from "@/app/_lib/cart/validate";
import { nextOrderNumber } from "@/app/_lib/orders/sequence";
import { reserveInventoryForTenant } from "@/app/_lib/products/inventory";
import { guestInfoSchema } from "@/app/_lib/orders/types";
import type { CartItem } from "@/app/_lib/cart/types";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { getTaxRate } from "@/app/_lib/orders/tax";
import { log } from "@/app/_lib/logger";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { claimIdempotencyKey, completeIdempotencyKey, failIdempotencyKey } from "@/app/_lib/checkout/idempotency";
import { getPlatformFeeBps } from "@/app/_lib/payments/platform-fee";
import { initiateOrderPayment } from "@/app/_lib/payments/providers";
import { evaluateDiscountCode, evaluateAutomaticDiscount } from "@/app/_lib/discounts/engine";
import { verifyChargesEnabled } from "@/app/_lib/stripe/verify-account";
import { findDiscountCode } from "@/app/_lib/discounts/codes";
import { applyDiscountInTx } from "@/app/_lib/discounts/apply";
import type { DiscountEvaluationResult } from "@/app/_lib/discounts/types";

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
  gclid: z.string().max(200).optional(),
  customerNote: z.string().max(1000).optional(),
  discountCode: z.string().min(1).max(64).optional(),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
});

export async function POST(req: Request) {
  // ── Rate limit ──────────────────────────────────────────────
  if (!(await checkRateLimit("co", 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // Resolve tenant from host header — never from request body
  const resolvedTenant = await resolveTenantFromHost();
  if (!resolvedTenant) {
    return NextResponse.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  }
  const tenantId = resolvedTenant.id;

  // ── Idempotency key ────────────────────────────────────────
  const idempotencyKey = req.headers.get("x-idempotency-key");
  if (!idempotencyKey) {
    return NextResponse.json({ error: "MISSING_IDEMPOTENCY_KEY", message: "x-idempotency-key header required" }, { status: 400 });
  }

  const claim = await claimIdempotencyKey(tenantId, idempotencyKey, "checkout-session");
  if (!claim.claimed) {
    if (claim.status === "COMPLETED") {
      return NextResponse.json(claim.responsePayload);
    }
    return NextResponse.json(
      { error: "DUPLICATE_REQUEST", message: "Duplicate request in progress, retry after 2 seconds" },
      { status: 409 },
    );
  }

  let body: z.infer<typeof checkoutInputSchema>;
  try {
    const raw = await req.json();
    body = checkoutInputSchema.parse(raw);
  } catch {
    await failIdempotencyKey(tenantId, idempotencyKey, "checkout-session");
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  const { items } = body;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      portalSlug: true,
      name: true,
      subscriptionPlan: true,
      platformFeeBps: true,
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Organisationen hittades inte" }, { status: 404 });
  }

  if (!tenant.stripeAccountId) {
    return NextResponse.json(
      { error: "STRIPE_NOT_CONFIGURED", message: "Betalning är inte konfigurerad." },
      { status: 503 },
    );
  }

  const chargesOk = await verifyChargesEnabled(tenant.stripeAccountId);
  if (!chargesOk) {
    return NextResponse.json(
      { error: "STRIPE_NOT_CONFIGURED", message: "Betalning är inte konfigurerad." },
      { status: 503 },
    );
  }

  // Validate cart server-side
  const validation = await validateCart(tenantId, items as CartItem[]);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Varukorgen innehåller ogiltiga artiklar", errors: validation.errors },
      { status: 409 },
    );
  }

  // Calculate totals
  const subtotalAmount = validation.validatedItems.reduce(
    (sum, item) => sum + item.validatedUnitAmount * item.quantity,
    0,
  );
  const taxRate = getTaxRate("STANDARD", "SE");
  const taxAmount = taxRate > 0 ? Math.round(subtotalAmount * taxRate / 10000) : 0;
  const totalAmount = subtotalAmount + taxAmount;
  const currency = validation.validatedItems[0]?.currency ?? "SEK";

  // ── Discount evaluation (before order creation) ────────���───
  // Re-evaluation inside tx is the authoritative check
  let discountResult: Extract<DiscountEvaluationResult, { valid: true }> | null = null;
  let discountCodeId: string | undefined;

  const productIds = validation.validatedItems.map((i) => i.productId);
  const itemCount = validation.validatedItems.reduce((sum, i) => sum + i.quantity, 0);

  const checkInDate = body.checkInDate ? new Date(body.checkInDate) : undefined;
  const checkOutDate = body.checkOutDate ? new Date(body.checkOutDate) : undefined;
  const nights = checkInDate && checkOutDate
    ? Math.max(0, Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86_400_000))
    : 0;

  if (body.discountCode) {
    // Guest entered a discount code — evaluate it
    const codeResult = await evaluateDiscountCode({
      tenantId,
      code: body.discountCode,
      orderAmount: totalAmount,
      productIds,
      itemCount,
      guestEmail: body.guestInfo?.email,
      checkInDate,
      checkOutDate,
    });

    if (!codeResult.valid) {
      await failIdempotencyKey(tenantId, idempotencyKey, "checkout-session");
      return NextResponse.json({ error: codeResult.error }, { status: 409 });
    }

    discountResult = codeResult;

    // Resolve DiscountCode.id for applyDiscountInTx
    const codeRecord = await findDiscountCode(tenantId, body.discountCode);
    discountCodeId = codeRecord?.id;
  } else {
    // No code — check for automatic discounts
    const autoResult = await evaluateAutomaticDiscount(tenantId, {
      orderAmount: totalAmount,
      productIds,
      itemCount,
      guestEmail: body.guestInfo?.email,
      guestAccountId: undefined,
      guestSegmentIds: [],
      checkInDate,
      checkOutDate,
      nights,
    });

    if (autoResult.valid) {
      discountResult = autoResult;
    }
  }

  const orderNumber = await nextOrderNumber(tenantId);

  // Create order
  let order;
  try {
  order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
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
        sourceChannel: "direct",
        customerNote: body.customerNote ?? null,
        metadata: body.gclid ? { gclid: body.gclid } : undefined,
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: created.id,
        tenantId,
        type: "ORDER_CREATED",
        message: `Order #${orderNumber} skapad`,
        metadata: { channel: "checkout_session" },
      },
    });

    // ── Apply discount inside transaction ─────────────────────
    if (discountResult) {
      const createdLineItems = await tx.orderLineItem.findMany({
        where: { orderId: created.id },
        select: { id: true, productId: true, totalAmount: true },
      });

      await applyDiscountInTx(tx, {
        orderId: created.id,
        tenantId,
        guestEmail: body.guestInfo?.email ?? "",
        guestAccountId: undefined,
        result: discountResult,
        discountCodeId,
        lineItems: createdLineItems,
      });
    }

    return created;
  });
  } catch (txErr) {
    if (txErr instanceof Error && txErr.message === "USAGE_LIMIT_REACHED") {
      await failIdempotencyKey(tenantId, idempotencyKey, "checkout-session");
      return NextResponse.json({ error: "USAGE_LIMIT_REACHED" }, { status: 409 });
    }
    throw txErr;
  }

  // Reserve inventory
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
        // Non-blocking
      }
    }
  }

  // ── Post-discount charge amount ──────────────────────────────
  // Stripe receives the post-discount amount. The order records both
  // the original totalAmount AND the discountAmount for audit purposes.
  const discountAmount = discountResult?.discountAmount ?? 0;
  const chargeAmount = Math.max(0, totalAmount - discountAmount);

  // Calculate platform fee
  const feeBps = getPlatformFeeBps(tenant.subscriptionPlan, tenant.platformFeeBps);
  await prisma.order.update({
    where: { id: order.id },
    data: { platformFeeBps: feeBps },
  });

  // Build URLs from request host
  const host = req.headers.get("host") ?? "localhost:3000";
  const isDev = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const protocol = isDev ? "http" : "https";
  const baseUrl = isDev
    ? `${protocol}://${host}`
    : `${protocol}://${tenant.portalSlug}.rutgr.com`;

  // Initiate payment via adapter — checkoutMode: "session" triggers redirect mode
  try {
    const init = await initiateOrderPayment({
      order: {
        id: order.id,
        tenantId,
        totalAmount: chargeAmount,
        currency,
      },
      guest: {
        email: body.guestInfo?.email ?? "",
        name: body.guestInfo?.name ?? "",
      },
      locale: "sv-SE",
      returnUrl: `${baseUrl}/shop/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/shop/checkout/cancel`,
      platformFeeBps: feeBps,
      metadata: {
        checkoutMode: "session",
        orderId: order.id,
        tenantId,
        orderNumber: String(orderNumber),
        orderType: "PURCHASE",
        productName: validation.validatedItems[0]?.title ?? "Beställning",
      },
    });

    if (init.mode === "redirect") {
      if ("providerSessionId" in init && init.providerSessionId) {
        await prisma.order.update({
          where: { id: order.id },
          data: { stripeCheckoutSessionId: init.providerSessionId },
        });
      }

      log("info", "checkout.session_initiated", {
        tenantId,
        orderId: order.id,
        orderNumber,
        amount: chargeAmount,
        discountAmount,
        currency,
        feeBps,
      });

      const redirectPayload = { url: init.redirectUrl };
      await completeIdempotencyKey(tenantId, idempotencyKey, "checkout-session", redirectPayload);
      return NextResponse.json(redirectPayload);
    }

    const embeddedPayload = { clientSecret: init.clientSecret, orderId: order.id };
    await completeIdempotencyKey(tenantId, idempotencyKey, "checkout-session", embeddedPayload);
    return NextResponse.json(embeddedPayload);
  } catch (err) {
    log("error", "checkout.session_failed", {
      tenantId,
      orderId: order.id,
      error: String(err),
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", financialStatus: "VOIDED", fulfillmentStatus: "CANCELLED", cancelledAt: new Date() },
    });
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        tenantId: tenantId,
        type: "ORDER_CANCELLED",
        message: "Betalningsinitiering misslyckades — order avbokad automatiskt",
      },
    });

    await failIdempotencyKey(tenantId, idempotencyKey, "checkout-session");
    return NextResponse.json(
      { error: "PAYMENT_FAILED", message: err instanceof Error ? err.message : "Betalning misslyckades" },
      { status: 503 },
    );
  }
}
