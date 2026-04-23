// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub next/link with a plain <a> + forwardRef so the tests can exercise
// click + keyboard behaviour without a Next router context. The real Link's
// router.push() would throw in isolated jsdom tests; the stub preserves all
// the behaviours Tabs relies on (ref, onClick, onKeyDown, href, tabIndex).
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(
      function MockLink({ children, href, ...rest }, ref) {
        return React.createElement("a", { ref, href, ...rest }, children);
      },
    ),
  };
});

import { Tabs, type Tab } from "./Tabs";

const sample: Tab[] = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
  { id: "c", label: "C" },
];

function getTab(label: string): HTMLElement {
  // Each tab renders its label inside a <span class="tabs__label">. The tab
  // element (<button> or <a>) is the closest element with role="tab".
  const labelEl = screen.getByText(label);
  const tab = labelEl.closest('[role="tab"]') as HTMLElement | null;
  if (!tab) throw new Error(`No role="tab" ancestor found for label "${label}"`);
  return tab;
}

describe("Tabs — rendering", () => {
  it("renders all tabs with their labels", () => {
    render(<Tabs tabs={sample} activeTabId="a" />);
    expect(screen.getByText("A")).not.toBeNull();
    expect(screen.getByText("B")).not.toBeNull();
    expect(screen.getByText("C")).not.toBeNull();
  });

  it("applies ariaLabel to the tablist", () => {
    render(<Tabs tabs={sample} activeTabId="a" ariaLabel="Sidoflikar" />);
    expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe(
      "Sidoflikar",
    );
  });

  it("does not invent an aria-label when ariaLabel is omitted", () => {
    render(<Tabs tabs={sample} activeTabId="a" />);
    expect(screen.getByRole("tablist").getAttribute("aria-label")).toBeNull();
  });

  it("renders a badge when provided", () => {
    const tabs: Tab[] = [
      { id: "a", label: "Beställningar", badge: 7 },
      { id: "b", label: "Arkiv" },
    ];
    render(<Tabs tabs={tabs} activeTabId="a" />);
    expect(screen.getByText("7")).not.toBeNull();
  });
});

describe("Tabs — ARIA + roving tabindex", () => {
  it("marks the active tab with aria-selected=true and others false", () => {
    render(<Tabs tabs={sample} activeTabId="b" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[2].getAttribute("aria-selected")).toBe("false");
  });

  it("sets tabIndex=0 on active tab and -1 on inactive tabs", () => {
    render(<Tabs tabs={sample} activeTabId="b" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].tabIndex).toBe(-1);
    expect(tabs[1].tabIndex).toBe(0);
    expect(tabs[2].tabIndex).toBe(-1);
  });
});

