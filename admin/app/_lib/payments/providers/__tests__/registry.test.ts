import { describe, it, expect, beforeEach } from "vitest";

// Fresh registry per test — re-import module to reset Map
let registerPaymentAdapter: typeof import("../registry").registerPaymentAdapter;
let getPaymentAdapter: typeof import("../registry").getPaymentAdapter;
let listPaymentAdapters: typeof import("../registry").listPaymentAdapters;

beforeEach(async () => {
  // vitest module cache reset
  const mod = await import("../registry");
  // We can't truly reset module state without vi.resetModules, so use inline Map
  // Instead, test with a fresh adapter each time using unique keys
  registerPaymentAdapter = mod.registerPaymentAdapter;
  getPaymentAdapter = mod.getPaymentAdapter;
  listPaymentAdapters = mod.listPaymentAdapters;
});

function makeFakeAdapter(key: string) {
  return {
    providerKey: key,
    displayName: `Test ${key}`,
    initiatePayment: async () => ({ mode: "embedded" as const, clientSecret: "test" }),
    parseWebhook: async () => null,
    resolveOutcome: async () => ({ status: "resolved" as const }),
    refund: async () => ({ success: true, providerRefundId: "r1" }),
  };
}

describe("Payment Provider Registry", () => {
  it("registers and retrieves an adapter", () => {
    const key = `test_${Date.now()}_1`;
    const adapter = makeFakeAdapter(key);
    registerPaymentAdapter(adapter);
    expect(getPaymentAdapter(key)).toBe(adapter);
  });

  it("throws on unknown providerKey", () => {
    expect(() => getPaymentAdapter("nonexistent_provider_xyz")).toThrow(
      "No payment adapter registered for provider: nonexistent_provider_xyz",
    );
  });

  it("throws on duplicate providerKey", () => {
    const key = `test_${Date.now()}_3`;
    const adapter = makeFakeAdapter(key);
    registerPaymentAdapter(adapter);
    expect(() => registerPaymentAdapter(adapter)).toThrow(
      `Payment adapter already registered: ${key}`,
    );
  });

  it("listPaymentAdapters returns all registered adapters", () => {
    const key = `test_list_${Date.now()}`;
    registerPaymentAdapter(makeFakeAdapter(key));
    const list = listPaymentAdapters();
    expect(list.some((a) => a.providerKey === key)).toBe(true);
  });
});
