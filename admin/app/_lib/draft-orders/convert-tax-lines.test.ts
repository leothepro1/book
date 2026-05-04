import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { reparentTaxLinesDraftToOrder } from "./convert-tax-lines";

const taxLineUpdateMany = vi.fn();

const mockTx = {
  taxLine: {
    updateMany: (...a: unknown[]) => taxLineUpdateMany(...a),
  },
};

beforeEach(() => {
  taxLineUpdateMany.mockReset().mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("reparentTaxLinesDraftToOrder", () => {
  it("happy path: 2 lines × 1 TaxLine each → reparent both", async () => {
    taxLineUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const result = await reparentTaxLinesDraftToOrder(mockTx as never, {
      tenantId: "t_1",
      pairs: [
        { draftLineItemId: "dli_1", orderLineItemId: "oli_1" },
        { draftLineItemId: "dli_2", orderLineItemId: "oli_2" },
      ],
    });
    expect(taxLineUpdateMany).toHaveBeenCalledTimes(2);
    expect(result.reparented).toBe(2);
  });

  it("UPDATE in place — preserves audit history (Q7 LOCKED)", async () => {
    taxLineUpdateMany.mockResolvedValueOnce({ count: 1 });
    await reparentTaxLinesDraftToOrder(mockTx as never, {
      tenantId: "t_1",
      pairs: [{ draftLineItemId: "dli_1", orderLineItemId: "oli_1" }],
    });
    const call = taxLineUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      tenantId: "t_1",
      draftLineItemId: "dli_1",
    });
    expect(call.data).toEqual({
      orderLineItemId: "oli_1",
      draftLineItemId: null,
    });
    // Note: data does NOT touch createdAt, source, channelLiable, etc.
  });

  it("pre-Tax-2 frozen draft (0 TaxLines) → no-op, no error (Q8)", async () => {
    taxLineUpdateMany.mockResolvedValueOnce({ count: 0 });
    const result = await reparentTaxLinesDraftToOrder(mockTx as never, {
      tenantId: "t_1",
      pairs: [{ draftLineItemId: "dli_legacy", orderLineItemId: "oli_1" }],
    });
    expect(result.reparented).toBe(0);
    expect(taxLineUpdateMany).toHaveBeenCalledTimes(1); // updateMany ran, just affected 0 rows
  });

  it("multi-jurisdiction (multiple TaxLines per draft line) all reparent", async () => {
    // Future US case: 1 draftLineItem → 3 TaxLines (state + county + city).
    // updateMany.count reflects the multi-row update.
    taxLineUpdateMany.mockResolvedValueOnce({ count: 3 });
    const result = await reparentTaxLinesDraftToOrder(mockTx as never, {
      tenantId: "t_1",
      pairs: [
        { draftLineItemId: "dli_us", orderLineItemId: "oli_us" },
      ],
    });
    expect(result.reparented).toBe(3);
  });

  it("cross-tenant guard: reparent is scoped by tenantId in WHERE", async () => {
    await reparentTaxLinesDraftToOrder(mockTx as never, {
      tenantId: "t_target",
      pairs: [{ draftLineItemId: "dli_1", orderLineItemId: "oli_1" }],
    });
    expect(taxLineUpdateMany.mock.calls[0][0].where.tenantId).toBe(
      "t_target",
    );
  });

  it("empty pairs array → no DB ops, returns 0", async () => {
    const result = await reparentTaxLinesDraftToOrder(mockTx as never, {
      tenantId: "t_1",
      pairs: [],
    });
    expect(taxLineUpdateMany).not.toHaveBeenCalled();
    expect(result.reparented).toBe(0);
  });

  it("ordering preserved — pairs processed in array order", async () => {
    await reparentTaxLinesDraftToOrder(mockTx as never, {
      tenantId: "t_1",
      pairs: [
        { draftLineItemId: "dli_alpha", orderLineItemId: "oli_alpha" },
        { draftLineItemId: "dli_beta", orderLineItemId: "oli_beta" },
        { draftLineItemId: "dli_gamma", orderLineItemId: "oli_gamma" },
      ],
    });
    expect(taxLineUpdateMany.mock.calls[0][0].where.draftLineItemId).toBe(
      "dli_alpha",
    );
    expect(taxLineUpdateMany.mock.calls[1][0].where.draftLineItemId).toBe(
      "dli_beta",
    );
    expect(taxLineUpdateMany.mock.calls[2][0].where.draftLineItemId).toBe(
      "dli_gamma",
    );
  });

  it("Tax-2 invariant: orderLineItemId XOR draftLineItemId — sets one, nulls the other", async () => {
    await reparentTaxLinesDraftToOrder(mockTx as never, {
      tenantId: "t_1",
      pairs: [{ draftLineItemId: "dli_1", orderLineItemId: "oli_1" }],
    });
    const data = taxLineUpdateMany.mock.calls[0][0].data;
    expect(data.orderLineItemId).toBe("oli_1");
    expect(data.draftLineItemId).toBeNull();
  });
});
