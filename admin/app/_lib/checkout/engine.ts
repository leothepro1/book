/**
 * Checkout Engine — Core
 * ══════════════════════
 *
 * processCheckout() is the ONLY entry point for all checkout flows.
 * It handles all shared infrastructure:
 *   rate limiting, tenant resolution, Stripe verification,
 *   order creation, PaymentIntent/Session creation, orphan cleanup,
 *   structured logging, error handling.
 *
 * Each checkout type provides only domain-specific logic via the
 * CheckoutType<T> interface. Adding a new checkout = 1 file + 1 registry entry.
 *
 * Invariants:
 *   - tenantId NEVER from request body — resolved from host header
 *   - Order created BEFORE any Stripe call — always
 *   - canTransition() is the ONLY status guard (webhook-side)
 *   - Prices in ören — never floats
 *   - Orphan orders cancelled on Stripe failure
 */

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { nextOrderNumber } from "@/app/_lib/orders/sequence";
import { getTaxRate } from "@/app/_lib/orders/tax";
import { log } from "@/app/_lib/logger";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { initiateOrderPayment } from "@/app/_lib/payments/providers/initiate";
import { CheckoutError } from "./errors";
import { SUPPORTED_CURRENCIES, MIN_AMOUNT, MAX_AMOUNT } from "./types";
import type {
  CheckoutType,
  CheckoutContext,
  TenantCheckoutInfo,
} from "./types";

// ── Engine ──────────────────────────────────────────────────────

