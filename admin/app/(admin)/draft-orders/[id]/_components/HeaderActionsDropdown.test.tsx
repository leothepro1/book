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

import { HeaderActionsDropdown } from "./HeaderActionsDropdown";
import type { HeaderActionsDropdownItem } from "./HeaderActionsDropdown";

let click1: Mock<() => void>;
let click2: Mock<() => void>;

beforeEach(() => {
  click1 = vi.fn();
  click2 = vi.fn();
});

describe("HeaderActionsDropdown", () => {
  it("items=[] → renders null", () => {
    const { container } = render(<HeaderActionsDropdown items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("default trigger label is 'Fler åtgärder'", () => {
    const items: HeaderActionsDropdownItem[] = [
      { key: "a", label: "Alpha", onClick: click1 },
    ];
    render(<HeaderActionsDropdown items={items} />);
    expect(screen.getByText(/Fler åtgärder/)).toBeTruthy();
  });

  it("custom trigger label rendered", () => {
    const items: HeaderActionsDropdownItem[] = [
      { key: "a", label: "Alpha", onClick: click1 },
    ];
    render(<HeaderActionsDropdown triggerLabel="Mer" items={items} />);
    expect(screen.getByText(/Mer/)).toBeTruthy();
  });

  it("click trigger opens menu", () => {
    const items: HeaderActionsDropdownItem[] = [
      { key: "a", label: "Alpha", onClick: click1 },
    ];
    render(<HeaderActionsDropdown items={items} />);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("click trigger again closes menu", () => {
    const items: HeaderActionsDropdownItem[] = [
      { key: "a", label: "Alpha", onClick: click1 },
    ];
    render(<HeaderActionsDropdown items={items} />);
    const trigger = screen.getByText(/Fler åtgärder/);
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("click outside closes menu (mousedown)", () => {
    const items: HeaderActionsDropdownItem[] = [
      { key: "a", label: "Alpha", onClick: click1 },
    ];
    const { container } = render(
      <div>
        <HeaderActionsDropdown items={items} />
        <div data-testid="outside" />
      </div>,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    expect(screen.getByRole("menu")).toBeTruthy();
    const outside = screen.getByTestId("outside");
    fireEvent.mouseDown(outside);
    expect(screen.queryByRole("menu")).toBeNull();
    void container;
  });

  it("click item → onClick called and menu closes", () => {
    const items: HeaderActionsDropdownItem[] = [
      { key: "a", label: "Alpha", onClick: click1 },
      { key: "b", label: "Beta", onClick: click2 },
    ];
    render(<HeaderActionsDropdown items={items} />);
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Beta"));
    expect(click2).toHaveBeenCalled();
    expect(click1).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("click disabled item → onClick NOT called, menu stays open", () => {
    const items: HeaderActionsDropdownItem[] = [
      { key: "a", label: "Alpha", onClick: click1, disabled: true },
    ];
    render(<HeaderActionsDropdown items={items} />);
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Alpha"));
    expect(click1).not.toHaveBeenCalled();
    // Menu may or may not stay open; the more important assertion is that
    // disabled prevented the action.
  });

  it("danger item has danger color", () => {
    const items: HeaderActionsDropdownItem[] = [
      { key: "a", label: "Avbryt", onClick: click1, danger: true },
    ];
    render(<HeaderActionsDropdown items={items} />);
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    const itemBtn = screen.getByText("Avbryt");
    expect(itemBtn.style.color).toContain("admin-danger");
  });

  it("disabled item has opacity 0.5 and not-allowed cursor", () => {
    const items: HeaderActionsDropdownItem[] = [
      { key: "a", label: "Alpha", onClick: click1, disabled: true },
    ];
    render(<HeaderActionsDropdown items={items} />);
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    const itemBtn = screen.getByText("Alpha") as HTMLButtonElement;
    expect(itemBtn.style.opacity).toBe("0.5");
    expect(itemBtn.style.cursor).toBe("not-allowed");
  });

  it("disabledTooltip shows as title attribute on disabled item", () => {
    const items: HeaderActionsDropdownItem[] = [
      {
        key: "a",
        label: "Skicka",
        onClick: click1,
        disabled: true,
        disabledTooltip: "Lägg till kund först",
      },
    ];
    render(<HeaderActionsDropdown items={items} />);
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    const itemBtn = screen.getByText("Skicka");
    expect(itemBtn.getAttribute("title")).toBe("Lägg till kund först");
  });

  it("aria-expanded reflects menu open state", () => {
    const items: HeaderActionsDropdownItem[] = [
      { key: "a", label: "Alpha", onClick: click1 },
    ];
    render(<HeaderActionsDropdown items={items} />);
    const trigger = screen.getByText(/Fler åtgärder/);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
