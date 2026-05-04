import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

const mockPrisma = {
  draftOrder: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));

const { getDraftByShareToken } = await import("./get-by-share-token");

// ── Fixtures ────────────────────────────────────────────────────

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    displayNumber: "D-2026-0001",
    status: "INVOICED",
    buyerKind: "GUEST",
    contactEmail: "buyer@example.com",
    contactPhone: null,
    contactFirstName: "Anna",
    contactLastName: "Andersson",
    customerNote: null,
    subtotalCents: BigInt(80_00),
    orderDiscountCents: BigInt(0),
    shippingCents: BigInt(0),
    totalTaxCents: BigInt(20_00),
    totalCents: BigInt(100_00),
    currency: "SEK",
    taxesIncluded: true,
    appliedDiscountCode: null,
    appliedDiscountAmount: null,
    paymentTermsFrozen: null,
    invoiceSentAt: new Date("2026-04-25T12:00:00Z"),
    shareLinkToken: "tok_abc",
    shareLinkExpiresAt: new Date("2026-05-10T12:00:00Z"),
    invoiceUrl: "https://acme.rutgr.com/invoice/tok_abc",
    invoiceEmailSubject: null,
    invoiceEmailMessage: null,
    metafields: null,
    lineItems: [],
    ...overrides,
  };
}

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "line_1",
    tenantId: "tenant_1",
    draftOrderId: "draft_1",
    lineType: "ACCOMMODATION",
    position: 0,
    accommodationId: "acc_1",
    checkInDate: new Date("2026-06-01T00:00:00Z"),
    checkOutDate: new Date("2026-06-04T00:00:00Z"),
    nights: 3,
    title: "Strandvilla",
    variantTitle: null,
    quantity: 1,
    unitPriceCents: BigInt(2000_00),
    subtotalCents: BigInt(6000_00),
    lineDiscountCents: BigInt(0),
    taxAmountCents: BigInt(1500_00),
    totalCents: BigInt(7500_00),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.draftOrder.findUnique.mockResolvedValue(null);
});

// ═══════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════

