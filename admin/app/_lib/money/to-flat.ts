import type { MoneyBag } from "./types";

/**
 * Map a nested `MoneyBag` to a flat Prisma update payload. Inverse of
 * `moneyBagFromFlat`.
 *
 * See `_audit/presentment-money-handoff.md` §6.
 */
export function moneyBagToFlat(bag: MoneyBag): {
  amount: bigint | number;
  currency: string;
  presentmentAmount: bigint | number;
  presentmentCurrency: string;
} {
  return {
    amount: bag.shopMoney.amount,
    currency: bag.shopMoney.currency,
    presentmentAmount: bag.presentmentMoney.amount,
    presentmentCurrency: bag.presentmentMoney.currency,
  };
}
