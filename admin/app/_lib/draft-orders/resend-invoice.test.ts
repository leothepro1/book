import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";

// ── Mocks ────────────────────────────────────────────────────────

type TxMock = {
  draftOrder: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  draftOrderEvent: {
    create: ReturnType<typeof vi.fn>;
  };
};

const mockTx: TxMock = {
  draftOrder: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  draftOrderEvent: {
    create: vi.fn(),
  },
};

const mockPrisma = {
  draftOrder: {
    findFirst: vi.fn(),
  },
  tenant: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(async (cb: (tx: TxMock) => Promise<unknown>) => cb(mockTx)),
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/apps/webhooks", () => ({
  emitPlatformEvent: vi.fn(() => Promise.resolve()),
}));

// Lifecycle helpers — mocked so we don't pull in the full sendInvoice
// machinery just to test the resend service.
const mockLoadTenantForInvoice = vi.fn();
const mockAssertTenantStripeReady = vi.fn();
const mockTryCancelStripePaymentIntent = vi.fn();
vi.mock("./lifecycle", () => ({
  clampShareLinkTtl: (ms?: number) => ms ?? 7 * 24 * 60 * 60 * 1000,
  generateShareLinkToken: () => "tok_new_xyz",
  buildInvoiceUrl: (slug: string, token: string) =>
    `https://${slug}.rutgr.com/invoice/${token}`,
  mergeMetafields: (existing: unknown, updates: Record<string, unknown>) => {
    const base =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    return { ...base, ...updates };
  },
  loadTenantForInvoice: mockLoadTenantForInvoice,
  assertTenantStripeReady: mockAssertTenantStripeReady,
  tryCancelStripePaymentIntent: mockTryCancelStripePaymentIntent,
}));

const mockStripeRetrieve = vi.fn();
vi.mock("@/app/_lib/stripe/client", () => ({
  getStripe: () => ({
    paymentIntents: { retrieve: mockStripeRetrieve },
  }),
}));

const mockGetPlatformFeeBps = vi.fn(() => 500);
vi.mock("@/app/_lib/payments/platform-fee", () => ({
  getPlatformFeeBps: (...args: unknown[]) => mockGetPlatformFeeBps(...args),
}));

const mockInitiateOrderPayment = vi.fn();
vi.mock("@/app/_lib/payments/providers", () => ({
  initiateOrderPayment: (...args: unknown[]) =>
    mockInitiateOrderPayment(...args),
}));

const mockCreateDraftOrderEventInTx = vi.fn(() => Promise.resolve());
vi.mock("./events", () => ({
  createDraftOrderEventInTx: (...args: unknown[]) =>
    mockCreateDraftOrderEventInTx(...args),
}));

const { resendInvoice } = await import("./resend-invoice");

// ── Fixtures ────────────────────────────────────────────────────

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    displayNumber: "D-2026-0001",
    status: "INVOICED",
    pricesFrozenAt: new Date("2026-04-25T12:00:00Z"),
    totalCents: BigInt(100_00),
    currency: "SEK",
    contactEmail: "buyer@example.com",
    contactFirstName: "Anna",
    contactLastName: "Andersson",
    metafields: { stripePaymentIntentId: "pi_old" },
    invoiceEmailSubject: null,
    invoiceEmailMessage: null,
    version: 1,
    ...overrides,
  };
}

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant_1",
    portalSlug: "acme",
    stripeAccountId: "acct_acme",
    stripeOnboardingComplete: true,
    subscriptionPlan: "STANDARD",
    platformFeeBps: 500,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();

  mockPrisma.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockPrisma.tenant.findUnique.mockResolvedValue({
    stripeAccountId: "acct_acme",
    stripeOnboardingComplete: true,
  });
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: TxMock) => Promise<unknown>) => cb(mockTx),
  );
  mockTx.draftOrder.findFirst.mockResolvedValue(makeDraft());
  mockTx.draftOrder.update.mockResolvedValue(makeDraft({ version: 2 }));
  mockTx.draftOrderEvent.create.mockResolvedValue({ id: "ev_1" });

  mockLoadTenantForInvoice.mockResolvedValue(makeTenant());
  mockAssertTenantStripeReady.mockResolvedValue(undefined);
  mockTryCancelStripePaymentIntent.mockResolvedValue({
    attempted: true,
    error: null,
  });

  mockStripeRetrieve.mockResolvedValue({
    id: "pi_old",
    status: "requires_payment_method",
  });

  mockInitiateOrderPayment.mockResolvedValue({
    mode: "embedded",
    clientSecret: "cs_new",
    providerSessionId: "pi_new",
  });

  mockGetPlatformFeeBps.mockReturnValue(500);
  mockCreateDraftOrderEventInTx.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════
