/**
 * Purchase Checkout Type (Gift Cards)
 * ════════════════════════════════════
 *
 * Gift card purchase flow. Validates amount against tenant config,
 * verifies design, validates scheduled delivery date.
 */

import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { CheckoutError } from "../errors";
import type { CheckoutType, CheckoutContext, ResolvedPrice } from "../types";

// ── Input schema ────────────────────────────────────────────────

const inputSchema = z.object({
  designId: z.string().cuid(),
  amount: z.number().int().min(10000).max(10000000),
  recipientEmail: z.string().email(),
  recipientName: z.string().min(1).max(100),
  senderName: z.string().min(1).max(100),
  message: z.string().max(500).optional(),
  scheduledAt: z.string().datetime(),
});

type PurchaseInput = z.infer<typeof inputSchema>;

// ── Constants ───────────────────────────────────────────────────

const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_SCHEDULE_BEHIND_MS = 5 * 60 * 1000;

// ── Cache keys ──────────────────────────────────────────────────

const GCP_KEY = "giftCardProduct";
const DESIGN_KEY = "design";

// ── Type implementation ─────────────────────────────────────────

export const purchaseCheckout: CheckoutType<PurchaseInput> = {
  id: "purchase",
  inputSchema,
  rateLimit: ["purchase", 10, 60 * 60 * 1000],
  stripeMode: "payment_intent",
  orderType: "PURCHASE",
  paymentMethod: "STRIPE_ELEMENTS",

  async validate(ctx) {
    const { input, tenant, cache } = ctx;

    // Validate scheduledAt bounds
    const date = new Date(input.scheduledAt);
    const now = Date.now();
    if (date.getTime() < now - MAX_SCHEDULE_BEHIND_MS) {
      throw new CheckoutError("INVALID_PARAMS", "Schemaläggning kan inte vara i det förflutna", 400);
    }
    if (date.getTime() > now + MAX_SCHEDULE_AHEAD_MS) {
      throw new CheckoutError("INVALID_PARAMS", "Schemaläggning kan inte vara mer än 12 månader framåt", 400);
    }

    // Verify gift card enabled
    const gcp = await prisma.giftCardProduct.findFirst({
      where: { tenantId: tenant.id, enabled: true },
    });
    if (!gcp) {
      throw new CheckoutError("GIFT_CARDS_DISABLED", "Presentkort är inte aktiverat.", 400);
    }
    cache.set(GCP_KEY, gcp);

    // Validate amount against tenant config
    if (input.amount < gcp.minAmount || input.amount > gcp.maxAmount) {
      throw new CheckoutError("INVALID_AMOUNT", "Beloppet ligger utanför tillåtet intervall.", 400);
    }

    // Verify design belongs to tenant and is active
    const design = await prisma.giftCardDesign.findFirst({
      where: { id: input.designId, tenantId: tenant.id, active: true },
    });
    if (!design) {
      throw new CheckoutError("INVALID_DESIGN", "Vald design finns inte eller är inaktiv.", 400);
    }
    cache.set(DESIGN_KEY, design);
  },

  async resolvePrice(ctx): Promise<ResolvedPrice> {
    const { input, cache } = ctx;
    const gcp = cache.get(GCP_KEY) as { id: string };
    const design = cache.get(DESIGN_KEY) as { imageUrl: string } | undefined;

    return {
      amount: input.amount,
      currency: "SEK",
      lineItems: [
        {
          productId: gcp.id,
          variantId: null,
          title: "Presentkort",
          variantTitle: null,
          sku: null,
          imageUrl: design?.imageUrl ?? null,
          quantity: 1,
          unitAmount: input.amount,
          totalAmount: input.amount,
          currency: "SEK",
        },
      ],
    };
  },

  buildMetadata(ctx) {
    const { input } = ctx;
    return {
      type: "gift_card",
      designId: input.designId,
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName,
      senderName: input.senderName,
      message: input.message ?? "",
      scheduledAt: input.scheduledAt,
    };
  },

  buildStripeMetadata(ctx) {
    const { input } = ctx;
    return {
      designId: input.designId,
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName,
      senderName: input.senderName,
      message: input.message ?? "",
      scheduledAt: input.scheduledAt,
      amount: input.amount.toString(),
    };
  },

  resolveGuestInfo(input) {
    return {
      email: input.recipientEmail,
      name: input.senderName,
    };
  },

  buildIntentConfig() {
    return { paymentMethodTypes: ["card"] };
  },
};
