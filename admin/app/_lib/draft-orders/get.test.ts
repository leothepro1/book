import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

const mockPrisma = {
  draftOrder: {
    findFirst: vi.fn(),
  },
  guestAccount: {
    findFirst: vi.fn(),
  },
  tenant: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const mockStripeRetrieve = vi.fn();
vi.mock("@/app/_lib/stripe/client", () => ({
  getStripe: () => ({
    paymentIntents: { retrieve: mockStripeRetrieve },
  }),
}));

const { getDraft } = await import("./get");

// ── Fixtures ────────────────────────────────────────────────────

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    displayNumber: "D-2026-0001",
    status: "OPEN",
    expiresAt: new Date("2026-05-01T00:00:00Z"),
    createdAt: new Date("2026-04-25T00:00:00Z"),
    updatedAt: new Date("2026-04-25T00:00:00Z"),
    totalCents: BigInt(50_00),
    currency: "SEK",
    guestAccountId: null,
    metafields: null,
    lineItems: [],
    events: [],
    reservations: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
  mockPrisma.guestAccount.findFirst.mockResolvedValue(null);
  mockStripeRetrieve.mockResolvedValue(null);
});

// ═══════════════════════════════════════════════════════════════
// Happy path + not-found
// ═══════════════════════════════════════════════════════════════

describe("getDraft — happy path", () => {
  it("returns full detail on match", async () => {
    mockPrisma.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft({ events: [{ id: "ev1" }] }))
      // prev/next
      .mockResolvedValueOnce({ id: "prev_1", displayNumber: "D-2026-0000" })
      .mockResolvedValueOnce({ id: "next_1", displayNumber: "D-2026-0002" });

    const result = await getDraft("draft_1", "tenant_1");

    expect(result).not.toBeNull();
    expect(result?.draft.id).toBe("draft_1");
    expect(result?.events.length).toBe(1);
    expect(result?.prev).toEqual({ id: "prev_1", displayNumber: "D-2026-0000" });
    expect(result?.next).toEqual({ id: "next_1", displayNumber: "D-2026-0002" });
    expect(result?.stripePaymentIntent).toBeNull();
  });
});

