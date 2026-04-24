import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenantPaymentConfig: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    paymentSession: { upsert: (...args: unknown[]) => mockUpsert(...args) },
  },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/integrations/crypto", () => ({
  encryptCredentials: vi.fn().mockReturnValue({ encrypted: Buffer.from("enc"), iv: Buffer.from("iv") }),
  decryptCredentials: vi.fn().mockReturnValue({}),
}));

// Register FakePaymentAdapter
import { registerPaymentAdapter } from "../registry";
import { FakePaymentAdapter } from "../adapters/fake-payments";
try { registerPaymentAdapter(new FakePaymentAdapter()); } catch { /* already registered */ }

const { initiateOrderPayment } = await import("../initiate");

describe("initiateOrderPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no TenantPaymentConfig → falls back to bedfront_payments
    // But bedfront_payments needs Stripe → use fake_payments via config mock
    mockFindUnique.mockResolvedValue({ providerKey: "fake_payments" });
    mockUpsert.mockResolvedValue({});
  });

  const baseParams = {
    order: { id: "order_1", tenantId: "tenant_1", totalAmount: 50000, currency: "SEK" },
    guest: { email: "test@example.se", name: "Test" },
    locale: "sv-SE",
    returnUrl: "http://localhost:3000/success",
  };

  it("calls adapter.initiatePayment with correct params", async () => {
    const result = await initiateOrderPayment(baseParams);
    expect(result.mode).toBe("embedded");
    if (result.mode === "embedded") {
      expect(result.clientSecret).toBe("fake_secret_order_1");
    }
  });

  it("returns embedded mode with clientSecret", async () => {
    const result = await initiateOrderPayment(baseParams);
    expect(result).toEqual({
      mode: "embedded",
      clientSecret: "fake_secret_order_1",
      providerSessionId: "fake_pi_order_1",
    });
  });

  it("is idempotent — same sessionId returns same clientSecret", async () => {
    const r1 = await initiateOrderPayment(baseParams);
    const r2 = await initiateOrderPayment(baseParams);
    expect(r1).toEqual(r2);
  });

  it("uses tenant's configured provider from TenantPaymentConfig", async () => {
    // Config returns fake_payments — adapter used should be FakePaymentAdapter
    mockFindUnique.mockResolvedValue({ providerKey: "fake_payments" });

    const result = await initiateOrderPayment(baseParams);
    // FakePaymentAdapter returns "fake_secret_" prefix
    expect(result.mode).toBe("embedded");
    if (result.mode === "embedded") {
      expect(result.clientSecret).toMatch(/^fake_secret_/);
    }
  });
});
