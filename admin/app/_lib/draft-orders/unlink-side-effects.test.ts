import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

const mockReleaseHold = vi.fn();
const mockResolveAdapter = vi.fn();
vi.mock("@/app/_lib/integrations/resolve", () => ({
  resolveAdapter: (...args: unknown[]) => mockResolveAdapter(...args),
}));

const mockStripeCancel = vi.fn();
vi.mock("@/app/_lib/stripe/client", () => ({
  getStripe: () => ({ paymentIntents: { cancel: mockStripeCancel } }),
}));

const mockTenantFindUnique = vi.fn();
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenant: { findUnique: (...args: unknown[]) => mockTenantFindUnique(...args) },
  },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const { runUnlinkSideEffects } = await import("./unlink-side-effects");

// ── Setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockResolveAdapter.mockResolvedValue({ releaseHold: mockReleaseHold });
  mockReleaseHold.mockResolvedValue(undefined);
  mockTenantFindUnique.mockResolvedValue({
    stripeAccountId: "acct_123",
    stripeOnboardingComplete: true,
  });
  mockStripeCancel.mockResolvedValue({ id: "pi_123", status: "canceled" });
});

const baseArgs = {
  tenantId: "tenant_1",
  draftOrderId: "draft_1",
  sessionId: "ses_1",
};

// ═══════════════════════════════════════════════════════════════
// Empty inputs
// ═══════════════════════════════════════════════════════════════

