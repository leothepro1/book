export const dynamic = "force-dynamic";

/**
 * Update Guest Info on Pending Order
 * ═══════════════════════════════════
 *
 * Called by the checkout client before payment confirmation.
 * Persists all guest fields + billing address on the Order,
 * then upserts GuestAccount immediately (not deferred to webhook).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { upsertGuestAccountFromOrder } from "@/app/_lib/guest-auth/account";
import { log } from "@/app/_lib/logger";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { canTransition } from "@/app/_lib/orders/types";

const billingAddressSchema = z.object({
  address1: z.string().min(1).max(200).trim(),
  address2: z.string().max(200).trim().optional(),
  city: z.string().min(1).max(100).trim(),
  postalCode: z.string().min(1).max(20).trim(),
  country: z.string().length(2), // ISO 3166-1 alpha-2
});

const inputSchema = z.object({
  orderId: z.string().min(1).max(50),
  sessionToken: z.string().max(100).optional(),
  guestEmail: z.string().email("Ogiltig e-postadress").max(254),
  guestFirstName: z.string().min(1, "Förnamn krävs").max(100).trim(),
  guestLastName: z.string().min(1, "Efternamn krävs").max(100).trim(),
  guestPhone: z.string().max(50).trim().optional(),
  billingAddress: billingAddressSchema.optional(),
});

export async function POST(req: Request) {
  if (!(await checkRateLimit("ug", 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  }

  let body: z.infer<typeof inputSchema>;
  try {
    body = inputSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: body.orderId },
    select: { id: true, tenantId: true, status: true },
  });

  if (!order || order.tenantId !== tenant.id) {
    return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  }

  if (order.status !== "PENDING") {
    return NextResponse.json(
      { error: "ORDER_NOT_PENDING", message: "Ordern kan inte längre uppdateras." },
      { status: 409 },
    );
  }

  const guestName = `${body.guestFirstName} ${body.guestLastName}`.trim();

  // ── Update Order with guest fields first ──
  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        guestName,
        guestEmail: body.guestEmail,
        guestPhone: body.guestPhone ?? null,
        billingAddress: body.billingAddress ? JSON.parse(JSON.stringify(body.billingAddress)) : null,
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        tenantId: tenant.id,
        type: "GUEST_INFO_UPDATED",
        message: `Gästuppgifter registrerade — ${guestName} (${body.guestEmail})`,
        metadata: { guestName, guestEmail: body.guestEmail },
      },
    }),
  ]);

  // ── Write contact info to CheckoutSession (non-blocking) ──
  if (body.sessionToken) {
    prisma.checkoutSession.updateMany({
      where: { token: body.sessionToken, tenantId: tenant.id },
      data: {
        guestEmail: body.guestEmail,
        guestFirstName: body.guestFirstName,
        guestLastName: body.guestLastName,
        guestPhone: body.guestPhone ?? null,
      },
    }).catch(() => {
      // Non-blocking — contact info on session is for analytics/recovery only
    });
  }

  // ── Upsert GuestAccount + link order + create ORDER_PLACED event ──
  try {
    await upsertGuestAccountFromOrder(
      tenant.id,
      order.id,
      body.guestEmail,
      guestName,
      body.guestPhone,
      body.billingAddress ? {
        address1: body.billingAddress.address1,
        address2: body.billingAddress.address2,
        city: body.billingAddress.city,
        postalCode: body.billingAddress.postalCode,
        country: body.billingAddress.country,
      } : null,
    );
  } catch (err) {
    // Non-blocking — webhook will retry
    log("warn", "checkout.guest_account_upsert_failed", {
      tenantId: tenant.id, orderId: order.id, error: String(err),
    });
  }

  log("info", "checkout.guest_info_updated", {
    tenantId: tenant.id, orderId: order.id, guestEmail: body.guestEmail,
    hasAddress: !!body.billingAddress,
  });

  // Dev-only: auto-trigger post-payment side effects.
  // Guest info is now saved — simulate a successful Stripe webhook
  // so PMS booking, email, and analytics fire without real payment.
  if (process.env.NODE_ENV === "development") {
    setImmediate(async () => {
      try {
        const freshOrder = await prisma.order.findUnique({
          where: { id: order.id },
          select: { status: true },
        });
        if (!freshOrder || !canTransition(freshOrder.status, "PAID")) return;

        const paymentSession = await prisma.paymentSession.findUnique({
          where: { orderId: order.id },
          select: { externalSessionId: true },
        });
        const piId = paymentSession?.externalSessionId ?? "dev_simulated_pi";

        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: "PAID",
              financialStatus: "PAID",
              paidAt: new Date(),
              stripePaymentIntentId: piId,
            },
          });
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              tenantId: tenant.id,
              type: "PAYMENT_CAPTURED",
              message: "[DEV] Betalning simulerad",
            },
          });
        });

        const { processOrderPaidSideEffects } = await import(
          "@/app/_lib/orders/process-paid-side-effects"
        );
        await processOrderPaidSideEffects(order.id, piId);

        log("info", "dev.auto_trigger_payment_complete", { orderId: order.id });
      } catch (err) {
        log("error", "dev.auto_trigger_payment_failed", {
          orderId: order.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return NextResponse.json({ ok: true });
}
