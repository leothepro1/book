/**
 * Cart Checkout Type
 * ══════════════════
 *
 * Shop/cart flow using Stripe Checkout Session (hosted).
 * Validates cart server-side, reserves inventory, creates
 * session with line items.
 */

import { z } from "zod";
import { headers } from "next/headers";
import { validateCart } from "@/app/_lib/cart/validate";
import { reserveInventoryForTenant } from "@/app/_lib/products/inventory";
import { guestInfoSchema } from "@/app/_lib/orders/types";
import { CheckoutError } from "../errors";
import type {
  CheckoutType,
  CheckoutContext,
  ResolvedPrice,
  CheckoutSessionConfig,
} from "../types";
import type { CartItem } from "@/app/_lib/cart/types";

// ── Input schema ────────────────────────────────────────────────

const inputSchema = z.object({
  items: z
    .array(
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
    )
    .min(1, "Varukorgen är tom"),
  guestInfo: guestInfoSchema.optional(),
});

type CartInput = z.infer<typeof inputSchema>;

// ── Cache key ───────────────────────────────────────────────────

const VALIDATION_KEY = "cartValidation";

// ── Type implementation ─────────────────────────────────────────

export const cartCheckout: CheckoutType<CartInput> = {
  id: "cart",
  inputSchema,
  rateLimit: ["co", 10, 60 * 60 * 1000],
  stripeMode: "checkout_session",
  orderType: "PURCHASE",
  paymentMethod: "STRIPE_CHECKOUT",

  async validate(ctx) {
    const validation = await validateCart(ctx.tenant.id, ctx.input.items as CartItem[]);
    if (!validation.valid) {
      throw new CheckoutError(
        "CART_INVALID",
        "Varukorgen innehåller ogiltiga artiklar",
        409,
      );
    }
    ctx.cache.set(VALIDATION_KEY, validation);
  },

  async resolvePrice(ctx): Promise<ResolvedPrice> {
    const validation = ctx.cache.get(VALIDATION_KEY) as {
      validatedItems: Array<{
        productId: string;
        variantId: string | null;
        title: string;
        variantTitle: string | null;
        imageUrl: string | null;
        quantity: number;
        validatedUnitAmount: number;
        currency: string;
      }>;
    };

    const subtotal = validation.validatedItems.reduce(
      (sum, item) => sum + item.validatedUnitAmount * item.quantity,
      0,
    );
    const currency = validation.validatedItems[0]?.currency ?? "SEK";

    return {
      amount: subtotal,
      currency: currency as ResolvedPrice["currency"],
      lineItems: validation.validatedItems.map((item) => ({
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
    };
  },

  buildMetadata() {
    return { type: "cart" };
  },

  buildStripeMetadata() {
    return {};
  },

  resolveGuestInfo(input) {
    return {
      email: input.guestInfo?.email ?? "",
      name: input.guestInfo?.name ?? "",
      phone: input.guestInfo?.phone,
    };
  },

  async afterOrderCreated(orderId, ctx) {
    const validation = ctx.cache.get(VALIDATION_KEY) as {
      validatedItems: Array<{
        productId: string;
        variantId: string | null;
        quantity: number;
      }>;
    };

    for (const item of validation.validatedItems) {
      if (item.quantity > 0) {
        try {
          await reserveInventoryForTenant({
            tenantId: ctx.tenant.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            sessionId: orderId,
            ttlMinutes: 30,
          });
        } catch {
          // Non-blocking — product may not track inventory
        }
      }
    }
  },

  async buildSessionConfig(ctx, price) {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3000";
    const isDev = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const protocol = isDev ? "http" : "https";
    const baseUrl = isDev
      ? `${protocol}://${host}`
      : `${protocol}://${ctx.tenant.portalSlug}.rutgr.com`;

    const validation = ctx.cache.get(VALIDATION_KEY) as {
      validatedItems: Array<{
        title: string;
        variantTitle: string | null;
        imageUrl: string | null;
        validatedUnitAmount: number;
        currency: string;
        quantity: number;
      }>;
    };

    return {
      successUrl: `${baseUrl}/shop/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/shop/checkout/cancel`,
      customerEmail: ctx.input.guestInfo?.email,
      expiresInSeconds: 1800,
      stripeLineItems: validation.validatedItems.map((item) => ({
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
    };
  },
};
