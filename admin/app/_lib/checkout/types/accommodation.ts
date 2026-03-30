/**
 * Accommodation Checkout Type
 * ═══════════════════════════
 *
 * PMS booking flow. Resolves price from PMS adapter,
 * validates stay dates, supports rate plan selection.
 * Guest info collected later via /api/checkout/update-guest.
 */

import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveProduct } from "@/app/_lib/products/resolve";
import { validateStayDates } from "@/app/_lib/validation/dates";
import { resolvePaymentMethods } from "@/app/_lib/payments/resolve";
import { resolveAccommodationPrice, AccommodationPriceError } from "@/app/_lib/accommodations";
import { CheckoutError } from "../errors";
import type { CheckoutType, CheckoutContext, ResolvedPrice } from "../types";
import type { PaymentMethodConfig } from "@/app/_lib/payments/types";

// ── Input schema ────────────────────────────────────────────────

const inputSchema = z.object({
  productSlug: z.string().min(1).max(100),
  accommodationId: z.string().min(1).max(100).optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().min(1).max(99),
  ratePlanId: z.string().max(200).nullable().optional(),
  paymentType: z.enum(["full", "klarna"]),
});

type AccommodationInput = z.infer<typeof inputSchema>;

// ── Cache keys ──────────────────────────────────────────────────

const PRODUCT_KEY = "product";
const RESOLVED_KEY = "resolved";
const RATE_PLAN_NAME_KEY = "ratePlanName";

// ── Type implementation ─────────────────────────────────────────

export const accommodationCheckout: CheckoutType<AccommodationInput> = {
  id: "accommodation",
  inputSchema,
  rateLimit: ["pi", 10, 60 * 60 * 1000],
  stripeMode: "payment_intent",
  orderType: "ACCOMMODATION",
  paymentMethod: "STRIPE_ELEMENTS",

  async validate(ctx) {
    const dateCheck = validateStayDates(ctx.input.checkIn, ctx.input.checkOut);
    if (!dateCheck.valid) {
      throw new CheckoutError("INVALID_PARAMS", dateCheck.error, 400);
    }
  },

  async resolvePrice(ctx): Promise<ResolvedPrice> {
    const { input, tenant, cache } = ctx;

    const product = await prisma.product.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: input.productSlug } },
      include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
    });

    if (!product || product.status !== "ACTIVE") {
      throw new CheckoutError("PRODUCT_NOT_FOUND", "Produkten hittades inte", 404);
    }

    const resolved = resolveProduct(product);
    cache.set(PRODUCT_KEY, product);
    cache.set(RESOLVED_KEY, resolved);

    let totalPrice = resolved.price;
    let currency = resolved.currency;
    let ratePlanName: string | null = null;

    if (input.accommodationId) {
      try {
        const priceResult = await resolveAccommodationPrice({
          tenantId: tenant.id,
          accommodationId: input.accommodationId,
          ratePlanId: input.ratePlanId ?? undefined,
          checkIn: new Date(input.checkIn),
          checkOut: new Date(input.checkOut),
          guests: input.guests,
        });

        totalPrice = priceResult.totalPrice;
        currency = priceResult.currency;
        ratePlanName = priceResult.ratePlan.name;
      } catch (err) {
        if (err instanceof AccommodationPriceError) {
          throw new CheckoutError(
            err.code === "PMS_UNAVAILABLE" ? "PMS_UNAVAILABLE" : "PRODUCT_NOT_FOUND",
            err.message,
            err.code === "PMS_UNAVAILABLE" ? 503 : 400,
          );
        }
        throw new CheckoutError(
          "PMS_UNAVAILABLE",
          "Kunde inte hämta pris från bokningssystemet.",
          503,
        );
      }
    }

    cache.set(RATE_PLAN_NAME_KEY, ratePlanName);

    return {
      amount: totalPrice,
      currency: currency as ResolvedPrice["currency"],
      lineItems: [
        {
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
      ],
    };
  },

  buildMetadata(ctx) {
    const { input, cache } = ctx;
    const product = cache.get(PRODUCT_KEY) as { productType: string } | undefined;
    const ratePlanName = cache.get(RATE_PLAN_NAME_KEY) as string | null;
    const dateCheck = validateStayDates(input.checkIn, input.checkOut);

    return {
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guests: input.guests,
      nights: dateCheck.valid ? dateCheck.nights : 0,
      ratePlanId: input.ratePlanId ?? null,
      ratePlanName,
      productSlug: input.productSlug,
      productType: product?.productType ?? null,
      accommodationId: input.accommodationId ?? null,
    };
  },

  buildStripeMetadata(ctx) {
    return { productSlug: ctx.input.productSlug };
  },

  resolveGuestInfo() {
    // Guest info collected later via /api/checkout/update-guest
    return { email: "", name: "" };
  },

  buildIntentConfig(ctx) {
    const resolved = resolvePaymentMethods(
      ctx.tenant.paymentMethodConfig as PaymentMethodConfig | null,
    );
    const types =
      ctx.input.paymentType === "klarna" && resolved.klarnaEnabled
        ? ["klarna"]
        : resolved.stripeTypes.filter((t) => t !== "klarna");
    return { paymentMethodTypes: types };
  },
};