export async function processCheckout<TInput>(
  req: Request,
  type: CheckoutType<TInput>,
): Promise<NextResponse> {
  const startMs = Date.now();
  let tenantId: string | undefined;
  let orderId: string | undefined;

  try {
    // ── 1. Rate limit ────────────────────────────────────────
    const [prefix, max, windowMs] = type.rateLimit;
    if (!(await checkRateLimit(prefix, max, windowMs))) {
      throw new CheckoutError("RATE_LIMITED", "För många förfrågningar", 429);
    }

    // ── 2. Resolve tenant from host — NEVER from body ────────
    const tenantRow = await resolveTenantFromHost();
    if (!tenantRow) {
      throw new CheckoutError("TENANT_NOT_FOUND", "Tenant not found", 404);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantRow.id },
      select: {
        id: true,
        name: true,
        portalSlug: true,
        stripeAccountId: true,
        stripeOnboardingComplete: true,
        paymentMethodConfig: true,
      },
    }) as TenantCheckoutInfo | null;

    if (!tenant) {
      throw new CheckoutError("TENANT_NOT_FOUND", "Tenant not found", 404);
    }
    tenantId = tenant.id;

    // ── 3. Parse + validate input ────────────────────────────
    let input: TInput;
    try {
      const raw = await req.json();
      input = type.inputSchema.parse(raw);
    } catch {
      throw new CheckoutError("INVALID_PARAMS", "Ogiltig begäran", 400);
    }

    const ctx: CheckoutContext<TInput> = {
      tenant,
      input,
      req,
      cache: new Map(),
    };

    // ── 4. Domain-specific validation ────────────────────────
    await type.validate(ctx);

    // ── 5. Resolve price server-side ─────────────────────────
    const price = await type.resolvePrice(ctx);

    // ── 6. Universal bounds check ────────────────────────────
    if (price.amount < MIN_AMOUNT || price.amount > MAX_AMOUNT) {
      log("error", "checkout.amount_out_of_bounds", {
        amount: price.amount,
        tenantId: tenant.id,
        type: type.id,
      });
      throw new CheckoutError(
        "INVALID_PRICE",
        "Ogiltigt belopp. Kontakta hotellet direkt.",
        400,
      );
    }

    if (!SUPPORTED_CURRENCIES.includes(price.currency as typeof SUPPORTED_CURRENCIES[number])) {
      throw new CheckoutError("INVALID_CURRENCY", "Valutan stöds inte.", 400);
    }

    // ── 7. Create Order FIRST — before any payment call ────────
    const orderNumber = await nextOrderNumber(tenant.id);
    const taxRate = getTaxRate("STANDARD", "SE");
    const taxAmount = taxRate > 0
      ? Math.round(price.amount * taxRate / 10000)
      : 0;
    const totalAmount = price.amount + taxAmount;
    const guestInfo = type.resolveGuestInfo(input);
    const metadata = type.buildMetadata(ctx) as import("@prisma/client").Prisma.InputJsonValue;

    const order = await prisma.$transaction(async (tx) => {
      return tx.order.create({
        data: {
          tenantId: tenant.id,
          orderNumber,
          status: "PENDING",
          orderType: type.orderType,
          paymentMethod: type.paymentMethod,
          guestEmail: guestInfo.email,
          guestName: guestInfo.name,
          guestPhone: guestInfo.phone ?? null,
          subtotalAmount: price.amount,
          taxRate,
          taxAmount,
          totalAmount,
          currency: price.currency,
          metadata,
          lineItems: {
            create: price.lineItems.map((li) => ({
              productId: li.productId,
              variantId: li.variantId,
              title: li.title,
              variantTitle: li.variantTitle,
              sku: li.sku,
              imageUrl: li.imageUrl,
              quantity: li.quantity,
              unitAmount: li.unitAmount,
              totalAmount: li.totalAmount,
              currency: li.currency,
            })),
          },
          events: {
            create: {
              tenantId: tenant.id,
              type: "ORDER_CREATED",
              message: `Order #${orderNumber} skapad`,
            },
          },
        },
      });
    });

    orderId = order.id;

    // ── 9. Post-order hook (inventory reservation etc) ────────
    if (type.afterOrderCreated) {
      await type.afterOrderCreated(order.id, ctx);
    }

    // ── 10. Initiate payment via adapter layer ─────────────────
    const init = await initiateOrderPayment({
      order: {
        id: order.id,
        tenantId: tenant.id,
        totalAmount: totalAmount,
        currency: price.currency,
      },
      guest: guestInfo,
      locale: "sv-SE",
      returnUrl: type.buildStripeMetadata(ctx).returnUrl ?? "",
      metadata: {
        orderNumber: String(orderNumber),
        orderType: type.orderType,
        ...type.buildStripeMetadata(ctx),
      },
    });

    log("info", "checkout.payment_initiated", {
      tenantId: tenant.id,
      orderId: order.id,
      orderNumber,
      amount: totalAmount,
      currency: price.currency,
      type: type.id,
      mode: init.mode,
      durationMs: Date.now() - startMs,
    });

    if (init.mode === "embedded") {
      return NextResponse.json({
        clientSecret: init.clientSecret,
        orderId: order.id,
      });
    } else {
      return NextResponse.json({ url: init.redirectUrl });
    }
  } catch (err) {
    // ── Typed checkout errors ────────────────────────────────
    if (err instanceof CheckoutError) {
      log("warn", `checkout.${err.code.toLowerCase()}`, {
        tenantId,
        orderId,
        type: type.id,
        error: err.message,
      });
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.httpStatus },
      );
    }

    // ── Unexpected errors — orphan cleanup ───────────────────
    log("error", "checkout.unexpected_error", {
      tenantId,
      orderId,
      type: type.id,
      error: String(err),
    });

    if (orderId) {
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        await prisma.orderEvent.create({
          data: {
            orderId,
            tenantId,
            type: "ORDER_CANCELLED",
            message: "Betalningsinitiering misslyckades — order avbokad automatiskt",
          },
        });
      } catch {
        // Best effort — don't throw from error handler
      }
    }

    return NextResponse.json(
      {
        error: "PAYMENT_FAILED",
        message: err instanceof Error ? err.message : "Betalning misslyckades",
      },
      { status: 503 },
    );
  }
}
