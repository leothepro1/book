import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PaymentAdapterContext } from "../types";

// Mock Stripe SDK
const mockPICreate = vi.fn();
const mockPIRetrieve = vi.fn();
const mockRefundCreate = vi.fn();
const mockConstructEvent = vi.fn();
const mockAccountRetrieve = vi.fn().mockResolvedValue({ charges_enabled: true });

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    paymentIntents: {
      create: (...args: unknown[]) => mockPICreate(...args),
      retrieve: (...args: unknown[]) => mockPIRetrieve(...args),
    },
    refunds: { create: (...args: unknown[]) => mockRefundCreate(...args) },
    webhooks: { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) },
    accounts: { retrieve: (...args: unknown[]) => mockAccountRetrieve(...args) },
  })),
}));

// Mock prisma
const mockSessionFindUnique = vi.fn();
const mockSessionFindFirst = vi.fn();
const mockSessionUpsert = vi.fn();
const mockSessionUpdate = vi.fn();
const mockTenantFindUnique = vi.fn();
const mockTenantFindUniqueOrThrow = vi.fn();
const mockTenantFindFirst = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    paymentSession: {
      findUnique: (...args: unknown[]) => mockSessionFindUnique(...args),
      findFirst: (...args: unknown[]) => mockSessionFindFirst(...args),
      upsert: (...args: unknown[]) => mockSessionUpsert(...args),
      update: (...args: unknown[]) => mockSessionUpdate(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => mockTenantFindUnique(...args),
      findUniqueOrThrow: (...args: unknown[]) => mockTenantFindUniqueOrThrow(...args),
      findFirst: (...args: unknown[]) => mockTenantFindFirst(...args),
    },
  },
}));

vi.mock("@/app/_lib/env", () => ({
  env: { STRIPE_SECRET_KEY: "sk_test_xxx", STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_CONNECT_WEBHOOK_SECRET: null },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/payments/platform-fee", () => ({
  getPlatformFeeBps: () => 500,
  calculateApplicationFee: (amount: number, bps: number) => Math.floor((amount * bps) / 10000),
}));

vi.mock("@/app/_lib/stripe/client", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: (...args: unknown[]) => mockPICreate(...args),
      retrieve: (...args: unknown[]) => mockPIRetrieve(...args),
    },
    refunds: { create: (...args: unknown[]) => mockRefundCreate(...args) },
    webhooks: { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) },
    accounts: { retrieve: (...args: unknown[]) => mockAccountRetrieve(...args) },
  }),
}));

vi.mock("@/app/_lib/stripe/verify-account", () => ({
  verifyChargesEnabled: vi.fn().mockResolvedValue(true),
}));

const { BedfrontPaymentsAdapter } = await import("../adapters/bedfront-payments");
const adapter = new BedfrontPaymentsAdapter();

const ctx: PaymentAdapterContext = { tenantId: "tenant_1", credentials: {} };

// Minimal mock PrismaClient for parseWebhook
const mockPrisma = {
  tenant: {
    findFirst: (...args: unknown[]) => mockTenantFindFirst(...args),
  },
  paymentSession: {
    findFirst: (...args: unknown[]) => mockSessionFindFirst(...args),
  },
} as never;

