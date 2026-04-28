// @vitest-environment jsdom

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  type Mock,
} from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ConfirmModal } from "./ConfirmModal";

let onConfirmMock: Mock<() => void>;
let onCancelMock: Mock<() => void>;

beforeEach(() => {
  onConfirmMock = vi.fn();
  onCancelMock = vi.fn();
});

describe("ConfirmModal", () => {
  it("open=false → renders null (no dialog)", () => {
    render(
      <ConfirmModal
        open={false}
        title="X"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("open=true → dialog visible with title + confirm + cancel", () => {
    render(
      <ConfirmModal
        open={true}
        title="Avbryt utkast"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Avbryt utkast")).toBeTruthy();
    expect(screen.getByText("Bekräfta")).toBeTruthy();
    expect(screen.getAllByText("Avbryt").length).toBeGreaterThan(0);
  });

  it("custom confirmLabel + cancelLabel", () => {
    render(
      <ConfirmModal
        open={true}
        title="Skicka"
        confirmLabel="Skicka faktura"
        cancelLabel="Stäng"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    expect(screen.getByText("Skicka faktura")).toBeTruthy();
    expect(screen.getByText("Stäng")).toBeTruthy();
  });

  it("description renders in body", () => {
    render(
      <ConfirmModal
        open={true}
        title="X"
        description="Detta kan inte ångras."
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    expect(screen.getByText("Detta kan inte ångras.")).toBeTruthy();
  });

  it("children render in body (e.g. cancel-reason input)", () => {
    render(
      <ConfirmModal
        open={true}
        title="X"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      >
        <textarea data-testid="reason" />
      </ConfirmModal>,
    );
    expect(screen.getByTestId("reason")).toBeTruthy();
  });

  it("click confirm-button → onConfirm called", () => {
    render(
      <ConfirmModal
        open={true}
        title="X"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    fireEvent.click(screen.getByText("Bekräfta"));
    expect(onConfirmMock).toHaveBeenCalled();
  });

  it("click cancel-button → onCancel called", () => {
    render(
      <ConfirmModal
        open={true}
        title="X"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    fireEvent.click(screen.getByText("Avbryt"));
    expect(onCancelMock).toHaveBeenCalled();
  });

  it("click X close-button → onCancel called", () => {
    render(
      <ConfirmModal
        open={true}
        title="X"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    fireEvent.click(screen.getByLabelText("Stäng"));
    expect(onCancelMock).toHaveBeenCalled();
  });

  it("click on overlay (outside modal) → onCancel called", () => {
    const { container } = render(
      <ConfirmModal
        open={true}
        title="X"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    const overlay = container.querySelector(".am-overlay");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(onCancelMock).toHaveBeenCalled();
  });

  it("click inside modal → onCancel NOT called (stopPropagation)", () => {
    const { container } = render(
      <ConfirmModal
        open={true}
        title="X"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    const modal = container.querySelector(".am-modal");
    expect(modal).not.toBeNull();
    fireEvent.click(modal!);
    expect(onCancelMock).not.toHaveBeenCalled();
  });

  it("danger=true → confirm-button has admin-btn--danger class", () => {
    render(
      <ConfirmModal
        open={true}
        title="X"
        danger
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    const confirmBtn = screen.getByText("Bekräfta");
    expect(confirmBtn.className).toContain("admin-btn--danger");
  });

  it("isPending=true → buttons disabled, confirm shows 'Bearbetar...'", () => {
    render(
      <ConfirmModal
        open={true}
        title="X"
        isPending
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    expect(screen.getByText("Bearbetar...")).toBeTruthy();
    const cancelBtn = screen.getByText("Avbryt") as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(true);
  });

  it("isPending=true → overlay click does NOT cancel", () => {
    const { container } = render(
      <ConfirmModal
        open={true}
        title="X"
        isPending
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    const overlay = container.querySelector(".am-overlay");
    fireEvent.click(overlay!);
    expect(onCancelMock).not.toHaveBeenCalled();
  });

  it("aria-labelledby points to title id", () => {
    render(
      <ConfirmModal
        open={true}
        title="Avbryt utkast"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );
    const dialog = screen.getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const labelEl = document.getElementById(labelId!);
    expect(labelEl?.textContent).toBe("Avbryt utkast");
  });
});
