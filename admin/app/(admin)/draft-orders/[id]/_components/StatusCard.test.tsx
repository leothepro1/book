// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { StatusCard } from "./StatusCard";

const baseDraft = {
  status: "OPEN" as const,
  createdAt: new Date("2026-04-20T10:30:00Z"),
  expiresAt: new Date("2026-04-27T00:00:00Z"),
  invoiceSentAt: null,
  pricesFrozenAt: null,
};

describe("StatusCard — read-only", () => {
  it("renders status badge label + skapad/utgår rows", () => {
    render(<StatusCard draft={baseDraft} stripePaymentIntent={null} />);
    expect(screen.getByText("Utkast")).toBeTruthy();
    expect(screen.getByText("Skapad")).toBeTruthy();
    expect(screen.getByText("Utgår")).toBeTruthy();
  });

  it("hides Faktura skickad row when invoiceSentAt is null", () => {
    render(<StatusCard draft={baseDraft} stripePaymentIntent={null} />);
    expect(screen.queryByText("Faktura skickad")).toBeNull();
  });

  it("shows Faktura skickad row when invoiceSentAt is set", () => {
    render(
      <StatusCard
        draft={{ ...baseDraft, invoiceSentAt: new Date("2026-04-22T08:00:00Z") }}
        stripePaymentIntent={null}
      />,
    );
    expect(screen.getByText("Faktura skickad")).toBeTruthy();
  });

  it("hides Priser låsta row when pricesFrozenAt is null", () => {
    render(<StatusCard draft={baseDraft} stripePaymentIntent={null} />);
    expect(screen.queryByText("Priser låsta")).toBeNull();
  });

  it("shows Priser låsta row when pricesFrozenAt is set", () => {
    render(
      <StatusCard
        draft={{ ...baseDraft, pricesFrozenAt: new Date("2026-04-22T08:00:00Z") }}
        stripePaymentIntent={null}
      />,
    );
    expect(screen.getByText("Priser låsta")).toBeTruthy();
  });

  it("hides Betalning row when stripePaymentIntent is null", () => {
    render(<StatusCard draft={baseDraft} stripePaymentIntent={null} />);
    expect(screen.queryByText("Betalning")).toBeNull();
  });

  it("shows Betalning row + status when stripePaymentIntent is set (Q14)", () => {
    render(
      <StatusCard
        draft={baseDraft}
        stripePaymentIntent={{ id: "pi_1", status: "succeeded" }}
      />,
    );
    expect(screen.getByText("Betalning")).toBeTruthy();
    expect(screen.getByText("succeeded")).toBeTruthy();
  });
});
