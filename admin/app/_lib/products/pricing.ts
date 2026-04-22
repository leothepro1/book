/**
 * Product Pricing Resolution
 * ══════════════════════════
 * Single source of truth for how prices are resolved.
 *
 * Shopify model:
 *   - Product has a base price
 *   - Each variant can override with its own price
 *   - A variant price of 0 means "use product base price"
 *   - effectivePrice(product, variant) is the ONLY way to resolve price
 *
 * This function is used by:
 *   - Admin UI (variant table displays effective price)
 *   - Storefront (product page, cart, checkout)
 *   - Order creation (price at time of purchase)
 *
 * NEVER read variant.price or product.price directly for display —
 * always go through effectivePrice().
 */

/**
 * Resolve the effective price for a variant.
 *
 * Rules:
 *   1. If variant has a price > 0, that's the effective price
 *   2. Otherwise, inherit from product base price
 *
 * All prices in smallest currency unit (ören/cents).
 */
export function effectivePrice(
  productPrice: number,
  variantPrice: number | null | undefined,
): number {
  if (variantPrice != null && variantPrice > 0) return variantPrice;
  return productPrice;
}

/**
 * Check if a variant has an explicit price override.
 */
export function hasVariantPriceOverride(
  variantPrice: number | null | undefined,
): boolean {
  return variantPrice != null && variantPrice > 0;
}

/**
 * Format a price in smallest currency unit to display string.
 * 12900 → "129" (SEK, no decimals for whole amounts)
 * 12950 → "129,50"
 *
 * @deprecated Use `formatSek` from `@/app/_lib/money/format` for new code.
 * `formatPriceDisplay` omits the currency suffix (callers append " kr"
 * manually), while `formatSek` returns the fully-formatted string. Kept
 * here to preserve legacy call-site contracts; migration is a follow-up
 * cleanup tracked as UX-debt.
 */
export function formatPriceDisplay(
  amount: number,
  currency: string = "SEK",
): string {
  const value = amount / 100;
  if (currency === "SEK") {
    if (Number.isInteger(value)) {
      return new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
    }
    return new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency }).format(value);
}

/**
 * Get the price range across all variants (using effective prices).
 * Returns { min, max } in smallest currency unit.
 */
export function getVariantPriceRange(
  productPrice: number,
  variants: Array<{ price: number | null | undefined }>,
): { min: number; max: number } {
  if (variants.length === 0) return { min: productPrice, max: productPrice };

  const prices = variants.map((v) => effectivePrice(productPrice, v.price));
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}
