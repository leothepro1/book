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

/**
 * @deprecated Use the calculator from `@/app/_lib/tax` (lands in Tax-1).
 * This stub will be removed in Tax-3 once all callers migrate to
 * `calculateTax(req)` per master plan §4 Decision 1. See
 * `_audit/tax-engine-master-plan.md` and `_audit/tax-0-recon.md`.
 */
export function getTaxRate(
  _productType: ProductType,
  _countryCode: string = "SE",
): number {
  // TODO: implement per-country, per-product-type tax lookup
  // For now: tax is included in the PMS-resolved price (Swedish standard)
  return 0;
}
