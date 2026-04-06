export const dynamic = "force-dynamic";

/**
 * POST /api/portal/checkout/session/cart
 * ══════════════════════════════════════
 *
 * Creates a CheckoutSession for cart/product checkout.
 * Follows the exact same pattern as the accommodation session route.
 *
 * Prices are re-fetched server-side — client prices are NEVER trusted.
 * The session snapshot is the single source of truth from this point forward.
 *
 * Flow:
 *   1. CartDrawer "Gå till kassan" → POST here
 *   2. Server validates items, re-fetches prices, creates CheckoutSession
 *   3. Returns { token, redirect: "/checkout" }
 *   4. /checkout?session=[token] loads session, renders CheckoutClient
 *   5. CheckoutClient calls POST /api/checkout/payment-intent { sessionToken }
 *   6. Order created from frozen snapshot → PaymentIntent → payment
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { verifyChargesEnabled } from "@/app/_lib/stripe/verify-account";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { effectivePrice } from "@/app/_lib/products/pricing";
import { log } from "@/app/_lib/logger";
import { reserveInventoryForTenant } from "@/app/_lib/products/inventory";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

const cartItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string().nullable(),
  quantity: z.number().int().min(1).max(99),
  title: z.string(),
  variantTitle: z.string().nullable(),
  imageUrl: z.string().nullable(),
  unitAmount: z.number().int(),
  currency: z.enum(["SEK", "EUR", "NOK", "DKK"]),
  addedAt: z.string(),
});

const inputSchema = z.object({
  items: z.array(cartItemSchema).min(1, "Varukorgen är tom").max(100, "Max 100 artiklar"),
});

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export async function POST(req: Request) {
  // ── Rate limit (same as accommodation session: 15/hour) ────
  if (!(await checkRateLimit("cs-cart", 15, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // ── Resolve tenant from host — never from body ─────────────
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  }

  // ── Parse input ────────────────────────────────────────────
  let body: z.infer<typeof inputSchema>;
  try {
    body = inputSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  // ── Verify Stripe is configured and active ─────────────────
  const tenantRecord = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { stripeAccountId: true },
  });

  if (!tenantRecord?.stripeAccountId) {
    return NextResponse.json(
      { error: "STRIPE_NOT_CONFIGURED", message: "Betalning är inte konfigurerad." },
      { status: 503 },
    );
  }

  const chargesOk = await verifyChargesEnabled(tenantRecord.stripeAccountId);
  if (!chargesOk) {
    return NextResponse.json(
      { error: "STRIPE_NOT_CONFIGURED", message: "Betalning är inte konfigurerad." },
      { status: 503 },
    );
  }

  // ── Validate cart items server-side ─────────────────────────
  // Re-fetch every product + variant from DB. Never trust client prices.
  const productIds = [...new Set(body.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId: tenant.id },
    select: {
      id: true,
      title: true,
      status: true,
      price: true,
      currency: true,
      trackInventory: true,
      inventoryQuantity: true,
      continueSellingWhenOutOfStock: true,
      variants: {
        select: {
          id: true,
          price: true,
          trackInventory: true,
          inventoryQuantity: true,
          continueSellingWhenOutOfStock: true,
          option1: true,
          option2: true,
          option3: true,
        },
      },
      options: { select: { name: true }, orderBy: { sortOrder: "asc" } },
      media: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));

  type ResolvedCartItem = {
    id: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    title: string;
    variantTitle: string | null;
    /** Option name → selected value, e.g. { "Tid": "07:00" } */
    variantOptions: Record<string, string>;
    imageUrl: string | null;
    unitAmount: number;
    currency: string;
    addedAt: string;
  };

  const resolvedItems: ResolvedCartItem[] = [];

  for (const item of body.items) {
    const product = productMap.get(item.productId);

    if (!product || product.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "PRODUCT_UNAVAILABLE", productId: item.productId, title: item.title },
        { status: 400 },
      );
    }

    let serverPrice = product.price;
    let trackInventory = product.trackInventory;
    let inventoryQty = product.inventoryQuantity;
    let continueOOS = product.continueSellingWhenOutOfStock;

    if (item.variantId) {
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant) {
        return NextResponse.json(
          { error: "VARIANT_UNAVAILABLE", productId: item.productId, variantId: item.variantId },
          { status: 400 },
        );
      }
      serverPrice = effectivePrice(product.price, variant.price);
      trackInventory = variant.trackInventory;
      inventoryQty = variant.inventoryQuantity;
      continueOOS = variant.continueSellingWhenOutOfStock;
    }

    // Price mismatch — client had stale price
    if (item.unitAmount !== serverPrice) {
      return NextResponse.json(
        { error: "PRICE_MISMATCH", productId: item.productId, clientPrice: item.unitAmount, serverPrice },
        { status: 400 },
      );
    }

    // Inventory check
    if (trackInventory && !continueOOS) {
      if (inventoryQty <= 0) {
        return NextResponse.json(
          { error: "OUT_OF_STOCK", productId: item.productId, title: item.title },
          { status: 400 },
        );
      }
      if (item.quantity > inventoryQty) {
        return NextResponse.json(
          { error: "INSUFFICIENT_STOCK", productId: item.productId, title: item.title, available: inventoryQty },
          { status: 400 },
        );
      }
    }

    // Build option name → value map from variant
    const variantOptions: Record<string, string> = {};
    if (item.variantId) {
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (variant) {
        const optionNames = product.options.map((o) => o.name);
        if (variant.option1 && optionNames[0]) variantOptions[optionNames[0]] = variant.option1;
        if (variant.option2 && optionNames[1]) variantOptions[optionNames[1]] = variant.option2;
        if (variant.option3 && optionNames[2]) variantOptions[optionNames[2]] = variant.option3;
      }
    }

    resolvedItems.push({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      title: item.title,
      variantTitle: item.variantTitle,
      variantOptions,
      imageUrl: product.media[0]?.url ?? item.imageUrl,
      unitAmount: serverPrice,
      currency: product.currency,
      addedAt: item.addedAt,
    });
  }

  // ── Compute total from server-verified prices ──────────────
  const cartTotal = resolvedItems.reduce(
    (sum, item) => sum + item.unitAmount * item.quantity,
    0,
  );

  // ── Invariant: CART session must always have cartItems ──────
  if (resolvedItems.length === 0) {
    return NextResponse.json({ error: "EMPTY_CART" }, { status: 400 });
  }

  // ── Create CheckoutSession ─────────────────────────────────
  const token = generateToken();

  const session = await prisma.checkoutSession.create({
    data: {
      token,
      tenantId: tenant.id,
      sessionType: "CART",
      status: "CHECKOUT",
      cartItems: resolvedItems,
      cartTotal,
      currency: resolvedItems[0]?.currency ?? "SEK",
      selectedAddons: [],
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  // ── Reserve inventory for tracked items ─────────────────────
  // Reservations use session.id as sessionId — released by expire-reservations cron
  // if session expires without payment. TTL matches session TTL (30 min).
  for (const item of resolvedItems) {
    const product = productMap.get(item.productId);
    if (!product) continue;

    let shouldReserve = product.trackInventory;
    if (item.variantId) {
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (variant) shouldReserve = variant.trackInventory;
    }

    if (shouldReserve) {
      try {
        await reserveInventoryForTenant({
          tenantId: tenant.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          sessionId: session.id,
          ttlMinutes: 30,
        });
      } catch (err) {
        // Reservation failed — likely concurrent oversell. Cancel session and return error.
        log("error", "checkout_session.cart_reservation_failed", {
          tenantId: tenant.id,
          sessionId: session.id,
          productId: item.productId,
          error: err instanceof Error ? err.message : String(err),
        });
        await prisma.checkoutSession.update({
          where: { id: session.id },
          data: { status: "ABANDONED" },
        });
        return NextResponse.json(
          { error: "OUT_OF_STOCK", productId: item.productId, title: item.title },
          { status: 400 },
        );
      }
    }
  }

  log("info", "checkout_session.cart_created", {
    tenantId: tenant.id,
    sessionId: session.id,
    itemCount: resolvedItems.length,
    cartTotal,
    currency: resolvedItems[0]?.currency ?? "SEK",
  });

  return NextResponse.json({ token, redirect: "/checkout" });
}
