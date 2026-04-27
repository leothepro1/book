// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { LocalLineItem } from "./_components/types";

// ── Mocks ────────────────────────────────────────────────────

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("./actions", () => ({
  createDraftWithLinesAction: vi.fn(),
  previewDraftTotalsAction: vi.fn(),
  searchCustomersAction: vi.fn(),
}));

// Replace LineItemsCard with a controllable harness that exposes setLines via a hidden button.
vi.mock("./_components/LineItemsCard", () => ({
  LineItemsCard: (props: {
    lines: LocalLineItem[];
    setLines: (
      next:
        | LocalLineItem[]
        | ((prev: LocalLineItem[]) => LocalLineItem[]),
    ) => void;
    conflictingLineTempIds: string[];
  }) => (
    <div data-testid="lines-card">
      <span data-testid="line-count">{props.lines.length}</span>
      <span data-testid="conflict-ids">
        {props.conflictingLineTempIds.join(",")}
      </span>
      <button
        data-testid="seed-lines"
        onClick={() =>
          props.setLines([
            {
              tempId: "tmp_1",
              accommodation: {
                id: "a1",
                name: "X",
                type: "CABIN",
                status: "ACTIVE",
                basePricePerNight: 0,
                currency: "SEK",
              },
              fromDate: new Date("2026-05-01"),
              toDate: new Date("2026-05-03"),
              guestCount: 2,
              isCheckingAvailability: false,
              availability: { available: true },
            },
            {
              tempId: "tmp_2",
              accommodation: {
                id: "a2",
                name: "Y",
                type: "CABIN",
                status: "ACTIVE",
                basePricePerNight: 0,
                currency: "SEK",
              },
              fromDate: new Date("2026-05-04"),
              toDate: new Date("2026-05-06"),
              guestCount: 1,
              isCheckingAvailability: false,
              availability: { available: true },
            },
          ])
        }
      >
        seed
      </button>
      <button
        data-testid="seed-unavailable"
        onClick={() =>
          props.setLines([
            {
              tempId: "tmp_x",
              accommodation: {
                id: "a3",
                name: "Z",
                type: "CABIN",
                status: "ACTIVE",
                basePricePerNight: 0,
                currency: "SEK",
              },
              fromDate: new Date("2026-05-01"),
              toDate: new Date("2026-05-03"),
              guestCount: 1,
              isCheckingAvailability: false,
              availability: { available: false },
            },
          ])
        }
      >
        seed-bad
      </button>
    </div>
  ),
}));

// SaveBar: render in-place (skip portal) so test can interact directly.
vi.mock("./_components/SaveBar", () => ({
  SaveBar: (props: {
    canSave: boolean;
    isSaving: boolean;
    onSave: () => void;
  }) => (
    <button
      data-testid="save-btn"
      data-can-save={String(props.canSave)}
      data-is-saving={String(props.isSaving)}
      disabled={!props.canSave || props.isSaving}
      onClick={props.onSave}
    >
      {props.isSaving ? "Skapar order…" : "Skapa order"}
    </button>
  ),
}));

import {
  createDraftWithLinesAction,
  previewDraftTotalsAction,
  searchCustomersAction,
} from "./actions";
import { NewDraftOrderClient } from "./NewDraftOrderClient";

const createMock = createDraftWithLinesAction as unknown as ReturnType<
  typeof vi.fn
>;
const previewMock = previewDraftTotalsAction as unknown as ReturnType<
  typeof vi.fn
>;
const searchCustomersMock = searchCustomersAction as unknown as ReturnType<
  typeof vi.fn
>;

const PREVIEW_2_LINES = {
  subtotal: BigInt(250000),
  discountAmount: BigInt(0),
  taxAmount: BigInt(30000),
  total: BigInt(280000),
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
    {
      lineIndex: 1,
      accommodationId: "a2",
      nights: 2,
      pricePerNight: BigInt(62500),
      lineSubtotal: BigInt(125000),
      addonsTotal: BigInt(0),
    },
  ],
  discountApplicable: false,
};

