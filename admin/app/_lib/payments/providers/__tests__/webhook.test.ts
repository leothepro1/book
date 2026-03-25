import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
const mockWebhookEventCreate = vi.fn();
const mockOrderFindUnique = vi.fn();
const mockOrderUpdate = vi.fn();
const mockOrderEventCreate = vi.fn();
const mockPaymentSessionUpdateMany = vi.fn();
const mockInventoryReservationFindMany = vi.fn();
const mockInventoryReservationUpdateMany = vi.fn();
const mockInventoryChangeCreate = vi.fn();

// Transaction mock that executes the callback with a tx proxy
const mock$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    order: { update: (...args: unknown[]) => mockOrderUpdate(...args) },
    orderEvent: { create: (...args: unknown[]) => mockOrderEventCreate(...args) },
    paymentSession: { updateMany: (...args: unknown[]) => mockPaymentSessionUpdateMany(...args) },
    inventoryReservation: {
      findMany: (...args: unknown[]) => mockInventoryReservationFindMany(...args),
      updateMany: (...args: unknown[]) => mockInventoryReservationUpdateMany(...args),
    },
    inventoryChange: { create: (...args: unknown[]) => mockInventoryChangeCreate(...args) },
    product: { findUnique: vi.fn().mockResolvedValue({ inventoryQuantity: 10 }) },
    productVariant: { findUnique: vi.fn().mockResolvedValue({ inventoryQuantity: 10 }) },
  };
  return fn(tx);
});

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    stripeWebhookEvent: { create: (...args: unknown[]) => mockWebhookEventCreate(...args) },
    order: {
      findUnique: (...args: unknown[]) => mockOrderFindUnique(...args),
      update: (...args: unknown[]) => mockOrderUpdate(...args),
    },
    paymentSession: {
      updateMany: (...args: unknown[]) => mockPaymentSessionUpdateMany(...args),
    },
    orderEvent: {
      create: (...args: unknown[]) => mockOrderEventCreate(...args),
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ name: "Test Tenant" }),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mock$transaction(fn),
  },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

vi.mock("@/app/_lib/orders/types", () => ({
  canTransition: (from: string, to: string) => {
    const valid: Record<string, string[]> = {
      PENDING: ["PAID", "CANCELLED"],
      PAID: ["FULFILLED", "CANCELLED", "REFUNDED"],
      FULFILLED: ["REFUNDED"],
      CANCELLED: [],
      REFUNDED: [],
    };
    return valid[from]?.includes(to) ?? false;
  },
}));

vi.mock("@/app/_lib/products/inventory", () => ({
  adjustInventoryInTx: vi.fn(),
}));

// Import FakePaymentAdapter and register it
import { registerPaymentAdapter } from "../registry";
import { FakePaymentAdapter } from "../adapters/fake-payments";

try { registerPaymentAdapter(new FakePaymentAdapter()); } catch { /* already registered */ }

const { handlePaymentWebhook } = await import("../webhook");

