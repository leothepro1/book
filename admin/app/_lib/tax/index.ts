/**
 * Tax engine — public barrel.
 *
 * Tax-0 ships type contracts and enums only. Calculator implementation
 * (`calculateTax`) lands in Tax-1. Provider adapters in Tax-1 (builtin)
 * and Tax-8 (Avalara).
 */

export type {
  ComputedTaxLine,
  TaxCollectMode,
  TaxLocation,
  TaxRequest,
  TaxRequestCompanyLocation,
  TaxRequestCustomer,
  TaxRequestLine,
  TaxRequestShippingLine,
  TaxResponse,
  TaxResponseLine,
  TaxResponseShippingLine,
} from "./types";

export type { TaxCategory } from "./taxonomy";
export {
  TAX_CATEGORIES,
  DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE,
} from "./taxonomy";

export type { TaxExemptionCode } from "./exemptions";
export { TAX_EXEMPTION_CODES } from "./exemptions";