beforeEach(() => {
  pushMock.mockReset();
  createMock.mockReset();
  previewMock.mockReset();
  searchCustomersMock.mockReset();
  previewMock.mockResolvedValue(PREVIEW_2_LINES);
  searchCustomersMock.mockResolvedValue([]);
});

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("NewDraftOrderClient", () => {
  it("C1 — renders the page header 'Ny utkastorder'", () => {
    render(<NewDraftOrderClient />);
    expect(
      screen.getByRole("heading", { name: /Ny utkastorder/ }),
    ).toBeTruthy();
  });

  it("C1b — header contains back-button to /draft-orders", () => {
    render(<NewDraftOrderClient />);
    const backBtn = screen.getByRole("button", {
      name: "Tillbaka till utkastorders",
    });
    expect(backBtn).toBeTruthy();
    fireEvent.click(backBtn);
    expect(pushMock).toHaveBeenCalledWith("/draft-orders");
  });

  it("C2 — line-count starts at 0 (empty state delegated to LineItemsCard)", () => {
    render(<NewDraftOrderClient />);
    expect(screen.getByTestId("line-count").textContent).toBe("0");
  });

  it("C3 — SaveBar disabled when no lines (canSave=false)", () => {
    render(<NewDraftOrderClient />);
    const btn = screen.getByTestId("save-btn") as HTMLButtonElement;
    expect(btn.dataset.canSave).toBe("false");
    expect(btn.disabled).toBe(true);
  });

  it("C4 — SaveBar enabled once all lines are available", () => {
    render(<NewDraftOrderClient />);
    fireEvent.click(screen.getByTestId("seed-lines"));
    const btn = screen.getByTestId("save-btn") as HTMLButtonElement;
    expect(btn.dataset.canSave).toBe("true");
    expect(btn.disabled).toBe(false);
  });

  it("C5 — handleSave calls createDraftWithLinesAction with correct payload", async () => {
    createMock.mockResolvedValue({ ok: true, draft: { id: "d_1", lines: [] } });
    render(<NewDraftOrderClient />);
    fireEvent.click(screen.getByTestId("seed-lines"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("save-btn"));
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.lines).toHaveLength(2);
    expect(arg.lines[0]).toMatchObject({
      accommodationId: "a1",
      guestCount: 2,
    });
    expect(arg.lines[0].fromDate).toBeInstanceOf(Date);
    expect(arg.lines[0].toDate).toBeInstanceOf(Date);
  });

  it("C6 — success → router.push to /draft-orders/[id]/konfigurera", async () => {
    createMock.mockResolvedValue({
      ok: true,
      draft: { id: "draft_99", lines: [] },
    });
    render(<NewDraftOrderClient />);
    fireEvent.click(screen.getByTestId("seed-lines"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("save-btn"));
    });
    expect(pushMock).toHaveBeenCalledWith(
      "/draft-orders/draft_99/konfigurera",
    );
  });

  it("C7 — error → setSaveError shows pf-error-banner", async () => {
    createMock.mockResolvedValue({ ok: false, error: "Nätverksfel" });
    const { container } = render(<NewDraftOrderClient />);
    fireEvent.click(screen.getByTestId("seed-lines"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("save-btn"));
    });
    const banner = container.querySelector(".pf-error-banner");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toBe("Nätverksfel");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("C8 — conflictingLineIndices map to tempIds → forwarded to LineItemsCard", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: "Konflikt",
      conflictingLineIndices: [0, 1],
    });
    render(<NewDraftOrderClient />);
    fireEvent.click(screen.getByTestId("seed-lines"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("save-btn"));
    });
    expect(screen.getByTestId("conflict-ids").textContent).toBe("tmp_1,tmp_2");
  });
});

