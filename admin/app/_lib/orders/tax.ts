/**
 * Tax Rate Resolution
 * ═══════════════════
 *
 * Returns tax rate in basis points (e.g. 2500 = 25%).
 * Currently returns 0 — will be implemented per-country, per-product-type.
 *
 * Sweden reference rates:
 *   Standard VAT:     2500 (25%)
 *   Hospitality/food: 1200 (12%)
 *   Transport:         600 (6%)
 */

import type { ProductType } from "@prisma/client";

export function getTaxRate(
  _productType: ProductType,
  _countryCode: string = "SE",
): number {
  // TODO: implement per-country, per-product-type tax lookup
  // For now: tax is included in the PMS-resolved price (Swedish standard)
  return 0;
}
