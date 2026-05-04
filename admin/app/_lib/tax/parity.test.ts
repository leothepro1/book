/**
 * 12-decision parity tests — exercises every master-plan lock-in
 * decision end-to-end via `calculateTax()`. If a future PR breaks
 * any decision, this single file fails loud — easier than auditing
 * per-component tests. See `_audit/tax-engine-master-plan.md` §4.
 */

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
import type {
  TaxRequest,
  TaxResponse,
  ComputedTaxLine,
} from "./types";
import { TAX_CATEGORIES } from "./taxonomy";
import { TAX_EXEMPTION_CODES } from "./exemptions";
import { roundTaxAmount } from "@/app/_lib/money/round";

const buildReq = (overrides: Partial<TaxRequest> = {}): TaxRequest => ({
  tenantId: "t_parity",
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
  tenantTaxConfigFindFirst.mockResolvedValue(null);
});

afterEach(() => {
  __resetTaxProviderRegistryForTests();
  registerTaxProvider(builtinTaxProvider);
});

// ─────────────────────────────────────────────────────────────────────
// Decision 1 — Single calculator, multiple callers
// ─────────────────────────────────────────────────────────────────────

describe("Decision 1: single calculator, multiple callers", () => {
  it("cart-style request returns valid response", async () => {
    const res = await calculateTax(buildReq());
    expect(res).toMatchObject({
      lines: expect.any(Array),
      shippingLines: expect.any(Array),
      source: expect.any(String),
      estimated: expect.any(Boolean),
      warnings: expect.any(Array),
    });
  });

  it("order-style request (same shape) returns valid response", async () => {
    // Same shape — calculator is callable from any surface (Cart,
    // Checkout, DraftOrder, Order). Tax-3 will set `estimated: false`
    // on finalized orders; for Tax-1 the calculator just delegates.
    const res = await calculateTax(
      buildReq({
        lines: [
          {
            lineId: "ln_finalized",
            taxCategory: "ACCOMMODATION_HOTEL",
            taxableAmount: BigInt(150000),
            quantity: 1,
            taxable: true,
          },
        ],
      }),
    );
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].taxLines[0].rate).toBe(0.12);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decision 2 — TaxLine is a persistence model
// (Tax-0 schema; Tax-1 emits the in-memory shape that maps 1-1 to it.)
// ─────────────────────────────────────────────────────────────────────

describe("Decision 2: ComputedTaxLine maps 1-1 to TaxLine schema", () => {
  it("every emitted ComputedTaxLine has the persistence-required fields", async () => {
    const res = await calculateTax(buildReq());
    const tl = res.lines[0].taxLines[0];
    const required: (keyof ComputedTaxLine)[] = [
      "title",
      "jurisdiction",
      "rate",
      "taxableAmount",
      "taxAmount",
      "presentmentTaxAmount",
      "source",
      "channelLiable",
    ];
    for (const key of required) {
      expect(tl[key]).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decision 3 — MoneyBag dual-currency at API surface
// (Tax-1 V1: presentment = shop. Tax-4 introduces FX divergence.)
// ─────────────────────────────────────────────────────────────────────

describe("Decision 3: MoneyBag dual-currency contract", () => {
  it("presentmentTaxAmount === taxAmount in Tax-1 V1 (Q9 LOCKED)", async () => {
    const res = await calculateTax(buildReq());
    const tl = res.lines[0].taxLines[0];
    expect(tl.presentmentTaxAmount).toBe(tl.taxAmount);
  });

  it("presentment field is always present (typed as bigint)", async () => {
    const res = await calculateTax(buildReq());
    expect(typeof res.lines[0].taxLines[0].presentmentTaxAmount).toBe(
      "bigint",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decision 4 — Banker's rounding at line-level
// ─────────────────────────────────────────────────────────────────────

describe("Decision 4: banker's rounding at line × jurisdiction", () => {
  it("Shopify-equivalent fixture: 268.5 öre → 268 (banker down)", async () => {
    // 25% × 1074 öre = 268.5 → roundHalfToEven → 268.
    const res = await calculateTax(
      buildReq({
        lines: [
          {
            lineId: "ln_1",
            taxCategory: "RETAIL_GENERAL",
            taxableAmount: BigInt(1074),
            quantity: 1,
            taxable: true,
          },
        ],
      }),
    );
    expect(res.lines[0].taxLines[0].taxAmount).toBe(BigInt(268));
    // Sanity: Math.round disagrees.
    expect(Math.round(268.5)).toBe(269);
  });

  it("Shopify-equivalent fixture: 269.82 öre → 270 (not halfway, normal round)", async () => {
    // Constructing a precise base: closest int base for 25.5% (FI) ≈
    // 269.82 / 0.255 ≈ 1058.12 — pick base 1058 → tax = 269.79 →
    // round to 270. Demonstrates banker's rounding agrees with normal
    // rounding outside the halfway case.
    const res = await calculateTax(
      buildReq({
        buyerLocation: { countryCode: "FI" },
        fulfillmentLocation: { countryCode: "FI" },
        shopCurrency: "EUR",
        presentmentCurrency: "EUR",
        lines: [
          {
            lineId: "ln_1",
            taxCategory: "RETAIL_GENERAL",
            taxableAmount: BigInt(1058),
            quantity: 1,
            taxable: true,
          },
        ],
      }),
    );
    expect(res.lines[0].taxLines[0].taxAmount).toBe(BigInt(270));
  });

  it("multi-line: line-level rounding sum diverges from round-of-sum", async () => {
    // Three lines × 1230 öre × 25% = 307.5 each → 308 each → 924 sum.
    // Round-of-sum: 3690 × 25% = 922.5 → banker → 922. Different.
    const res = await calculateTax(
      buildReq({
        lines: [
          {
            lineId: "A",
            taxCategory: "RETAIL_GENERAL",
            taxableAmount: BigInt(1230),
            quantity: 1,
            taxable: true,
          },
          {
            lineId: "B",
            taxCategory: "RETAIL_GENERAL",
            taxableAmount: BigInt(1230),
            quantity: 1,
            taxable: true,
          },
          {
            lineId: "C",
            taxCategory: "RETAIL_GENERAL",
            taxableAmount: BigInt(1230),
            quantity: 1,
            taxable: true,
          },
        ],
      }),
    );
    const lineLevelSum = res.lines.reduce(
      (acc, l) => acc + l.taxLines[0].taxAmount,
      BigInt(0),
    );
    expect(lineLevelSum).toBe(BigInt(924));
    // Round-of-sum disagrees.
    expect(BigInt(roundTaxAmount(3690 * 0.25))).toBe(BigInt(922));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decision 5 — TaxRegistration as separate entity
// (Tax-0 added the schema. The calculator surface accommodates it via
// `companyLocation.taxRegistrationId` in TaxRequestCompanyLocation.)
// ─────────────────────────────────────────────────────────────────────

describe("Decision 5: TaxRegistration surface in calculator request", () => {
  it("TaxRequestCompanyLocation accepts taxRegistrationId without throwing", async () => {
    const res = await calculateTax(
      buildReq({
        companyLocation: {
          id: "cl_1",
          collectMode: "COLLECT",
          taxExemptions: [],
          taxRegistrationId: "tr_se_1",
          vatNumber: "SE123456789",
        },
      }),
    );
    expect(res.source).toBe("builtin");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decision 6 — TaxCategory drives rate lookup
// ─────────────────────────────────────────────────────────────────────

describe("Decision 6: TaxCategory drives per-jurisdiction rate", () => {
  it("ACCOMMODATION_HOTEL in SE → 12%", async () => {
    const res = await calculateTax(
      buildReq({
        lines: [
          {
            lineId: "ln_1",
            taxCategory: "ACCOMMODATION_HOTEL",
            taxableAmount: BigInt(100000),
            quantity: 1,
            taxable: true,
          },
        ],
      }),
    );
    expect(res.lines[0].taxLines[0].rate).toBe(0.12);
  });

  it("RETAIL_GENERAL in SE → 25%", async () => {
    const res = await calculateTax(
      buildReq({
        lines: [
          {
            lineId: "ln_1",
            taxCategory: "RETAIL_GENERAL",
            taxableAmount: BigInt(100000),
            quantity: 1,
            taxable: true,
          },
        ],
      }),
    );
    expect(res.lines[0].taxLines[0].rate).toBe(0.25);
  });

  it("FOOD_RESTAURANT in NO → 15%", async () => {
    const res = await calculateTax(
      buildReq({
        buyerLocation: { countryCode: "NO" },
        fulfillmentLocation: { countryCode: "NO" },
        shopCurrency: "NOK",
        presentmentCurrency: "NOK",
        lines: [
          {
            lineId: "ln_1",
            taxCategory: "FOOD_RESTAURANT",
            taxableAmount: BigInt(100000),
            quantity: 1,
            taxable: true,
          },
        ],
      }),
    );
    expect(res.lines[0].taxLines[0].rate).toBe(0.15);
  });

  it("TaxCategory enum has the lightweight 16-value subset (Decision 6)", () => {
    expect(TAX_CATEGORIES).toHaveLength(16);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decision 7 — Tax overrides scope-limited
// (Tax-6 will add TaxOverride model. Tax-1's surface allows the
// downstream override to slot in via taxCodeOverride on the line.)
// ─────────────────────────────────────────────────────────────────────

describe("Decision 7: tax overrides surface (scope-limited)", () => {
  it("TaxRequestLine accepts taxCodeOverride without throwing", async () => {
    // The override doesn't change Tax-1 behavior (Tax-6 wires it),
    // but the surface must accommodate it for forward compatibility.
    const res = await calculateTax(
      buildReq({
        lines: [
          {
            lineId: "ln_1",
            taxCategory: "RETAIL_GENERAL",
            taxableAmount: BigInt(10000),
            quantity: 1,
            taxable: true,
            taxCodeOverride: "P0000000",
          },
        ],
      }),
    );
    expect(res.source).toBe("builtin");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decision 8 — TaxExemption enum
// ─────────────────────────────────────────────────────────────────────

describe("Decision 8: TaxExemptionCode enum drives exemption logic", () => {
  it("EU_REVERSE_CHARGE_EXEMPTION_RULE is in the enum (LOCKED critical)", () => {
    expect(TAX_EXEMPTION_CODES).toContain(
      "EU_REVERSE_CHARGE_EXEMPTION_RULE",
    );
  });

  it("calculator honors EU reverse-charge exemption (intra-EU)", async () => {
    const res = await calculateTax(
      buildReq({
        buyerLocation: { countryCode: "DE" },
        fulfillmentLocation: { countryCode: "SE" },
        companyLocation: {
          id: "cl_1",
          collectMode: "COLLECT",
          taxExemptions: ["EU_REVERSE_CHARGE_EXEMPTION_RULE"],
          vatNumber: "DE123456789",
        },
      }),
    );
    expect(res.lines[0].taxLines).toEqual([]);
    expect(res.warnings).toContain("eu_reverse_charge_applied");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decision 9 — Provider abstraction
// ─────────────────────────────────────────────────────────────────────

describe("Decision 9: provider abstraction", () => {
  it("builtin auto-registered after module-load", () => {
    expect(getTaxProvider("builtin")?.key).toBe("builtin");
  });

  it("calculator dispatches via providerKey from TenantTaxConfig", async () => {
    let captured: string | null = null;
    const customProvider: TaxProvider = {
      key: "custom-stub",
      displayName: "Custom test provider",
      async calculate(req): Promise<TaxResponse> {
        captured = req.tenantId;
        return {
          lines: req.lines.map((l) => ({
            lineId: l.lineId,
            taxLines: [],
          })),
          shippingLines: [],
          source: "custom-stub",
          estimated: false,
          warnings: [],
        };
      },
    };
    registerTaxProvider(customProvider);
    tenantTaxConfigFindFirst.mockResolvedValue({
      providerKey: "custom-stub",
      credentials: null,
    });
    const res = await calculateTax(buildReq());
    expect(res.source).toBe("custom-stub");
    expect(captured).toBe("t_parity");
  });

  it("future provider can override via TenantTaxConfig regionScope", async () => {
    const avalaraStub: TaxProvider = {
      key: "avalara-stub",
      displayName: "Avalara stub",
      async calculate(req): Promise<TaxResponse> {
        return {
          lines: req.lines.map((l) => ({
            lineId: l.lineId,
            taxLines: [],
          })),
          shippingLines: [],
          source: "avalara-stub",
          estimated: false,
          warnings: [],
        };
      },
    };
    registerTaxProvider(avalaraStub);
    tenantTaxConfigFindFirst.mockImplementation(
      ({ where }: { where: { regionScope: string } }) => {
        if (where.regionScope === "US") {
          return Promise.resolve({
            providerKey: "avalara-stub",
            credentials: null,
          });
        }
        return Promise.resolve(null);
      },
    );
    const res = await calculateTax(
      buildReq({
        buyerLocation: { countryCode: "US" },
        fulfillmentLocation: { countryCode: "US" },
        shopCurrency: "USD",
        presentmentCurrency: "USD",
      }),
    );
    expect(res.source).toBe("avalara-stub");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decision 10 — Failure mode: always quote, never block
// ─────────────────────────────────────────────────────────────────────

describe("Decision 10: failure-mode never blocks", () => {
  it("provider throws → tier-3 fallback, calculator returns valid response", async () => {
    const failProvider: TaxProvider = {
      key: "boom",
      displayName: "Always throws",
      async calculate() {
        throw new Error("boom");
      },
    };
    registerTaxProvider(failProvider);
    tenantTaxConfigFindFirst.mockResolvedValue({
      providerKey: "boom",
      credentials: null,
    });
    const res = await calculateTax(buildReq());
    expect(res.source).toBe("fallback_zero");
    expect(res.warnings[0]).toMatch(/boom/);
  });

  it("unregistered providerKey → tier-3 fallback", async () => {
    tenantTaxConfigFindFirst.mockResolvedValue({
      providerKey: "ghost-provider",
      credentials: null,
    });
    const res = await calculateTax(buildReq());
    expect(res.source).toBe("fallback_zero");
    expect(res.warnings[0]).toMatch(/provider_not_registered:ghost-provider/);
  });

  it("calculator never throws — even with raw-string provider error", async () => {
    const stringThrower: TaxProvider = {
      key: "string-thrower",
      displayName: "Throws raw string",
      async calculate() {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "no Error wrapper";
      },
    };
    registerTaxProvider(stringThrower);
    tenantTaxConfigFindFirst.mockResolvedValue({
      providerKey: "string-thrower",
      credentials: null,
    });
    await expect(calculateTax(buildReq())).resolves.toMatchObject({
      source: "fallback_zero",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decision 11 — Storage net, display formula
// ─────────────────────────────────────────────────────────────────────

describe("Decision 11: storage is always net; inclusive math is caller's job", () => {
  it("calculator returns NET tax amounts; not tax-inclusive math", async () => {
    // Input taxableAmount is the net base. Output taxAmount is the
    // computed tax — not the gross. Caller (Tax-2 / Tax-3) decides
    // display semantics per Market.taxDisplayMode.
    const res = await calculateTax(
      buildReq({
        lines: [
          {
            lineId: "ln_1",
            taxCategory: "RETAIL_GENERAL",
            taxableAmount: BigInt(10000),
            quantity: 1,
            taxable: true,
          },
        ],
      }),
    );
    const tl = res.lines[0].taxLines[0];
    expect(tl.taxableAmount).toBe(BigInt(10000)); // net base preserved
    expect(tl.taxAmount).toBe(BigInt(2500)); // 25% tax — net + tax = gross
    // Gross would be 10000 + 2500 = 12500, but calculator emits the
    // pieces separately so the caller can apply inclusive vs. exclusive
    // display formula.
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decision 12 — Drafts use same calculator with estimated=true
// (Tax-2 wires this; Tax-1 verifies the surface allows it.)
// ─────────────────────────────────────────────────────────────────────

describe("Decision 12: drafts use the same calculator surface", () => {
  it("response carries estimated flag (Tax-2 will use this for drafts)", async () => {
    const res = await calculateTax(buildReq());
    // Builtin returns estimated=true by default — calculator orchestrator
    // passes it through. Tax-3 will override to false on order finalize.
    expect(typeof res.estimated).toBe("boolean");
  });

  it("same calculator entry-point handles draft-shaped requests", async () => {
    // A draft request is structurally identical to an order request —
    // calculator doesn't distinguish (Decision 1 + Decision 12).
    const res = await calculateTax(
      buildReq({
        lines: [
          {
            lineId: "draft_ln_1",
            taxCategory: "ACCOMMODATION_HOTEL",
            taxableAmount: BigInt(50000),
            quantity: 1,
            taxable: true,
          },
        ],
      }),
    );
    expect(res.lines[0].lineId).toBe("draft_ln_1");
    expect(res.source).toBe("builtin");
  });
});
