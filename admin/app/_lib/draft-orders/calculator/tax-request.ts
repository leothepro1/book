/**
 * DraftOrder → TaxRequest mapper.
 *
 * Builds the Tax-1 calculator request from a draft + its (already
 * discount-adjusted) per-line taxable bases. This is a pure function —
 * no DB access — so the orchestrator can compose it freely with
 * pre-fetched data.
 *
 * Key mappings (Q1/Q2 advisory defaults):
 *   - lineType=ACCOMMODATION + nights > 30 → ACCOMMODATION_LONG_STAY
 *   - lineType=ACCOMMODATION + nights ≤ 30 → ACCOMMODATION_HOTEL
 *   - lineType=PRODUCT (STANDARD) → RETAIL_GENERAL
 *   - lineType=PRODUCT (GIFT_CARD) → FEE_OTHER
 *   - lineType=CUSTOM → FEE_OTHER
 *
 * Camping-vs-hotel disambiguation is deferred (no
 * Accommodation.taxCategory column in V1). Under SE/NO/DK/FI Nordic V1
 * rates, hotel and camping share the same VAT rate, so the simplification
 * is safe for current scope.
 */

import type { TaxRequest } from "@/app/_lib/tax/types";
import type { TaxCategory } from "@/app/_lib/tax/taxonomy";
import { DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE } from "@/app/_lib/tax/taxonomy";
import type { TaxExemptionCode } from "@/app/_lib/tax/exemptions";
import type { RawDraftOrder, RawDraftLineItem } from "./context";

const MS_PER_DAY = 86_400_000;

/**
 * Heuristic: lineType + product type / nights → TaxCategory.
 *
 * Long-stay detection happens here per Tax-1 Q8 LOCKED — nights > 30
 * resolves to ACCOMMODATION_LONG_STAY (rate 0 in seed). Caller-side
 * classification keeps the calculator pure.
 */
export function resolveTaxCategory(
  line: RawDraftLineItem,
  productTypeById: Map<string, "STANDARD" | "GIFT_CARD">,
): TaxCategory {
  if (line.lineType === "ACCOMMODATION") {
    if (line.checkInDate && line.checkOutDate) {
      const nights = Math.ceil(
        (line.checkOutDate.getTime() - line.checkInDate.getTime()) /
          MS_PER_DAY,
      );
      if (nights > 30) return "ACCOMMODATION_LONG_STAY";
    }
    return "ACCOMMODATION_HOTEL";
  }
  if (line.lineType === "PRODUCT" && line.productId) {
    const pt = productTypeById.get(line.productId) ?? "STANDARD";
    return DEFAULT_TAX_CATEGORY_BY_PRODUCT_TYPE[pt];
  }
  // CUSTOM (manual fee) → FEE_OTHER (Q2 default).
  return "FEE_OTHER";
}

export type CompanyLocationTaxContext = {
  /** TaxExemptionCode[] from CompanyLocation.taxExemptions. */
  taxExemptions: TaxExemptionCode[];
  /** Mapped from CompanyLocation.taxSetting. */
  collectMode: "COLLECT" | "DO_NOT_COLLECT" | "COLLECT_UNLESS_EXEMPT";
  vatNumber?: string;
  taxRegistrationId?: string;
};

export type BuildTaxRequestParams = {
  draft: RawDraftOrder;
  lineItems: readonly RawDraftLineItem[];
  /** Per-line taxable base post-discount (BigInt ören). 0 for non-taxable lines. */
  taxableBaseByLineId: Map<string, bigint>;
  /** Pre-loaded `Product.productType` lookups for PRODUCT lines. */
  productTypeById: Map<string, "STANDARD" | "GIFT_CARD">;
  /** Resolved per Tax-2 B.3 (Tenant.addressCountry → "SE" fallback). */
  fulfillmentCountryCode: string;
  /** V1: same as fulfillment unless caller has a richer source. */
  buyerCountryCode: string;
  shopCurrency: string;
  /** Q4 LOCKED in Tax-2: equals shopCurrency until Tax-4 Markets lands. */
  presentmentCurrency: string;
  /** Optional B2B context — populated when buyerKind=COMPANY. */
  companyLocation?: CompanyLocationTaxContext;
};

export function buildTaxRequestFromDraft(
  params: BuildTaxRequestParams,
): TaxRequest {
  const {
    draft,
    lineItems,
    taxableBaseByLineId,
    productTypeById,
    fulfillmentCountryCode,
    buyerCountryCode,
    shopCurrency,
    presentmentCurrency,
    companyLocation,
  } = params;

  return {
    tenantId: draft.tenantId,
    buyerLocation: { countryCode: buyerCountryCode },
    fulfillmentLocation: { countryCode: fulfillmentCountryCode },
    lines: lineItems.map((l) => ({
      lineId: l.id,
      productId: l.productId ?? l.accommodationId ?? undefined,
      taxCategory: resolveTaxCategory(l, productTypeById),
      taxableAmount: taxableBaseByLineId.get(l.id) ?? BigInt(0),
      quantity: l.quantity,
      taxable: l.taxable,
    })),
    shippingLines:
      draft.shippingCents > BigInt(0)
        ? [
            {
              shippingLineId: `shipping_${draft.id}`,
              taxableAmount: draft.shippingCents,
            },
          ]
        : [],
    shopCurrency,
    presentmentCurrency,
    companyLocation: companyLocation
      ? {
          id: draft.companyLocationId ?? "",
          taxExemptions: companyLocation.taxExemptions,
          vatNumber: companyLocation.vatNumber,
          taxRegistrationId: companyLocation.taxRegistrationId,
          collectMode: companyLocation.collectMode,
        }
      : undefined,
  };
}