// Happy path
// ═══════════════════════════════════════════════════════════════

describe("resendInvoice — happy path", () => {
  it("INVOICED + live PI → cancels old, mints new, rotates token", async () => {
    // Final tx-internal findFirst returns the post-update draft
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft())
      .mockResolvedValueOnce(makeDraft({ version: 2 }));

    const result = await resendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      actorUserId: "user_1",
    });

    expect(result.shareLinkToken).toBe("tok_new_xyz");
    expect(result.invoiceUrl).toBe(
      "https://acme.rutgr.com/invoice/tok_new_xyz",
    );
    expect(result.stripePaymentIntentId).toBe("pi_new");
    expect(result.clientSecret).toBe("cs_new");
    expect(result.rotatedPaymentIntent).toBe(true);
    expect(result.previousPiCancelError).toBeNull();

    expect(mockTryCancelStripePaymentIntent).toHaveBeenCalledWith(
      "tenant_1",
      "pi_old",
    );
    expect(mockInitiateOrderPayment).toHaveBeenCalledTimes(1);
    expect(mockTx.draftOrder.update).toHaveBeenCalledTimes(1);
    expect(mockCreateDraftOrderEventInTx).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        type: "INVOICE_RESENT",
        actorUserId: "user_1",
      }),
    );
  });

  it("OVERDUE → behaves identically to INVOICED", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "OVERDUE" }),
    );
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft({ status: "OVERDUE" }))
      .mockResolvedValueOnce(makeDraft({ status: "OVERDUE", version: 2 }));

    const result = await resendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(result.rotatedPaymentIntent).toBe(true);
  });

  it("PI status=canceled → no cancel call, mints new PI", async () => {
    mockStripeRetrieve.mockResolvedValue({
      id: "pi_old",
      status: "canceled",
    });
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft())
      .mockResolvedValueOnce(makeDraft({ version: 2 }));

    const result = await resendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(mockTryCancelStripePaymentIntent).not.toHaveBeenCalled();
    expect(result.rotatedPaymentIntent).toBe(true);
  });

  it("no previous PI in metafields → mints new PI without cancel", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ metafields: null }),
    );
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft({ metafields: null }))
      .mockResolvedValueOnce(makeDraft({ metafields: { stripePaymentIntentId: "pi_new" }, version: 2 }));

    const result = await resendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(mockStripeRetrieve).not.toHaveBeenCalled();
    expect(mockTryCancelStripePaymentIntent).not.toHaveBeenCalled();
    expect(result.rotatedPaymentIntent).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Pre-condition errors
// ═══════════════════════════════════════════════════════════════

