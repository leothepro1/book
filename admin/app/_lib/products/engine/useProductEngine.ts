"use client";

/**
 * useProductEngine — Rendering-agnostic Product Hook
 * ══════════════════════════════════════════════════
 *
 * Manages variant selection, pricing, inventory, and add-to-cart
 * for standard products. Follows the same patterns as useCommerceEngine:
 *   - Local useState for selection state
 *   - All derived values via useMemo
 *   - Never throws — all states handled gracefully
 *   - No async operations (pricing is deterministic from product data)
 *
 * Replaces the inline logic that was in ProductAddToCartElement.
 */

import { useState, useMemo, useCallback } from "react";
import type { StandardProductContext } from "@/app/(guest)/_lib/product-context/ProductContext";
import { useCart } from "@/app/(guest)/_lib/cart/CartContext";
import { effectivePrice } from "../pricing";
import type { ProductEngine } from "./types";

export function useProductEngine(product: StandardProductContext): ProductEngine {
  const { addToCart: cartAddToCart } = useCart();

  // ── Selection state ──

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const opt of product.options) {
      if (opt.values.length > 0) initial[opt.name] = opt.values[0]!;
    }
    return initial;
  });

  // ── Derived: selected variant ──

  const selectedVariant = useMemo(() => {
    if (product.variants.length === 0) return null;
    return product.variants.find((v) => {
      const opts = product.options;
      if (opts[0] && v.option1 !== selectedOptions[opts[0].name]) return false;
      if (opts[1] && v.option2 !== selectedOptions[opts[1].name]) return false;
      if (opts[2] && v.option3 !== selectedOptions[opts[2].name]) return false;
      return true;
    }) ?? null;
  }, [product.variants, product.options, selectedOptions]);

  // ── Derived: pricing ──

  const price = effectivePrice(product.price, selectedVariant?.price);
  const compareAtPrice = selectedVariant?.compareAtPrice ?? product.compareAtPrice;
  const activeImageUrl = selectedVariant?.imageUrl ?? null;

  // ── Derived: inventory ──

  const trackInv = selectedVariant ? selectedVariant.trackInventory : product.trackInventory;
  const inventoryQuantity = selectedVariant ? selectedVariant.inventoryQuantity : product.inventoryQuantity;
  const continueOOS = selectedVariant
    ? selectedVariant.continueSellingWhenOutOfStock
    : product.continueSellingWhenOutOfStock;
  const inStock = !trackInv || inventoryQuantity > 0 || continueOOS;
  const lowStock = trackInv && inventoryQuantity > 0 && inventoryQuantity <= 5;

  // ── Derived: display ──

  const variantTitle = selectedVariant
    ? [selectedVariant.option1, selectedVariant.option2, selectedVariant.option3]
        .filter(Boolean)
        .join(" / ")
    : null;

  // ── Actions ──

  const setOption = useCallback((name: string, value: string) => {
    setSelectedOptions((prev) => ({ ...prev, [name]: value }));
  }, []);

  const addToCart = useCallback(() => {
    if (!inStock) return;
    cartAddToCart({
      productId: product.id,
      variantId: selectedVariant?.id ?? null,
      quantity: 1,
      title: product.title,
      variantTitle,
      imageUrl: selectedVariant?.imageUrl ?? product.images[0] ?? null,
      unitAmount: price,
      currency: product.currency,
    });
  }, [inStock, cartAddToCart, product, selectedVariant, variantTitle, price]);

  return {
    selectedOptions,
    selectedVariant,
    price,
    compareAtPrice,
    activeImageUrl,
    inStock,
    lowStock,
    inventoryQuantity,
    variantTitle,
    setOption,
    addToCart,
  };
}
