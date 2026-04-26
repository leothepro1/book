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

import { createDraftWithLinesAction } from "./actions";
import { NewDraftOrderClient } from "./NewDraftOrderClient";

const createMock = createDraftWithLinesAction as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  pushMock.mockReset();
  createMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NewDraftOrderClient", () => {
  it("C1 — renders the page header 'Ny utkastorder'", () => {
    render(<NewDraftOrderClient />);
    expect(screen.getByRole("heading", { name: "Ny utkastorder" })).toBeTruthy();
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
