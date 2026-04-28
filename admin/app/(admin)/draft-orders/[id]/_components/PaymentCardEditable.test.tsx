// @vitest-environment jsdom

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { PaymentCardEditable } from "./PaymentCardEditable";
import type { DraftOrderStatus } from "@prisma/client";

let onSendInvoice: Mock<() => void>;
let onMarkAsPaid: Mock<() => void>;
let writeTextMock: Mock<(text: string) => Promise<void>>;
let originalClipboard: Clipboard | undefined;

type DraftFixture = Parameters<typeof PaymentCardEditable>[0]["draft"];

function buildDraft(overrides: Partial<DraftFixture> = {}): DraftFixture {
  return {
    id: "d_1",
    status: "OPEN" as DraftOrderStatus,
    subtotalCents: BigInt(100000),
    orderDiscountCents: BigInt(0),
    shippingCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(100000),
    currency: "SEK",
    guestAccountId: "guest_1",
    contactEmail: "anna@example.com",
    invoiceUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  onSendInvoice = vi.fn();
  onMarkAsPaid = vi.fn();
  writeTextMock = vi.fn().mockResolvedValue(undefined);
  originalClipboard = navigator.clipboard;
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
});

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  }
});

describe("PaymentCardEditable — status routing", () => {
  it("OPEN + customer + email → 'Skicka faktura' enabled", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({ status: "OPEN" })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    const btn = screen.getByText("Skicka faktura") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("OPEN + no customer → disabled, tooltip 'Lägg till kund först'", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({ guestAccountId: null, contactEmail: null })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    const btn = screen.getByText("Skicka faktura") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toBe("Lägg till kund först");
  });

  it("OPEN + customer but no email → disabled, tooltip 'Kunden saknar e-postadress'", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({ contactEmail: null })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    const btn = screen.getByText("Skicka faktura") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toBe("Kunden saknar e-postadress");
  });

  it("OPEN + customer + customerEmail fallback (no contactEmail) → enabled", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({ contactEmail: null })}
        customerEmail="lookup@example.com"
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    const btn = screen.getByText("Skicka faktura") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("APPROVED → 'Skicka faktura' visible", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({ status: "APPROVED" })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    expect(screen.getByText("Skicka faktura")).toBeTruthy();
  });

  it("INVOICED + invoiceUrl → 'Markera som betald' + 'Kopiera fakturalänk'", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({
          status: "INVOICED",
          invoiceUrl: "https://x/invoice/abc",
        })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    expect(screen.getByText("Markera som betald")).toBeTruthy();
    expect(screen.getByText("Kopiera fakturalänk")).toBeTruthy();
  });

  it("INVOICED + no invoiceUrl → only 'Markera som betald'", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({ status: "INVOICED", invoiceUrl: null })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    expect(screen.getByText("Markera som betald")).toBeTruthy();
    expect(screen.queryByText("Kopiera fakturalänk")).toBeNull();
  });

  it("OVERDUE same as INVOICED", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({
          status: "OVERDUE",
          invoiceUrl: "https://x/invoice/abc",
        })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    expect(screen.getByText("Markera som betald")).toBeTruthy();
    expect(screen.getByText("Kopiera fakturalänk")).toBeTruthy();
  });

  it("PAID → 'Konverterar till order...' text, no buttons", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({ status: "PAID" })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    expect(screen.getByText(/Konverterar till order/)).toBeTruthy();
    expect(screen.queryByText("Skicka faktura")).toBeNull();
    expect(screen.queryByText("Markera som betald")).toBeNull();
  });

  it("COMPLETING → 'Genomförs...' text", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({ status: "COMPLETING" })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    expect(screen.getByText(/Genomförs/)).toBeTruthy();
  });

  for (const status of ["COMPLETED", "CANCELLED", "REJECTED"] as const) {
    it(`${status} → no actions, no processing-text`, () => {
      render(
        <PaymentCardEditable
          draft={buildDraft({ status })}
          customerEmail={null}
          onSendInvoice={onSendInvoice}
          onMarkAsPaid={onMarkAsPaid}
        />,
      );
      expect(screen.queryByText("Skicka faktura")).toBeNull();
      expect(screen.queryByText("Markera som betald")).toBeNull();
      expect(screen.queryByText(/Konverterar/)).toBeNull();
      expect(screen.queryByText(/Genomförs/)).toBeNull();
    });
  }

  it("PENDING_APPROVAL → no actions (B2B OOS)", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({ status: "PENDING_APPROVAL" })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    expect(screen.queryByText("Skicka faktura")).toBeNull();
    expect(screen.queryByText("Markera som betald")).toBeNull();
  });
});

describe("PaymentCardEditable — actions", () => {
  it("click 'Skicka faktura' → onSendInvoice called", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({ status: "OPEN" })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    fireEvent.click(screen.getByText("Skicka faktura"));
    expect(onSendInvoice).toHaveBeenCalled();
  });

  it("click 'Markera som betald' → onMarkAsPaid called", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({ status: "INVOICED" })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    fireEvent.click(screen.getByText("Markera som betald"));
    expect(onMarkAsPaid).toHaveBeenCalled();
  });

  it("click 'Kopiera fakturalänk' → clipboard.writeText called + 'Kopierat!'", async () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({
          status: "INVOICED",
          invoiceUrl: "https://x/invoice/abc",
        })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    fireEvent.click(screen.getByText("Kopiera fakturalänk"));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("https://x/invoice/abc");
    });
    await waitFor(() => {
      expect(screen.getByText("Kopierat!")).toBeTruthy();
    });
  });

  it("after 2000ms, 'Kopierat!' reverts to 'Kopiera fakturalänk'", async () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({
          status: "INVOICED",
          invoiceUrl: "https://x/invoice/abc",
        })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    fireEvent.click(screen.getByText("Kopiera fakturalänk"));
    await waitFor(() => {
      expect(screen.getByText("Kopierat!")).toBeTruthy();
    });
    // 2500ms timeout > 2000ms reset timer
    await waitFor(
      () => {
        expect(screen.getByText("Kopiera fakturalänk")).toBeTruthy();
      },
      { timeout: 2500 },
    );
  });
});

describe("PaymentCardEditable — totals layout", () => {
  it("renders subtotal + total always; conditional rows only when > 0", () => {
    render(
      <PaymentCardEditable
        draft={buildDraft({
          subtotalCents: BigInt(100000),
          orderDiscountCents: BigInt(5000),
          shippingCents: BigInt(0),
          totalTaxCents: BigInt(2500),
          totalCents: BigInt(97500),
        })}
        customerEmail={null}
        onSendInvoice={onSendInvoice}
        onMarkAsPaid={onMarkAsPaid}
      />,
    );
    expect(screen.getByText("Delsumma")).toBeTruthy();
    expect(screen.getByText("Rabatt")).toBeTruthy();
    expect(screen.queryByText("Frakt")).toBeNull();
    expect(screen.getByText("Moms")).toBeTruthy();
    expect(screen.getByText("Totalt")).toBeTruthy();
  });
});