describe("runUnlinkSideEffects — no work to do", () => {
  it("returns zeros and nulls when no holds + no PI", async () => {
    const result = await runUnlinkSideEffects({
      ...baseArgs,
      releasedHoldExternalIds: [],
      stripePaymentIntentId: null,
    });

    expect(result).toEqual({
      holdReleaseAttempted: 0,
      holdReleaseErrors: [],
      stripePaymentIntentCancelAttempted: false,
      stripePaymentIntentCancelError: null,
    });
    expect(mockResolveAdapter).not.toHaveBeenCalled();
    expect(mockStripeCancel).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// PMS hold release
// ═══════════════════════════════════════════════════════════════

describe("runUnlinkSideEffects — PMS hold release", () => {
  it("releases all holds when the adapter accepts each call", async () => {
    const result = await runUnlinkSideEffects({
      ...baseArgs,
      releasedHoldExternalIds: ["mews_a", "mews_b", "mews_c"],
      stripePaymentIntentId: null,
    });

    expect(result.holdReleaseAttempted).toBe(3);
    expect(result.holdReleaseErrors).toEqual([]);
    expect(mockReleaseHold).toHaveBeenCalledTimes(3);
    expect(mockReleaseHold).toHaveBeenNthCalledWith(1, "tenant_1", "mews_a");
    expect(mockReleaseHold).toHaveBeenNthCalledWith(2, "tenant_1", "mews_b");
    expect(mockReleaseHold).toHaveBeenNthCalledWith(3, "tenant_1", "mews_c");
  });

  it("collects per-hold errors without aborting the loop", async () => {
    mockReleaseHold
      .mockResolvedValueOnce(undefined) // mews_a OK
      .mockRejectedValueOnce(new Error("Mews 503")) // mews_b fail
      .mockResolvedValueOnce(undefined); // mews_c OK

    const result = await runUnlinkSideEffects({
      ...baseArgs,
      releasedHoldExternalIds: ["mews_a", "mews_b", "mews_c"],
      stripePaymentIntentId: null,
    });

    expect(result.holdReleaseAttempted).toBe(3);
    expect(result.holdReleaseErrors).toEqual([
      { holdExternalId: "mews_b", error: "Mews 503" },
    ]);
  });

  it("does NOT throw even when every hold release fails", async () => {
    mockReleaseHold.mockRejectedValue(new Error("network down"));

    const result = await runUnlinkSideEffects({
      ...baseArgs,
      releasedHoldExternalIds: ["mews_a", "mews_b"],
      stripePaymentIntentId: null,
    });

    expect(result.holdReleaseAttempted).toBe(2);
    expect(result.holdReleaseErrors).toHaveLength(2);
  });

  it("falls back to a per-hold error when adapter resolution fails", async () => {
    mockResolveAdapter.mockRejectedValue(new Error("integration not configured"));

    const result = await runUnlinkSideEffects({
      ...baseArgs,
      releasedHoldExternalIds: ["mews_a", "mews_b"],
      stripePaymentIntentId: null,
    });

    expect(result.holdReleaseAttempted).toBe(2);
    expect(result.holdReleaseErrors).toEqual([
      { holdExternalId: "mews_a", error: "integration not configured" },
      { holdExternalId: "mews_b", error: "integration not configured" },
    ]);
    expect(mockReleaseHold).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Stripe PI cancel
// ═══════════════════════════════════════════════════════════════

describe("runUnlinkSideEffects — Stripe PI cancel", () => {
  it("calls stripe.paymentIntents.cancel with no Connect params in dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      const result = await runUnlinkSideEffects({
        ...baseArgs,
        releasedHoldExternalIds: [],
        stripePaymentIntentId: "pi_test_123",
      });

      expect(result.stripePaymentIntentCancelAttempted).toBe(true);
      expect(result.stripePaymentIntentCancelError).toBeNull();
      expect(mockStripeCancel).toHaveBeenCalledWith("pi_test_123", undefined);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("attaches stripeAccount Connect param in non-dev for onboarded tenants", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_xxx");
    try {
      await runUnlinkSideEffects({
        ...baseArgs,
        releasedHoldExternalIds: [],
        stripePaymentIntentId: "pi_live_456",
      });

      expect(mockStripeCancel).toHaveBeenCalledWith("pi_live_456", {
        stripeAccount: "acct_123",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("captures Stripe error without throwing", async () => {
    mockStripeCancel.mockRejectedValue(
      new Error("PaymentIntent already succeeded"),
    );

    const result = await runUnlinkSideEffects({
      ...baseArgs,
      releasedHoldExternalIds: [],
      stripePaymentIntentId: "pi_already_paid",
    });

    expect(result.stripePaymentIntentCancelAttempted).toBe(true);
    expect(result.stripePaymentIntentCancelError).toBe(
      "PaymentIntent already succeeded",
    );
  });

  it("skips cancel entirely when stripePaymentIntentId is null", async () => {
    const result = await runUnlinkSideEffects({
      ...baseArgs,
      releasedHoldExternalIds: [],
      stripePaymentIntentId: null,
    });

    expect(result.stripePaymentIntentCancelAttempted).toBe(false);
    expect(result.stripePaymentIntentCancelError).toBeNull();
    expect(mockStripeCancel).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Combined: holds + PI
// ═══════════════════════════════════════════════════════════════

describe("runUnlinkSideEffects — combined", () => {
  it("runs holds first, then PI cancel; both reported in result", async () => {
    const result = await runUnlinkSideEffects({
      ...baseArgs,
      releasedHoldExternalIds: ["mews_x"],
      stripePaymentIntentId: "pi_xyz",
    });

    expect(result.holdReleaseAttempted).toBe(1);
    expect(result.holdReleaseErrors).toEqual([]);
    expect(result.stripePaymentIntentCancelAttempted).toBe(true);
    expect(result.stripePaymentIntentCancelError).toBeNull();
  });

  it("never throws even when both Stripe AND PMS fail", async () => {
    mockReleaseHold.mockRejectedValue(new Error("PMS down"));
    mockStripeCancel.mockRejectedValue(new Error("Stripe down"));

    const result = await runUnlinkSideEffects({
      ...baseArgs,
      releasedHoldExternalIds: ["mews_a"],
      stripePaymentIntentId: "pi_bad",
    });

    expect(result.holdReleaseErrors).toHaveLength(1);
    expect(result.stripePaymentIntentCancelError).toBe("Stripe down");
  });
});
