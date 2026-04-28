// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  DraftHoldState,
  DraftLineItem,
  DraftReservation,
} from "@prisma/client";

import { HoldsCard } from "./HoldsCard";

function buildLine(overrides: Partial<DraftLineItem> = {}): DraftLineItem {
  return {
    id: "line_1",
    tenantId: "tenant_1",
    draftOrderId: "draft_1",
    lineType: "ACCOMMODATION",
    position: 0,
    accommodationId: "acc_1",
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
    quantity: 1,
    unitPriceCents: BigInt(100000),
    subtotalCents: BigInt(100000),
    lineDiscountCents: BigInt(0),
    taxAmountCents: BigInt(0),
    totalCents: BigInt(100000),
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

function buildReservation(
  overrides: Partial<DraftReservation> = {},
): DraftReservation {
  return {
    id: "res_1",
    tenantId: "tenant_1",
    draftOrderId: "draft_1",
    draftLineItemId: "line_1",
    accommodationId: "acc_1",
    ratePlanId: null,
    checkInDate: new Date("2026-05-12"),
    checkOutDate: new Date("2026-05-15"),
    guestCounts: { adults: 2 },
    holdExternalId: null,
    holdExpiresAt: null,
    holdState: "PLACED" as DraftHoldState,
    holdLastAttemptAt: null,
    holdLastError: null,
    holdIdempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("HoldsCard — read-only", () => {
  it("renders empty-state when no reservations", () => {
    render(<HoldsCard reservations={[]} lineItems={[]} />);
    expect(screen.getByText("Inga reservationer.")).toBeTruthy();
  });

  it("renders line title (joined via draftLineItemId) + state-label per reservation", () => {
    render(
      <HoldsCard
        reservations={[buildReservation()]}
        lineItems={[buildLine()]}
      />,
    );
    expect(screen.getByText("Cozy Cabin")).toBeTruthy();
    expect(screen.getByText("Placerad")).toBeTruthy();
  });

  it("renders em-dash when line-join misses (orphan reservation)", () => {
    render(
      <HoldsCard
        reservations={[buildReservation({ draftLineItemId: "missing" })]}
        lineItems={[buildLine()]}
      />,
    );
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders FAILED state with PROBLEM-bucket label", () => {
    render(
      <HoldsCard
        reservations={[buildReservation({ holdState: "FAILED" })]}
        lineItems={[buildLine()]}
      />,
    );
    expect(screen.getByText("Misslyckades")).toBeTruthy();
  });

  it("renders all 6 hold-state labels for distinct reservations", () => {
    const states: DraftHoldState[] = [
      "NOT_PLACED",
      "PLACING",
      "PLACED",
      "RELEASED",
      "FAILED",
      "CONFIRMED",
    ];
    const lines = states.map((s, i) =>
      buildLine({ id: `l_${i}`, title: `Line ${i}` }),
    );
    const reservations = states.map((s, i) =>
      buildReservation({ id: `r_${i}`, draftLineItemId: `l_${i}`, holdState: s }),
    );
    render(<HoldsCard reservations={reservations} lineItems={lines} />);
    expect(screen.getByText("Ej placerad")).toBeTruthy();
    expect(screen.getByText("Placeras")).toBeTruthy();
    expect(screen.getByText("Placerad")).toBeTruthy();
    expect(screen.getByText("Släppt")).toBeTruthy();
    expect(screen.getByText("Misslyckades")).toBeTruthy();
    expect(screen.getByText("Bekräftad")).toBeTruthy();
  });
});