describe("Tabs — button mode click", () => {
  it("clicking a button tab fires onChange with its id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(id: string) => void>();
    render(<Tabs tabs={sample} activeTabId="a" onChange={onChange} />);
    await user.click(screen.getByText("B"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("clicking a disabled tab does NOT fire onChange", () => {
    // userEvent.click throws on disabled elements by design, so use
    // fireEvent.click to match the browser native dispatch — which our
    // handler still has to reject. jsdom suppresses onClick on disabled
    // buttons natively, so the assertion verifies both paths.
    const onChange = vi.fn<(id: string) => void>();
    const tabs: Tab[] = [
      { id: "a", label: "A" },
      { id: "b", label: "B", disabled: true },
    ];
    render(<Tabs tabs={tabs} activeTabId="a" onChange={onChange} />);
    fireEvent.click(screen.getByText("B"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Tabs — link mode", () => {
  const linkTabs: Tab[] = [
    { id: "a", label: "A", href: "/a" },
    { id: "b", label: "B", href: "/b" },
    { id: "c", label: "C", href: "/c" },
  ];

  it("renders each tab as an <a> with the given href", () => {
    render(<Tabs tabs={linkTabs} activeTabId="a" />);
    expect(getTab("A").tagName).toBe("A");
    expect(getTab("A").getAttribute("href")).toBe("/a");
    expect(getTab("B").getAttribute("href")).toBe("/b");
    expect(getTab("C").getAttribute("href")).toBe("/c");
  });

  it("click fires onChange when onChange is provided (analytics hook)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(id: string) => void>();
    render(<Tabs tabs={linkTabs} activeTabId="a" onChange={onChange} />);
    await user.click(screen.getByText("B"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("click is a no-op when onChange is not provided (nav delegated to Link)", async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={linkTabs} activeTabId="a" />);
    // Assert that clicking doesn't throw — nav is the Link's job, we own no state.
    await user.click(screen.getByText("B"));
    expect(screen.getByText("B")).not.toBeNull();
  });

  it("disabled link tab: click prevents navigation and does not fire onChange", () => {
    const onChange = vi.fn<(id: string) => void>();
    const tabs: Tab[] = [
      { id: "a", label: "A", href: "/a" },
      { id: "b", label: "B", href: "/b", disabled: true },
    ];
    render(<Tabs tabs={tabs} activeTabId="a" onChange={onChange} />);
    const click = fireEvent.click(screen.getByText("B"));
    // fireEvent returns whether defaultPrevented is true — our onClick calls
    // e.preventDefault() for disabled links.
    expect(click).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Tabs — keyboard navigation (button mode auto-activates)", () => {
  it("ArrowRight moves activation to the next non-disabled tab", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(id: string) => void>();
    render(<Tabs tabs={sample} activeTabId="a" onChange={onChange} />);
    act(() => getTab("A").focus());
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("ArrowLeft moves activation to the previous non-disabled tab", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(id: string) => void>();
    render(<Tabs tabs={sample} activeTabId="c" onChange={onChange} />);
    act(() => getTab("C").focus());
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("Home jumps to the first non-disabled tab", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(id: string) => void>();
    render(<Tabs tabs={sample} activeTabId="c" onChange={onChange} />);
    act(() => getTab("C").focus());
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("End jumps to the last non-disabled tab", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(id: string) => void>();
    render(<Tabs tabs={sample} activeTabId="a" onChange={onChange} />);
    act(() => getTab("A").focus());
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("arrow nav skips disabled tabs", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(id: string) => void>();
    const tabs: Tab[] = [
      { id: "a", label: "A" },
      { id: "b", label: "B", disabled: true },
      { id: "c", label: "C" },
    ];
    render(<Tabs tabs={tabs} activeTabId="a" onChange={onChange} />);
    act(() => getTab("A").focus());
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("ArrowRight on the last tab wraps to the first", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(id: string) => void>();
    render(<Tabs tabs={sample} activeTabId="c" onChange={onChange} />);
    act(() => getTab("C").focus());
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("ArrowLeft on the first tab wraps to the last", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(id: string) => void>();
    render(<Tabs tabs={sample} activeTabId="a" onChange={onChange} />);
    act(() => getTab("A").focus());
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith("c");
  });
});

describe("Tabs — keyboard navigation (link mode: manual activation)", () => {
  const linkTabs: Tab[] = [
    { id: "a", label: "A", href: "/a" },
    { id: "b", label: "B", href: "/b" },
    { id: "c", label: "C", href: "/c" },
  ];

  it("arrows move focus without auto-activating (onChange not called)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(id: string) => void>();
    render(<Tabs tabs={linkTabs} activeTabId="a" onChange={onChange} />);
    act(() => getTab("A").focus());
    await user.keyboard("{ArrowRight}");
    // Focus moved to the next tab
    expect(document.activeElement).toBe(getTab("B"));
    // onChange NOT called — user must press Enter to navigate in link mode
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Tabs — variant + size classes", () => {
  it("applies underline variant by default", () => {
    const { container } = render(<Tabs tabs={sample} activeTabId="a" />);
    expect(container.querySelector(".tabs--underline")).not.toBeNull();
  });

  it("applies pills variant when requested", () => {
    const { container } = render(
      <Tabs tabs={sample} activeTabId="a" variant="pills" />,
    );
    expect(container.querySelector(".tabs--pills")).not.toBeNull();
  });

  it("applies md size by default", () => {
    const { container } = render(<Tabs tabs={sample} activeTabId="a" />);
    expect(container.querySelector(".tabs--md")).not.toBeNull();
  });

  it("applies sm size when requested", () => {
    const { container } = render(
      <Tabs tabs={sample} activeTabId="a" size="sm" />,
    );
    expect(container.querySelector(".tabs--sm")).not.toBeNull();
  });
});
