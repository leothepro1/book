import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { persistTaxLinesForDraft } from "./freeze-tax-lines";
import type { DraftTotalsLineBreakdown } from "./calculator/types";
import type { ComputedTaxLine } from "@/app/_lib/tax/types";

const taxLineDeleteMany = vi.fn();
const taxLineCreateMany = vi.fn();

const mockTx = {
  taxLine: {
    deleteMany: (...a: unknown[]) => taxLineDeleteMany(...a),
    createMany: (...a: unknown[]) => taxLineCreateMany(...a),
  },
};

beforeEach(() => {
  taxLineDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  taxLineCreateMany.mockReset().mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

const makeTaxLine = (
  overrides: Partial<ComputedTaxLine> = {},
): ComputedTaxLine => ({
  title: "Moms 12% (hotell)",
  jurisdiction: "SE",
  rate: 0.12,
  taxableAmount: BigInt(50000),
  taxAmount: BigInt(6000),
  presentmentTaxAmount: BigInt(6000),
  source: "builtin",
  channelLiable: true,
  ...overrides,
});

const makeBreakdown = (
  lineId: string,
  taxLines: ComputedTaxLine[],
  taxCents = BigInt(0),
): DraftTotalsLineBreakdown => ({
  lineId,
  subtotalCents: BigInt(50000),
  manualLineDiscountCents: BigInt(0),
  allocatedOrderDiscountCents: BigInt(0),
  totalLineDiscountCents: BigInt(0),
  taxableBaseCents: BigInt(50000),
  taxCents,
  taxLines,
  totalCents: BigInt(50000 + Number(taxCents)),
});

describe("persistTaxLinesForDraft", () => {
  it("happy path: 1 ACC line + SE → 1 TaxLine row created", async () => {
    const breakdown = makeBreakdown(
      "dli_1",
      [makeTaxLine()],
      BigInt(6000),
    );
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [breakdown],
      presentmentCurrency: "SEK",
    });
    expect(taxLineDeleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t_1",
        draftLineItemId: { in: ["dli_1"] },
      },
    });
    expect(taxLineCreateMany).toHaveBeenCalledTimes(1);
    const rows = taxLineCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: "t_1",
      draftLineItemId: "dli_1",
      orderLineItemId: null,
      jurisdiction: "SE",
      rate: "0.12",
      taxAmountCents: BigInt(6000),
      source: "builtin",
      channelLiable: true,
    });
  });

  it("long-stay → 1 TaxLine with rate=0 + audit-trail title (Q5)", async () => {
    const longStay = makeTaxLine({
      title: "Momsbefriad (>30 dagar)",
      rate: 0,
      taxAmount: BigInt(0),
      presentmentTaxAmount: BigInt(0),
    });
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [makeBreakdown("dli_1", [longStay])],
      presentmentCurrency: "SEK",
    });
    const rows = taxLineCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0].rate).toBe("0");
    expect(rows[0].title).toMatch(/Momsbefriad/);
  });

  it("tier-3 fallback / non-taxable → empty taxLines, no createMany", async () => {
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [makeBreakdown("dli_1", [])],
      presentmentCurrency: "SEK",
    });
    // deleteMany still runs (defensive cleanup), createMany skipped.
    expect(taxLineDeleteMany).toHaveBeenCalledTimes(1);
    expect(taxLineCreateMany).not.toHaveBeenCalled();
  });

  it("re-freeze edge — deleteMany cleans prior rows BEFORE createMany", async () => {
    // Two different freezes, second one would overwrite. We just
    // verify the operation order in a single call.
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [makeBreakdown("dli_1", [makeTaxLine()])],
      presentmentCurrency: "SEK",
    });
    const deleteOrder = taxLineDeleteMany.mock.invocationCallOrder[0];
    const createOrder = taxLineCreateMany.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(createOrder);
  });

  it("multi-line: 2 ACC + 1 PRODUCT + 1 CUSTOM → 4 TaxLine rows", async () => {
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [
        makeBreakdown("dli_1", [
          makeTaxLine({ jurisdiction: "SE", rate: 0.12 }),
        ]),
        makeBreakdown("dli_2", [
          makeTaxLine({ jurisdiction: "SE", rate: 0.12 }),
        ]),
        makeBreakdown("dli_3", [
          makeTaxLine({ jurisdiction: "SE", rate: 0.25 }),
        ]),
        makeBreakdown("dli_4", [
          makeTaxLine({ jurisdiction: "SE", rate: 0.25 }),
        ]),
      ],
      presentmentCurrency: "SEK",
    });
    const rows = taxLineCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(4);
    expect(rows.map((r: { draftLineItemId: string }) => r.draftLineItemId)).toEqual([
      "dli_1",
      "dli_2",
      "dli_3",
      "dli_4",
    ]);
  });

  it("presentmentCurrency propagated to every row (Q4 LOCKED)", async () => {
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [makeBreakdown("dli_1", [makeTaxLine()])],
      presentmentCurrency: "NOK",
    });
    const rows = taxLineCreateMany.mock.calls[0][0].data;
    expect(rows[0].presentmentCurrency).toBe("NOK");
  });

  it("presentmentTaxAmount = taxAmount in Tax-2 V1 (Q4 LOCKED)", async () => {
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [makeBreakdown("dli_1", [makeTaxLine()])],
      presentmentCurrency: "SEK",
    });
    const row = taxLineCreateMany.mock.calls[0][0].data[0];
    expect(row.presentmentTaxAmountCents).toBe(row.taxAmountCents);
  });

  it("DraftLineItem.taxAmountCents = sum of related TaxLine.taxAmountCents (parity)", async () => {
    // Single jurisdiction in V1 — sum is trivial. Reinforces the
    // invariant that downstream queries can rely on.
    const breakdown = makeBreakdown(
      "dli_1",
      [makeTaxLine({ taxAmount: BigInt(6000) })],
      BigInt(6000),
    );
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [breakdown],
      presentmentCurrency: "SEK",
    });
    const sum = taxLineCreateMany.mock.calls[0][0].data.reduce(
      (acc: bigint, r: { taxAmountCents: bigint }) => acc + r.taxAmountCents,
      BigInt(0),
    );
    expect(sum).toBe(breakdown.taxCents);
  });

  it("empty perLine array → no DB ops (early exit)", async () => {
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [],
      presentmentCurrency: "SEK",
    });
    expect(taxLineDeleteMany).not.toHaveBeenCalled();
    expect(taxLineCreateMany).not.toHaveBeenCalled();
  });

  it("rate is stringified for Prisma Decimal column", async () => {
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [makeBreakdown("dli_1", [makeTaxLine({ rate: 0.255 })])],
      presentmentCurrency: "EUR",
    });
    const row = taxLineCreateMany.mock.calls[0][0].data[0];
    expect(typeof row.rate).toBe("string");
    expect(row.rate).toBe("0.255");
  });

  it("source + channelLiable carried verbatim from ComputedTaxLine", async () => {
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [
        makeBreakdown("dli_1", [
          makeTaxLine({ source: "avalara", channelLiable: false }),
        ]),
      ],
      presentmentCurrency: "USD",
    });
    const row = taxLineCreateMany.mock.calls[0][0].data[0];
    expect(row.source).toBe("avalara");
    expect(row.channelLiable).toBe(false);
  });

  it("multi-jurisdiction (future) — multiple TaxLines per single line", async () => {
    // Forward-compat test: when a US line carries (state + county +
    // city), all rows are created and the parent draftLineItemId is
    // shared.
    await persistTaxLinesForDraft(mockTx as never, {
      tenantId: "t_1",
      perLine: [
        makeBreakdown("dli_us", [
          makeTaxLine({ jurisdiction: "US-NY", rate: 0.04 }),
          makeTaxLine({ jurisdiction: "US-NY-NEW_YORK_COUNTY", rate: 0.045 }),
          makeTaxLine({ jurisdiction: "US-NY-NEW_YORK_CITY", rate: 0.045 }),
        ]),
      ],
      presentmentCurrency: "USD",
    });
    const rows = taxLineCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    expect(rows.every((r: { draftLineItemId: string }) => r.draftLineItemId === "dli_us")).toBe(true);
  });
});