describe("resendInvoice — pre-condition errors", () => {
  it("draft not found → NotFoundError", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(null);
    await expect(
      resendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("status=OPEN → ValidationError", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "OPEN" }),
    );
    await expect(
      resendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("status=PAID → ValidationError", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ status: "PAID" }),
    );
    await expect(
      resendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("pricesFrozenAt is null → ValidationError", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ pricesFrozenAt: null }),
    );
    await expect(
      resendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("totalCents=0 → ValidationError", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({ totalCents: BigInt(0) }),
    );
    await expect(
      resendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ═══════════════════════════════════════════════════════════════
// PI inspection branches
// ═══════════════════════════════════════════════════════════════

describe("resendInvoice — PI inspection", () => {
  it("PI status=succeeded → ConflictError ALREADY_PAID", async () => {
    mockStripeRetrieve.mockResolvedValue({
      id: "pi_old",
      status: "succeeded",
    });

    await expect(
      resendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mockTryCancelStripePaymentIntent).not.toHaveBeenCalled();
    expect(mockInitiateOrderPayment).not.toHaveBeenCalled();
  });

  it("PI retrieve throws → tolerated, mints new PI", async () => {
    mockStripeRetrieve.mockRejectedValue(new Error("api down"));
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft())
      .mockResolvedValueOnce(makeDraft({ version: 2 }));

    const result = await resendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(mockTryCancelStripePaymentIntent).not.toHaveBeenCalled();
    expect(result.rotatedPaymentIntent).toBe(true);
    expect(result.previousPiCancelError).toBe("api down");
  });

  it("Stripe.cancel reports error → propagates as previousPiCancelError, still mints new", async () => {
    mockTryCancelStripePaymentIntent.mockResolvedValue({
      attempted: true,
      error: "Stripe 503",
    });
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft())
      .mockResolvedValueOnce(makeDraft({ version: 2 }));

    const result = await resendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    expect(result.previousPiCancelError).toBe("Stripe 503");
    expect(result.rotatedPaymentIntent).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Adapter contract
// ═══════════════════════════════════════════════════════════════

describe("resendInvoice — adapter contract", () => {
  it("non-embedded init → ValidationError", async () => {
    mockInitiateOrderPayment.mockResolvedValue({
      mode: "redirect",
      redirectUrl: "https://stripe.com/x",
    });

    await expect(
      resendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("missing providerSessionId → ValidationError", async () => {
    mockInitiateOrderPayment.mockResolvedValue({
      mode: "embedded",
      clientSecret: "cs_new",
      providerSessionId: undefined,
    });

    await expect(
      resendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Concurrency / tx
// ═══════════════════════════════════════════════════════════════

describe("resendInvoice — concurrency", () => {
  it("status changed mid-flow → ConflictError", async () => {
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ status: "PAID" }),
    );

    await expect(
      resendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("version mismatch mid-flow → ConflictError", async () => {
    mockTx.draftOrder.findFirst.mockResolvedValueOnce(
      makeDraft({ version: 99 }),
    );

    await expect(
      resendInvoice({ tenantId: "tenant_1", draftOrderId: "draft_1" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Email override params
// ═══════════════════════════════════════════════════════════════

describe("resendInvoice — email overrides", () => {
  it("invoiceEmailSubject + Message persisted via tx update", async () => {
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(makeDraft())
      .mockResolvedValueOnce(makeDraft({ version: 2 }));

    await resendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
      invoiceEmailSubject: "Påminnelse om faktura",
      invoiceEmailMessage: "Hej igen — vi väntar på betalning.",
    });

    const updateArgs = mockTx.draftOrder.update.mock.calls[0]?.[0];
    expect(updateArgs?.data.invoiceEmailSubject).toBe(
      "Påminnelse om faktura",
    );
    expect(updateArgs?.data.invoiceEmailMessage).toBe(
      "Hej igen — vi väntar på betalning.",
    );
  });

  it("no overrides → preserves stored subject/message", async () => {
    mockPrisma.draftOrder.findFirst.mockResolvedValue(
      makeDraft({
        invoiceEmailSubject: "Original subject",
        invoiceEmailMessage: "Original message",
      }),
    );
    mockTx.draftOrder.findFirst
      .mockResolvedValueOnce(
        makeDraft({
          invoiceEmailSubject: "Original subject",
          invoiceEmailMessage: "Original message",
        }),
      )
      .mockResolvedValueOnce(makeDraft({ version: 2 }));

    await resendInvoice({
      tenantId: "tenant_1",
      draftOrderId: "draft_1",
    });

    const updateArgs = mockTx.draftOrder.update.mock.calls[0]?.[0];
    expect(updateArgs?.data.invoiceEmailSubject).toBe("Original subject");
    expect(updateArgs?.data.invoiceEmailMessage).toBe("Original message");
  });
});
