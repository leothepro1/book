/**
 * Tax categorization for hospitality verticals.
 *
 * Lightweight subset of Shopify's 10,000-node product taxonomy
 * (master plan §4 Decision 6). 16 flat categories that cover the
 * realistic hospitality SKU space. Per-jurisdiction rate lookup
 * lives in the calculator (Tax-1 territory); this enum is the
 * single classifier on the request side.
 *
 * Future: Tax-9 may migrate to full Shopify taxonomy if vertical
 * breadth justifies it.
 */

export type TaxCategory =
  | "ACCOMMODATION_HOTEL"
  | "ACCOMMODATION_CAMPING"
  | "ACCOMMODATION_LONG_STAY"
  | "FOOD_BREAKFAST"
  | "FOOD_RESTAURANT"
  | "FOOD_GROCERY"
  | "BEVERAGE_NON_ALCOHOLIC"
  | "BEVERAGE_ALCOHOLIC"
  | "TRANSPORT_LOCAL"
  | "EXPERIENCE_TOUR"
  | "EXPERIENCE_SPA"
  | "RETAIL_GENERAL"
  | "RETAIL_SOUVENIR"
  | "FEE_BOOKING"
  | "FEE_CLEANING"
  | "FEE_OTHER";

export const TAX_CATEGORIES: readonly TaxCategory[] = [
  "ACCOMMODATION_HOTEL",
  "ACCOMMODATION_CAMPING",
  "ACCOMMODATION_LONG_STAY",
  "FOOD_BREAKFAST",
  "FOOD_RESTAURANT",
  "FOOD_GROCERY",
  "BEVERAGE_NON_ALCOHOLIC",
  "BEVERAGE_ALCOHOLIC",
  "TRANSPORT_LOCAL",
  "EXPERIENCE_TOUR",
  "EXPERIENCE_SPA",
  "RETAIL_GENERAL",
  "RETAIL_SOUVENIR",
  "FEE_BOOKING",
  "FEE_CLEANING",
  "FEE_OTHER",
] as const;

/**
 * Default mapping from `Product.productType` → `TaxCategory`.
 *
 * The accommodation domain is no longer modeled as a `ProductType`
 * (replaced March 2026 by the first-class `Accommodation` model);
 * the recon's stale `PMS_ACCOMMODATION` entry has been dropped here
 * accordingly. Accommodation lines must supply their own category
 * via the calculator request.
 *
 * For `GIFT_CARD`: gift cards are typically `taxable: false` at the
 * line level (tax applies on redemption); the category default is a
 * safe fallback only — calculator should respect the line's taxable
 * flag first.
 */
export const DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE: Record<
  "STANDARD" | "GIFT_CARD",
  TaxCategory
> = {
  STANDARD: "RETAIL_GENERAL",
  GIFT_CARD: "FEE_OTHER",
};