describe("BedfrontPaymentsAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantFindUniqueOrThrow.mockResolvedValue({
      stripeAccountId: "acct_test",
      stripeOnboardingComplete: true,
      subscriptionPlan: "BASIC",
      platformFeeBps: null,
    });
    mockTenantFindUnique.mockResolvedValue({ stripeAccountId: "acct_test" });
    mockTenantFindFirst.mockResolvedValue({ id: "tenant_1" });
    mockSessionFindUnique.mockResolvedValue(null);
    mockSessionFindFirst.mockResolvedValue(null);
    mockSessionUpsert.mockResolvedValue({});
  });

  const baseRequest = {
    sessionId: "order_1",
    tenantId: "tenant_1",
    amount: 50000,
    currency: "SEK",
    guestEmail: "test@example.se",
    guestName: "Test",
    locale: "sv-SE",
    returnUrl: "http://localhost/success",
    metadata: { orderId: "order_1", tenantId: "tenant_1" },
  };

  describe("initiatePayment", () => {
    it("creates PaymentIntent with correct amount and metadata.sessionId", async () => {
      mockPICreate.mockResolvedValue({
        id: "pi_test_1",
        client_secret: "pi_test_1_secret",
      });

      await adapter.initiatePayment(baseRequest, ctx);

      expect(mockPICreate).toHaveBeenCalledTimes(1);
      const [createArgs] = mockPICreate.mock.calls[0];
      expect(createArgs.amount).toBe(50000);
      expect(createArgs.metadata.sessionId).toBe("order_1");
    });

    it("is idempotent — retrieves existing PI if session exists", async () => {
      mockSessionUpsert.mockResolvedValue({
        externalSessionId: "pi_existing",
        orderId: "order_1",
      });
      mockPIRetrieve.mockResolvedValue({
        id: "pi_existing",
        status: "requires_payment_method",
        client_secret: "pi_existing_secret",
      });

      const result = await adapter.initiatePayment(baseRequest, ctx);

      expect(mockPICreate).not.toHaveBeenCalled();
      expect(mockPIRetrieve).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        mode: "embedded",
        clientSecret: "pi_existing_secret",
        providerSessionId: "pi_existing",
      });
    });
  });

  describe("parseWebhook", () => {
    it("returns null for invalid signature", async () => {
      mockConstructEvent.mockImplementation(() => { throw new Error("bad sig"); });

      const result = await adapter.parseWebhook("body", { "stripe-signature": "bad" }, mockPrisma);
      expect(result).toBeNull();
    });

    it("returns null for unhandled event type", async () => {
      mockConstructEvent.mockReturnValue({
        id: "evt_1",
        type: "customer.created",
        data: { object: {} },
      });

      const result = await adapter.parseWebhook("body", { "stripe-signature": "valid" }, mockPrisma);
      expect(result).toBeNull();
    });

    it("returns null when no orderId resolvable", async () => {
      mockConstructEvent.mockReturnValue({
        id: "evt_2",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_unknown", metadata: {} } },
      });
      mockSessionFindFirst.mockResolvedValue(null);

      const result = await adapter.parseWebhook("body", { "stripe-signature": "valid" }, mockPrisma);
      expect(result).toBeNull();
    });

    it("returns PaymentWebhookEvent for payment_intent.succeeded with metadata", async () => {
      mockConstructEvent.mockReturnValue({
        id: "evt_3",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_xxx", metadata: { sessionId: "order_99" } } },
      });

      const result = await adapter.parseWebhook("body", { "stripe-signature": "valid" }, mockPrisma);
      expect(result).toEqual({
        providerKey: "bedfront_payments",
        externalEventId: "evt_3",
        orderId: "order_99",
        rawPayload: expect.objectContaining({ id: "evt_3" }),
      });
    });

    it("resolves orderId via DB when metadata is empty", async () => {
      mockConstructEvent.mockReturnValue({
        id: "evt_4",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_no_meta", metadata: {} } },
      });
      mockSessionFindFirst.mockResolvedValue({ orderId: "order_from_db" });

      const result = await adapter.parseWebhook("body", { "stripe-signature": "valid" }, mockPrisma);
      expect(result?.orderId).toBe("order_from_db");
    });
  });

  describe("resolveOutcome", () => {
    it("maps payment_intent.succeeded → resolved", async () => {
      const event = {
        providerKey: "bedfront_payments",
        externalEventId: "evt_1",
        orderId: "o1",
        rawPayload: { id: "evt_1", type: "payment_intent.succeeded", data: { object: {} } },
      };
      const result = await adapter.resolveOutcome(event);
      expect(result).toEqual({ status: "resolved" });
    });

    it("maps payment_intent.payment_failed → rejected", async () => {
      const event = {
        providerKey: "bedfront_payments",
        externalEventId: "evt_2",
        orderId: "o1",
        rawPayload: {
          id: "evt_2",
          type: "payment_intent.payment_failed",
          data: {
            object: {
              last_payment_error: { decline_code: "insufficient_funds" },
            },
          },
        },
      };
      const result = await adapter.resolveOutcome(event);
      expect(result).toEqual({ status: "rejected", reason: "INSUFFICIENT_FUNDS" });
    });
  });

  describe("refund", () => {
    it("calls stripe.refunds.create with correct params", async () => {
      mockSessionFindUnique.mockResolvedValue({
        externalSessionId: "pi_refund_test",
        tenantId: "tenant_1",
      });
      mockPIRetrieve.mockResolvedValue({
        latest_charge: "ch_123",
      });
      mockRefundCreate.mockResolvedValue({ id: "re_456" });

      const result = await adapter.refund({
        sessionId: "order_refund",
        amount: 10000,
        reason: "customer request",
        ctx,
      });

      expect(mockRefundCreate).toHaveBeenCalledTimes(1);
      const [refundArgs] = mockRefundCreate.mock.calls[0];
      expect(refundArgs.charge).toBe("ch_123");
      expect(refundArgs.amount).toBe(10000);
      expect(result).toEqual({ success: true, providerRefundId: "re_456" });
    });
  });
});