describe("handlePaymentWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebhookEventCreate.mockResolvedValue({});
    mockOrderUpdate.mockResolvedValue({});
    mockOrderEventCreate.mockResolvedValue({});
    mockPaymentSessionUpdateMany.mockResolvedValue({ count: 1 });
    mockInventoryReservationFindMany.mockResolvedValue([]);
  });

  it("returns { handled: false } for unparseable webhook", async () => {
    const result = await handlePaymentWebhook("fake_payments", "not json", {});
    expect(result.handled).toBe(false);
  });

  it("returns { handled: false } for missing required fields", async () => {
    const result = await handlePaymentWebhook(
      "fake_payments",
      JSON.stringify({ eventId: "e1" }),
      {},
    );
    expect(result.handled).toBe(false);
  });

  it("transitions Order PENDING → PAID on resolved outcome", async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: "order_1",
      status: "PENDING",
      orderType: "ACCOMMODATION",
      totalAmount: 50000,
      tenantId: "t1",
      guestEmail: "test@example.com",
      guestName: "Test",
      guestPhone: null,
      orderNumber: 1001,
      currency: "SEK",
      metadata: null,
      lineItems: [],
      paymentSession: { id: "ps_1" },
    });

    const payload = JSON.stringify({
      eventId: "evt_1",
      sessionId: "order_1",
      outcome: "resolved",
    });

    const result = await handlePaymentWebhook("fake_payments", payload, {});
    expect(result.handled).toBe(true);
    expect(result.outcome?.status).toBe("resolved");
    expect(mock$transaction).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — second call with same eventId is skipped", async () => {
    mockWebhookEventCreate.mockResolvedValueOnce({});
    mockOrderFindUnique.mockResolvedValue({
      id: "order_2",
      status: "PENDING",
      orderType: "ACCOMMODATION",
      totalAmount: 50000,
      tenantId: "t1",
      guestEmail: "test@example.com",
      guestName: "Test",
      guestPhone: null,
      orderNumber: 1002,
      currency: "SEK",
      metadata: null,
      lineItems: [],
      paymentSession: null,
    });

    const payload = JSON.stringify({
      eventId: "evt_dup",
      sessionId: "order_2",
      outcome: "resolved",
    });

    await handlePaymentWebhook("fake_payments", payload, {});

    const uniqueError = new Error("Unique constraint");
    (uniqueError as any).code = "P2002";
    mockWebhookEventCreate.mockRejectedValueOnce(uniqueError);

    const result2 = await handlePaymentWebhook("fake_payments", payload, {});
    expect(result2.handled).toBe(true);
    expect(mock$transaction).toHaveBeenCalledTimes(1);
  });

  it("does NOT cancel Order on rejected outcome", async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: "order_3",
      status: "PENDING",
      totalAmount: 50000,
      tenantId: "t1",
      lineItems: [],
      paymentSession: { id: "ps_3" },
    });

    const payload = JSON.stringify({
      eventId: "evt_3",
      sessionId: "order_3",
      outcome: "rejected",
    });

    const result = await handlePaymentWebhook("fake_payments", payload, {});
    expect(result.handled).toBe(true);
    expect(result.outcome?.status).toBe("rejected");

    expect(mock$transaction).toHaveBeenCalledTimes(1);
    expect(mockOrderUpdate).not.toHaveBeenCalled();
  });

  it("skips transition if Order is already PAID", async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: "order_4",
      status: "PAID",
      totalAmount: 50000,
      tenantId: "t1",
      lineItems: [],
      paymentSession: null,
    });

    const payload = JSON.stringify({
      eventId: "evt_4",
      sessionId: "order_4",
      outcome: "resolved",
    });

    const result = await handlePaymentWebhook("fake_payments", payload, {});
    expect(result.handled).toBe(true);
    expect(mock$transaction).not.toHaveBeenCalled();
  });

  it("returns { handled: false } when order not found", async () => {
    mockOrderFindUnique.mockResolvedValue(null);

    const payload = JSON.stringify({
      eventId: "evt_5",
      sessionId: "nonexistent",
      outcome: "resolved",
    });

    const result = await handlePaymentWebhook("fake_payments", payload, {});
    expect(result.handled).toBe(false);
  });

  it("PaymentSession transitions to RESOLVED on resolved outcome", async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: "order_ps1",
      status: "PENDING",
      orderType: "ACCOMMODATION",
      totalAmount: 50000,
      tenantId: "t1",
      guestEmail: "test@example.com",
      guestName: "Test",
      guestPhone: null,
      orderNumber: 1010,
      currency: "SEK",
      metadata: null,
      lineItems: [],
      paymentSession: { id: "ps_resolved" },
    });

    const payload = JSON.stringify({
      eventId: "evt_ps1",
      sessionId: "order_ps1",
      outcome: "resolved",
    });

    const result = await handlePaymentWebhook("fake_payments", payload, {});
    expect(result.handled).toBe(true);
    expect(result.outcome?.status).toBe("resolved");

    expect(mockPaymentSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "order_ps1" },
        data: expect.objectContaining({ status: "RESOLVED" }),
      }),
    );
  });

  it("PaymentSession transitions to REJECTED on rejected outcome", async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: "order_ps2",
      status: "PENDING",
      totalAmount: 50000,
      tenantId: "t1",
      lineItems: [],
      paymentSession: { id: "ps_rejected" },
    });

    const payload = JSON.stringify({
      eventId: "evt_ps2",
      sessionId: "order_ps2",
      outcome: "rejected",
    });

    const result = await handlePaymentWebhook("fake_payments", payload, {});
    expect(result.handled).toBe(true);
    expect(result.outcome?.status).toBe("rejected");

    expect(mockPaymentSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "order_ps2" },
        data: expect.objectContaining({ status: "REJECTED" }),
      }),
    );
  });
});