describe("NewDraftOrderClient — preview + customer + discount integration", () => {
  it("C9 — adding lines triggers preview after 500ms debounce", async () => {
    vi.useFakeTimers();
    render(<NewDraftOrderClient />);
    expect(previewMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("seed-lines"));
    // Before debounce window completes, no fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(previewMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await flushAsync();
    expect(previewMock).toHaveBeenCalledTimes(1);
    const callArg = previewMock.mock.calls[0][0];
    expect(callArg.lines).toHaveLength(2);
    expect(callArg.lines[0]).toMatchObject({
      accommodationId: "a1",
      guestCount: 2,
    });
    expect(callArg.discountCode).toBeUndefined();

    // Pricing summary renders the resolved totals.
    expect(screen.getByText("Delsumma")).toBeTruthy();
    expect(screen.getByText("2 500 kr")).toBeTruthy(); // subtotal
    expect(screen.getByText("2 800 kr")).toBeTruthy(); // total
  });

  it("C10 — preview not called while lines.length === 0", async () => {
    vi.useFakeTimers();
    render(<NewDraftOrderClient />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("C11 — selecting a customer renders CustomerCard with name + email + orders", async () => {
    vi.useFakeTimers();
    searchCustomersMock.mockResolvedValue([
      {
        id: "g1",
        email: "anna@example.se",
        name: "Anna Andersson",
        phone: null,
        draftOrderCount: 0,
        orderCount: 3,
      },
    ]);
    render(<NewDraftOrderClient />);

    fireEvent.click(
      screen.getByRole("button", { name: "+ Lägg till kund" }),
    );
    const input = screen.getByPlaceholderText(
      "Sök på namn eller e-post",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "anna" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();

    fireEvent.click(screen.getByText("Anna Andersson"));

    // Card now shows the selected customer; no more "Lägg till kund" button.
    expect(
      screen.queryByRole("button", { name: "+ Lägg till kund" }),
    ).toBeNull();
    expect(screen.getByText("Anna Andersson")).toBeTruthy();
    expect(screen.getByText("anna@example.se · 3 ordrar")).toBeTruthy();
  });

  it("C12 — clearing customer via X-button returns to empty card state", async () => {
    vi.useFakeTimers();
    searchCustomersMock.mockResolvedValue([
      {
        id: "g1",
        email: "anna@example.se",
        name: "Anna Andersson",
        phone: null,
        draftOrderCount: 0,
        orderCount: 3,
      },
    ]);
    render(<NewDraftOrderClient />);
    fireEvent.click(
      screen.getByRole("button", { name: "+ Lägg till kund" }),
    );
    fireEvent.change(
      screen.getByPlaceholderText("Sök på namn eller e-post"),
      { target: { value: "anna" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    fireEvent.click(screen.getByText("Anna Andersson"));

    fireEvent.click(screen.getByRole("button", { name: "Ta bort kund" }));
    expect(
      screen.getByRole("button", { name: "+ Lägg till kund" }),
    ).toBeTruthy();
    expect(screen.queryByText("Anna Andersson")).toBeNull();
  });

  it("C13 — applying a discount triggers preview re-fetch with discountCode", async () => {
    vi.useFakeTimers();
    previewMock.mockResolvedValue({
      ...PREVIEW_2_LINES,
      discountAmount: BigInt(50000),
      total: BigInt(230000),
      discountApplicable: true,
    });
    render(<NewDraftOrderClient />);
    fireEvent.click(screen.getByTestId("seed-lines"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await flushAsync();
    expect(previewMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText("Rabattkod"), {
      target: { value: "sommar2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tillämpa" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await flushAsync();

    expect(previewMock).toHaveBeenCalledTimes(2);
    const lastCall = previewMock.mock.calls[1][0];
    expect(lastCall.discountCode).toBe("SOMMAR2026");

    // Discount pill rendered with formatted amount.
    expect(screen.getByText("SOMMAR2026")).toBeTruthy();
    // The amount appears in two places — the pill and the pricing summary.
    expect(screen.getAllByText("−500 kr").length).toBeGreaterThan(0);
  });

  it("C14 — invalid discount soft-fails: error text shown, pricing has no discount row", async () => {
    vi.useFakeTimers();
    // First fetch: no discount, OK preview.
    previewMock.mockResolvedValueOnce(PREVIEW_2_LINES);
    // Second fetch (after applying invalid code): server returns soft-fail.
    previewMock.mockResolvedValueOnce({
      ...PREVIEW_2_LINES,
      discountAmount: BigInt(0),
      discountApplicable: false,
      discountError: "Koden är inte längre giltig",
    });

    render(<NewDraftOrderClient />);
    fireEvent.click(screen.getByTestId("seed-lines"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await flushAsync();

    fireEvent.change(screen.getByPlaceholderText("Rabattkod"), {
      target: { value: "expired" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tillämpa" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await flushAsync();

    // Pill stays applied (invalid modifier), error shown via role=alert.
    expect(screen.getByText("EXPIRED")).toBeTruthy();
    expect(
      screen.getByRole("alert").textContent,
    ).toBe("Koden är inte längre giltig");
    // "Rabatt" appears as the DiscountCard title, but NOT as a pricing-summary
    // row label — there's exactly one occurrence (the title), not two.
    expect(screen.getAllByText("Rabatt")).toHaveLength(1);
  });

  it("C15 — stale-response guard: only the latest response is rendered", async () => {
    vi.useFakeTimers();

    // First call: resolves slow with stale data.
    let resolveStale: ((v: typeof PREVIEW_2_LINES) => void) | null = null;
    previewMock.mockImplementationOnce(
      () =>
        new Promise<typeof PREVIEW_2_LINES>((resolve) => {
          resolveStale = resolve;
        }),
    );
    // Second call: resolves immediately with fresh data.
    const FRESH = {
      ...PREVIEW_2_LINES,
      subtotal: BigInt(999900),
      total: BigInt(999900),
      taxAmount: BigInt(0),
    };
    previewMock.mockResolvedValueOnce(FRESH);

    render(<NewDraftOrderClient />);
    fireEvent.click(screen.getByTestId("seed-lines"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    // First fetch is in-flight (not resolved). Apply discount → re-fetch.
    fireEvent.change(screen.getByPlaceholderText("Rabattkod"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tillämpa" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await flushAsync();

    // Now resolve the stale first call — it should be discarded.
    await act(async () => {
      resolveStale?.(PREVIEW_2_LINES);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Pricing should reflect FRESH values, not stale.
    expect(screen.getAllByText("9 999 kr").length).toBeGreaterThan(0); // 999900 ören
    expect(screen.queryByText("2 500 kr")).toBeNull();
  });
});
