import { afterEach, describe, it, expect } from "vitest";
import {
  registerTaxProvider,
  getTaxProvider,
  listTaxProviders,
  __resetTaxProviderRegistryForTests,
} from "./registry";
import type { TaxProvider } from "./interface";
import type { TaxResponse } from "../types";

const noopResponse = async (): Promise<TaxResponse> => ({
  lines: [],
  shippingLines: [],
  source: "test",
  estimated: false,
  warnings: [],
});

const buildProvider = (key: string, displayName = key): TaxProvider => ({
  key,
  displayName,
  calculate: noopResponse,
});

describe("tax provider registry", () => {
  afterEach(() => {
    __resetTaxProviderRegistryForTests();
  });

  it("registers a provider with a unique key", () => {
    const builtin = buildProvider("builtin", "Builtin tax engine");
    registerTaxProvider(builtin);
    expect(getTaxProvider("builtin")).toBe(builtin);
  });

  it("throws on duplicate key registration", () => {
    registerTaxProvider(buildProvider("builtin"));
    expect(() => registerTaxProvider(buildProvider("builtin"))).toThrow(
      /key collision/,
    );
  });

  it("getTaxProvider returns undefined for an unknown key", () => {
    expect(getTaxProvider("nope")).toBeUndefined();
  });

  it("listTaxProviders returns all registered providers", () => {
    const a = buildProvider("a");
    const b = buildProvider("b");
    registerTaxProvider(a);
    registerTaxProvider(b);
    const all = listTaxProviders();
    expect(all).toHaveLength(2);
    expect(all).toContain(a);
    expect(all).toContain(b);
  });

  it("interface enforces calculate signature at compile time", async () => {
    // Compile-time guard: this object must structurally match TaxProvider.
    // If the interface changes, this assignment fails type-check.
    const provider: TaxProvider = buildProvider("type-check");
    const result = await provider.calculate(
      {
        tenantId: "t",
        buyerLocation: { countryCode: "SE" },
        fulfillmentLocation: { countryCode: "SE" },
        lines: [],
        shippingLines: [],
        presentmentCurrency: "SEK",
        shopCurrency: "SEK",
      },
      { tenantId: "t", credentials: {} },
    );
    expect(result.source).toBe("test");
  });
});
