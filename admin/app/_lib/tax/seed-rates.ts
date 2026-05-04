import type { TaxCategory } from "./taxonomy";

/**
 * Nordic V1 tax-rate seed table. Per master plan Q7 LOCKED.
 * Keyed by (countryCode, taxCategory). Region (sub-country) NOT
 * supported in V1 — added in future phases for US/CA local taxes.
 *
 * Rates are fact-checked at recon time (2026-05). Rate changes
 * occur in country tax legislation and require operator/legal
 * review before update. NOT auto-pulled from external source —
 * Tax-8 (Avalara adapter) handles dynamic rates for jurisdictions
 * outside Nordic.
 *
 * Format: Decimal as fraction (0.25 = 25%). NOT basis points.
 * Matches master plan Decision 1 + Tax-0 TaxLine.rate Decimal(7,6).
 */
export type RateSeedEntry = {
  /** 0.25 = 25%. */
  rate: number;
  /** Localized title shown on receipts: "Moms 12% (hotell)", etc. */
  jurisdictionTitle: string;
  /** Legislative context, exemption rules. Surfaced for audit/timeline. */
  notes?: string;
};

export const NORDIC_TAX_RATES: Record<
  string,
  Partial<Record<TaxCategory, RateSeedEntry>>
> = {
  SE: {
    // Standard 25%
    RETAIL_GENERAL: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    RETAIL_SOUVENIR: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    BEVERAGE_ALCOHOLIC: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    EXPERIENCE_SPA: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FEE_BOOKING: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FEE_OTHER: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    // Reduced 12%
    ACCOMMODATION_HOTEL: {
      rate: 0.12,
      jurisdictionTitle: "Moms 12% (hotell)",
    },
    ACCOMMODATION_CAMPING: {
      rate: 0.12,
      jurisdictionTitle: "Moms 12% (camping)",
    },
    FOOD_RESTAURANT: {
      rate: 0.12,
      jurisdictionTitle: "Moms 12% (restaurang)",
    },
    FOOD_GROCERY: {
      rate: 0.12,
      jurisdictionTitle: "Moms 12% (livsmedel)",
    },
    FOOD_BREAKFAST: {
      rate: 0.12,
      jurisdictionTitle: "Moms 12% (frukost)",
    },
    BEVERAGE_NON_ALCOHOLIC: { rate: 0.12, jurisdictionTitle: "Moms 12%" },
    FEE_CLEANING: { rate: 0.12, jurisdictionTitle: "Moms 12%" },
    // Reduced 6%
    TRANSPORT_LOCAL: { rate: 0.06, jurisdictionTitle: "Moms 6% (resor)" },
    EXPERIENCE_TOUR: {
      rate: 0.06,
      jurisdictionTitle: "Moms 6% (kultur)",
    },
    // Tax-exempt by jurisdictional rule (audit trail kept by emitting rate=0)
    ACCOMMODATION_LONG_STAY: {
      rate: 0,
      jurisdictionTitle: "Momsbefriad (>30 dagar)",
      notes: "Långtidsuthyrning >30 dagar är momsbefriad enl. SKV.",
    },
  },
  NO: {
    // Standard 25%
    RETAIL_GENERAL: { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    RETAIL_SOUVENIR: { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    BEVERAGE_ALCOHOLIC: { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    EXPERIENCE_SPA: { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    FEE_BOOKING: { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    FEE_OTHER: { rate: 0.25, jurisdictionTitle: "MVA 25%" },
    // Reduced 15% (food)
    FOOD_RESTAURANT: { rate: 0.15, jurisdictionTitle: "MVA 15% (mat)" },
    FOOD_GROCERY: { rate: 0.15, jurisdictionTitle: "MVA 15%" },
    FOOD_BREAKFAST: { rate: 0.15, jurisdictionTitle: "MVA 15%" },
    BEVERAGE_NON_ALCOHOLIC: { rate: 0.15, jurisdictionTitle: "MVA 15%" },
    FEE_CLEANING: { rate: 0.15, jurisdictionTitle: "MVA 15%" },
    // Reduced 12% (transport, accommodation)
    ACCOMMODATION_HOTEL: {
      rate: 0.12,
      jurisdictionTitle: "MVA 12% (overnatting)",
    },
    ACCOMMODATION_CAMPING: {
      rate: 0.12,
      jurisdictionTitle: "MVA 12% (camping)",
    },
    TRANSPORT_LOCAL: {
      rate: 0.12,
      jurisdictionTitle: "MVA 12% (transport)",
    },
    // Reduced 6% (cultural events)
    EXPERIENCE_TOUR: { rate: 0.06, jurisdictionTitle: "MVA 6% (kultur)" },
    // Tax-exempt
    ACCOMMODATION_LONG_STAY: {
      rate: 0,
      jurisdictionTitle: "MVA-fritak (>30 dager)",
      notes: "Langtidsutleie >30 dager er MVA-fritatt.",
    },
  },
  DK: {
    // Flat 25% — Denmark has no reduced VAT rates.
    RETAIL_GENERAL: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    RETAIL_SOUVENIR: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    BEVERAGE_ALCOHOLIC: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    BEVERAGE_NON_ALCOHOLIC: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    EXPERIENCE_SPA: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    EXPERIENCE_TOUR: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FEE_BOOKING: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FEE_OTHER: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FEE_CLEANING: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    ACCOMMODATION_HOTEL: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    ACCOMMODATION_CAMPING: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FOOD_RESTAURANT: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FOOD_GROCERY: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    FOOD_BREAKFAST: { rate: 0.25, jurisdictionTitle: "Moms 25%" },
    // Passenger transport is VAT-exempt under Danish rules.
    TRANSPORT_LOCAL: {
      rate: 0,
      jurisdictionTitle: "Momsfri (passagertransport)",
    },
    // Tax-exempt
    ACCOMMODATION_LONG_STAY: {
      rate: 0,
      jurisdictionTitle: "Momsfri (>30 dage)",
    },
  },
  FI: {
    // Standard 25.5% (raised Sept 2024 from 24%)
    RETAIL_GENERAL: { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    RETAIL_SOUVENIR: { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    BEVERAGE_ALCOHOLIC: { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    EXPERIENCE_SPA: { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    FEE_BOOKING: { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    FEE_OTHER: { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    FEE_CLEANING: { rate: 0.255, jurisdictionTitle: "ALV 25.5%" },
    // Reduced 14%
    FOOD_RESTAURANT: {
      rate: 0.14,
      jurisdictionTitle: "ALV 14% (ravintola)",
    },
    FOOD_GROCERY: { rate: 0.14, jurisdictionTitle: "ALV 14%" },
    FOOD_BREAKFAST: { rate: 0.14, jurisdictionTitle: "ALV 14%" },
    BEVERAGE_NON_ALCOHOLIC: { rate: 0.14, jurisdictionTitle: "ALV 14%" },
    // Reduced 10%
    ACCOMMODATION_HOTEL: {
      rate: 0.1,
      jurisdictionTitle: "ALV 10% (majoitus)",
    },
    ACCOMMODATION_CAMPING: { rate: 0.1, jurisdictionTitle: "ALV 10%" },
    TRANSPORT_LOCAL: {
      rate: 0.1,
      jurisdictionTitle: "ALV 10% (kuljetus)",
    },
    EXPERIENCE_TOUR: {
      rate: 0.1,
      jurisdictionTitle: "ALV 10% (kulttuuri)",
    },
    // Tax-exempt
    ACCOMMODATION_LONG_STAY: {
      rate: 0,
      jurisdictionTitle: "ALV-vapaa (>30 päivää)",
    },
  },
};

/**
 * Look up a rate for `(countryCode, taxCategory)`. Country code is
 * normalized to upper-case (Q6 LOCKED — defensive ISO handling).
 *
 * Returns `null` for unsupported country (non-Nordic) or missing
 * category. Caller decides the user-visible behavior; the calculator
 * (Tax-1 B.3) translates `null` into a warning per Decision 10
 * ("always quote, never block").
 */
export function lookupRate(
  countryCode: string,
  taxCategory: TaxCategory,
): RateSeedEntry | null {
  const country = NORDIC_TAX_RATES[countryCode.toUpperCase()];
  if (!country) return null;
  return country[taxCategory] ?? null;
}
