import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────

const mockNotFound = vi.fn(() => {
  // Real Next.js notFound() throws — mirror that for branching tests.
  throw new Error("NEXT_NOT_FOUND");
});
const mockResolveTenantFromHost = vi.fn();
const mockGetDraftByShareToken = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));
vi.mock("@/app/(guest)/_lib/tenant/resolveTenantFromHost", () => ({
  resolveTenantFromHost: mockResolveTenantFromHost,
}));
vi.mock("@/app/_lib/draft-orders", () => ({
  getDraftByShareToken: mockGetDraftByShareToken,
}));
vi.mock("@/app/_lib/money/format", () => ({
  formatSek: (v: bigint | number) => `${String(v)} öre`,
}));
// Import the InvoiceClient only as a stub — we test it separately.
vi.mock("./InvoiceClient", () => ({
  InvoiceClient: ({ token }: { token: string }) => (
    <div data-testid="invoice-client">client:{token}</div>
  ),
}));
// Stylesheet import — vitest ignores .css by default but be explicit.
vi.mock("../invoice.css", () => ({}));

const { default: InvoicePage } = await import("./page");

// ── Fixtures ────────────────────────────────────────────────────

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    displayNumber: "D-2026-0001",
    status: "INVOICED",
    contactEmail: "buyer@example.com",
    contactPhone: null,
    contactFirstName: "Anna",
    contactLastName: "Andersson",
    customerNote: null,
    subtotalCents: BigInt(80_00),
    orderDiscountCents: BigInt(0),
    totalTaxCents: BigInt(20_00),
    totalCents: BigInt(100_00),
    currency: "SEK",
    taxesIncluded: true,
    appliedDiscountCode: null,
    appliedDiscountAmount: null,
    paymentTerms: null,
    invoiceSentAt: new Date("2026-04-25T12:00:00Z"),
    shareLinkExpiresAt: new Date("2026-05-10T12:00:00Z"),
    invoiceEmailSubject: null,
    invoiceEmailMessage: null,
    lineItems: [
      {
        id: "line_1",
        position: 0,
        lineType: "ACCOMMODATION",
        title: "Strandvilla",
        variantTitle: null,
        quantity: 1,
        unitPriceCents: BigInt(2000_00),
        subtotalCents: BigInt(6000_00),
        totalCents: BigInt(7500_00),
        checkInDate: "2026-06-01T00:00:00.000Z",
        checkOutDate: "2026-06-04T00:00:00.000Z",
        nights: 3,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveTenantFromHost.mockResolvedValue({ id: "tenant_1" });
  mockGetDraftByShareToken.mockResolvedValue({
    draft: makeDraft(),
    expired: false,
  });
});

// ═══════════════════════════════════════════════════════════════
// Branching
// ═══════════════════════════════════════════════════════════════

describe("InvoicePage — branching", () => {
  it("calls notFound when tenant unresolved", async () => {
    mockResolveTenantFromHost.mockResolvedValue(null);
    await expect(
      InvoicePage({ params: Promise.resolve({ token: "tok_abc" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound when draft not visible", async () => {
    mockGetDraftByShareToken.mockResolvedValue(null);
    await expect(
      InvoicePage({ params: Promise.resolve({ token: "tok_abc" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders ExpiredView when expired=true", async () => {
    mockGetDraftByShareToken.mockResolvedValue({
      draft: makeDraft(),
      expired: true,
    });
    const ui = await InvoicePage({
      params: Promise.resolve({ token: "tok_abc" }),
    });
    render(ui);
    expect(screen.getByText("Länken har gått ut")).toBeTruthy();
    expect(screen.queryByTestId("invoice-client")).toBeNull();
  });

  it("renders PaidView when status=PAID", async () => {
    mockGetDraftByShareToken.mockResolvedValue({
      draft: makeDraft({ status: "PAID" }),
      expired: false,
    });
    const ui = await InvoicePage({
      params: Promise.resolve({ token: "tok_abc" }),
    });
    render(ui);
    expect(screen.getByText(/Tack — fakturan är betald/)).toBeTruthy();
    expect(screen.queryByTestId("invoice-client")).toBeNull();
  });

  it("renders InvoiceClient when status=INVOICED", async () => {
    const ui = await InvoicePage({
      params: Promise.resolve({ token: "tok_abc" }),
    });
    render(ui);
    expect(screen.getByText("Faktura D-2026-0001")).toBeTruthy();
    expect(screen.getByText("Strandvilla")).toBeTruthy();
    expect(screen.getByTestId("invoice-client")).toBeTruthy();
  });

  it("renders order discount row when orderDiscountCents > 0", async () => {
    mockGetDraftByShareToken.mockResolvedValue({
      draft: makeDraft({
        orderDiscountCents: BigInt(500),
        appliedDiscountCode: "SOMMAR10",
      }),
      expired: false,
    });
    const ui = await InvoicePage({
      params: Promise.resolve({ token: "tok_abc" }),
    });
    render(ui);
    expect(screen.getByText(/SOMMAR10/)).toBeTruthy();
  });

  it("renders customer note when present", async () => {
    mockGetDraftByShareToken.mockResolvedValue({
      draft: makeDraft({ customerNote: "Tack för förfrågan!" }),
      expired: false,
    });
    const ui = await InvoicePage({
      params: Promise.resolve({ token: "tok_abc" }),
    });
    render(ui);
    expect(screen.getByText("Tack för förfrågan!")).toBeTruthy();
  });

  it("renders 'Ladda ner PDF' link with /invoice/{token}/pdf href and download attribute on INVOICED draft", async () => {
    const ui = await InvoicePage({
      params: Promise.resolve({ token: "tok_abc" }),
    });
    render(ui);
    const link = screen.getByText("Ladda ner PDF") as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/invoice/tok_abc/pdf");
    expect(link.getAttribute("download")).toBe("Faktura-D-2026-0001.pdf");
  });
});
