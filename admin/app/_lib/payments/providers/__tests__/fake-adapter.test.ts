import { describe, it, expect } from "vitest";
import { FakePaymentAdapter } from "../adapters/fake-payments";
import type { PaymentSessionRequest, PaymentAdapterContext } from "../types";

const adapter = new FakePaymentAdapter();
const ctx: PaymentAdapterContext = { tenantId: "tenant_1", credentials: {} };

// Minimal mock PrismaClient for parseWebhook
const mockPrisma = {
  paymentSession: { findFirst: async () => null },
} as never;

const baseRequest: PaymentSessionRequest = {
  sessionId: "order_123",
  tenantId: "tenant_1",
  amount: 50000,
  currency: "SEK",
  guestEmail: "test@example.se",
  guestName: "Test User",
  locale: "sv-SE",
  returnUrl: "http://localhost:3000/success",
  metadata: { orderId: "order_123" },
};

describe("FakePaymentAdapter", () => {
  describe("initiatePayment", () => {
    it("returns embedded mode with fake clientSecret", async () => {
      const result = await adapter.initiatePayment(baseRequest, ctx);
      expect(result).toEqual({
        mode: "embedded",
        clientSecret: "fake_secret_order_123",
      });
    });

    it("is idempotent — same sessionId returns same clientSecret", async () => {
      const r1 = await adapter.initiatePayment(baseRequest, ctx);
      const r2 = await adapter.initiatePayment(baseRequest, ctx);
      expect(r1).toEqual(r2);
    });
  });

  describe("parseWebhook", () => {
    it("returns null for invalid JSON", async () => {
      const result = await adapter.parseWebhook("not json", {}, mockPrisma);
      expect(result).toBeNull();
    });

    it("returns null for missing fields", async () => {
      const result = await adapter.parseWebhook(JSON.stringify({ eventId: "e1" }), {}, mockPrisma);
      expect(result).toBeNull();
    });

    it("returns PaymentWebhookEvent for valid payload", async () => {
      const body = JSON.stringify({
        eventId: "evt_1",
        sessionId: "order_123",
        outcome: "resolved",
      });
      const result = await adapter.parseWebhook(body, {}, mockPrisma);
      expect(result).toEqual({
        providerKey: "fake_payments",
        externalEventId: "evt_1",
        orderId: "order_123",
        rawPayload: { eventId: "evt_1", sessionId: "order_123", outcome: "resolved" },
      });
    });
  });

  describe("resolveOutcome", () => {
    it('maps "resolved" → { status: "resolved" }', async () => {
      const event = {
        providerKey: "fake_payments",
        externalEventId: "e1",
        orderId: "o1",
        rawPayload: { outcome: "resolved" },
      };
      expect(await adapter.resolveOutcome(event)).toEqual({ status: "resolved" });
    });

    it('maps "rejected" → { status: "rejected", reason: "PROVIDER_ERROR" }', async () => {
      const event = {
        providerKey: "fake_payments",
        externalEventId: "e2",
        orderId: "o1",
        rawPayload: { outcome: "rejected" },
      };
      expect(await adapter.resolveOutcome(event)).toEqual({
        status: "rejected",
        reason: "PROVIDER_ERROR",
      });
    });

    it('maps "pending" → { status: "pending", expiresAt: Date }', async () => {
      const event = {
        providerKey: "fake_payments",
        externalEventId: "e3",
        orderId: "o1",
        rawPayload: { outcome: "pending" },
      };
      const result = await adapter.resolveOutcome(event);
      expect(result.status).toBe("pending");
      if (result.status === "pending") {
        expect(result.expiresAt).toBeInstanceOf(Date);
        expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      }
    });
  });

  describe("checkPaymentStatus", () => {
    it("always returns resolved", async () => {
      const result = await adapter.checkPaymentStatus!("ext_123", ctx);
      expect(result).toEqual({
        orderId: "ext_123",
        outcome: { status: "resolved" },
      });
    });
  });

  describe("handleReturn", () => {
    it("returns resolved for outcome=success", async () => {
      const result = await adapter.handleReturn!({ outcome: "success" }, ctx);
      expect(result).toEqual({ status: "resolved" });
    });

    it("returns rejected for other outcomes", async () => {
      const result = await adapter.handleReturn!({ outcome: "cancel" }, ctx);
      expect(result).toEqual({ status: "rejected", reason: "PROVIDER_ERROR" });
    });
  });

  describe("refund", () => {
    it("returns success with fake refund ID", async () => {
      const result = await adapter.refund({
        sessionId: "order_123",
        amount: 10000,
        reason: "test",
        ctx,
      });
      expect(result.success).toBe(true);
      expect(result.providerRefundId).toMatch(/^fake_refund_/);
    });
  });
});
