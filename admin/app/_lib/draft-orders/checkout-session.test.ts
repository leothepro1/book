/**
 * Phase E — `createDraftCheckoutSession` test suite.
 *
 * Covers the v1.3 §7.3 lazy-creation pipeline at the helper level:
 *
 *   - Happy path (created)
 *   - Resume (existing healthy ACTIVE session)
 *   - P2002 race + orphan reuse
 *   - 4 failure forks (unit_unavailable, stripe_unavailable ×2,
 *     tenant_not_ready)
 *   - Structural draft_not_payable cases (status, total=0, missing
 *     buyer email, draft expired)
 *   - Compensation isolation (fresh-tx, never-throws, CAS guard)
 *
 * External adapters are mocked at the module boundary. Prisma is
 * mocked as a thin object — the partial unique active-session index
 * is simulated by throwing `P2002` from `draftCheckoutSession.create`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { ValidationError } from "@/app/_lib/errors/service-errors";

// ── Mock surface ────────────────────────────────────────────────

type TxMock = {
  draftOrder: { findFirst: ReturnType<typeof vi.fn> };
  draftLineItem: { update: ReturnType<typeof vi.fn> };
  draftCheckoutSession: { findFirst: ReturnType<typeof vi.fn> };
  // computeDraftTotals reads accommodation + companyLocation; mocked at
  // the module level instead so we don't have to model those here.
};

const mockTx: TxMock = {
  draftOrder: { findFirst: vi.fn() },
  draftLineItem: { update: vi.fn() },
  draftCheckoutSession: { findFirst: vi.fn() },
};

const mockPrisma = {
  draftOrder: { findFirst: vi.fn() },
  draftCheckoutSession: {
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  tenant: { findUnique: vi.fn() },
  guestAccount: { findUnique: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: TxMock) => Promise<unknown>) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const computeDraftTotalsMock = vi.fn();
vi.mock("./calculator/orchestrator", () => ({
  computeDraftTotals: (...args: unknown[]) => computeDraftTotalsMock(...args),
}));

const placeHoldsForDraftMock = vi.fn();
vi.mock("./holds", () => ({
  placeHoldsForDraft: (...args: unknown[]) => placeHoldsForDraftMock(...args),
  // Re-export shape preserved so other modules don't break under
  // module-mode vitest.
  DEFAULT_DRAFT_HOLD_DURATION_MS: 30 * 60 * 1000,
}));

const initiateOrderPaymentMock = vi.fn();
vi.mock("@/app/_lib/payments/providers/initiate", () => ({
  initiateOrderPayment: (...args: unknown[]) =>
    initiateOrderPaymentMock(...args),
}));

const assertTenantStripeReadyMock = vi.fn();
vi.mock("@/app/_lib/stripe/verify-account", () => ({
  assertTenantStripeReady: (...args: unknown[]) =>
    assertTenantStripeReadyMock(...args),
  verifyChargesEnabled: vi.fn().mockResolvedValue(true),
  verifyEmbeddedModeReady: vi.fn().mockResolvedValue(true),
}));

const stripeCancelMock = vi.fn();
vi.mock("@/app/_lib/stripe/client", () => ({
  getStripe: () => ({
    paymentIntents: { cancel: stripeCancelMock },
  }),
}));

const releaseHoldMock = vi.fn();
const resolveAdapterMock = vi.fn();
vi.mock("@/app/_lib/integrations/resolve", () => ({
  resolveAdapter: (...args: unknown[]) => resolveAdapterMock(...args),
}));

vi.mock("@/app/_lib/tenant/tenant-url", () => ({
  getTenantUrl: ({ portalSlug }: { portalSlug: string }, opts?: { path?: string }) =>
    `https://${portalSlug}.rutgr.com${opts?.path ?? ""}`,
}));

// computeIdempotencyKey is a pure helper but pulls in Prisma types;
// mock it to a deterministic short string so we can assert on the
// Stripe call shape without exercising the SHA hashing.
vi.mock("@/app/_lib/integrations/reliability/idempotency", () => ({
  computeIdempotencyKey: vi.fn(() => "idem_test_key"),
}));

const { createDraftCheckoutSession } = await import("./checkout-session");
const { log } = await import("@/app/_lib/logger");
const logMock = log as unknown as ReturnType<typeof vi.fn>;

// ── Fixtures ────────────────────────────────────────────────────

function makeDraft(over: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "INVOICED" as const,
    contactEmail: "buyer@example.com",
    contactFirstName: null,
    contactLastName: null,
    guestAccountId: null,
    companyContactId: null,
    companyLocationId: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    version: 5,
    currency: "SEK",
    lineItems: [{ id: "line_1" }],
    ...over,
  };
}

function makeTenant(over: Record<string, unknown> = {}) {
  return {
    id: "tenant_1",
    portalSlug: "apelviken-test",
    stripeAccountId: "acct_test_1",
    stripeOnboardingComplete: true,
    ...over,
  };
}

function makeTotals(over: Record<string, unknown> = {}) {
  return {
    source: "COMPUTED" as const,
    frozenAt: null,
    currency: "SEK",
    subtotalCents: BigInt(50000),
    totalLineDiscountCents: BigInt(0),
    orderDiscountCents: BigInt(0),
    totalDiscountCents: BigInt(0),
    taxCents: BigInt(0),
    shippingCents: BigInt(0),
    totalCents: BigInt(50000),
    perLine: [],
    warnings: [] as string[],
    ...over,
  };
}

function makeSession(over: Record<string, unknown> = {}) {
  return {
    id: "ses_new",
    tenantId: "tenant_1",
    draftOrderId: "draft_1",
    draftOrderVersion: 5,
    status: "ACTIVE" as const,
    frozenSubtotal: BigInt(50000),
    frozenTaxAmount: BigInt(0),
    frozenDiscountAmount: BigInt(0),
    frozenTotal: BigInt(50000),
    currency: "SEK",
    stripePaymentIntentId: null as string | null,
    stripeClientSecret: null as string | null,
    stripeIdempotencyKey: "idem_test_key",
    lastHoldRefreshAt: null,
    holdRefreshFailureCount: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    lastBuyerActivityAt: new Date(),
    paidAt: null,
    unlinkedAt: null,
    unlinkReason: null,
    cancelledAt: null,
    version: 1,
    ...over,
  };
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the fields: (`draftOrderId`)",
    { code: "P2002", clientVersion: "test" },
  );
}

// ── Setup ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();

  // Sane defaults — overridden per-test as needed.
  mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockPrisma.tenant.findUnique.mockResolvedValue(makeTenant());
  mockPrisma.draftCheckoutSession.findFirst.mockResolvedValue(null);
  mockPrisma.draftCheckoutSession.create.mockResolvedValue(makeSession());
  mockPrisma.draftCheckoutSession.updateMany.mockResolvedValue({ count: 1 });
  // resolveBuyer falls back to draft.contactEmail in the default
  // fixture (`guestAccountId: null`) so guest lookups never run.
  mockPrisma.guestAccount.findUnique.mockResolvedValue(null);
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: TxMock) => Promise<unknown>) => cb(mockTx),
  );

  computeDraftTotalsMock.mockResolvedValue(makeTotals());
  placeHoldsForDraftMock.mockResolvedValue({
    placed: [
      { draftLineItemId: "line_1", holdExternalId: "mews_a", holdExpiresAt: new Date() },
    ],
    failed: [],
    skipped: [],
  });
  initiateOrderPaymentMock.mockResolvedValue({
    mode: "embedded",
    clientSecret: "cs_secret",
    providerSessionId: "pi_test_123",
  });
  assertTenantStripeReadyMock.mockResolvedValue(undefined);

  resolveAdapterMock.mockResolvedValue({ releaseHold: releaseHoldMock });
  releaseHoldMock.mockResolvedValue(undefined);
  stripeCancelMock.mockResolvedValue({ id: "pi_test_123", status: "canceled" });
});

// ═══════════════════════════════════════════════════════════════
// Happy path
// ═══════════════════════════════════════════════════════════════

describe("createDraftCheckoutSession — created", () => {
  it("runs the 5-step pipeline and returns kind=created", async () => {
    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    expect(result.sessionId).toBe("ses_new");
    expect(result.clientSecret).toBe("cs_secret");
    expect(result.redirectUrl).toBe(
      "https://apelviken-test.rutgr.com/checkout?draftSession=ses_new",
    );

    // Step ordering (snapshot → create → holds → initiate → updateMany).
    expect(computeDraftTotalsMock).toHaveBeenCalledTimes(1);
    expect(mockPrisma.draftCheckoutSession.create).toHaveBeenCalledTimes(1);
    expect(placeHoldsForDraftMock).toHaveBeenCalledTimes(1);
    expect(initiateOrderPaymentMock).toHaveBeenCalledTimes(1);
    expect(mockPrisma.draftCheckoutSession.updateMany).toHaveBeenCalledTimes(1);
  });

  it("forwards stripeIdempotencyKey to initiateOrderPayment", async () => {
    await createDraftCheckoutSession("tenant_1", "draft_1");

    const call = initiateOrderPaymentMock.mock.calls[0][0];
    expect(call.idempotencyKey).toBe("idem_test_key");
    expect(call.metadata.kind).toBe("draft_order_invoice");
    expect(call.metadata.draftOrderId).toBe("draft_1");
    expect(call.metadata.draftCheckoutSessionId).toBe("ses_new");
  });

  it("step-5 updateMany uses CAS on status: ACTIVE", async () => {
    await createDraftCheckoutSession("tenant_1", "draft_1");

    const persistCall = mockPrisma.draftCheckoutSession.updateMany.mock.calls[0][0];
    expect(persistCall.where).toMatchObject({
      id: "ses_new",
      status: "ACTIVE",
    });
    expect(persistCall.data.stripePaymentIntentId).toBe("pi_test_123");
    expect(persistCall.data.stripeClientSecret).toBe("cs_secret");
  });
});

// ═══════════════════════════════════════════════════════════════
// Resume — existing healthy ACTIVE session
// ═══════════════════════════════════════════════════════════════

describe("createDraftCheckoutSession — resumed", () => {
  it("short-circuits when an ACTIVE session already has a PI", async () => {
    mockPrisma.draftCheckoutSession.findFirst.mockResolvedValue(
      makeSession({
        id: "ses_existing",
        stripePaymentIntentId: "pi_existing",
        stripeClientSecret: "cs_existing_secret",
      }),
    );

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result).toEqual({
      kind: "resumed",
      sessionId: "ses_existing",
      clientSecret: "cs_existing_secret",
      redirectUrl:
        "https://apelviken-test.rutgr.com/checkout?draftSession=ses_existing",
    });
    expect(computeDraftTotalsMock).not.toHaveBeenCalled();
    expect(mockPrisma.draftCheckoutSession.create).not.toHaveBeenCalled();
    expect(placeHoldsForDraftMock).not.toHaveBeenCalled();
    expect(initiateOrderPaymentMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// P2002 race — orphan reuse
// ═══════════════════════════════════════════════════════════════

describe("createDraftCheckoutSession — P2002 race", () => {
  it("orphan (>30s, no PI): CAS-cancels, retries insert, succeeds", async () => {
    const oldSession = makeSession({
      id: "ses_orphan",
      createdAt: new Date(Date.now() - 60_000),
      stripePaymentIntentId: null,
      stripeClientSecret: null,
    });
    // First findFirst (resume short-circuit) → no active session.
    // Second findFirst (orphan handler) → the orphan.
    mockPrisma.draftCheckoutSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(oldSession);
    // First create throws P2002, retry succeeds.
    mockPrisma.draftCheckoutSession.create
      .mockRejectedValueOnce(p2002())
      .mockResolvedValueOnce(makeSession({ id: "ses_retry" }));

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result.kind).toBe("created");
    if (result.kind === "created") expect(result.sessionId).toBe("ses_retry");
    // CAS-cancel hit on the orphan (status: ACTIVE).
    expect(mockPrisma.draftCheckoutSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ses_orphan", status: "ACTIVE" },
        data: expect.objectContaining({
          status: "CANCELLED",
          unlinkReason: "orphan_pre_pi",
        }),
      }),
    );
    expect(logMock).toHaveBeenCalledWith(
      "info",
      "draft_invoice.session_orphan_reused",
      expect.objectContaining({
        previousSessionId: "ses_orphan",
        draftOrderId: "draft_1",
      }),
    );
  });

  it("race-loser (existing has PI): treats as resume", async () => {
    const winnerSession = makeSession({
      id: "ses_winner",
      createdAt: new Date(),
      stripePaymentIntentId: "pi_winner",
      stripeClientSecret: "cs_winner",
    });
    mockPrisma.draftCheckoutSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winnerSession);
    mockPrisma.draftCheckoutSession.create.mockRejectedValueOnce(p2002());

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result.kind).toBe("resumed");
    if (result.kind === "resumed") {
      expect(result.sessionId).toBe("ses_winner");
      expect(result.clientSecret).toBe("cs_winner");
    }
  });

  it("race-loser poll exhaustion (no PI ever appears): throws", async () => {
    const freshNoPi = makeSession({
      id: "ses_fresh_racer",
      createdAt: new Date(),
      stripePaymentIntentId: null,
      stripeClientSecret: null,
    });
    mockPrisma.draftCheckoutSession.findFirst
      .mockResolvedValueOnce(null) // initial resume short-circuit
      .mockResolvedValue(freshNoPi); // every orphan-handler poll
    mockPrisma.draftCheckoutSession.create.mockRejectedValueOnce(p2002());

    await expect(
      createDraftCheckoutSession("tenant_1", "draft_1"),
    ).rejects.toThrow(/orphan-collision unresolved/);
  });
});

// ═══════════════════════════════════════════════════════════════
// Step 3 fail — hold placement
// ═══════════════════════════════════════════════════════════════

describe("createDraftCheckoutSession — unit_unavailable", () => {
  it("returns unit_unavailable when any line failed", async () => {
    placeHoldsForDraftMock.mockResolvedValue({
      placed: [],
      failed: [{ draftLineItemId: "line_1", error: "Mews 503" }],
      skipped: [],
    });

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result).toEqual({
      kind: "unit_unavailable",
      reason: "Mews 503",
    });
    // Compensation: CAS-cancel ran; no Stripe calls.
    expect(mockPrisma.draftCheckoutSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CANCELLED",
          unlinkReason: "hold_placement_failed",
        }),
      }),
    );
    expect(initiateOrderPaymentMock).not.toHaveBeenCalled();
    expect(stripeCancelMock).not.toHaveBeenCalled();
  });

  it("releases partially-placed holds during compensation", async () => {
    placeHoldsForDraftMock.mockResolvedValue({
      placed: [
        { draftLineItemId: "line_1", holdExternalId: "mews_a", holdExpiresAt: new Date() },
      ],
      failed: [{ draftLineItemId: "line_2", error: "Mews 503" }],
      skipped: [],
    });

    await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(releaseHoldMock).toHaveBeenCalledWith("tenant_1", "mews_a");
  });

  it("treats skipped lines as failure (strict threshold per Q4)", async () => {
    placeHoldsForDraftMock.mockResolvedValue({
      placed: [],
      failed: [],
      skipped: [
        { draftLineItemId: "line_1", reason: "ACCOMMODATION_NOT_PMS_SYNCED" },
      ],
    });

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result.kind).toBe("unit_unavailable");
    if (result.kind === "unit_unavailable") {
      expect(result.reason).toBe("ACCOMMODATION_NOT_PMS_SYNCED");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Step 4 fail — Stripe down
// ═══════════════════════════════════════════════════════════════

describe("createDraftCheckoutSession — stripe_unavailable (step 4)", () => {
  it("compensates and returns stripe_unavailable when initiateOrderPayment throws", async () => {
    initiateOrderPaymentMock.mockRejectedValue(new Error("Stripe is down"));

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result).toEqual({
      kind: "stripe_unavailable",
      reason: "Stripe is down",
    });
    expect(mockPrisma.draftCheckoutSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CANCELLED",
          unlinkReason: "pi_create_failed",
        }),
      }),
    );
    // Step 4 cleanup releases holds but does NOT cancel a PI (none persisted).
    expect(releaseHoldMock).toHaveBeenCalledWith("tenant_1", "mews_a");
    expect(stripeCancelMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Step 5 fail — PI persist CAS lost
// ═══════════════════════════════════════════════════════════════

describe("createDraftCheckoutSession — stripe_unavailable (step 5)", () => {
  it("compensates with Connect-account context in production when CAS persist returns count=0", async () => {
    // Defeat the dev/test bypass in `tryCancelStripePI` so the
    // production code path runs — i.e. `connectParams =
    // { stripeAccount: tenant.stripeAccountId }`. v1.3 §6.4 mandates
    // Connect-account context on the cancel; this test pins it.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_xxx");
    try {
      // First updateMany call is step 5 persist → count=0 (race lost).
      // Second updateMany call is compensation CAS-cancel → count=1.
      mockPrisma.draftCheckoutSession.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await createDraftCheckoutSession("tenant_1", "draft_1");

      expect(result.kind).toBe("stripe_unavailable");
      if (result.kind === "stripe_unavailable") {
        expect(result.reason).toBe("session_no_longer_active");
      }
      // Step 5 cleanup: cancel the PI we just created, with Connect.
      expect(stripeCancelMock).toHaveBeenCalledWith(
        "pi_test_123",
        { stripeAccount: "acct_test_1" },
      );
      // Holds released too.
      expect(releaseHoldMock).toHaveBeenCalledWith("tenant_1", "mews_a");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("compensates with bypass (undefined Connect params) in dev environment", async () => {
    // Mirror the dev-bypass branch from `tryCancelStripePI`: when
    // NODE_ENV === "development", Connect routing is skipped because
    // local dev can't exercise Stripe Connect onboarding. Phase D's
    // `unlink-side-effects.test.ts` covers the equivalent branch in
    // `runUnlinkSideEffects` the same way.
    vi.stubEnv("NODE_ENV", "development");
    try {
      mockPrisma.draftCheckoutSession.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await createDraftCheckoutSession("tenant_1", "draft_1");

      expect(result.kind).toBe("stripe_unavailable");
      if (result.kind === "stripe_unavailable") {
        expect(result.reason).toBe("session_no_longer_active");
      }
      expect(stripeCancelMock).toHaveBeenCalledWith(
        "pi_test_123",
        undefined,
      );
      expect(releaseHoldMock).toHaveBeenCalledWith("tenant_1", "mews_a");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Tenant not ready
// ═══════════════════════════════════════════════════════════════

describe("createDraftCheckoutSession — tenant_not_ready", () => {
  it("translates ValidationError from assertTenantStripeReady to tenant_not_ready kind", async () => {
    assertTenantStripeReadyMock.mockRejectedValue(
      new ValidationError("Tenant Stripe onboarding is not complete", {
        tenantId: "tenant_1",
        reason: "onboarding_incomplete",
      }),
    );

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result).toEqual({
      kind: "tenant_not_ready",
      reason: "onboarding_incomplete",
    });
    // No session inserted, no holds, no Stripe calls.
    expect(mockPrisma.draftCheckoutSession.create).not.toHaveBeenCalled();
    expect(placeHoldsForDraftMock).not.toHaveBeenCalled();
    expect(initiateOrderPaymentMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// draft_not_payable — structural
// ═══════════════════════════════════════════════════════════════

describe("createDraftCheckoutSession — draft_not_payable", () => {
  it("status_not_invoiced when draft is OPEN", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "OPEN" }),
    );
    const result = await createDraftCheckoutSession("tenant_1", "draft_1");
    expect(result).toEqual({
      kind: "draft_not_payable",
      reason: "status_not_invoiced",
    });
    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("draft_expired when draft.expiresAt has passed", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ expiresAt: new Date(Date.now() - 1000) }),
    );
    const result = await createDraftCheckoutSession("tenant_1", "draft_1");
    expect(result).toEqual({
      kind: "draft_not_payable",
      reason: "draft_expired",
    });
  });

  it("no_line_items when draft has zero lines", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ lineItems: [] }),
    );
    const result = await createDraftCheckoutSession("tenant_1", "draft_1");
    expect(result).toEqual({
      kind: "draft_not_payable",
      reason: "no_line_items",
    });
  });

  it("missing_buyer_email when no chain link resolves (null contactEmail, null guestAccountId)", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ contactEmail: null, guestAccountId: null }),
    );
    const result = await createDraftCheckoutSession("tenant_1", "draft_1");
    expect(result).toEqual({
      kind: "draft_not_payable",
      reason: "missing_buyer_email",
    });
    // No GuestAccount lookup happens when guestAccountId is null.
    expect(mockPrisma.guestAccount.findUnique).not.toHaveBeenCalled();
  });

  it("uses contactEmail + contactFirstName/contactLastName snapshot when both are populated", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        contactEmail: "snapshot@example.com",
        contactFirstName: "John",
        contactLastName: "Doe",
        guestAccountId: null,
      }),
    );

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result.kind).toBe("created");
    const piCall = initiateOrderPaymentMock.mock.calls[0][0];
    expect(piCall.guest).toEqual({
      email: "snapshot@example.com",
      name: "John Doe",
    });
    // Snapshot path → no live lookup needed.
    expect(mockPrisma.guestAccount.findUnique).not.toHaveBeenCalled();
  });

  it("contactEmail snapshot wins over GuestAccount.email when both are set with different values", async () => {
    // The fail-case the snapshot prevents: merchant typed
    // contactEmail = john@new.com from a phone call; John's stale
    // GuestAccount.email = john@old.com from a different tenant.
    // Snapshot must win so the receipt hits the inbox the merchant
    // actually intended.
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        contactEmail: "john@new.com",
        contactFirstName: null,
        contactLastName: null,
        guestAccountId: "g_john",
      }),
    );
    mockPrisma.guestAccount.findUnique.mockResolvedValue({
      email: "john@old.com",
      firstName: "John",
      lastName: "Stale",
      name: null,
    });

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result.kind).toBe("created");
    const piCall = initiateOrderPaymentMock.mock.calls[0][0];
    expect(piCall.guest.email).toBe("john@new.com");
    // No live lookup at all when contactEmail is set — snapshot
    // semantics, not just precedence.
    expect(mockPrisma.guestAccount.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to GuestAccount when contactEmail is null and guestAccountId is set", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ contactEmail: null, guestAccountId: "g_live" }),
    );
    mockPrisma.guestAccount.findUnique.mockResolvedValue({
      email: "live@example.com",
      firstName: "Anna",
      lastName: "Andersson",
      name: null,
    });

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result.kind).toBe("created");
    expect(mockPrisma.guestAccount.findUnique).toHaveBeenCalledWith({
      where: { id: "g_live" },
      select: { email: true, firstName: true, lastName: true, name: true },
    });
    const piCall = initiateOrderPaymentMock.mock.calls[0][0];
    expect(piCall.guest).toEqual({
      email: "live@example.com",
      name: "Anna Andersson",
    });
  });

  it("GuestAccount fallback: falls back to deprecated `name` when firstName/lastName are null", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ contactEmail: null, guestAccountId: "g_legacy" }),
    );
    mockPrisma.guestAccount.findUnique.mockResolvedValue({
      email: "legacy@example.com",
      firstName: null,
      lastName: null,
      name: "Legacy Name",
    });

    await createDraftCheckoutSession("tenant_1", "draft_1");

    const piCall = initiateOrderPaymentMock.mock.calls[0][0];
    expect(piCall.guest).toEqual({
      email: "legacy@example.com",
      name: "Legacy Name",
    });
  });

  it("missing_buyer_email when guestAccountId set but lookup returns null AND contactEmail also null", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ contactEmail: null, guestAccountId: "g_deleted" }),
    );
    mockPrisma.guestAccount.findUnique.mockResolvedValue(null);

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result).toEqual({
      kind: "draft_not_payable",
      reason: "missing_buyer_email",
    });
  });

  it("zero_or_negative_total when totals come back at 0", async () => {
    computeDraftTotalsMock.mockResolvedValue(
      makeTotals({ totalCents: BigInt(0) }),
    );
    const result = await createDraftCheckoutSession("tenant_1", "draft_1");
    expect(result).toEqual({
      kind: "draft_not_payable",
      reason: "zero_or_negative_total",
    });
    // Crucially: no session insert.
    expect(mockPrisma.draftCheckoutSession.create).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Compensation isolation
// ═══════════════════════════════════════════════════════════════

describe("createDraftCheckoutSession — compensation isolation", () => {
  it("compensation never throws — adapter.releaseHold rejection is logged, not propagated", async () => {
    placeHoldsForDraftMock.mockResolvedValue({
      placed: [
        { draftLineItemId: "line_1", holdExternalId: "mews_a", holdExpiresAt: new Date() },
      ],
      failed: [{ draftLineItemId: "line_2", error: "Mews 503" }],
      skipped: [],
    });
    releaseHoldMock.mockRejectedValue(new Error("PMS network down"));

    // Pipeline still completes with unit_unavailable rather than
    // throwing the compensation's hold-release failure.
    const result = await createDraftCheckoutSession("tenant_1", "draft_1");
    expect(result.kind).toBe("unit_unavailable");
    expect(logMock).toHaveBeenCalledWith(
      "warn",
      "draft_invoice.hold_release_failed",
      expect.objectContaining({
        tenantId: "tenant_1",
        holdExternalId: "mews_a",
        error: "PMS network down",
      }),
    );
  });

  it("CAS guard logs cancel_cas_lost when count=0 during orphan handling", async () => {
    const oldOrphan = makeSession({
      id: "ses_orphan",
      createdAt: new Date(Date.now() - 60_000),
    });
    const winnerAfterRace = makeSession({
      id: "ses_winner",
      stripePaymentIntentId: "pi_winner",
      stripeClientSecret: "cs_winner",
    });
    mockPrisma.draftCheckoutSession.findFirst
      .mockResolvedValueOnce(null) // resume short-circuit
      .mockResolvedValueOnce(oldOrphan) // first orphan-handler poll
      .mockResolvedValueOnce(winnerAfterRace); // post-CAS-loss re-poll
    // updateMany sequence: CAS-cancel attempt (count=0 → CAS lost).
    mockPrisma.draftCheckoutSession.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    mockPrisma.draftCheckoutSession.create.mockRejectedValueOnce(p2002());

    const result = await createDraftCheckoutSession("tenant_1", "draft_1");

    expect(result.kind).toBe("resumed");
    expect(logMock).toHaveBeenCalledWith(
      "warn",
      "draft_invoice.session_cancel_cas_lost",
      expect.objectContaining({
        sessionId: "ses_orphan",
        context: "orphan_collision",
      }),
    );
  });

  it("step 4 cleanup runs in a fresh tx — does not share the snapshot tx", async () => {
    initiateOrderPaymentMock.mockRejectedValue(new Error("Stripe down"));

    await createDraftCheckoutSession("tenant_1", "draft_1");

    // $transaction is invoked exactly once (step 1 snapshot). Cleanup
    // uses raw prisma.draftCheckoutSession.updateMany at the top
    // level — never inside a transaction callback.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.draftCheckoutSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unlinkReason: "pi_create_failed",
        }),
      }),
    );
  });
});
