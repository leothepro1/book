/**
 * Tax engine — public barrel.
 *
 * Tax-0 ships type contracts and enums. Tax-1 adds the calculator
 * orchestrator (`calculateTax`) + builtin provider (Nordic V1).
 * Tax-8 adds the Avalara adapter.
 */

export { calculateTax } from "./calculate";

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
