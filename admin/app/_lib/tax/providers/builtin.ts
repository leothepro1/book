import type { TaxProvider, TaxProviderContext } from "./interface";
import type {
  TaxRequest,
  TaxResponse,
  TaxResponseLine,
  TaxResponseShippingLine,
  ComputedTaxLine,
} from "../types";
import { roundTaxAmount } from "@/app/_lib/money/round";
import { lookupRate } from "../seed-rates";

const PROVIDER_KEY = "builtin";

/**
 * Builtin tax provider. Static rate-seed lookup per master plan
 * Decision 6 + Q7 LOCKED (Nordic V1).
 *
 * - Pure function (no DB access — `TenantTaxConfig` was already
 *   resolved by the calculator orchestrator).
 * - Banker's rounding per line × jurisdiction (Decision 4 / Q10
 *   parity with Shopify fixtures).
 * - Honors company-location collectMode (DO_NOT_COLLECT skips all).
 * - Honors customer/company `taxExemptions` (handles
 *   `EU_REVERSE_CHARGE_EXEMPTION_RULE` with intra-EU sub-condition
 *   per Q7 LOCKED).
 * - Throws nothing — calculator orchestrator wraps in try/catch.
 *
 * For non-Nordic jurisdictions, returns `warnings: ["no_rate_for_country:XX"]`
 * with empty taxLines. Calculator surfaces these for operator
 * visibility; aim is "always quote, never block".
 */
export const builtinTaxProvider: TaxProvider = {
  key: PROVIDER_KEY,
  displayName: "Built-in (Nordic V1)",

  async calculate(
    req: TaxRequest,
    _ctx: TaxProviderContext,
  ): Promise<TaxResponse> {
    const warnings: string[] = [];
    const country = (
      req.fulfillmentLocation?.countryCode ?? ""
    ).toUpperCase();

    // Honor B2B collectMode: DO_NOT_COLLECT → skip all tax.
    const skipAllTax =
      req.companyLocation?.collectMode === "DO_NOT_COLLECT";

    // Honor EU reverse-charge: when companyLocation OR customer carries
    // EU_REVERSE_CHARGE_EXEMPTION_RULE AND the buyer's country differs
    // from the fulfillment country (Q7 LOCKED, intra-EU semantics per
    // Shopify enum doc).
    const hasReverseCharge =
      (req.companyLocation?.taxExemptions ?? []).includes(
        "EU_REVERSE_CHARGE_EXEMPTION_RULE",
      ) ||
      (req.customer?.taxExemptions ?? []).includes(
        "EU_REVERSE_CHARGE_EXEMPTION_RULE",
      );
    const buyerCountry = (
      req.buyerLocation?.countryCode ?? ""
    ).toUpperCase();
    const reverseChargeApplies =
      hasReverseCharge && buyerCountry !== "" && buyerCountry !== country;

    if (skipAllTax) warnings.push("collect_mode_do_not_collect");
    if (reverseChargeApplies) warnings.push("eu_reverse_charge_applied");

    const lines: TaxResponseLine[] = (req.lines ?? []).map((line) => {
      if (!line.taxable || skipAllTax || reverseChargeApplies) {
        return { lineId: line.lineId, taxLines: [] };
      }

      const seed = lookupRate(country, line.taxCategory);
      if (!seed) {
        // Either non-Nordic country OR category missing for this country.
        const warningKey = country
          ? `no_rate_for_country:${country}`
          : "no_country_provided";
        if (!warnings.includes(warningKey)) warnings.push(warningKey);
        return { lineId: line.lineId, taxLines: [] };
      }

      if (seed.rate === 0) {
        // Explicit rate=0 still emits a TaxLine for audit/timeline (Q5).
        return {
          lineId: line.lineId,
          taxLines: [
            {
              title: seed.jurisdictionTitle,
              jurisdiction: country,
              rate: 0,
              taxableAmount: line.taxableAmount,
              taxAmount: BigInt(0),
              presentmentTaxAmount: BigInt(0),
              source: PROVIDER_KEY,
              channelLiable: true,
            } satisfies ComputedTaxLine,
          ],
        };
      }

      // Compute tax — banker's rounding per line × jurisdiction
      // (Decision 4). One jurisdiction per line in Nordic V1; future
      // US/CA support will iterate multiple jurisdictions per line.
      const taxableNumber = Number(line.taxableAmount);
      const rawTax = taxableNumber * seed.rate;
      const taxAmount = BigInt(roundTaxAmount(rawTax));

      const taxLine: ComputedTaxLine = {
        title: seed.jurisdictionTitle,
        jurisdiction: country,
        rate: seed.rate,
        taxableAmount: line.taxableAmount,
        taxAmount,
        // Tax-1 V1: presentment = shop (Q9 LOCKED). Tax-4 introduces
        // FX conversion when Markets resolves localCurrencies.
        presentmentTaxAmount: taxAmount,
        source: PROVIDER_KEY,
        channelLiable: true,
      };

      return { lineId: line.lineId, taxLines: [taxLine] };
    });

    // Shipping lines — Tax-1 stub: empty taxLines pass-through.
    // Tax-7 wires merchant shipping-tax overrides + per-jurisdiction
    // shipping rates.
    const shippingLines: TaxResponseShippingLine[] = (
      req.shippingLines ?? []
    ).map((s) => ({
      shippingLineId: s.shippingLineId,
      taxLines: [],
    }));

    return {
      lines,
      shippingLines,
      source: PROVIDER_KEY,
      // `estimated: true` matches cart/preview surface; calculator
      // orchestrator overrides for finalized orders (Tax-3).
      estimated: true,
      warnings,
    };
  },
};
