import {
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";

const tenantTaxConfigFindFirst = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenantTaxConfig: {
      findFirst: (...a: unknown[]) => tenantTaxConfigFindFirst(...a),
    },
  },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

import { calculateTax } from "./calculate";
import {
  registerTaxProvider,
  getTaxProvider,
  __resetTaxProviderRegistryForTests,
} from "./providers/registry";
import { builtinTaxProvider } from "./providers/builtin";
import type { TaxProvider } from "./providers/interface";
import type { TaxRequest, TaxResponse } from "./types";

const baseReq = (overrides: Partial<TaxRequest> = {}): TaxRequest => ({
  tenantId: "t_1",
  buyerLocation: { countryCode: "SE" },
  fulfillmentLocation: { countryCode: "SE" },
  lines: [
    {
      lineId: "ln_1",
      taxCategory: "RETAIL_GENERAL",
      taxableAmount: BigInt(10000),
      quantity: 1,
      taxable: true,
    },
  ],
  shippingLines: [],
  shopCurrency: "SEK",
  presentmentCurrency: "SEK",
  ...overrides,
});

beforeEach(() => {
  tenantTaxConfigFindFirst.mockReset();
  // Default: no tenant config — calculator falls back to "builtin"
  tenantTaxConfigFindFirst.mockResolvedValue(null);
});

afterEach(() => {
  // Restore the registry to a clean state with builtin re-registered,
  // since tests may have registered/cleared additional providers.
  __resetTaxProviderRegistryForTests();
  registerTaxProvider(builtinTaxProvider);
});

describe("calculateTax — happy path with builtin", () => {
  it("no TenantTaxConfig → defaults to builtin", async () => {
    const res = await calculateTax(baseReq());
    expect(res.source).toBe("builtin");
    expect(res.lines[0].taxLines[0].rate).toBe(0.25);
  });

  it("multi-tenant isolation — different tenants resolve independently", async () => {
    tenantTaxConfigFindFirst.mockImplementation(
      ({ where }: { where: { tenantId: string } }) => {
        if (where.tenantId === "t_a") {
          return Promise.resolve({
            providerKey: "builtin",
            credentials: null,
          });
        }
        return Promise.resolve(null);
      },
    );
    const a = await calculateTax(baseReq({ tenantId: "t_a" }));
    const b = await calculateTax(baseReq({ tenantId: "t_b" }));
    expect(a.source).toBe("builtin");
    expect(b.source).toBe("builtin");
  });
});

describe("calculateTax — TenantTaxConfig resolution (Q3 LOCKED)", () => {
  it("region-specific config beats GLOBAL", async () => {
    tenantTaxConfigFindFirst.mockImplementation(
      ({ where }: { where: { regionScope: string } }) => {
        if (where.regionScope === "SE") {
          return Promise.resolve({
            providerKey: "builtin",
            credentials: { region: "se" },
          });
        }
        if (where.regionScope === "GLOBAL") {
          return Promise.resolve({
            providerKey: "should-not-resolve",
            credentials: { region: "global" },
          });
        }
        return Promise.resolve(null);
      },
    );
    const res = await calculateTax(baseReq());
    // Region-specific resolved → builtin found → real source.
    expect(res.source).toBe("builtin");
    // The first findFirst call must be for the region-specific lookup.
    expect(tenantTaxConfigFindFirst).toHaveBeenCalledTimes(1);
    expect(tenantTaxConfigFindFirst.mock.calls[0][0].where.regionScope).toBe(
      "SE",
    );
  });

  it("GLOBAL fallback when no region-specific config", async () => {
    tenantTaxConfigFindFirst.mockImplementation(
      ({ where }: { where: { regionScope: string } }) => {
        if (where.regionScope === "GLOBAL") {
          return Promise.resolve({
            providerKey: "builtin",
            credentials: null,
          });
        }
        return Promise.resolve(null);
      },
    );
    const res = await calculateTax(baseReq());
    expect(res.source).toBe("builtin");
    expect(tenantTaxConfigFindFirst).toHaveBeenCalledTimes(2);
  });

  it("active: false config means findFirst returns null → falls through", async () => {
    // The where clause already includes active: true, so an inactive
    // row simply doesn't match; mock returns null in both calls →
    // calculator defaults to builtin.
    tenantTaxConfigFindFirst.mockResolvedValue(null);
    const res = await calculateTax(baseReq());
    expect(res.source).toBe("builtin");
  });

  it("empty fulfillment country skips region lookup, jumps to GLOBAL", async () => {
    tenantTaxConfigFindFirst.mockImplementation(
      ({ where }: { where: { regionScope: string } }) => {
        if (where.regionScope === "GLOBAL") {
          return Promise.resolve({
            providerKey: "builtin",
            credentials: null,
          });
        }
        return Promise.resolve(null);
      },
    );
    const res = await calculateTax(
      baseReq({
        buyerLocation: { countryCode: "" },
        fulfillmentLocation: { countryCode: "" },
      }),
    );
    // GLOBAL config resolved → builtin runs (returns warning for missing
    // country; source remains "builtin", NOT "fallback_zero").
    expect(res.source).toBe("builtin");
    expect(res.warnings).toContain("no_country_provided");
    // Only GLOBAL findFirst was called — no region lookup for empty country.
    expect(tenantTaxConfigFindFirst).toHaveBeenCalledTimes(1);
    expect(tenantTaxConfigFindFirst.mock.calls[0][0].where.regionScope).toBe(
      "GLOBAL",
    );
  });
});

