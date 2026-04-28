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

const updateMock = vi.fn();
const removeMock = vi.fn();

vi.mock("../actions", () => ({
  updateDraftLineItemAction: (input: unknown) => updateMock(input),
  removeDraftLineItemAction: (input: unknown) => removeMock(input),
}));

import { LineRowEditable } from "./LineRowEditable";
import type { LineRowEditableLine } from "./LineRowEditable";

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

let onUpdateMock: Mock<() => void>;

function renderRow(line: LineRowEditableLine = buildLine()) {
  return render(
    <table>
      <tbody>
        <LineRowEditable line={line} draftId="d_1" onUpdate={onUpdateMock} />
      </tbody>
    </table>,
  );
}

beforeEach(() => {
  updateMock.mockReset();
  removeMock.mockReset();
  onUpdateMock = vi.fn();
});

describe("LineRowEditable — render", () => {
  it("ACCOMMODATION line: qty input + price display + Total + Ta bort", () => {
    renderRow(
      buildLine({
        quantity: 2,
        unitPriceCents: BigInt(150000),
        totalCents: BigInt(300000),
      }),
    );
    expect(screen.getByLabelText("Antal för Cozy Cabin")).toBeTruthy();
    // Price displayed (no input for ACCOMMODATION)
    expect(screen.queryByLabelText("À-pris för Cozy Cabin")).toBeNull();
    expect(screen.getByText("1 500 kr")).toBeTruthy(); // unit price
    expect(screen.getByText("3 000 kr")).toBeTruthy(); // total
    expect(screen.getByLabelText("Ta bort Cozy Cabin")).toBeTruthy();
  });

  it("CUSTOM line: qty input AND price input", () => {
    renderRow(buildLine({ lineType: "CUSTOM", title: "Custom fee" }));
    expect(screen.getByLabelText("Antal för Custom fee")).toBeTruthy();
    expect(screen.getByLabelText("À-pris för Custom fee")).toBeTruthy();
  });

  it("PRODUCT line: qty input, price display only", () => {
    renderRow(buildLine({ lineType: "PRODUCT", title: "T-shirt" }));
    expect(screen.getByLabelText("Antal för T-shirt")).toBeTruthy();
    expect(screen.queryByLabelText("À-pris för T-shirt")).toBeNull();
  });

  it("ACCOMMODATION qty input has max=99", () => {
    renderRow(buildLine({ lineType: "ACCOMMODATION" }));
    const input = screen.getByLabelText(/Antal/) as HTMLInputElement;
    expect(input.max).toBe("99");
  });

  it("PRODUCT qty input has max=9999", () => {
    renderRow(buildLine({ lineType: "PRODUCT", title: "T-shirt" }));
    const input = screen.getByLabelText(/Antal/) as HTMLInputElement;
    expect(input.max).toBe("9999");
  });
});

describe("LineRowEditable — qty inline edit", () => {
  it("blur with same value → no action", () => {
    renderRow(buildLine());
    const input = screen.getByLabelText(/Antal/) as HTMLInputElement;
    fireEvent.blur(input);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("blur with new valid value → updateDraftLineItemAction called with patch", async () => {
    updateMock.mockResolvedValueOnce({ ok: true, draft: {} });
    renderRow(buildLine());
    const input = screen.getByLabelText(/Antal/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.blur(input);
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock).toHaveBeenCalledWith({
      draftId: "d_1",
      lineItemId: "l_1",
      patch: { lineType: "ACCOMMODATION", quantity: 3 },
    });
    await waitFor(() => expect(onUpdateMock).toHaveBeenCalled());
  });

  it("blur with qty < 1 → revert to original, no action", () => {
    renderRow(buildLine({ quantity: 2 }));
    const input = screen.getByLabelText(/Antal/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(updateMock).not.toHaveBeenCalled();
    expect(input.value).toBe("2");
  });

  it("Enter key commits + blurs", async () => {
    updateMock.mockResolvedValueOnce({ ok: true, draft: {} });
    renderRow(buildLine());
    const input = screen.getByLabelText(/Antal/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
  });

  it("Escape key reverts + blurs, no action", () => {
    renderRow(buildLine({ quantity: 1 }));
    const input = screen.getByLabelText(/Antal/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(updateMock).not.toHaveBeenCalled();
    expect(input.value).toBe("1");
  });

  it("update failure → error visible inline, qty reverts", async () => {
    updateMock.mockResolvedValueOnce({
      ok: false,
      error: "Cannot modify line — hold is active; release it first",
    });
    renderRow(buildLine({ quantity: 1 }));
    const input = screen.getByLabelText(/Antal/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Cannot modify line — hold is active",
      ),
    );
    expect(input.value).toBe("1");
    expect(onUpdateMock).not.toHaveBeenCalled();
  });
});

describe("LineRowEditable — CUSTOM price inline edit", () => {
  it("blur with new price → patch with unitPriceCents (kr → cents)", async () => {
    updateMock.mockResolvedValueOnce({ ok: true, draft: {} });
    renderRow(
      buildLine({
        lineType: "CUSTOM",
        title: "Fee",
        unitPriceCents: BigInt(15000),
      }),
    );
    const priceInput = screen.getByLabelText(/À-pris/) as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "200.50" } });
    fireEvent.blur(priceInput);
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock).toHaveBeenCalledWith({
      draftId: "d_1",
      lineItemId: "l_1",
      patch: { lineType: "CUSTOM", unitPriceCents: BigInt(20050) },
    });
  });

  it("blur with same price → no action", () => {
    renderRow(
      buildLine({
        lineType: "CUSTOM",
        title: "Fee",
        unitPriceCents: BigInt(15000),
      }),
    );
    const priceInput = screen.getByLabelText(/À-pris/) as HTMLInputElement;
    fireEvent.blur(priceInput);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("LineRowEditable — remove", () => {
  it("click Ta bort → removeDraftLineItemAction called", async () => {
    removeMock.mockResolvedValueOnce({ ok: true, draft: {} });
    renderRow(buildLine());
    fireEvent.click(screen.getByLabelText("Ta bort Cozy Cabin"));
    await waitFor(() => expect(removeMock).toHaveBeenCalled());
    expect(removeMock).toHaveBeenCalledWith({
      draftId: "d_1",
      lineItemId: "l_1",
    });
    await waitFor(() => expect(onUpdateMock).toHaveBeenCalled());
  });

  it("remove failure → error visible inline, isRemoving cleared", async () => {
    removeMock.mockResolvedValueOnce({
      ok: false,
      error: "Cannot remove line — hold is confirmed (draft already converted)",
    });
    renderRow(buildLine());
    const removeBtn = screen.getByLabelText("Ta bort Cozy Cabin");
    fireEvent.click(removeBtn);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Cannot remove line — hold is confirmed",
      ),
    );
    expect((removeBtn as HTMLButtonElement).disabled).toBe(false);
    expect(onUpdateMock).not.toHaveBeenCalled();
  });
});

describe("LineRowEditable — pending overlay", () => {
  it("during qty update, inputs are disabled", async () => {
    let resolveAction: (v: { ok: true; draft: object }) => void = () => {};
    updateMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    renderRow(buildLine());
    const input = screen.getByLabelText(/Antal/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(input.disabled).toBe(true);
    });
    const removeBtn = screen.getByLabelText(
      "Ta bort Cozy Cabin",
    ) as HTMLButtonElement;
    expect(removeBtn.disabled).toBe(true);
    resolveAction({ ok: true, draft: {} });
    await waitFor(() => expect(input.disabled).toBe(false));
  });
});
