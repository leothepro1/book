export const dynamic = "force-dynamic";

/**
 * Create Purchase Intent (Order-First)
 * ═════════════════════════════════════
 *
 * Handles PURCHASE-type orders (gift cards, future purchasable products).
 * Same security architecture as payment-intent/route.ts:
 *   - tenantId from host header, never request body
 *   - amount validated server-side against GiftCardProduct config
 *   - Order created BEFORE Stripe call
 *   - verifyChargesEnabled() before Stripe call
 *   - rate limited per IP
 *
 * Returns: { clientSecret, orderId }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { initiateOrderPayment } from "@/app/_lib/payments/providers";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { nextOrderNumber } from "@/app/_lib/orders/sequence";
import { getPlatformFeeBps } from "@/app/_lib/payments/platform-fee";
import { log } from "@/app/_lib/logger";
import { verifyChargesEnabled } from "@/app/_lib/stripe/verify-account";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { claimIdempotencyKey, completeIdempotencyKey, failIdempotencyKey } from "@/app/_lib/checkout/idempotency";

// ── Validation ──────────────────────────────────────────────────

const inputSchema = z.object({
  designId: z.string().cuid(),
  amount: z.number().int().min(10000).max(10000000), // 100 kr – 100 000 kr in ören
  recipientEmail: z.string().email(),
  recipientName: z.string().min(1).max(100),
  senderName: z.string().min(1).max(100),
  message: z.string().max(500).optional(),
  scheduledAt: z.string().datetime(),
});

// ── scheduledAt bounds ──────────────────────────────────────────

const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000; // 12 months
const MAX_SCHEDULE_BEHIND_MS = 5 * 60 * 1000;              // 5 minutes (clock tolerance)

function validateScheduledAt(
  iso: string,
): { valid: true; date: Date } | { valid: false; error: string } {
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return { valid: false, error: "Ogiltigt datum" };
  }

  const now = Date.now();

  if (date.getTime() < now - MAX_SCHEDULE_BEHIND_MS) {
    return { valid: false, error: "Schemalaggning kan inte vara i det förflutna" };
  }

  if (date.getTime() > now + MAX_SCHEDULE_AHEAD_MS) {
    return { valid: false, error: "Schemalaggning kan inte vara mer än 12 månader framåt" };
  }

  return { valid: true, date };
}

// ── Handler ─────────────────────────────────────────────────────

export async function POST(req: Request) {
  // ── Rate limit ──────────────────────────────────────────────
  if (!(await checkRateLimit("purchase", 10, 60 * 60 * 1000))) {
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

  const claim = await claimIdempotencyKey(tenant.id, idempotencyKey, "purchase-intent");
  if (!claim.claimed) {
    if (claim.status === "COMPLETED") {
      return NextResponse.json(claim.responsePayload);
    }
    return NextResponse.json(
      { error: "DUPLICATE_REQUEST", message: "Duplicate request in progress, retry after 2 seconds" },
      { status: 409 },
    );
  }

  // ── Parse + validate input ──────────────────────────────────
  let body: z.infer<typeof inputSchema>;
  try {
    body = inputSchema.parse(await req.json());
  } catch {
    await failIdempotencyKey(tenant.id, idempotencyKey, "purchase-intent");
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  // ── Validate scheduledAt ────────────────────────────────────
  const scheduleCheck = validateScheduledAt(body.scheduledAt);
  if (!scheduleCheck.valid) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", message: scheduleCheck.error },
      { status: 400 },
    );
  }

  // ── Verify gift card is enabled for this tenant ─────────────
  const giftCardProduct = await prisma.giftCardProduct.findFirst({
    where: { tenantId: tenant.id, enabled: true },
  });

  if (!giftCardProduct || !giftCardProduct.enabled) {
    return NextResponse.json(
      { error: "GIFT_CARDS_DISABLED", message: "Presentkort är inte aktiverat." },
      { status: 400 },
    );
  }

  // ── Validate amount against tenant config ───────────────────
  if (body.amount < giftCardProduct.minAmount || body.amount > giftCardProduct.maxAmount) {
    log("warn", "purchase.amount_out_of_bounds", {
      tenantId: tenant.id,
      amount: body.amount,
      min: giftCardProduct.minAmount,
      max: giftCardProduct.maxAmount,
    });
    return NextResponse.json(
      { error: "INVALID_AMOUNT", message: "Beloppet ligger utanför tillåtet intervall." },
      { status: 400 },
    );
  }

  // ── Verify design belongs to this tenant and is active ──────
  const design = await prisma.giftCardDesign.findFirst({
    where: {
      id: body.designId,
      tenantId: tenant.id,
      active: true,
    },
  });

  if (!design) {
    return NextResponse.json(
      { error: "INVALID_DESIGN", message: "Vald design finns inte eller är inaktiv." },
      { status: 400 },
    );
  }

  // ── Verify Stripe Connect account is active ─────────────────
  const tenantStripe = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { stripeAccountId: true, stripeOnboardingComplete: true, subscriptionPlan: true, platformFeeBps: true },
  });

  if (!tenantStripe?.stripeAccountId || !tenantStripe.stripeOnboardingComplete) {
    return NextResponse.json(
      { error: "STRIPE_NOT_CONFIGURED", message: "Betalning är inte konfigurerad." },
      { status: 503 },
    );
  }

  const chargesOk = await verifyChargesEnabled(tenantStripe.stripeAccountId);
  if (!chargesOk) {
    return NextResponse.json(
      { error: "STRIPE_NOT_ACTIVE", message: "Betalning är inte aktiverad. Kontakta hotellet." },
      { status: 400 },
    );
  }

  // ── Create Order FIRST — before any Stripe call ─────────────
  const orderNumber = await nextOrderNumber(tenant.id);
  const feeBps = getPlatformFeeBps(tenantStripe.subscriptionPlan, tenantStripe.platformFeeBps);

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        tenantId: tenant.id,
        orderNumber,
        status: "PENDING",
        orderType: "PURCHASE",
        paymentMethod: "STRIPE_ELEMENTS",
        guestEmail: body.recipientEmail,
        guestName: body.senderName,
        subtotalAmount: body.amount,
        taxAmount: 0,
        taxRate: 0,
        totalAmount: body.amount,
        currency: "SEK",
        platformFeeBps: feeBps,
        metadata: {
          type: "gift_card",
          designId: body.designId,
          recipientEmail: body.recipientEmail,
          recipientName: body.recipientName,
          senderName: body.senderName,
          message: body.message ?? "",
          scheduledAt: body.scheduledAt,
        },
        lineItems: {
          create: {
            productId: giftCardProduct.id,
            variantId: null,
            title: "Presentkort",
            variantTitle: null,
            sku: null,
            imageUrl: design.imageUrl,
            quantity: 1,
            unitAmount: body.amount,
            totalAmount: body.amount,
            currency: "SEK",
          },
        },
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: newOrder.id,
        tenantId: tenant.id,
        type: "ORDER_CREATED",
        message: `Order #${orderNumber} skapad — Presentkort ${body.amount / 100} kr till ${body.recipientName}`,
        metadata: { giftCardAmount: body.amount, recipientName: body.recipientName },
      },
    });

    return newOrder;
  });

  // ── Initiate payment via provider adapter ────────────────────
  try {
    const init = await initiateOrderPayment({
      order: {
        id: order.id,
        tenantId: tenant.id,
        totalAmount: body.amount,
        currency: "SEK",
      },
      guest: { email: body.recipientEmail, name: body.senderName },
      locale: "sv-SE",
      platformFeeBps: feeBps,
      returnUrl: `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("host") ?? "localhost:3000"}/shop/gift-cards/confirmation`,
      metadata: {
        orderType: "PURCHASE",
        designId: body.designId,
        recipientEmail: body.recipientEmail,
        recipientName: body.recipientName,
        senderName: body.senderName,
        message: body.message ?? "",
        scheduledAt: body.scheduledAt,
        amount: body.amount.toString(),
      },
    });

    if (init.mode !== "embedded") {
      throw new Error("Expected embedded payment mode");
    }

    log("info", "purchase.payment_initiated", {
      tenantId: tenant.id,
      orderId: order.id,
      orderNumber,
      amount: body.amount,
      currency: "SEK",
      type: "gift_card",
    });

    const successPayload = { clientSecret: init.clientSecret, orderId: order.id };
    await completeIdempotencyKey(tenant.id, idempotencyKey, "purchase-intent", successPayload);
    return NextResponse.json(successPayload);
  } catch (err) {
    log("error", "purchase.payment_failed", {
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

    await failIdempotencyKey(tenant.id, idempotencyKey, "purchase-intent");
    return NextResponse.json(
      { error: "PAYMENT_FAILED", message: err instanceof Error ? err.message : "Betalning misslyckades" },
      { status: 503 },
    );
  }
}
