/**
 * Cart Validation (Server-side)
 * ═════════════════════════════
 *
 * Validates cart items against current product state before checkout.
 * Never trust client-supplied prices — this function re-computes them.
 */

"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { effectivePrice } from "@/app/_lib/products/pricing";
import type {
  CartItem,
  CartValidationError,
  CartValidationResult,
  ValidatedCartItem,
} from "./types";

/**
 * Validate cart items server-side. Checks:
 * 1. Product exists and is ACTIVE
 * 2. Variant exists (if specified)
 * 3. Stock availability (if inventory tracked)
 * 4. Price freshness (re-computes effectivePrice)
 *
 * Returns validated items with server-confirmed prices.
 */
export async function validateCart(
  tenantId: string,
  items: CartItem[],
): Promise<CartValidationResult> {
  const errors: CartValidationError[] = [];
  const validatedItems: ValidatedCartItem[] = [];

  // Batch-fetch all products referenced in the cart
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      tenantId,
    },
    include: {
      variants: true,
    },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const item of items) {
    const product = productMap.get(item.productId);

    // 1. Product must exist and be ACTIVE
    if (!product || product.status !== "ACTIVE") {
      errors.push({
        type: "PRODUCT_UNAVAILABLE",
        itemId: item.id,
        title: item.title,
      });
      continue;
    }

    // 2. Variant must exist if specified
    let variant = null;
    if (item.variantId) {
      variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant) {
        errors.push({
          type: "VARIANT_UNAVAILABLE",
          itemId: item.id,
          title: item.title,
        });
        continue;
      }
    }

    // 3. Check inventory
    const trackInventory = variant
      ? variant.trackInventory
      : product.trackInventory;
    const inventoryQty = variant
      ? variant.inventoryQuantity
      : product.inventoryQuantity;
    const continueSellingOOS = variant
      ? variant.continueSellingWhenOutOfStock
      : product.continueSellingWhenOutOfStock;

    if (trackInventory && !continueSellingOOS && inventoryQty < item.quantity) {
      errors.push({
        type: "INSUFFICIENT_STOCK",
        itemId: item.id,
        title: item.title,
        available: Math.max(0, inventoryQty),
      });
      continue;
    }

    // 4. Re-compute price using effectivePrice()
    const serverPrice = effectivePrice(
      product.price,
      variant?.price ?? null,
    );

    if (serverPrice !== item.unitAmount) {
      errors.push({
        type: "PRICE_CHANGED",
        itemId: item.id,
        title: item.title,
        oldAmount: item.unitAmount,
        newAmount: serverPrice,
      });
      // Still include in validated items with the correct price
      // so the UI can show the updated price
    }

    validatedItems.push({
      ...item,
      validatedUnitAmount: serverPrice,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    validatedItems,
  };
}
