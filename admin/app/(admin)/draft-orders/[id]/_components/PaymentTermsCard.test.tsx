// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PaymentTermsCard } from "./PaymentTermsCard";

describe("PaymentTermsCard — read-only B2B", () => {
  it("renders name when set", () => {
    render(
      <PaymentTermsCard
        paymentTermsId="terms_1"
        name="Net 30"
        depositPercent={null}
        frozen={false}
      />,
    );
    expect(screen.getByText("Net 30")).toBeTruthy();
  });

  it("falls back to id when name is null", () => {
    render(
      <PaymentTermsCard
        paymentTermsId="terms_1"
        name={null}
        depositPercent={null}
        frozen={false}
      />,
    );
    expect(screen.getByText("terms_1")).toBeTruthy();
  });

  it("hides Deposition row when depositPercent is null", () => {
    render(
      <PaymentTermsCard
        paymentTermsId="terms_1"
        name="X"
        depositPercent={null}
        frozen={false}
      />,
    );
    expect(screen.queryByText("Deposition")).toBeNull();
  });

  it("shows Deposition with formatted percent when set", () => {
    render(
      <PaymentTermsCard
        paymentTermsId="terms_1"
        name="X"
        depositPercent={12.5}
        frozen={false}
      />,
    );
    expect(screen.getByText("Deposition")).toBeTruthy();
    expect(screen.getByText(/12,5/)).toBeTruthy();
  });

  it("shows Låst badge when frozen", () => {
    render(
      <PaymentTermsCard
        paymentTermsId="terms_1"
        name="X"
        depositPercent={null}
        frozen={true}
      />,
    );
    expect(screen.getByText("Låst")).toBeTruthy();
  });

  it("hides Status row when not frozen", () => {
    render(
      <PaymentTermsCard
        paymentTermsId="terms_1"
        name="X"
        depositPercent={null}
        frozen={false}
      />,
    );
    expect(screen.queryByText("Låst")).toBeNull();
  });
});
