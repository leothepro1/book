import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicDraftDTO } from "@/app/_lib/draft-orders";

// ── Mocks ────────────────────────────────────────────────────────

const mockResolveTenantFromHost = vi.fn();
const mockGetDraftByShareToken = vi.fn();
const mockRenderInvoicePdf = vi.fn();
const mockTenantFindUnique = vi.fn();

vi.mock("@/app/(guest)/_lib/tenant/resolveTenantFromHost", () => ({
  resolveTenantFromHost: mockResolveTenantFromHost,
}));

vi.mock("@/app/_lib/draft-orders", () => ({
  getDraftByShareToken: mockGetDraftByShareToken,
  renderInvoicePdf: mockRenderInvoicePdf,
}));

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenant: { findUnique: mockTenantFindUnique },
  },
}));

const { GET } = await import("./route");

// ── Fixtures ────────────────────────────────────────────────────

function makeDraft(overrides: Partial<PublicDraftDTO> = {}): PublicDraftDTO {
  return {
    id: "draft_1",
    displayNumber: "D-2026-0001",
    status: "INVOICED",
    contactEmail: "buyer@example.com",
    contactPhone: null,
    contactFirstName: "Anna",
    contactLastName: "Andersson",
    customerNote: null,
    subtotalCents: BigInt(7500_00),
    orderDiscountCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(7500_00),
    currency: "SEK",
    taxesIncluded: true,
    appliedDiscountCode: null,
    appliedDiscountAmount: null,
    paymentTerms: null,
    invoiceSentAt: new Date("2026-04-25T12:00:00Z"),
    shareLinkExpiresAt: new Date("2026-05-10T12:00:00Z"),
    invoiceEmailSubject: null,
    invoiceEmailMessage: null,
    lineItems: [],
    ...overrides,
  };
}

const PDF_MAGIC_BUFFER = Buffer.from(
  "%PDF-1.7\n%fixture\n",
  "latin1",
);

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveTenantFromHost.mockResolvedValue({
    id: "tenant_1",
    name: "Acme Hotell",
  });
  mockGetDraftByShareToken.mockResolvedValue({
    draft: makeDraft(),
    expired: false,
  });
  mockTenantFindUnique.mockResolvedValue({
    name: "Acme Hotell",
    settings: { property: { address: "Storgatan 1" } },
  });
  mockRenderInvoicePdf.mockResolvedValue(PDF_MAGIC_BUFFER);
});

function makeContext(token = "tok_abc") {
  return { params: Promise.resolve({ token }) };
}

// ── Tests ───────────────────────────────────────────────────────

describe("GET /invoice/[token]/pdf", () => {
  it("404 when tenant cannot be resolved from host", async () => {
    mockResolveTenantFromHost.mockResolvedValueOnce(null);

    const res = await GET(new Request("https://example.com/x"), makeContext());

    expect(res.status).toBe(404);
    expect(mockGetDraftByShareToken).not.toHaveBeenCalled();
    expect(mockRenderInvoicePdf).not.toHaveBeenCalled();
  });

  it("404 when getDraftByShareToken returns null (cross-tenant or missing token)", async () => {
    mockGetDraftByShareToken.mockResolvedValueOnce(null);

    const res = await GET(new Request("https://example.com/x"), makeContext());

    expect(res.status).toBe(404);
    expect(mockRenderInvoicePdf).not.toHaveBeenCalled();
  });

  it("410 when share link expired AND status === 'INVOICED'", async () => {
    mockGetDraftByShareToken.mockResolvedValueOnce({
      draft: makeDraft({ status: "INVOICED" }),
      expired: true,
    });

    const res = await GET(new Request("https://example.com/x"), makeContext());

    expect(res.status).toBe(410);
    expect(mockRenderInvoicePdf).not.toHaveBeenCalled();
  });

  it("200 with correct Content-Type and Content-Disposition on happy path", async () => {
    const res = await GET(new Request("https://example.com/x"), makeContext());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^inline; filename="Faktura-D-2026-0001\.pdf"$/,
    );
    expect(res.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate",
    );
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");

    // Body is the PDF buffer.
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // Renderer received the right inputs.
    expect(mockRenderInvoicePdf).toHaveBeenCalledTimes(1);
    const args = mockRenderInvoicePdf.mock.calls[0][0];
    expect(args.tenantName).toBe("Acme Hotell");
    expect(args.tenantAddress).toBe("Storgatan 1");
    expect(args.draft.displayNumber).toBe("D-2026-0001");
  });

  it("200 (NOT 410) when status === 'PAID' AND expired === true (informational PDF)", async () => {
    mockGetDraftByShareToken.mockResolvedValueOnce({
      draft: makeDraft({ status: "PAID" }),
      expired: true,
    });

    const res = await GET(new Request("https://example.com/x"), makeContext());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(mockRenderInvoicePdf).toHaveBeenCalledTimes(1);
  });

  it("extracts brandColor from tenant.settings.theme.colors.buttonBg defensively", async () => {
    mockTenantFindUnique.mockResolvedValueOnce({
      name: "Acme Hotell",
      settings: {
        property: { address: "Storgatan 1" },
        theme: { colors: { buttonBg: "#8B3DFF" } },
      },
    });

    await GET(new Request("https://example.com/x"), makeContext());

    const args = mockRenderInvoicePdf.mock.calls[0][0];
    expect(args.brandColor).toBe("#8B3DFF");
  });

  it("tolerates missing tenant settings (no address, no brandColor)", async () => {
    mockTenantFindUnique.mockResolvedValueOnce({
      name: "Bare Tenant",
      settings: null,
    });

    const res = await GET(new Request("https://example.com/x"), makeContext());

    expect(res.status).toBe(200);
    const args = mockRenderInvoicePdf.mock.calls[0][0];
    expect(args.tenantName).toBe("Bare Tenant");
    expect(args.tenantAddress).toBeUndefined();
    expect(args.brandColor).toBeUndefined();
  });
});
