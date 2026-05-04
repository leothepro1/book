/**
 * Cross-currency money types — mirror Shopify's GraphQL MoneyBag pattern.
 *
 * Per `_audit/presentment-money-handoff.md` §6 (HYBRID decision):
 *   - Storage layer (Prisma): FLAT (`amount` + `currency` + parallel
 *     `presentmentAmount` + `presentmentCurrency`). Matches existing
 *     schema convention; per-column indexable.
 *   - Service-API / analytics-events / external API: NESTED MoneyBag.
 *     Forces every aggregation site to pick which money to use.
 *
 * Helpers `moneyBagFromFlat` (`./from-flat`) and `moneyBagToFlat`
 * (`./to-flat`) bridge between the two layers.
 */

export type MoneyV2 = {
  amount: bigint | number;
  currency: string;
};

export type MoneyBag = {
  shopMoney: MoneyV2;
  presentmentMoney: MoneyV2;
};
