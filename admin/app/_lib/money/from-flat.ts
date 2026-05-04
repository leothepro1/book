import type { MoneyBag } from "./types";

/**
 * Map a flat Prisma row (`amount` + `currency` + optional `presentment*`)
 * to a nested `MoneyBag`. When presentment fields are absent or null,
 * shop values are reused — matches the post-Tax-0 backfill semantic
 * (`presentment* = shop *`).
 *
 * See `_audit/presentment-money-handoff.md` §6.
 */
export function moneyBagFromFlat(args: {
  amount: bigint | number;
  currency: string;
  presentmentAmount?: bigint | number | null;
  presentmentCurrency?: string | null;
}): MoneyBag {
  return {
    shopMoney: { amount: args.amount, currency: args.currency },
    presentmentMoney: {
      amount: args.presentmentAmount ?? args.amount,
      currency: args.presentmentCurrency ?? args.currency,
    },
  };
}
