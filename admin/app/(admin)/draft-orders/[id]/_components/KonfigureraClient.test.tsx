// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { KonfigureraClient } from "./KonfigureraClient";
import type { KonfigureraClientDraft } from "./KonfigureraClient";

const minimalDraft: KonfigureraClientDraft = {
  id: "draft_1",
  displayNumber: "D-2026-0042",
  status: "OPEN",
  createdAt: new Date("2026-04-20T10:00:00Z"),
  expiresAt: new Date("2026-04-27T00:00:00Z"),
  invoiceSentAt: null,
  pricesFrozenAt: null,
  guestAccountId: null,
  companyLocationId: null,
  contactFirstName: null,
  contactLastName: null,
  contactEmail: null,
  contactPhone: null,
  appliedDiscountCode: null,
  appliedDiscountAmount: null,
  appliedDiscountType: null,
  internalNote: null,
  customerNote: null,
  tags: [],
  subtotalCents: BigInt(0),
  orderDiscountCents: BigInt(0),
  shippingCents: BigInt(0),
  totalTaxCents: BigInt(0),
  totalCents: BigInt(0),
  currency: "SEK",
  lineItems: [],
};

beforeEach(() => {
  pushMock.mockReset();
});

describe("KonfigureraClient", () => {
  it("renders header title with displayNumber + DraftBadge", () => {
    render(
      <KonfigureraClient
        draft={minimalDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.getByText("Draft D-2026-0042")).toBeTruthy();
    // Badge appears in both header and StatusCard; assert at least one renders.
    expect(screen.getAllByText("Utkast").length).toBeGreaterThanOrEqual(1);
  });

  it("renders all read-only cards including empty-states", () => {
    render(
      <KonfigureraClient
        draft={minimalDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Kund")).toBeTruthy();
    expect(screen.getByText("Rabatt")).toBeTruthy();
    expect(screen.getByText("Anteckningar")).toBeTruthy();
    expect(screen.getByText("Taggar")).toBeTruthy();
    expect(screen.getByText("Reservationer")).toBeTruthy();
    expect(screen.getByText("Bokning")).toBeTruthy();
    expect(screen.getByText("Betalning")).toBeTruthy();
    expect(screen.getByText("Inga rader.")).toBeTruthy();
    expect(screen.getByText("Ingen kund kopplad.")).toBeTruthy();
    expect(screen.getByText("Ingen rabatt tillämpad.")).toBeTruthy();
    expect(screen.getByText("Inga taggar.")).toBeTruthy();
    expect(screen.getByText("Inga reservationer.")).toBeTruthy();
  });

  it("does NOT render PaymentTermsCard when paymentTerms is null", () => {
    render(
      <KonfigureraClient
        draft={minimalDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.queryByText("Betalningsvillkor")).toBeNull();
  });

  it("renders PaymentTermsCard when paymentTerms is set (B2B)", () => {
    render(
      <KonfigureraClient
        draft={minimalDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={{
          id: "terms_1",
          name: "Net 30",
          depositPercent: 25,
          frozen: false,
        }}
      />,
    );
    expect(screen.getByText("Betalningsvillkor")).toBeTruthy();
    expect(screen.getByText("Net 30")).toBeTruthy();
  });

  it("back-button pushes to /draft-orders", () => {
    render(
      <KonfigureraClient
        draft={minimalDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByLabelText("Tillbaka till utkastorders"));
    expect(pushMock).toHaveBeenCalledWith("/draft-orders");
  });

  it("prev/next buttons are disabled when prev/next are null", () => {
    render(
      <KonfigureraClient
        draft={minimalDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(
      (screen.getByLabelText("Föregående utkast") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Nästa utkast") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("prev/next buttons navigate to /draft-orders/<id>/konfigurera when set", () => {
    render(
      <KonfigureraClient
        draft={minimalDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={{ id: "draft_prev", displayNumber: "D-2026-0041" }}
        next={{ id: "draft_next", displayNumber: "D-2026-0043" }}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByLabelText("Föregående utkast"));
    expect(pushMock).toHaveBeenLastCalledWith(
      "/draft-orders/draft_prev/konfigurera",
    );
    fireEvent.click(screen.getByLabelText("Nästa utkast"));
    expect(pushMock).toHaveBeenLastCalledWith(
      "/draft-orders/draft_next/konfigurera",
    );
  });

  it("renders Priser låsta row when pricesFrozenAt is set (informative, no banner)", () => {
    render(
      <KonfigureraClient
        draft={{
          ...minimalDraft,
          pricesFrozenAt: new Date("2026-04-22T08:00:00Z"),
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.getByText("Priser låsta")).toBeTruthy();
  });
});
