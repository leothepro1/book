// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PreviewResult } from "@/app/_lib/draft-orders";
import { PricingSummaryCard } from "./PricingSummaryCard";

const PREVIEW_BASIC: PreviewResult = {
  subtotal: BigInt(125000),
  discountAmount: BigInt(0),
  taxAmount: BigInt(15000),
  total: BigInt(140000),
  currency: "SEK",
  lineBreakdown: [
    {
      lineIndex: 0,
      accommodationId: "a1",
      nights: 2,
      pricePerNight: BigInt(62500),
      lineSubtotal: BigInt(125000),
      addonsTotal: BigInt(0),
    },
  ],
  discountApplicable: false,
};

const PREVIEW_WITH_DISCOUNT: PreviewResult = {
  ...PREVIEW_BASIC,
  discountAmount: BigInt(25000),
  total: BigInt(115000),
  discountApplicable: true,
};

const EMPTY_RESULT: PreviewResult = {
  subtotal: BigInt(0),
  discountAmount: BigInt(0),
  taxAmount: BigInt(0),
  total: BigInt(0),
  currency: "SEK",
  lineBreakdown: [],
  discountApplicable: false,
};

describe("PricingSummaryCard", () => {
  it("PS1 — placeholder when hasLines=false", () => {
    render(
      <PricingSummaryCard
        preview={null}
        isLoading={false}
        hasLines={false}
        error={null}
      />,
    );
    expect(
      screen.getByText("Lägg till boende för att se totalsumma"),
    ).toBeTruthy();
  });

  it("PS2 — placeholder when hasLines=true but preview=null (pre-fetch)", () => {
    render(
      <PricingSummaryCard
        preview={null}
        isLoading={false}
        hasLines={true}
        error={null}
      />,
    );
    expect(
      screen.getByText("Lägg till boende för att se totalsumma"),
    ).toBeTruthy();
  });

  it("PS3 — error banner takes priority over placeholder", () => {
    render(
      <PricingSummaryCard
        preview={null}
        isLoading={false}
        hasLines={false}
        error="Networkfel"
      />,
    );
    expect(screen.getByText("Networkfel")).toBeTruthy();
    expect(
      screen.queryByText("Lägg till boende för att se totalsumma"),
    ).toBeNull();
  });

  it("PS4 — renders subtotal/tax/total when preview loaded, no discount row", () => {
    render(
      <PricingSummaryCard
        preview={PREVIEW_BASIC}
        isLoading={false}
        hasLines={true}
        error={null}
      />,
    );
    expect(screen.getByText("Delsumma")).toBeTruthy();
    expect(screen.getByText("Moms")).toBeTruthy();
    expect(screen.getByText("Totalt")).toBeTruthy();
    expect(screen.queryByText("Rabatt")).toBeNull();
    expect(screen.getByText("1 250 kr")).toBeTruthy();
    expect(screen.getByText("150 kr")).toBeTruthy();
    expect(screen.getByText("1 400 kr")).toBeTruthy();
  });

  it("PS5 — renders discount row when discountApplicable=true && amount>0", () => {
    render(
      <PricingSummaryCard
        preview={PREVIEW_WITH_DISCOUNT}
        isLoading={false}
        hasLines={true}
        error={null}
      />,
    );
    expect(screen.getByText("Rabatt")).toBeTruthy();
    expect(screen.getByText("−250 kr")).toBeTruthy();
    expect(screen.getByText("1 150 kr")).toBeTruthy();
  });

  it("PS6 — omits discount row when discountAmount=0n even if applicable", () => {
    render(
      <PricingSummaryCard
        preview={{ ...PREVIEW_WITH_DISCOUNT, discountAmount: BigInt(0) }}
        isLoading={false}
        hasLines={true}
        error={null}
      />,
    );
    expect(screen.queryByText("Rabatt")).toBeNull();
  });

  it("PS7 — omits tax row when taxAmount=0n", () => {
    render(
      <PricingSummaryCard
        preview={{ ...PREVIEW_BASIC, taxAmount: BigInt(0) }}
        isLoading={false}
        hasLines={true}
        error={null}
      />,
    );
    expect(screen.queryByText("Moms")).toBeNull();
    expect(screen.getByText("Delsumma")).toBeTruthy();
    expect(screen.getByText("Totalt")).toBeTruthy();
  });

  it("PS8 — aria-busy=true when isLoading", () => {
    const { container } = render(
      <PricingSummaryCard
        preview={PREVIEW_BASIC}
        isLoading={true}
        hasLines={true}
        error={null}
      />,
    );
    const ariaBusy = container.querySelector("[aria-busy='true']");
    expect(ariaBusy).toBeTruthy();
  });

  it("PS9 — aria-busy=false when not loading", () => {
    const { container } = render(
      <PricingSummaryCard
        preview={PREVIEW_BASIC}
        isLoading={false}
        hasLines={true}
        error={null}
      />,
    );
    const ariaBusy = container.querySelector("[aria-busy='false']");
    expect(ariaBusy).toBeTruthy();
  });

  it("PS10 — loading-class applied when isLoading", () => {
    const { container } = render(
      <PricingSummaryCard
        preview={PREVIEW_BASIC}
        isLoading={true}
        hasLines={true}
        error={null}
      />,
    );
    expect(container.querySelector(".ndr-pricing--loading")).toBeTruthy();
  });

  it("PS11 — cross-tenant fail-closed (lineBreakdown=[] with hasLines=true) shows error", () => {
    render(
      <PricingSummaryCard
        preview={EMPTY_RESULT}
        isLoading={false}
        hasLines={true}
        error={null}
      />,
    );
    expect(screen.getByText("Kunde inte beräkna totaler")).toBeTruthy();
    expect(screen.queryByText("Delsumma")).toBeNull();
  });

  it("PS12 — explicit error takes priority over cross-tenant guard", () => {
    render(
      <PricingSummaryCard
        preview={EMPTY_RESULT}
        isLoading={false}
        hasLines={true}
        error="Custom error"
      />,
    );
    expect(screen.getByText("Custom error")).toBeTruthy();
    expect(screen.queryByText("Kunde inte beräkna totaler")).toBeNull();
  });

  it("PS13 — bigint amounts formatted via formatSek", () => {
    render(
      <PricingSummaryCard
        preview={{
          subtotal: BigInt(99950),
          discountAmount: BigInt(0),
          taxAmount: BigInt(0),
          total: BigInt(99950),
          currency: "SEK",
          lineBreakdown: [
            {
              lineIndex: 0,
              accommodationId: "a1",
              nights: 1,
              pricePerNight: BigInt(99950),
              lineSubtotal: BigInt(99950),
              addonsTotal: BigInt(0),
            },
          ],
          discountApplicable: false,
        }}
        isLoading={false}
        hasLines={true}
        error={null}
      />,
    );
    // 99950 ören = 999,50 kr (formatSek output for non-round amount)
    expect(screen.getAllByText("999,50 kr").length).toBeGreaterThan(0);
  });
});
