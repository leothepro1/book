/**
 * Tax engine request/response contracts.
 *
 * Mirrors Shopify's TaxesRequestSchema / TaxesResponseSchema (master plan
 * §3.1, §4 Decision 1). Single calculator interface invoked from Cart,
 * Checkout, DraftOrder calculation, and order finalization. Schema is
 * primitive-typed so no model details leak across boundaries.
 *
 * Tax-0 ships these types only. Tax-1 implements `calculateTax(req)`.
 */

import type { TaxCategory } from "./taxonomy";
import type { TaxExemptionCode } from "./exemptions";

/** Mirrors the Prisma `TaxCollectMode` enum added in B.4. */
export type TaxCollectMode =
  | "COLLECT"
  | "DO_NOT_COLLECT"
  | "COLLECT_UNLESS_EXEMPT";

export type TaxLocation = {
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  /** US state, CA province, etc. */
  region?: string;
  postalCode?: string;
  city?: string;
};

export type TaxRequestLine = {
  /** Stable identifier so the response can correlate per-line tax. */
  lineId: string;
  productId?: string;
  variantId?: string;
  taxCategory: TaxCategory;
  /** Line subtotal post-discount, pre-tax, in shop-currency öre. */
  taxableAmount: bigint;
  quantity: number;
  /** Explicit opt-out (gift cards, deposits-as-payment, etc.). */
  taxable: boolean;
  /** Provider-specific override (Avalara tax code, etc.). */
  taxCodeOverride?: string;
};

export type TaxRequestShippingLine = {
  shippingLineId: string;
  /** Shipping subtotal post-discount, pre-tax, in shop-currency öre. */
  taxableAmount: bigint;
  taxCodeOverride?: string;
};

export type TaxRequestCustomer = {
  id?: string;
  taxExemptions: TaxExemptionCode[];
  vatNumber?: string;
};

export type TaxRequestCompanyLocation = {
  id: string;
  taxExemptions: TaxExemptionCode[];
  vatNumber?: string;
  taxRegistrationId?: string;
  collectMode: TaxCollectMode;
};

export type TaxRequest = {
  tenantId: string;
  /** Future Tax-4; null pre-Markets implies tenant default. */
  marketId?: string;
  buyerLocation: TaxLocation;
  /** Origin (warehouse / accommodation property). */
  fulfillmentLocation: TaxLocation;
  lines: TaxRequestLine[];
  customer?: TaxRequestCustomer;
  companyLocation?: TaxRequestCompanyLocation;
  shippingLines: TaxRequestShippingLine[];
  /** Future: from Market resolution. Pre-Tax-4 equals shopCurrency. */
  presentmentCurrency: string;
  shopCurrency: string;
};

export type ComputedTaxLine = {
  /** Display title, e.g. "VAT 25%", "NY State Tax 4%". */
  title: string;
  /** Stable identifier, e.g. "SE", "US-NY-NEW_YORK_COUNTY". */
  jurisdiction: string;
  /** Decimal rate, e.g. 0.25 for 25 %. */
  rate: number;
  /** Base for this jurisdiction in shop-currency öre. */
  taxableAmount: bigint;
  /** Banker-rounded computed tax in shop-currency öre. */
  taxAmount: bigint;
  /** Same amount expressed in presentment currency. */
  presentmentTaxAmount: bigint;
  /** Provider key: "builtin", "avalara", "vertex", etc. */
  source: string;
  /** Marketplace facilitator liability flag. null = unknown. */
  channelLiable: boolean | null;
};

export type TaxResponseLine = {
  lineId: string;
  taxLines: ComputedTaxLine[];
};

export type TaxResponseShippingLine = {
  shippingLineId: string;
  taxLines: ComputedTaxLine[];
};

export type TaxResponse = {
  lines: TaxResponseLine[];
  shippingLines: TaxResponseShippingLine[];
  /** Provider key the result came from, including fallback variants. */
  source: string;
  /** True at cart preview, false at order-finalization snapshot. */
  estimated: boolean;
  warnings: string[];
};