describe("calculateTax — failure-mode tier-3 (Decision 10)", () => {
  it("provider key references unregistered provider → tier-3", async () => {
    tenantTaxConfigFindFirst.mockResolvedValue({
      providerKey: "avalara-not-yet-registered",
      credentials: null,
    });
    const res = await calculateTax(baseReq());
    expect(res.source).toBe("fallback_zero");
    expect(res.warnings[0]).toMatch(
      /tier3_fallback:provider_not_registered:avalara-not-yet-registered/,
    );
    expect(res.lines[0].taxLines).toEqual([]);
  });

  it("provider throws → tier-3 with error message in warnings", async () => {
    const throwingProvider: TaxProvider = {
      key: "throwing-test",
      displayName: "Throwing test provider",
      async calculate() {
        throw new Error("synthetic provider failure");
      },
    };
    registerTaxProvider(throwingProvider);
    tenantTaxConfigFindFirst.mockResolvedValue({
      providerKey: "throwing-test",
      credentials: null,
    });
    const res = await calculateTax(baseReq());
    expect(res.source).toBe("fallback_zero");
    expect(res.warnings[0]).toMatch(/synthetic provider failure/);
  });

  it("calculateTax NEVER throws (provider throws non-Error)", async () => {
    const throwingProvider: TaxProvider = {
      key: "throwing-string",
      displayName: "Throws a string",
      async calculate() {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "raw string error";
      },
    };
    registerTaxProvider(throwingProvider);
    tenantTaxConfigFindFirst.mockResolvedValue({
      providerKey: "throwing-string",
      credentials: null,
    });
    await expect(calculateTax(baseReq())).resolves.toMatchObject({
      source: "fallback_zero",
    });
  });

  it("tier-3 response preserves shipping lineId mapping", async () => {
    tenantTaxConfigFindFirst.mockResolvedValue({
      providerKey: "missing",
      credentials: null,
    });
    const res = await calculateTax(
      baseReq({
        shippingLines: [
          { shippingLineId: "ship_a", taxableAmount: BigInt(0) },
        ],
      }),
    );
    expect(res.shippingLines[0].shippingLineId).toBe("ship_a");
    expect(res.shippingLines[0].taxLines).toEqual([]);
  });
});

describe("calculateTax — credentials handling", () => {
  let capturedCtx: unknown = null;
  beforeEach(() => {
    capturedCtx = null;
    const captureProvider: TaxProvider = {
      key: "credential-capture",
      displayName: "Captures credentials",
      async calculate(_req, ctx): Promise<TaxResponse> {
        capturedCtx = ctx;
        return {
          lines: _req.lines.map((l) => ({
            lineId: l.lineId,
            taxLines: [],
          })),
          shippingLines: [],
          source: "credential-capture",
          estimated: true,
          warnings: [],
        };
      },
    };
    registerTaxProvider(captureProvider);
  });

  it("object credentials passed through to provider context", async () => {
    tenantTaxConfigFindFirst.mockResolvedValue({
      providerKey: "credential-capture",
      credentials: { apiKey: "sk_test_123", region: "us" },
    });
    await calculateTax(baseReq());
    expect(capturedCtx).toEqual({
      tenantId: "t_1",
      credentials: { apiKey: "sk_test_123", region: "us" },
    });
  });

  it("null credentials → empty object passed", async () => {
    tenantTaxConfigFindFirst.mockResolvedValue({
      providerKey: "credential-capture",
      credentials: null,
    });
    await calculateTax(baseReq());
    expect(capturedCtx).toEqual({ tenantId: "t_1", credentials: {} });
  });

  it("non-object credentials defensively → empty object passed", async () => {
    tenantTaxConfigFindFirst.mockResolvedValue({
      providerKey: "credential-capture",
      credentials: "not-an-object",
    });
    await calculateTax(baseReq());
    expect(capturedCtx).toEqual({ tenantId: "t_1", credentials: {} });
  });
});

describe("calculateTax — builtin auto-registration", () => {
  it("getTaxProvider('builtin') returns the builtin after module-load", () => {
    expect(getTaxProvider("builtin")?.key).toBe("builtin");
  });

  it("re-registering builtin is silent (HMR safety)", () => {
    expect(() => {
      // Module-level catch in calculate.ts swallows duplicate-registration
      // errors. The registry itself throws, but calculate.ts never lets
      // that bubble. Verify the registry behavior directly.
      registerTaxProvider(builtinTaxProvider);
    }).toThrow(/key collision/);
  });
});
