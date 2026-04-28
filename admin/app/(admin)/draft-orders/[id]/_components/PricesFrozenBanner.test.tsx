// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PricesFrozenBanner } from "./PricesFrozenBanner";

describe("PricesFrozenBanner", () => {
  it("renders the lock copy", () => {
    render(<PricesFrozenBanner />);
    expect(
      screen.getByText(
        /Priserna är låsta sedan fakturan skickades\. Rader och rabatt kan inte ändras\./,
      ),
    ).toBeTruthy();
  });

  it("uses role=status for screen-reader announcement", () => {
    render(<PricesFrozenBanner />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("decorative icon has aria-hidden", () => {
    const { container } = render(<PricesFrozenBanner />);
    const icon = container.querySelector(".pf-info-banner__icon");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });
});
