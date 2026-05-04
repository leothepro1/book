import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────────

const mockGetInvoiceClientSecret = vi.fn();
vi.mock("./actions", () => ({
  getInvoiceClientSecretAction: mockGetInvoiceClientSecret,
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: () => Promise.resolve({}),
}));

const mockConfirmPayment = vi.fn();
vi.mock("@stripe/react-stripe-js", () => ({
  // Pass-through providers — the inner form renders as plain children.
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({ confirmPayment: mockConfirmPayment }),
  useElements: () => ({}),
}));

const { InvoiceClient } = await import("./InvoiceClient");

const baseProps = {
  token: "tok_abc",
  displayNumber: "D-2026-0001",
  totalCents: "10000",
  currency: "SEK",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockConfirmPayment.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════
// Loading + ready
// ═══════════════════════════════════════════════════════════════

describe("InvoiceClient — load states", () => {
  it("shows loading first then ready PaymentElement", async () => {
    let resolveSecret!: (v: unknown) => void;
    mockGetInvoiceClientSecret.mockReturnValue(
      new Promise((resolve) => {
        resolveSecret = resolve as (v: unknown) => void;
      }),
    );

    render(<InvoiceClient {...baseProps} />);
    expect(screen.getByText(/Laddar betalning/)).toBeTruthy();

    resolveSecret({
      ok: true,
      clientSecret: "cs_live",
      paymentIntentId: "pi_1",
    });
    await waitFor(() =>
      expect(screen.getByTestId("payment-element")).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: /Betala fakturan/ })).toBeTruthy();
  });

  it("renders error banner when action returns ok=false", async () => {
    mockGetInvoiceClientSecret.mockResolvedValue({
      ok: false,
      code: "EXPIRED",
      message: "Faktura-länken har gått ut.",
    });

    render(<InvoiceClient {...baseProps} />);
    await waitFor(() =>
      expect(screen.getByText("Faktura-länken har gått ut.")).toBeTruthy(),
    );
    expect(screen.queryByTestId("payment-element")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// confirmPayment flow
// ═══════════════════════════════════════════════════════════════

describe("InvoiceClient — payment confirm", () => {
  it("calls confirmPayment with return_url and shows error inline", async () => {
    mockGetInvoiceClientSecret.mockResolvedValue({
      ok: true,
      clientSecret: "cs_live",
      paymentIntentId: "pi_1",
    });
    mockConfirmPayment.mockResolvedValue({
      error: { message: "Kortet avvisades." },
    });

    render(<InvoiceClient {...baseProps} />);
    await waitFor(() =>
      expect(screen.getByTestId("payment-element")).toBeTruthy(),
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /Betala fakturan/ }),
    );

    await waitFor(() =>
      expect(mockConfirmPayment).toHaveBeenCalledTimes(1),
    );
    const callArgs = mockConfirmPayment.mock.calls[0]?.[0];
    expect(callArgs?.confirmParams?.return_url).toContain(
      "/invoice/tok_abc/success",
    );

    await waitFor(() =>
      expect(screen.getByText("Kortet avvisades.")).toBeTruthy(),
    );
  });
});
