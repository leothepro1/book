// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DraftLineItem } from "@prisma/client";

import { LineItemsCard } from "./LineItemsCard";

function buildLine(overrides: Partial<DraftLineItem> = {}): DraftLineItem {
  return {
    id: "l_1",
    tenantId: "t",
    draftOrderId: "d",
    lineType: "ACCOMMODATION",
    position: 0,
    accommodationId: "a",
    checkInDate: new Date("2026-05-12"),
    checkOutDate: new Date("2026-05-15"),
    nights: 3,
    guestCounts: null,
    ratePlanId: null,
    ratePlanName: null,
    ratePlanCancellationPolicy: null,
    selectedAddons: null,
    productVariantId: null,
    productId: null,
    variantTitle: null,
    sku: null,
    imageUrl: null,
    taxable: true,
    taxCode: null,
    title: "Cozy Cabin",
    quantity: 2,
    unitPriceCents: BigInt(150000),
    subtotalCents: BigInt(300000),
    lineDiscountCents: BigInt(0),
    taxAmountCents: BigInt(0),
    totalCents: BigInt(300000),
    appliedCatalogId: null,
    appliedRule: null,
    lineDiscountTitle: null,
    lineDiscountType: null,
    lineDiscountValue: null,
    attributes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("LineItemsCard — read-only", () => {
  it("renders empty-state when no lines", () => {
    render(<LineItemsCard lines={[]} />);
    expect(screen.getByText("Inga rader.")).toBeTruthy();
  });

  it("renders table headers", () => {
    render(<LineItemsCard lines={[buildLine()]} />);
    expect(screen.getByText("Boende")).toBeTruthy();
    expect(screen.getByText("Datum")).toBeTruthy();
    expect(screen.getByText("Antal")).toBeTruthy();
    expect(screen.getByText("À pris")).toBeTruthy();
    expect(screen.getByText("Total")).toBeTruthy();
  });

  it("renders one row per line with title + quantity + unit + total", () => {
    render(<LineItemsCard lines={[buildLine()]} />);
    expect(screen.getByText("Cozy Cabin")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("1 500 kr")).toBeTruthy();
    expect(screen.getByText("3 000 kr")).toBeTruthy();
  });

  it("renders em-dash for date column when no checkInDate/checkOutDate (PRODUCT/CUSTOM line)", () => {
    render(
      <LineItemsCard
        lines={[
          buildLine({
            lineType: "PRODUCT",
            checkInDate: null,
            checkOutDate: null,
          }),
        ]}
      />,
    );
    expect(screen.getByText("—")).toBeTruthy();
  });
});
