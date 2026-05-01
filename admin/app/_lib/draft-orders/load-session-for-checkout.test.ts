/**
 * Phase G — `loadSessionForCheckout` test suite.
 *
 * Helper-level tests (Phase E + F precedent). Prisma is mocked at the
 * module boundary; no real DB access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  draftCheckoutSession: { findUnique: vi.fn() },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));

const { loadSessionForCheckout } = await import("./load-session-for-checkout");

const TENANT_A = "tenant_a";
const TENANT_B = "tenant_b";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ses_1",
    tenantId: TENANT_A,
    status: "ACTIVE" as const,
    stripeClientSecret: "pi_123_secret_abc",
    frozenSubtotal: BigInt(10000),
    frozenTaxAmount: BigInt(2500),
    frozenDiscountAmount: BigInt(0),
    frozenTotal: BigInt(12500),
    currency: "SEK",
    draftOrder: {
      id: "draft_1",
      shareLinkToken: "tok_abc",
      completedOrderId: null,
      contactEmail: "buyer@example.com",
      contactFirstName: "Anna",
      contactLastName: "Andersson",
      lineItems: [
        {
          id: "li_1",
          title: "Stuga 4 personer",
          quantity: 1,
          unitPriceCents: BigInt(10000),
          totalCents: BigInt(10000),
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadSessionForCheckout — happy path", () => {
  it("returns the full shape for an ACTIVE session in the matching tenant", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(makeRow());

    const result = await loadSessionForCheckout("ses_1", TENANT_A);

    expect(result).not.toBeNull();
    expect(result?.id).toBe("ses_1");
    expect(result?.status).toBe("ACTIVE");
    expect(result?.stripeClientSecret).toBe("pi_123_secret_abc");
    expect(result?.draftOrder.shareLinkToken).toBe("tok_abc");
    expect(result?.draftOrder.completedOrderId).toBeNull();
    expect(result?.draftOrder.lineItems).toHaveLength(1);
    expect(result?.draftOrder.lineItems[0].title).toBe("Stuga 4 personer");
  });

  it("returns the row for non-ACTIVE statuses (caller decides redirect)", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeRow({ status: "UNLINKED" }),
    );

    const result = await loadSessionForCheckout("ses_1", TENANT_A);

    expect(result?.status).toBe("UNLINKED");
  });

  it("returns the PAID row with completedOrderId populated", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeRow({
        status: "PAID",
        draftOrder: {
          ...makeRow().draftOrder,
          completedOrderId: "ord_xyz",
        },
      }),
    );

    const result = await loadSessionForCheckout("ses_1", TENANT_A);

    expect(result?.status).toBe("PAID");
    expect(result?.draftOrder.completedOrderId).toBe("ord_xyz");
  });
});

describe("loadSessionForCheckout — tenant scoping", () => {
  it("returns null when the row's tenantId does not match the caller", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeRow({ tenantId: TENANT_B }),
    );

    const result = await loadSessionForCheckout("ses_1", TENANT_A);

    expect(result).toBeNull();
  });

  it("returns null for a non-existent sessionId", async () => {
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(null);

    const result = await loadSessionForCheckout("ses_missing", TENANT_A);

    expect(result).toBeNull();
  });
});

describe("loadSessionForCheckout — invariant violations", () => {
  it("returns null if shareLinkToken is null on the parent draft", async () => {
    // shareLinkToken is set at sendInvoice time; resolving a session
    // whose parent draft has no token is a structural invariant
    // violation. Treat as missing rather than render an unreachable
    // /invoice/{null} URL.
    mockPrisma.draftCheckoutSession.findUnique.mockResolvedValue(
      makeRow({
        draftOrder: {
          ...makeRow().draftOrder,
          shareLinkToken: null,
        },
      }),
    );

    const result = await loadSessionForCheckout("ses_1", TENANT_A);

    expect(result).toBeNull();
  });
});
