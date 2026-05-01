/**
 * Phase F — `resolve-token` test suite.
 *
 *   - `classifyTokenState`: pure-function tests covering all 6
 *     forks of the v1.3 §7.2 decision tree, plus the three
 *     defensive `not_found` cases (token unresolved, draft never
 *     invoiced, paid-without-completedOrderId).
 *   - `resolveDraftByToken`: light Prisma mocking — only the
 *     three observable outcomes (matching tenant, mismatched
 *     tenant, missing token).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock surface ───────────────────────────────────────────────

const mockPrisma = {
  draftOrder: { findUnique: vi.fn() },
};

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: mockPrisma }));

const { resolveDraftByToken, classifyTokenState } = await import(
  "./resolve-token"
);
type DraftForToken = Awaited<ReturnType<typeof resolveDraftByToken>>;

// ── Fixtures ───────────────────────────────────────────────────

function makeDraft(over: Record<string, unknown> = {}): NonNullable<DraftForToken> {
  // Cast through unknown — the test fixture only populates the
  // fields the classifier reads. The full Prisma row is wider.
  return {
    id: "draft_1",
    tenantId: "tenant_1",
    status: "INVOICED",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    completedOrderId: null,
    lineItems: [],
    activeSessions: [],
    ...over,
  } as unknown as NonNullable<DraftForToken>;
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ═══════════════════════════════════════════════════════════════
// classifyTokenState — pure-function decision tree
// ═══════════════════════════════════════════════════════════════

describe("classifyTokenState — not_found defensive cases", () => {
  it("returns not_found when draft is null (token did not resolve)", () => {
    expect(classifyTokenState(null, new Date())).toEqual({
      kind: "not_found",
    });
  });

  it("returns not_found when draft is in OPEN", () => {
    const draft = makeDraft({ status: "OPEN" });
    expect(classifyTokenState(draft, new Date())).toEqual({
      kind: "not_found",
    });
  });

  it("returns not_found when draft is in PENDING_APPROVAL", () => {
    const draft = makeDraft({ status: "PENDING_APPROVAL" });
    expect(classifyTokenState(draft, new Date())).toEqual({
      kind: "not_found",
    });
  });

  it("returns not_found when draft is in APPROVED", () => {
    const draft = makeDraft({ status: "APPROVED" });
    expect(classifyTokenState(draft, new Date())).toEqual({
      kind: "not_found",
    });
  });

  it("returns not_found when draft is in REJECTED", () => {
    const draft = makeDraft({ status: "REJECTED" });
    expect(classifyTokenState(draft, new Date())).toEqual({
      kind: "not_found",
    });
  });

  it("returns not_found for PAID without completedOrderId (impossible state)", () => {
    const draft = makeDraft({ status: "PAID", completedOrderId: null });
    expect(classifyTokenState(draft, new Date())).toEqual({
      kind: "not_found",
    });
  });
});

describe("classifyTokenState — terminal states", () => {
  it("returns cancelled for CANCELLED drafts", () => {
    const draft = makeDraft({ status: "CANCELLED" });
    const result = classifyTokenState(draft, new Date());
    expect(result.kind).toBe("cancelled");
    if (result.kind === "cancelled") expect(result.draft).toBe(draft);
  });

  it("returns paid for PAID drafts with completedOrderId", () => {
    const draft = makeDraft({
      status: "PAID",
      completedOrderId: "order_paid",
    });
    const result = classifyTokenState(draft, new Date());
    expect(result.kind).toBe("paid");
    if (result.kind === "paid") expect(result.orderId).toBe("order_paid");
  });

  it("returns paid for COMPLETING drafts with completedOrderId", () => {
    const draft = makeDraft({
      status: "COMPLETING",
      completedOrderId: "order_completing",
    });
    const result = classifyTokenState(draft, new Date());
    expect(result.kind).toBe("paid");
    if (result.kind === "paid")
      expect(result.orderId).toBe("order_completing");
  });

  it("returns paid for COMPLETED drafts with completedOrderId", () => {
    const draft = makeDraft({
      status: "COMPLETED",
      completedOrderId: "order_completed",
    });
    const result = classifyTokenState(draft, new Date());
    expect(result.kind).toBe("paid");
    if (result.kind === "paid")
      expect(result.orderId).toBe("order_completed");
  });
});

describe("classifyTokenState — expired forks", () => {
  it("returns expired for OVERDUE drafts (invariant 15)", () => {
    const draft = makeDraft({ status: "OVERDUE" });
    const result = classifyTokenState(draft, new Date());
    expect(result.kind).toBe("expired");
  });

  it("returns expired when INVOICED draft.expiresAt <= now", () => {
    const past = new Date(Date.now() - 1000);
    const draft = makeDraft({ status: "INVOICED", expiresAt: past });
    const result = classifyTokenState(draft, new Date());
    expect(result.kind).toBe("expired");
  });

  it("expired wins over resume — INVOICED + expiresAt past + active session", () => {
    const past = new Date(Date.now() - 1000);
    const draft = makeDraft({
      status: "INVOICED",
      expiresAt: past,
      activeSessions: [{ id: "ses_active" }],
    });
    const result = classifyTokenState(draft, new Date());
    expect(result.kind).toBe("expired");
  });
});

describe("classifyTokenState — INVOICED happy paths", () => {
  it("returns fresh when INVOICED, expiresAt in future, no active session", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const draft = makeDraft({
      status: "INVOICED",
      expiresAt: future,
      activeSessions: [],
    });
    const result = classifyTokenState(draft, new Date());
    expect(result.kind).toBe("fresh");
  });

  it("returns resume with activeSessionId when an ACTIVE session exists", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const draft = makeDraft({
      status: "INVOICED",
      expiresAt: future,
      activeSessions: [{ id: "ses_existing" }],
    });
    const result = classifyTokenState(draft, new Date());
    expect(result.kind).toBe("resume");
    if (result.kind === "resume") {
      expect(result.activeSessionId).toBe("ses_existing");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// resolveDraftByToken — DB loader
// ═══════════════════════════════════════════════════════════════

describe("resolveDraftByToken", () => {
  it("returns the draft when token resolves and tenantId matches", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue({
      id: "draft_1",
      tenantId: "tenant_1",
      status: "INVOICED",
      expiresAt: new Date(),
      completedOrderId: null,
      lineItems: [],
      draftCheckoutSessions: [{ id: "ses_active" }],
    });

    const result = await resolveDraftByToken("token_x", "tenant_1");

    expect(result).not.toBeNull();
    if (result) {
      expect(result.id).toBe("draft_1");
      expect(result.activeSessions).toEqual([{ id: "ses_active" }]);
      // Ensure the schema field name is masked from callers.
      expect(
        (result as unknown as Record<string, unknown>).draftCheckoutSessions,
      ).toBeUndefined();
    }
  });

  it("returns null when token resolves to a draft in a different tenant", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue({
      id: "draft_other",
      tenantId: "tenant_other",
      status: "INVOICED",
      expiresAt: new Date(),
      completedOrderId: null,
      lineItems: [],
      draftCheckoutSessions: [],
    });

    const result = await resolveDraftByToken("token_y", "tenant_1");
    expect(result).toBeNull();
  });

  it("returns null when token does not resolve", async () => {
    mockPrisma.draftOrder.findUnique.mockResolvedValue(null);

    const result = await resolveDraftByToken("token_unknown", "tenant_1");
    expect(result).toBeNull();
  });
});
