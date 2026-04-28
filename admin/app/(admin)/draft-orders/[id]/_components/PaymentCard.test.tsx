// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PaymentCard } from "./PaymentCard";

const baseDraft = {
  subtotalCents: BigInt(100000),
  orderDiscountCents: BigInt(0),
  shippingCents: BigInt(0),
  totalTaxCents: BigInt(0),
  totalCents: BigInt(100000),
  currency: "SEK",
};

describe("PaymentCard — read-only summary", () => {
  it("renders Delsumma + Totalt always", () => {
    render(<PaymentCard draft={baseDraft} />);
    expect(screen.getByText("Delsumma")).toBeTruthy();
    expect(screen.getByText("Totalt")).toBeTruthy();
  });

  it("hides Rabatt when orderDiscountCents is 0", () => {
    render(<PaymentCard draft={baseDraft} />);
    expect(screen.queryByText("Rabatt")).toBeNull();
  });

  it("shows Rabatt when orderDiscountCents > 0", () => {
    render(
      <PaymentCard
        draft={{ ...baseDraft, orderDiscountCents: BigInt(5000) }}
      />,
    );
    expect(screen.getByText("Rabatt")).toBeTruthy();
    expect(screen.getByText(/^−/)).toBeTruthy();
  });

  it("hides Frakt + Moms when their cents are 0", () => {
    render(<PaymentCard draft={baseDraft} />);
    expect(screen.queryByText("Frakt")).toBeNull();
    expect(screen.queryByText("Moms")).toBeNull();
  });

  it("shows Frakt + Moms when their cents are > 0", () => {
    render(
      <PaymentCard
        draft={{
          ...baseDraft,
          shippingCents: BigInt(5000),
          totalTaxCents: BigInt(2500),
        }}
      />,
    );
    expect(screen.getByText("Frakt")).toBeTruthy();
    expect(screen.getByText("Moms")).toBeTruthy();
  });

  it("renders total amount in SEK", () => {
    render(<PaymentCard draft={baseDraft} />);
    expect(screen.getAllByText("1 000 kr").length).toBeGreaterThan(0);
  });
});
