// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DiscountCard } from "./DiscountCard";

describe("DiscountCard", () => {
  it("DC1 — empty state renders input + Tillämpa", () => {
    render(
      <DiscountCard
        appliedCode={null}
        onApply={() => {}}
        onRemove={() => {}}
        discountAmount={null}
        discountError={null}
        isApplicable={true}
      />,
    );
    expect(screen.getByText("Rabatt")).toBeTruthy();
    expect(screen.getByPlaceholderText("Rabattkod")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tillämpa" })).toBeTruthy();
  });

  it("DC2 — Tillämpa disabled when input empty", () => {
    render(
      <DiscountCard
        appliedCode={null}
        onApply={() => {}}
        onRemove={() => {}}
        discountAmount={null}
        discountError={null}
        isApplicable={true}
      />,
    );
    const btn = screen.getByRole("button", {
      name: "Tillämpa",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("DC3 — Tillämpa disabled when input is whitespace only", () => {
    render(
      <DiscountCard
        appliedCode={null}
        onApply={() => {}}
        onRemove={() => {}}
        discountAmount={null}
        discountError={null}
        isApplicable={true}
      />,
    );
    const input = screen.getByPlaceholderText(
      "Rabattkod",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    const btn = screen.getByRole("button", {
      name: "Tillämpa",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("DC4 — input has uppercase CSS class for visual normalization", () => {
    render(
      <DiscountCard
        appliedCode={null}
        onApply={() => {}}
        onRemove={() => {}}
        discountAmount={null}
        discountError={null}
        isApplicable={true}
      />,
    );
    const input = screen.getByPlaceholderText("Rabattkod");
    expect(input.className).toContain("ndr-discount-card__input");
  });

  it("DC5 — Apply normalizes via trim + toUpperCase before calling onApply", () => {
    const onApply = vi.fn();
    render(
      <DiscountCard
        appliedCode={null}
        onApply={onApply}
        onRemove={() => {}}
        discountAmount={null}
        discountError={null}
        isApplicable={true}
      />,
    );
    const input = screen.getByPlaceholderText(
      "Rabattkod",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  sommar2026  " } });
    fireEvent.click(screen.getByRole("button", { name: "Tillämpa" }));
    expect(onApply).toHaveBeenCalledWith("SOMMAR2026");
  });

  it("DC6 — Enter key submits like clicking Tillämpa", () => {
    const onApply = vi.fn();
    render(
      <DiscountCard
        appliedCode={null}
        onApply={onApply}
        onRemove={() => {}}
        discountAmount={null}
        discountError={null}
        isApplicable={true}
      />,
    );
    const input = screen.getByPlaceholderText(
      "Rabattkod",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "kod1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onApply).toHaveBeenCalledWith("KOD1");
  });

  it("DC7 — input cleared after apply", () => {
    render(
      <DiscountCard
        appliedCode={null}
        onApply={() => {}}
        onRemove={() => {}}
        discountAmount={null}
        discountError={null}
        isApplicable={true}
      />,
    );
    const input = screen.getByPlaceholderText(
      "Rabattkod",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Tillämpa" }));
    expect(input.value).toBe("");
  });

  it("DC8 — applied + isApplicable + amount>0 renders pill with formatted amount", () => {
    render(
      <DiscountCard
        appliedCode="SOMMAR2026"
        onApply={() => {}}
        onRemove={() => {}}
        discountAmount={BigInt(50000)}
        discountError={null}
        isApplicable={true}
      />,
    );
    expect(screen.getByText("SOMMAR2026")).toBeTruthy();
    expect(screen.getByText("−500 kr")).toBeTruthy();
  });

  it("DC9 — applied + isApplicable + amount=0n omits amount span", () => {
    const { container } = render(
      <DiscountCard
        appliedCode="ZERO"
        onApply={() => {}}
        onRemove={() => {}}
        discountAmount={BigInt(0)}
        discountError={null}
        isApplicable={true}
      />,
    );
    expect(screen.getByText("ZERO")).toBeTruthy();
    expect(
      container.querySelector(".ndr-discount-pill__amount"),
    ).toBeNull();
  });

  it("DC10 — applied + amount=null (pre-preview) omits amount span", () => {
    const { container } = render(
      <DiscountCard
        appliedCode="PENDING"
        onApply={() => {}}
        onRemove={() => {}}
        discountAmount={null}
        discountError={null}
        isApplicable={true}
      />,
    );
    expect(screen.getByText("PENDING")).toBeTruthy();
    expect(
      container.querySelector(".ndr-discount-pill__amount"),
    ).toBeNull();
  });

  it("DC11 — applied + invalid renders error text via role=alert, no amount", () => {
    const { container } = render(
      <DiscountCard
        appliedCode="EXPIRED"
        onApply={() => {}}
        onRemove={() => {}}
        discountAmount={BigInt(50000)}
        discountError="Koden är inte längre giltig"
        isApplicable={false}
      />,
    );
    expect(screen.getByText("EXPIRED")).toBeTruthy();
    expect(
      container.querySelector(".ndr-discount-pill__amount"),
    ).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Koden är inte längre giltig");
  });

  it("DC12 — applied + invalid pill has --invalid modifier class", () => {
    const { container } = render(
      <DiscountCard
        appliedCode="X"
        onApply={() => {}}
        onRemove={() => {}}
        discountAmount={null}
        discountError="Bad"
        isApplicable={false}
      />,
    );
    const pill = container.querySelector(".ndr-discount-pill") as HTMLElement;
    expect(pill.className).toContain("ndr-discount-pill--invalid");
  });

  it("DC13 — X-button calls onRemove", () => {
    const onRemove = vi.fn();
    render(
      <DiscountCard
        appliedCode="X"
        onApply={() => {}}
        onRemove={onRemove}
        discountAmount={null}
        discountError={null}
        isApplicable={true}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ta bort rabatt" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("DC14 — invalid + discountError=null does not render alert", () => {
    render(
      <DiscountCard
        appliedCode="X"
        onApply={() => {}}
        onRemove={() => {}}
        discountAmount={null}
        discountError={null}
        isApplicable={false}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
