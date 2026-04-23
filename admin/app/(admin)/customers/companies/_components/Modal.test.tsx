// @vitest-environment jsdom

import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing when open is false", () => {
    render(
      <Modal open={false} onClose={() => {}} title="X">
        hidden body
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("hidden body")).toBeNull();
  });

  it("renders title and children when open", () => {
    render(
      <Modal open onClose={() => {}} title="Hej">
        Body text
      </Modal>,
    );
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByText("Hej")).not.toBeNull();
    expect(screen.getByText("Body text")).not.toBeNull();
  });

  it("renders footer content when provided", () => {
    render(
      <Modal
        open
        onClose={() => {}}
        title="X"
        footer={<button>Klart</button>}
      >
        Body
      </Modal>,
    );
    expect(screen.getByText("Klart")).not.toBeNull();
  });

  it("sets role=dialog and aria-modal=true", () => {
    render(
      <Modal open onClose={() => {}} title="X">
        Body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("aria-labelledby references the title element", () => {
    render(
      <Modal open onClose={() => {}} title="Settitel">
        Body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).not.toBeNull();
    const titleEl = document.getElementById(titleId!);
    expect(titleEl?.textContent).toBe("Settitel");
  });

  it("aria-describedby passes through when provided", () => {
    render(
      <Modal open onClose={() => {}} title="X" ariaDescribedBy="extra-desc">
        Body
      </Modal>,
    );
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBe(
      "extra-desc",
    );
  });

  it("ESC calls onClose when dismissible (default)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        Body
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("ESC does not call onClose when dismissible=false", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} dismissible={false} title="X">
        Body
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("backdrop click calls onClose when dismissible", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        Body
      </Modal>,
    );
    const backdrop = document.querySelector(".co-modal-backdrop") as HTMLElement;
    expect(backdrop).not.toBeNull();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click does not call onClose when dismissible=false", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} dismissible={false} title="X">
        Body
      </Modal>,
    );
    const backdrop = document.querySelector(".co-modal-backdrop") as HTMLElement;
    await user.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clicking inside the modal does not trigger backdrop onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        <p>Body content</p>
      </Modal>,
    );
    await user.click(screen.getByText("Body content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("close X button calls onClose when dismissible", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        Body
      </Modal>,
    );
    await user.click(screen.getByRole("button", { name: "Stäng" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render X button when dismissible=false", () => {
    render(
      <Modal open onClose={() => {}} dismissible={false} title="X">
        Body
      </Modal>,
    );
    expect(screen.queryByRole("button", { name: "Stäng" })).toBeNull();
  });

  it("locks body scroll while open and restores on unmount", () => {
    const before = document.body.style.overflow;
    const { unmount } = render(
      <Modal open onClose={() => {}} title="X">
        Body
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe(before);
  });

  it("focuses initialFocusRef on open", () => {
    function W() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <Modal open onClose={() => {}} title="X" initialFocusRef={ref}>
          <button>First</button>
          <button ref={ref}>Target</button>
        </Modal>
      );
    }
    render(<W />);
    expect((document.activeElement as HTMLElement | null)?.textContent).toBe(
      "Target",
    );
  });

  it("focuses the first focusable element when no initialFocusRef is provided", () => {
    // With dismissible=true (default) the close X is the first focusable
    // in DOM order — header before body.
    render(
      <Modal open onClose={() => {}} title="X">
        <button>Body A</button>
        <button>Body B</button>
      </Modal>,
    );
    expect(
      (document.activeElement as HTMLElement | null)?.getAttribute("aria-label"),
    ).toBe("Stäng");
  });

  it("traps Tab: from last focusable wraps to first", async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={() => {}} dismissible={false} title="X">
        <button>A</button>
        <button>B</button>
      </Modal>,
    );
    // With dismissible=false there is no close button — A is first, B is last.
    const a = screen.getByText("A");
    const b = screen.getByText("B");
    act(() => b.focus());
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(a);
  });

  it("traps Shift+Tab: from first focusable wraps to last", async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={() => {}} dismissible={false} title="X">
        <button>A</button>
        <button>B</button>
      </Modal>,
    );
    const a = screen.getByText("A");
    const b = screen.getByText("B");
    act(() => a.focus());
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(b);
  });

  it("pulls focus back into the modal if the active element drifts outside", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Outside</button>
        <Modal open onClose={() => {}} dismissible={false} title="X">
          <button>A</button>
          <button>B</button>
        </Modal>
      </>,
    );
    // Force focus outside the modal, then press Tab: trap should yank it back.
    const outside = screen.getByText("Outside");
    act(() => outside.focus());
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(screen.getByText("A"));
  });

  it("returns focus to the element that had focus before open (auto-capture)", async () => {
    const user = userEvent.setup();
    function W() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} title="X">
            <button>Inside</button>
          </Modal>
        </>
      );
    }
    render(<W />);
    const trigger = screen.getByText("Open");
    await user.click(trigger);
    expect(screen.getByRole("dialog")).not.toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("returnFocusRef overrides the auto-captured element", async () => {
    const user = userEvent.setup();
    function W() {
      const [open, setOpen] = useState(false);
      const returnRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <button ref={returnRef}>Return here</button>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title="X"
            returnFocusRef={returnRef}
          >
            <button>Inside</button>
          </Modal>
        </>
      );
    }
    render(<W />);
    await user.click(screen.getByText("Open"));
    expect(screen.getByRole("dialog")).not.toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByText("Return here"));
  });

  it("nested modals: ESC closes only the top modal", async () => {
    const user = userEvent.setup();
    function Two() {
      const [aOpen, setA] = useState(true);
      const [bOpen, setB] = useState(true);
      return (
        <>
          <Modal open={aOpen} onClose={() => setA(false)} title="Modal A">
            <p>A body</p>
          </Modal>
          <Modal open={bOpen} onClose={() => setB(false)} title="Modal B">
            <p>B body</p>
          </Modal>
        </>
      );
    }
    render(<Two />);
    expect(screen.getByText("A body")).not.toBeNull();
    expect(screen.getByText("B body")).not.toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("B body")).toBeNull());
    // A is still mounted — it wasn't the top of the stack.
    expect(screen.getByText("A body")).not.toBeNull();
  });

  it("nested modals share one body-scroll lock (first push / last pop)", async () => {
    function Two() {
      const [aOpen, setA] = useState(true);
      const [bOpen, setB] = useState(true);
      return (
        <>
          <Modal open={aOpen} onClose={() => setA(false)} title="A">
            <p>A body</p>
          </Modal>
          <Modal open={bOpen} onClose={() => setB(false)} title="B">
            <p>B body</p>
          </Modal>
        </>
      );
    }
    const before = document.body.style.overflow;
    const { unmount } = render(<Two />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe(before);
  });
});