describe("getDraft — not found", () => {
  it("returns null when no draft matches id", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
    const result = await getDraft("nonexistent", "tenant_1");
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// T-cross-tenant: indistinguishable from not-found, no error string
// ═══════════════════════════════════════════════════════════════

describe("getDraft — T-cross-tenant", () => {
  it("cross-tenant access returns null (no leak, no exception)", async () => {
    // Prisma findFirst with where: { id, tenantId } returns null when
    // the draft belongs to a different tenant. Mocked accordingly.
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);

    const result = await getDraft("real_draft_in_tenant_alpha", "tenant_beta");
    expect(result).toBeNull();
    // Same shape as not-found (above) — no Error thrown, no info leaked.
  });

  it("WHERE always includes tenantId scope", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
    await getDraft("d_1", "tenant_alpha");

    const args = mockPrisma.draftOrder.findFirst.mock.calls[0][0] as {
      where: { id: string; tenantId: string };
    };
    expect(args.where.tenantId).toBe("tenant_alpha");
    expect(args.where.id).toBe("d_1");
  });
});

// ═══════════════════════════════════════════════════════════════
// T-customer-hydration
// ═══════════════════════════════════════════════════════════════

describe("getDraft — T-customer-hydration", () => {
  it("when guestAccountId set, parallel findFirst is invoked tenant-scoped", async () => {
    mockPrisma.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft({ guestAccountId: "g_1" }))
      .mockResolvedValueOnce(null) // prev
      .mockResolvedValueOnce(null); // next
    mockPrisma.guestAccount.findFirst.mockResolvedValue({
      id: "g_1",
      email: "kund@example.com",
    });

    const result = await getDraft("draft_1", "tenant_1");

    expect(mockPrisma.guestAccount.findFirst).toHaveBeenCalledTimes(1);
    const args = mockPrisma.guestAccount.findFirst.mock.calls[0][0] as {
      where: { id: string; tenantId: string };
    };
    expect(args.where.id).toBe("g_1");
    expect(args.where.tenantId).toBe("tenant_1");
    expect(result?.customer).toEqual({ id: "g_1", email: "kund@example.com" });
  });

  it("when guestAccountId is null, no extra customer query", async () => {
    mockPrisma.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft({ guestAccountId: null }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await getDraft("draft_1", "tenant_1");

    expect(mockPrisma.guestAccount.findFirst).not.toHaveBeenCalled();
    expect(result?.customer).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// T-stripe-pi-conditional
// ═══════════════════════════════════════════════════════════════

describe("getDraft — T-stripe-pi-conditional", () => {
  it("not fetched when status !== INVOICED", async () => {
    mockPrisma.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft({ status: "OPEN" }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await getDraft("draft_1", "tenant_1");

    expect(mockStripeRetrieve).not.toHaveBeenCalled();
  });

  it("fetched when status === INVOICED and PI id present in metafields", async () => {
    mockPrisma.draftOrder.findFirst
      .mockResolvedValueOnce(
        makeDraft({
          status: "INVOICED",
          metafields: { stripePaymentIntentId: "pi_test_123" },
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.tenant.findUnique.mockResolvedValue({
      stripeAccountId: null,
      stripeOnboardingComplete: false,
    });
    mockStripeRetrieve.mockResolvedValue({
      id: "pi_test_123",
      status: "requires_payment_method",
    });

    const result = await getDraft("draft_1", "tenant_1");

    expect(mockStripeRetrieve).toHaveBeenCalledWith("pi_test_123", undefined);
    expect(result?.stripePaymentIntent).toEqual({
      id: "pi_test_123",
      status: "requires_payment_method",
    });
  });

  it("returns null on Stripe fetch failure (best-effort, never throws)", async () => {
    mockPrisma.draftOrder.findFirst
      .mockResolvedValueOnce(
        makeDraft({
          status: "INVOICED",
          metafields: { stripePaymentIntentId: "pi_test_456" },
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.tenant.findUnique.mockResolvedValue({
      stripeAccountId: null,
      stripeOnboardingComplete: false,
    });
    mockStripeRetrieve.mockRejectedValue(new Error("Stripe down"));

    const result = await getDraft("draft_1", "tenant_1");
    expect(result?.stripePaymentIntent).toBeNull();
  });

  it("INVOICED but no PI id in metafields → null without Stripe call", async () => {
    mockPrisma.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft({ status: "INVOICED", metafields: {} }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await getDraft("draft_1", "tenant_1");
    expect(mockStripeRetrieve).not.toHaveBeenCalled();
    expect(result?.stripePaymentIntent).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// T-prev-next: scoping
// ═══════════════════════════════════════════════════════════════

describe("getDraft — prev/next navigation", () => {
  it("prev/next queries are tenant-scoped and use displayNumber", async () => {
    mockPrisma.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft({ displayNumber: "D-2026-0050" }))
      .mockResolvedValueOnce({ id: "p", displayNumber: "D-2026-0049" })
      .mockResolvedValueOnce({ id: "n", displayNumber: "D-2026-0051" });

    await getDraft("draft_1", "tenant_alpha");

    const prevArgs = mockPrisma.draftOrder.findFirst.mock.calls[1][0] as {
      where: { tenantId: string; displayNumber: { lt: string } };
    };
    const nextArgs = mockPrisma.draftOrder.findFirst.mock.calls[2][0] as {
      where: { tenantId: string; displayNumber: { gt: string } };
    };
    expect(prevArgs.where.tenantId).toBe("tenant_alpha");
    expect(prevArgs.where.displayNumber.lt).toBe("D-2026-0050");
    expect(nextArgs.where.tenantId).toBe("tenant_alpha");
    expect(nextArgs.where.displayNumber.gt).toBe("D-2026-0050");
  });
});