describe("getDraftByShareToken — input guard", () => {
  it("returns null when token is empty", async () => {
    const result = await getDraftByShareToken("", "tenant_1");
    expect(result).toBeNull();
    expect(mockPrisma.draftOrder.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when hostTenantId is empty", async () => {
    const result = await getDraftByShareToken("tok_abc", "");
    expect(result).toBeNull();
    expect(mockPrisma.draftOrder.findUnique).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Happy path
// ═══════════════════════════════════════════════════════════════

describe("getDraftByShareToken — happy path", () => {
  it("returns DTO for INVOICED draft with matching tenant", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(
      makeDraft({ lineItems: [makeLine()] }),
    );

    const result = await getDraftByShareToken("tok_abc", "tenant_1", {
      now: new Date("2026-04-26T12:00:00Z"),
    });

    expect(result).not.toBeNull();
    expect(result?.expired).toBe(false);
    expect(result?.draft.id).toBe("draft_1");
    expect(result?.draft.displayNumber).toBe("D-2026-0001");
    expect(result?.draft.status).toBe("INVOICED");
    expect(result?.draft.totalCents).toBe(BigInt(100_00));
    expect(result?.draft.lineItems).toHaveLength(1);
    expect(result?.draft.lineItems[0]?.title).toBe("Strandvilla");
    expect(result?.draft.lineItems[0]?.nights).toBe(3);
    expect(result?.draft.lineItems[0]?.checkInDate).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  it("includes paymentTerms when frozen JSON is well-formed", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(
      makeDraft({
        paymentTermsFrozen: { name: "Netto 30", type: "NET", netDays: 30 },
      }),
    );

    const result = await getDraftByShareToken("tok_abc", "tenant_1");
    expect(result?.draft.paymentTerms).toEqual({
      name: "Netto 30",
      type: "NET",
      netDays: 30,
    });
  });

  it("returns paymentTerms=null when frozen JSON is malformed", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(
      makeDraft({ paymentTermsFrozen: { name: 123 } }),
    );

    const result = await getDraftByShareToken("tok_abc", "tenant_1");
    expect(result?.draft.paymentTerms).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Cross-tenant guard
// ═══════════════════════════════════════════════════════════════

describe("getDraftByShareToken — cross-tenant guard", () => {
  it("returns null when draft.tenantId differs from hostTenantId", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(
      makeDraft({ tenantId: "tenant_other" }),
    );

    const result = await getDraftByShareToken("tok_abc", "tenant_1");
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Status gate
// ═══════════════════════════════════════════════════════════════

describe("getDraftByShareToken — status gate", () => {
  it.each(["OPEN", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"])(
    "returns null when status=%s",
    async (status) => {
      mockPrisma.draftOrder.findUnique.mockResolvedValue(makeDraft({ status }));
      const result = await getDraftByShareToken("tok_abc", "tenant_1");
      expect(result).toBeNull();
    },
  );

  it("returns DTO when status=PAID", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(
      makeDraft({ status: "PAID" }),
    );
    const result = await getDraftByShareToken("tok_abc", "tenant_1");
    expect(result?.draft.status).toBe("PAID");
    expect(result?.expired).toBe(false);
  });

  it("returns DTO when status=COMPLETED", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(
      makeDraft({ status: "COMPLETED" }),
    );
    const result = await getDraftByShareToken("tok_abc", "tenant_1");
    expect(result?.draft.status).toBe("COMPLETED");
  });
});

// ═══════════════════════════════════════════════════════════════
// Expiry
// ═══════════════════════════════════════════════════════════════

describe("getDraftByShareToken — expiry", () => {
  it("flags expired=true when shareLinkExpiresAt < now and status=INVOICED", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(
      makeDraft({
        shareLinkExpiresAt: new Date("2026-04-20T00:00:00Z"),
      }),
    );

    const result = await getDraftByShareToken("tok_abc", "tenant_1", {
      now: new Date("2026-05-01T00:00:00Z"),
    });
    expect(result).not.toBeNull();
    expect(result?.expired).toBe(true);
  });

  it("does NOT flag expired=true when status=PAID even past expiry", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(
      makeDraft({
        status: "PAID",
        shareLinkExpiresAt: new Date("2026-04-20T00:00:00Z"),
      }),
    );

    const result = await getDraftByShareToken("tok_abc", "tenant_1", {
      now: new Date("2026-05-01T00:00:00Z"),
    });
    expect(result?.expired).toBe(false);
  });

  it("flags expired=true when status=OVERDUE and link expired", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(
      makeDraft({
        status: "OVERDUE",
        shareLinkExpiresAt: new Date("2026-04-20T00:00:00Z"),
      }),
    );

    const result = await getDraftByShareToken("tok_abc", "tenant_1", {
      now: new Date("2026-05-01T00:00:00Z"),
    });
    expect(result?.expired).toBe(true);
  });

  it("does not flag expired when shareLinkExpiresAt is null", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(
      makeDraft({ shareLinkExpiresAt: null }),
    );

    const result = await getDraftByShareToken("tok_abc", "tenant_1");
    expect(result?.expired).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Not found
// ═══════════════════════════════════════════════════════════════

describe("getDraftByShareToken — not found", () => {
  it("returns null when token has no matching draft", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(null);
    const result = await getDraftByShareToken("tok_missing", "tenant_1");
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// PII redaction — internal-only fields are absent from DTO
// ═══════════════════════════════════════════════════════════════

describe("getDraftByShareToken — PII redaction", () => {
  it("does not expose internalNote or metafields", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(
      makeDraft({
        internalNote: "secret operator-only note",
        metafields: { stripePaymentIntentId: "pi_secret" },
      }),
    );

    const result = await getDraftByShareToken("tok_abc", "tenant_1");
    expect(result).not.toBeNull();
    const dto = result!.draft as unknown as Record<string, unknown>;
    expect(dto.internalNote).toBeUndefined();
    expect(dto.metafields).toBeUndefined();
  });
});
