// @vitest-environment jsdom

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { StatusCard } from "./StatusCard";

const baseDraft = {
  status: "OPEN" as const,
  createdAt: new Date("2026-04-20T10:30:00Z"),
  expiresAt: new Date("2026-04-27T00:00:00Z"),
  invoiceSentAt: null,
  invoiceUrl: null,
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
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

  // "Priser låsta" row removed in Phase C — `pricesFrozenAt` column
  // was deleted in Phase B. Phase F will introduce a session-aware
  // status row if/when the design calls for it.

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

describe("StatusCard — invoiceUrl + lifecycle timestamps (7.2b.4d.2)", () => {
  let writeTextMock: ReturnType<typeof vi.fn>;
  let originalClipboard: Clipboard | undefined;

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", {
        value: originalClipboard,
        configurable: true,
      });
    }
  });

  it("hides invoiceUrl row when null", () => {
    render(<StatusCard draft={baseDraft} stripePaymentIntent={null} />);
    expect(screen.queryByText("Fakturalänk")).toBeNull();
  });

  it("renders invoiceUrl row with Kopiera button when set", () => {
    render(
      <StatusCard
        draft={{ ...baseDraft, invoiceUrl: "https://x/inv/abc" }}
        stripePaymentIntent={null}
      />,
    );
    expect(screen.getByText("Fakturalänk")).toBeTruthy();
    expect(screen.getByText("Kopiera")).toBeTruthy();
  });

  it("clicking Kopiera calls clipboard.writeText and shows 'Kopierat!'", async () => {
    render(
      <StatusCard
        draft={{ ...baseDraft, invoiceUrl: "https://x/inv/abc" }}
        stripePaymentIntent={null}
      />,
    );
    fireEvent.click(screen.getByText("Kopiera"));
    await waitFor(() =>
      expect(writeTextMock).toHaveBeenCalledWith("https://x/inv/abc"),
    );
    await waitFor(() => expect(screen.getByText("Kopierat!")).toBeTruthy());
  });

  it("renders Genomfört row when completedAt is set", () => {
    render(
      <StatusCard
        draft={{
          ...baseDraft,
          completedAt: new Date("2026-04-25T08:00:00Z"),
        }}
        stripePaymentIntent={null}
      />,
    );
    expect(screen.getByText("Genomfört")).toBeTruthy();
  });

  it("renders Avbruten row + reason when both set", () => {
    render(
      <StatusCard
        draft={{
          ...baseDraft,
          cancelledAt: new Date("2026-04-25T08:00:00Z"),
          cancellationReason: "Kunden ändrade sig",
        }}
        stripePaymentIntent={null}
      />,
    );
    expect(screen.getByText("Avbruten")).toBeTruthy();
    expect(screen.getByText(/Kunden ändrade sig/)).toBeTruthy();
  });

  it("renders Avbruten row but NO reason when reason is empty", () => {
    render(
      <StatusCard
        draft={{
          ...baseDraft,
          cancelledAt: new Date("2026-04-25T08:00:00Z"),
          cancellationReason: null,
        }}
        stripePaymentIntent={null}
      />,
    );
    expect(screen.getByText("Avbruten")).toBeTruthy();
    expect(screen.queryByText(/Anledning:/)).toBeNull();
  });
});
