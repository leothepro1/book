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
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { validateStayDates } from "@/app/_lib/validation/dates";
import { resolvePaymentMethods } from "@/app/_lib/payments/resolve";
import { log } from "@/app/_lib/logger";
import { CheckoutError } from "../errors";
import type { CheckoutType, CheckoutContext, ResolvedPrice } from "../types";
import type { PaymentMethodConfig } from "@/app/_lib/payments/types";

// ── Input schema ────────────────────────────────────────────────

const inputSchema = z.object({
  productSlug: z.string().min(1).max(100),
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

    if (product.productType === "PMS_ACCOMMODATION" && product.pmsSourceId) {
      try {
        const adapter = await resolveAdapter(tenant.id);
        const availability = await adapter.getAvailability(tenant.id, {
          checkIn: new Date(input.checkIn),
          checkOut: new Date(input.checkOut),
          guests: input.guests,
        });

        const entry = availability.categories.find(
          (e) => e.category.externalId === product.pmsSourceId,
        );

        if (entry && entry.ratePlans.length > 0) {
          const ratePlan = input.ratePlanId
            ? entry.ratePlans.find((rp) => rp.externalId === input.ratePlanId)
            : entry.ratePlans[0];

          if (ratePlan) {
            totalPrice = ratePlan.totalPrice;
            currency = ratePlan.currency;
            ratePlanName = ratePlan.name;
          }
        }
      } catch (err) {
        log("error", "checkout.pms_price_failed", {
          tenantId: tenant.id,
          productSlug: input.productSlug,
          error: String(err),
        });
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
    const product = cache.get(PRODUCT_KEY) as { productType: string; pmsSourceId: string | null } | undefined;
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
      pmsSourceId: product?.pmsSourceId ?? null,
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
