// @vitest-environment jsdom

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  type Mock,
} from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const addMock = vi.fn();

vi.mock("../actions", () => ({
  addDraftLineItemAction: (input: unknown) => addMock(input),
  // The other line actions are imported transitively via LineRowEditable;
  // mock them as no-ops to keep this test focused on the card-level wiring.
  updateDraftLineItemAction: vi.fn(),
  removeDraftLineItemAction: vi.fn(),
}));

// Mock the cross-route AccommodationPickerModal so we don't pull in the
// /new search action tree.
vi.mock(
  "@/app/(admin)/draft-orders/new/_components/AccommodationPickerModal",
  () => ({
    AccommodationPickerModal: ({
      onClose,
      onAdd,
    }: {
      onClose: () => void;
      onAdd: (
        acc: { id: string; name: string; type: string; status: string; basePricePerNight: number; currency: string },
        from: Date,
        to: Date,
        guests: number,
      ) => void;
    }) => (
      <div data-testid="picker-modal">
        <button
          type="button"
          onClick={() =>
            onAdd(
              {
                id: "acc_1",
                name: "Cabin",
                type: "ROOM",
                status: "ACTIVE",
                basePricePerNight: 1500,
                currency: "SEK",
              },
              new Date(2026, 4, 12),
              new Date(2026, 4, 15),
              3,
            )
          }
        >
          mock-add
        </button>
        <button type="button" onClick={onClose}>
          mock-close
        </button>
      </div>
    ),
  }),
);

import { LineItemsCardEditable } from "./LineItemsCardEditable";
import type { LineRowEditableLine } from "./LineRowEditable";

let onUpdateMock: Mock<() => void>;

function buildLine(
  overrides: Partial<LineRowEditableLine> = {},
): LineRowEditableLine {
  return {
    id: "l_1",
    lineType: "ACCOMMODATION",
    title: "Cozy Cabin",
    checkInDate: new Date("2026-05-12"),
    checkOutDate: new Date("2026-05-15"),
    quantity: 1,
    unitPriceCents: BigInt(150000),
    totalCents: BigInt(150000),
    ...overrides,
  };
}

beforeEach(() => {
  addMock.mockReset();
  onUpdateMock = vi.fn();
});

describe("LineItemsCardEditable", () => {
  it("empty: renders 'Inga rader.' + add button", () => {
    render(
      <LineItemsCardEditable
        lines={[]}
        draftId="d_1"
        onUpdate={onUpdateMock}
      />,
    );
    expect(screen.getByText("Inga rader.")).toBeTruthy();
    expect(screen.getByText("+ Lägg till boende")).toBeTruthy();
  });

  it("with lines: renders table headers + one row per line", () => {
    render(
      <LineItemsCardEditable
        lines={[buildLine(), buildLine({ id: "l_2", title: "Other" })]}
        draftId="d_1"
        onUpdate={onUpdateMock}
      />,
    );
    expect(screen.getByText("Boende")).toBeTruthy();
    expect(screen.getByText("Datum")).toBeTruthy();
    expect(screen.getByText("Antal")).toBeTruthy();
    expect(screen.getByText("À pris")).toBeTruthy();
    expect(screen.getByText("Total")).toBeTruthy();
    expect(screen.getByText("Cozy Cabin")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
  });

  it("click '+ Lägg till boende' opens AccommodationPickerModal", () => {
    render(
      <LineItemsCardEditable
        lines={[]}
        draftId="d_1"
        onUpdate={onUpdateMock}
      />,
    );
    expect(screen.queryByTestId("picker-modal")).toBeNull();
    fireEvent.click(screen.getByText("+ Lägg till boende"));
    expect(screen.getByTestId("picker-modal")).toBeTruthy();
  });

  it("modal close → picker disappears, no action", () => {
    render(
      <LineItemsCardEditable
        lines={[]}
        draftId="d_1"
        onUpdate={onUpdateMock}
      />,
    );
    fireEvent.click(screen.getByText("+ Lägg till boende"));
    fireEvent.click(screen.getByText("mock-close"));
    expect(screen.queryByTestId("picker-modal")).toBeNull();
    expect(addMock).not.toHaveBeenCalled();
  });

  it("modal onAdd → addDraftLineItemAction called with mapped AccommodationLineInput", async () => {
    addMock.mockResolvedValueOnce({ ok: true, draft: {} });
    render(
      <LineItemsCardEditable
        lines={[]}
        draftId="d_1"
        onUpdate={onUpdateMock}
      />,
    );
    fireEvent.click(screen.getByText("+ Lägg till boende"));
    fireEvent.click(screen.getByText("mock-add"));
    await waitFor(() => expect(addMock).toHaveBeenCalled());
    expect(addMock).toHaveBeenCalledWith({
      draftId: "d_1",
      line: {
        lineType: "ACCOMMODATION",
        accommodationId: "acc_1",
        checkInDate: "2026-05-12",
        checkOutDate: "2026-05-15",
        guestCounts: { adults: 3, children: 0, infants: 0 },
        taxable: true,
      },
    });
    await waitFor(() => expect(onUpdateMock).toHaveBeenCalled());
  });

  it("add success → picker closed, no error visible", async () => {
    addMock.mockResolvedValueOnce({ ok: true, draft: {} });
    render(
      <LineItemsCardEditable
        lines={[]}
        draftId="d_1"
        onUpdate={onUpdateMock}
      />,
    );
    fireEvent.click(screen.getByText("+ Lägg till boende"));
    fireEvent.click(screen.getByText("mock-add"));
    await waitFor(() => expect(onUpdateMock).toHaveBeenCalled());
    expect(screen.queryByTestId("picker-modal")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("add failure → addError visible, no onUpdate", async () => {
    addMock.mockResolvedValueOnce({
      ok: false,
      error: "Line currency does not match draft currency",
    });
    render(
      <LineItemsCardEditable
        lines={[]}
        draftId="d_1"
        onUpdate={onUpdateMock}
      />,
    );
    fireEvent.click(screen.getByText("+ Lägg till boende"));
    fireEvent.click(screen.getByText("mock-add"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Line currency does not match draft currency",
      ),
    );
    expect(onUpdateMock).not.toHaveBeenCalled();
  });

  it("isAdding: card-wide overlay rendered with aria-busy", async () => {
    let resolveAdd: (v: { ok: true; draft: object }) => void = () => {};
    addMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        }),
    );
    render(
      <LineItemsCardEditable
        lines={[]}
        draftId="d_1"
        onUpdate={onUpdateMock}
      />,
    );
    expect(screen.queryByLabelText("Lägger till boende")).toBeNull();
    fireEvent.click(screen.getByText("+ Lägg till boende"));
    fireEvent.click(screen.getByText("mock-add"));
    await waitFor(() => {
      const overlay = screen.getByLabelText("Lägger till boende");
      expect(overlay.getAttribute("aria-busy")).toBe("true");
    });
    resolveAdd({ ok: true, draft: {} });
    await waitFor(() =>
      expect(screen.queryByLabelText("Lägger till boende")).toBeNull(),
    );
  });
});
