import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

const mockPrisma = {
  draftOrder: {
    findUnique: vi.fn(),
  },
  tenant: {
    findUnique: vi.fn(),
  },
};

const mockResolveTenantFromHost = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockGetDraftByShareToken = vi.fn();
const mockStripeRetrieve = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/(guest)/_lib/tenant/resolveTenantFromHost", () => ({
  resolveTenantFromHost: mockResolveTenantFromHost,
}));
vi.mock("@/app/_lib/rate-limit/checkout", () => ({
  checkRateLimit: mockCheckRateLimit,
}));
vi.mock("@/app/_lib/draft-orders", () => ({
  getDraftByShareToken: mockGetDraftByShareToken,
  // Re-implement the typed metafields accessor inline so we don't pull
  // in the real index barrel and trigger Prisma client init.
  getDraftStripePaymentIntentId: (draft: { metafields: unknown }) => {
    const mf = draft.metafields;
    if (!mf || typeof mf !== "object" || Array.isArray(mf)) return null;
    const v = (mf as Record<string, unknown>).stripePaymentIntentId;
    return typeof v === "string" && v.length > 0 ? v : null;
  },
}));
vi.mock("@/app/_lib/stripe/client", () => ({
  getStripe: () => ({
    paymentIntents: { retrieve: mockStripeRetrieve },
  }),
}));

const { getInvoiceClientSecretAction } = await import("./actions");

// ── Helpers ─────────────────────────────────────────────────────

function happyDraft(overrides: Record<string, unknown> = {}) {
  return {
    draft: {
      id: "draft_1",
      displayNumber: "D-2026-0001",
      status: "INVOICED",
      ...overrides,
    },
    expired: false,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(true);
  mockResolveTenantFromHost.mockResolvedValue({
    id: "tenant_1",
    portalSlug: "acme",
  });
  mockGetDraftByShareToken.mockResolvedValue(happyDraft());
  mockPrisma.draftOrder.findUnique.mockResolvedValue({
    metafields: { stripePaymentIntentId: "pi_123" },
    tenantId: "tenant_1",
  });
  mockPrisma.tenant.findUnique.mockResolvedValue({
    stripeAccountId: "acct_123",
    stripeOnboardingComplete: true,
  });
  mockStripeRetrieve.mockResolvedValue({
    id: "pi_123",
    client_secret: "pi_123_secret_xyz",
    status: "requires_payment_method",
  });
});

// ═══════════════════════════════════════════════════════════════
// Input + rate limit
// ═══════════════════════════════════════════════════════════════

describe("getInvoiceClientSecretAction — input + rate limit", () => {
  it("returns NOT_FOUND for empty token", async () => {
    const r = await getInvoiceClientSecretAction("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_FOUND");
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("returns RATE_LIMITED when limit exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("RATE_LIMITED");
  });
});

// ═══════════════════════════════════════════════════════════════
// Tenant resolution
// ═══════════════════════════════════════════════════════════════

describe("getInvoiceClientSecretAction — tenant resolution", () => {
  it("returns TENANT_NOT_RESOLVED when host yields no tenant", async () => {
    mockResolveTenantFromHost.mockResolvedValue(null);
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TENANT_NOT_RESOLVED");
  });
});

// ═══════════════════════════════════════════════════════════════
// Draft state branching
// ═══════════════════════════════════════════════════════════════

describe("getInvoiceClientSecretAction — draft state", () => {
  it("returns NOT_FOUND when draft is not visible", async () => {
    mockGetDraftByShareToken.mockResolvedValue(null);
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_FOUND");
  });

  it("returns EXPIRED when token expired", async () => {
    mockGetDraftByShareToken.mockResolvedValue({
      ...happyDraft(),
      expired: true,
    });
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("EXPIRED");
  });

  it("returns ALREADY_PAID when status=PAID", async () => {
    mockGetDraftByShareToken.mockResolvedValue(
      happyDraft({ status: "PAID" }),
    );
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ALREADY_PAID");
  });

  it("returns ALREADY_PAID when status=COMPLETED", async () => {
    mockGetDraftByShareToken.mockResolvedValue(
      happyDraft({ status: "COMPLETED" }),
    );
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ALREADY_PAID");
  });
});

// ═══════════════════════════════════════════════════════════════
// PI metadata + Stripe retrieve
// ═══════════════════════════════════════════════════════════════

describe("getInvoiceClientSecretAction — PI retrieval", () => {
  it("returns INVALID_STATE when metafields missing PI id", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue({
      metafields: null,
      tenantId: "tenant_1",
    });
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_STATE");
  });

  it("returns NOT_FOUND when raw row tenantId mismatches", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue({
      metafields: { stripePaymentIntentId: "pi_123" },
      tenantId: "tenant_other",
    });
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_FOUND");
  });

  it("returns ALREADY_PAID when PI status=succeeded (webhook race)", async () => {
    mockStripeRetrieve.mockResolvedValue({
      id: "pi_123",
      client_secret: "pi_123_secret_xyz",
      status: "succeeded",
    });
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ALREADY_PAID");
  });

  it("returns INVALID_STATE when PI status=canceled", async () => {
    mockStripeRetrieve.mockResolvedValue({
      id: "pi_123",
      client_secret: null,
      status: "canceled",
    });
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_STATE");
  });

  it("returns STRIPE_ERROR when retrieve throws", async () => {
    mockStripeRetrieve.mockRejectedValue(new Error("api down"));
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("STRIPE_ERROR");
  });

  it("returns ok with clientSecret on happy path", async () => {
    const r = await getInvoiceClientSecretAction("tok_abc");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.clientSecret).toBe("pi_123_secret_xyz");
      expect(r.paymentIntentId).toBe("pi_123");
    }
  });
});
