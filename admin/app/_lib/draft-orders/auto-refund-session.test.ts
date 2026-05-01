/**
 * Phase H — `runAutoRefundForPaidNonActiveSession` test suite.
 *
 * Helper-level tests (Phase D + E precedent). Stripe, sendOperatorAlert,
 * and logger are mocked at the module boundary; no real network or DB.
 *
 * Env-stubbing pattern mirrors Phase D's unlink-side-effects.test.ts —
 * try/finally + vi.unstubAllEnvs() so each test exercises a specific
 * connect-params branch without leaking state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { RunAutoRefundForPaidNonActiveSessionArgs } from "./auto-refund-session";

const stripeRefundsCreateMock = vi.fn();
vi.mock("@/app/_lib/stripe/client", () => ({
  getStripe: () => ({
    refunds: { create: stripeRefundsCreateMock },
  }),
}));

const sendOperatorAlertMock = vi.fn();
vi.mock("@/app/_lib/integrations/reliability/alert-operator", () => ({
  sendOperatorAlert: (...args: unknown[]) => sendOperatorAlertMock(...args),
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const { runAutoRefundForPaidNonActiveSession } = await import(
  "./auto-refund-session"
);
const { log } = await import("@/app/_lib/logger");
const logMock = log as unknown as ReturnType<typeof vi.fn>;

// ── Fixtures ────────────────────────────────────────────────────

function makeArgs(
  over: Partial<RunAutoRefundForPaidNonActiveSessionArgs> = {},
): RunAutoRefundForPaidNonActiveSessionArgs {
  return {
    tenant: {
      id: "tenant_1",
      stripeAccountId: "acct_test_1",
      stripeOnboardingComplete: true,
    },
    sessionId: "sess_abc123",
    paymentIntentId: "pi_test_xyz",
    amountCents: 12500,
    reasonCode: "unlinked_session_paid",
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  stripeRefundsCreateMock.mockResolvedValue({
    id: "re_test_001",
    status: "succeeded",
  });
  sendOperatorAlertMock.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════
// Connect-context branches (mirrors unlink-side-effects.test.ts)
// ═══════════════════════════════════════════════════════════════

describe("runAutoRefundForPaidNonActiveSession — Connect context", () => {
  it("attaches stripeAccount in production for onboarded tenants", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_xxx");
    try {
      await runAutoRefundForPaidNonActiveSession(makeArgs());

      expect(stripeRefundsCreateMock).toHaveBeenCalledWith(
        {
          payment_intent: "pi_test_xyz",
          reason: "requested_by_customer",
        },
        {
          stripeAccount: "acct_test_1",
          idempotencyKey: "draft_invoice:sess_abc123:auto_refund",
        },
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("omits stripeAccount in development (devOrTest bypass)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      await runAutoRefundForPaidNonActiveSession(makeArgs());

      expect(stripeRefundsCreateMock).toHaveBeenCalledWith(
        expect.any(Object),
        {
          // No stripeAccount key — connectParams was undefined and spread to nothing.
          idempotencyKey: "draft_invoice:sess_abc123:auto_refund",
        },
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("omits stripeAccount when STRIPE_SECRET_KEY starts with sk_test_", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_xxx");
    try {
      await runAutoRefundForPaidNonActiveSession(makeArgs());

      expect(stripeRefundsCreateMock).toHaveBeenCalledWith(
        expect.any(Object),
        {
          idempotencyKey: "draft_invoice:sess_abc123:auto_refund",
        },
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("omits stripeAccount when tenant is not onboarded", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_xxx");
    try {
      await runAutoRefundForPaidNonActiveSession(
        makeArgs({
          tenant: {
            id: "tenant_1",
            stripeAccountId: "acct_test_1",
            stripeOnboardingComplete: false,
          },
        }),
      );

      expect(stripeRefundsCreateMock).toHaveBeenCalledWith(
        expect.any(Object),
        {
          idempotencyKey: "draft_invoice:sess_abc123:auto_refund",
        },
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("omits stripeAccount when stripeAccountId is null", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_xxx");
    try {
      await runAutoRefundForPaidNonActiveSession(
        makeArgs({
          tenant: {
            id: "tenant_1",
            stripeAccountId: null,
            stripeOnboardingComplete: true,
          },
        }),
      );

      expect(stripeRefundsCreateMock).toHaveBeenCalledWith(
        expect.any(Object),
        {
          idempotencyKey: "draft_invoice:sess_abc123:auto_refund",
        },
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Idempotency-key shape
// ═══════════════════════════════════════════════════════════════

describe("runAutoRefundForPaidNonActiveSession — idempotency key", () => {
  it("uses exact format `draft_invoice:${sessionId}:auto_refund` with no attempt suffix", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      await runAutoRefundForPaidNonActiveSession(
        makeArgs({ sessionId: "sess_xyz999" }),
      );

      const callArgs = stripeRefundsCreateMock.mock.calls[0];
      const opts = callArgs[1] as { idempotencyKey: string };
      expect(opts.idempotencyKey).toBe(
        "draft_invoice:sess_xyz999:auto_refund",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// reasonCode plumbing
// ═══════════════════════════════════════════════════════════════

describe("runAutoRefundForPaidNonActiveSession — reasonCode plumbing", () => {
  it("plumbs `unlinked_session_paid` through to log + alert", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      await runAutoRefundForPaidNonActiveSession(
        makeArgs({ reasonCode: "unlinked_session_paid" }),
      );

      expect(logMock).toHaveBeenCalledWith(
        "warn",
        "draft_invoice.unlinked_session_paid_refunded",
        expect.objectContaining({
          reasonCode: "unlinked_session_paid",
          sessionId: "sess_abc123",
          refundId: "re_test_001",
          amountCents: 12500,
        }),
      );
      expect(sendOperatorAlertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("unlinked_session_paid"),
          severity: "warning",
          tenantId: "tenant_1",
        }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("plumbs `cancelled_session_paid` through to log + alert", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      await runAutoRefundForPaidNonActiveSession(
        makeArgs({ reasonCode: "cancelled_session_paid" }),
      );

      expect(logMock).toHaveBeenCalledWith(
        "warn",
        "draft_invoice.cancelled_session_paid_refunded",
        expect.objectContaining({
          reasonCode: "cancelled_session_paid",
        }),
      );
      expect(sendOperatorAlertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("cancelled_session_paid"),
          severity: "warning",
        }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Stripe error path
// ═══════════════════════════════════════════════════════════════

describe("runAutoRefundForPaidNonActiveSession — Stripe error", () => {
  it("logs error, sends urgent alert, re-throws when refunds.create rejects", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      stripeRefundsCreateMock.mockRejectedValue(
        new Error("stripe_unreachable"),
      );

      await expect(
        runAutoRefundForPaidNonActiveSession(makeArgs()),
      ).rejects.toThrow("stripe_unreachable");

      expect(logMock).toHaveBeenCalledWith(
        "error",
        "draft_invoice.unlinked_session_paid_refund_failed",
        expect.objectContaining({
          error: "stripe_unreachable",
          paymentIntentId: "pi_test_xyz",
          sessionId: "sess_abc123",
        }),
      );
      expect(sendOperatorAlertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "urgent",
          subject: expect.stringContaining("auto-refund failed"),
        }),
      );
      // Success log + success alert MUST NOT have been called on failure path.
      expect(logMock).not.toHaveBeenCalledWith(
        "warn",
        expect.stringContaining("_refunded"),
        expect.anything(),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("plumbs cancelled_session_paid through the failure path", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      stripeRefundsCreateMock.mockRejectedValue(new Error("boom"));

      await expect(
        runAutoRefundForPaidNonActiveSession(
          makeArgs({ reasonCode: "cancelled_session_paid" }),
        ),
      ).rejects.toThrow("boom");

      expect(logMock).toHaveBeenCalledWith(
        "error",
        "draft_invoice.cancelled_session_paid_refund_failed",
        expect.anything(),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Refund-call shape
// ═══════════════════════════════════════════════════════════════

describe("runAutoRefundForPaidNonActiveSession — refund call shape", () => {
  it("calls stripe.refunds.create with payment_intent + requested_by_customer reason", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      await runAutoRefundForPaidNonActiveSession(makeArgs());

      const [createBody] = stripeRefundsCreateMock.mock.calls[0];
      expect(createBody).toEqual({
        payment_intent: "pi_test_xyz",
        reason: "requested_by_customer",
      });
      // Refund body intentionally has NO `amount` — full refund.
      expect(createBody).not.toHaveProperty("amount");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
