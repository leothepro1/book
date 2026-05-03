import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const mockResolveTenantFromHost = vi.fn();
const mockGetDraftByShareToken = vi.fn();

vi.mock("next/navigation", () => ({ notFound: mockNotFound }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
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
vi.mock("../../invoice.css", () => ({}));

const { default: SuccessPage } = await import("./page");

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft_1",
    displayNumber: "D-2026-0001",
    status: "PAID",
    totalCents: BigInt(100_00),
    currency: "SEK",
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

describe("InvoiceSuccessPage", () => {
  it("calls notFound when tenant unresolved", async () => {
    mockResolveTenantFromHost.mockResolvedValue(null);
    await expect(
      SuccessPage({ params: Promise.resolve({ token: "tok_abc" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders success message when status=PAID", async () => {
    const ui = await SuccessPage({
      params: Promise.resolve({ token: "tok_abc" }),
    });
    render(ui);
    expect(screen.getByText("Tack — fakturan är betald")).toBeTruthy();
  });

  it("renders pending message when status still INVOICED (webhook race)", async () => {
    mockGetDraftByShareToken.mockResolvedValue({
      draft: makeDraft({ status: "INVOICED" }),
      expired: false,
    });
    const ui = await SuccessPage({
      params: Promise.resolve({ token: "tok_abc" }),
    });
    render(ui);
    expect(screen.getByText("Betalningen bekräftas")).toBeTruthy();
  });
});
