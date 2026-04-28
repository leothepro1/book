// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const applyMock = vi.fn();
const removeMock = vi.fn();

vi.mock("../actions", () => ({
  applyDraftDiscountCodeAction: (args: { draftId: string; code: string }) =>
    applyMock(args),
  removeDraftDiscountCodeAction: (args: { draftId: string }) =>
    removeMock(args),
}));

vi.mock("@/app/(admin)/draft-orders/new/_components/DiscountCard", () => ({
  DiscountCard: ({
    appliedCode,
    discountAmount,
    discountError,
    isApplicable,
    onApply,
    onRemove,
  }: {
    appliedCode: string | null;
    discountAmount: bigint | null;
    discountError: string | null;
    isApplicable: boolean;
    onApply: (code: string) => void;
    onRemove: () => void;
  }) => (
    <div data-testid="new-discount-card">
      <span data-testid="applied-code">{appliedCode ?? "NONE"}</span>
      <span data-testid="discount-amount">
        {discountAmount === null ? "NONE" : discountAmount.toString()}
      </span>
      <span data-testid="is-applicable">{String(isApplicable)}</span>
      {discountError && <span data-testid="error">{discountError}</span>}
      <button type="button" onClick={() => onApply("SUMMER20")}>
        mock-apply
      </button>
      <button type="button" onClick={() => onRemove()}>
        mock-remove
      </button>
    </div>
  ),
}));

import { DiscountCardEditable } from "./DiscountCardEditable";

let onUpdateMock: Mock<() => void>;

beforeEach(() => {
  applyMock.mockReset();
  removeMock.mockReset();
  onUpdateMock = vi.fn();
});

describe("DiscountCardEditable", () => {
  it("renders /new DiscountCard with passed-through code/amount and isApplicable=true", () => {
    render(
      <DiscountCardEditable
        draftId="d1"
        appliedCode="SUMMER20"
        appliedAmount={BigInt(5000)}
        onUpdate={onUpdateMock}
      />,
    );
    expect(screen.getByTestId("applied-code").textContent).toBe("SUMMER20");
    expect(screen.getByTestId("discount-amount").textContent).toBe("5000");
    expect(screen.getByTestId("is-applicable").textContent).toBe("true");
  });

  it("happy apply: action called with draftId+code, onUpdate fires on ok", async () => {
    applyMock.mockResolvedValueOnce({ ok: true, draft: { id: "d1" } });
    render(
      <DiscountCardEditable
        draftId="d1"
        appliedCode={null}
        appliedAmount={null}
        onUpdate={onUpdateMock}
      />,
    );
    fireEvent.click(screen.getByText("mock-apply"));
    await waitFor(() => expect(onUpdateMock).toHaveBeenCalled());
    expect(applyMock).toHaveBeenCalledWith({ draftId: "d1", code: "SUMMER20" });
  });

  it("apply failure: onUpdate NOT called, error surfaces", async () => {
    applyMock.mockResolvedValueOnce({
      ok: false,
      error: "Discount code not eligible",
    });
    render(
      <DiscountCardEditable
        draftId="d1"
        appliedCode={null}
        appliedAmount={null}
        onUpdate={onUpdateMock}
      />,
    );
    fireEvent.click(screen.getByText("mock-apply"));
    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toBe(
        "Discount code not eligible",
      ),
    );
    expect(onUpdateMock).not.toHaveBeenCalled();
  });

  it("happy remove: action called with draftId, onUpdate fires on ok", async () => {
    removeMock.mockResolvedValueOnce({ ok: true, draft: { id: "d1" } });
    render(
      <DiscountCardEditable
        draftId="d1"
        appliedCode="SUMMER20"
        appliedAmount={BigInt(5000)}
        onUpdate={onUpdateMock}
      />,
    );
    fireEvent.click(screen.getByText("mock-remove"));
    await waitFor(() => expect(onUpdateMock).toHaveBeenCalled());
    expect(removeMock).toHaveBeenCalledWith({ draftId: "d1" });
  });

  it("overlay renders during pending action with aria-busy + aria-label", async () => {
    let resolveApply: (v: { ok: true; draft: object }) => void = () => {};
    applyMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );
    render(
      <DiscountCardEditable
        draftId="d1"
        appliedCode={null}
        appliedAmount={null}
        onUpdate={onUpdateMock}
      />,
    );
    expect(screen.queryByLabelText("Sparar rabatt")).toBeNull();
    fireEvent.click(screen.getByText("mock-apply"));
    await waitFor(() => {
      const overlay = screen.getByLabelText("Sparar rabatt");
      expect(overlay.getAttribute("aria-busy")).toBe("true");
    });
    resolveApply({ ok: true, draft: {} });
    await waitFor(() =>
      expect(screen.queryByLabelText("Sparar rabatt")).toBeNull(),
    );
  });

  it("overlay disappears on action failure (not just success)", async () => {
    applyMock.mockResolvedValueOnce({ ok: false, error: "no" });
    render(
      <DiscountCardEditable
        draftId="d1"
        appliedCode={null}
        appliedAmount={null}
        onUpdate={onUpdateMock}
      />,
    );
    fireEvent.click(screen.getByText("mock-apply"));
    await waitFor(() => expect(screen.getByTestId("error")).toBeTruthy());
    expect(screen.queryByLabelText("Sparar rabatt")).toBeNull();
  });
});
