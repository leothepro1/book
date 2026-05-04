import { describe, it, expect } from "vitest";
import { moneyBagFromFlat } from "./from-flat";
import { moneyBagToFlat } from "./to-flat";

describe("moneyBagFromFlat", () => {
  it("equal-currency case (single-market tenant)", () => {
    const bag = moneyBagFromFlat({
      amount: 12500,
      currency: "SEK",
      presentmentAmount: 12500,
      presentmentCurrency: "SEK",
    });
    expect(bag).toEqual({
      shopMoney: { amount: 12500, currency: "SEK" },
      presentmentMoney: { amount: 12500, currency: "SEK" },
    });
  });

  it("multi-currency case (presentment differs from shop)", () => {
    const bag = moneyBagFromFlat({
      amount: 12500,
      currency: "SEK",
      presentmentAmount: 1100,
      presentmentCurrency: "EUR",
    });
    expect(bag.shopMoney).toEqual({ amount: 12500, currency: "SEK" });
    expect(bag.presentmentMoney).toEqual({ amount: 1100, currency: "EUR" });
  });

  it("null presentmentAmount falls back to shop amount", () => {
    const bag = moneyBagFromFlat({
      amount: 500,
      currency: "SEK",
      presentmentAmount: null,
      presentmentCurrency: null,
    });
    expect(bag.shopMoney).toEqual({ amount: 500, currency: "SEK" });
    expect(bag.presentmentMoney).toEqual({ amount: 500, currency: "SEK" });
  });

  it("undefined presentment* falls back to shop", () => {
    const bag = moneyBagFromFlat({ amount: 99, currency: "USD" });
    expect(bag.presentmentMoney).toEqual({ amount: 99, currency: "USD" });
  });

  it("preserves bigint amounts (DraftOrder cents path)", () => {
    const bag = moneyBagFromFlat({
      amount: BigInt("9007199254740993"), // > Number.MAX_SAFE_INTEGER
      currency: "SEK",
      presentmentAmount: BigInt("9007199254740993"),
      presentmentCurrency: "SEK",
    });
    expect(bag.shopMoney.amount).toBe(BigInt("9007199254740993"));
    expect(bag.presentmentMoney.amount).toBe(BigInt("9007199254740993"));
  });

  it("zero amount handled correctly", () => {
    const bag = moneyBagFromFlat({ amount: 0, currency: "SEK" });
    expect(bag.shopMoney.amount).toBe(0);
    expect(bag.presentmentMoney.amount).toBe(0);
  });
});

describe("moneyBagToFlat", () => {
  it("inverts moneyBagFromFlat for equal-currency input", () => {
    const flat = moneyBagToFlat({
      shopMoney: { amount: 12500, currency: "SEK" },
      presentmentMoney: { amount: 12500, currency: "SEK" },
    });
    expect(flat).toEqual({
      amount: 12500,
      currency: "SEK",
      presentmentAmount: 12500,
      presentmentCurrency: "SEK",
    });
  });

  it("preserves multi-currency MoneyBag", () => {
    const flat = moneyBagToFlat({
      shopMoney: { amount: 12500, currency: "SEK" },
      presentmentMoney: { amount: 1100, currency: "EUR" },
    });
    expect(flat.amount).toBe(12500);
    expect(flat.currency).toBe("SEK");
    expect(flat.presentmentAmount).toBe(1100);
    expect(flat.presentmentCurrency).toBe("EUR");
  });
});

describe("moneyBag round-trip", () => {
  it("toFlat(fromFlat(x)) === x for equal-currency rows", () => {
    const original = {
      amount: 12500,
      currency: "SEK",
      presentmentAmount: 12500,
      presentmentCurrency: "SEK",
    };
    const round = moneyBagToFlat(moneyBagFromFlat(original));
    expect(round).toEqual(original);
  });

  it("toFlat(fromFlat(x)) === x for multi-currency rows", () => {
    const original = {
      amount: 12500,
      currency: "SEK",
      presentmentAmount: 1100,
      presentmentCurrency: "EUR",
    };
    const round = moneyBagToFlat(moneyBagFromFlat(original));
    expect(round).toEqual(original);
  });

  it("null presentment promotes to shop on round-trip", () => {
    const flat = moneyBagToFlat(
      moneyBagFromFlat({
        amount: 500,
        currency: "SEK",
        presentmentAmount: null,
        presentmentCurrency: null,
      }),
    );
    // Round-trip materializes the fallback — caller can detect via
    // `flat.presentmentAmount === flat.amount`.
    expect(flat.presentmentAmount).toBe(500);
    expect(flat.presentmentCurrency).toBe("SEK");
  });
});
