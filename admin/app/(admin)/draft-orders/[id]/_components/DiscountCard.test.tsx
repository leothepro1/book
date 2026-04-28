// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DiscountCard } from "./DiscountCard";

describe("DiscountCard — read-only", () => {
  it("renders empty-state when no code", () => {
    render(
      <DiscountCard
        appliedDiscountCode={null}
        appliedDiscountAmount={null}
        appliedDiscountType={null}
      />,
    );
    expect(screen.getByText("Ingen rabatt tillämpad.")).toBeTruthy();
  });

  it("renders code chip when code is set", () => {
    render(
      <DiscountCard
        appliedDiscountCode="SUMMER20"
        appliedDiscountAmount={null}
        appliedDiscountType={null}
      />,
    );
    expect(screen.getByText("SUMMER20")).toBeTruthy();
  });

  it("renders amount with negative prefix when amount is set", () => {
    render(
      <DiscountCard
        appliedDiscountCode="SUMMER20"
        appliedDiscountAmount={BigInt(5000)}
        appliedDiscountType={null}
      />,
    );
    expect(screen.getByText(/^−/)).toBeTruthy();
  });

  it("renders Procent label for PERCENTAGE type", () => {
    render(
      <DiscountCard
        appliedDiscountCode="X"
        appliedDiscountAmount={null}
        appliedDiscountType="PERCENTAGE"
      />,
    );
    expect(screen.getByText("Procent")).toBeTruthy();
  });

  it("renders Fast belopp label for FIXED_AMOUNT type", () => {
    render(
      <DiscountCard
        appliedDiscountCode="X"
        appliedDiscountAmount={null}
        appliedDiscountType="FIXED_AMOUNT"
      />,
    );
    expect(screen.getByText("Fast belopp")).toBeTruthy();
  });
});
