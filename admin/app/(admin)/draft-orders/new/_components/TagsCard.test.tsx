// @vitest-environment jsdom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../actions", () => ({
  searchDraftTagsAction: vi.fn(),
}));

import { searchDraftTagsAction } from "../actions";
import { TagsCard } from "./TagsCard";

const searchMock = searchDraftTagsAction as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  searchMock.mockReset();
  searchMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush() {
  // Drain pending macrotasks (debounce timer + resolved promise) inside act
  // so React commits the state updates the timer callback triggered.
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe("TagsCard", () => {
  it("TC1 — empty value renders input + 0 / 50 counter", () => {
    render(<TagsCard value={[]} onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByPlaceholderText("Lägg till tagg")).toBeTruthy();
    expect(screen.getByText("0 / 50")).toBeTruthy();
  });

  it("TC2 — Enter on non-empty input calls onChange with [trimmed]", () => {
    const onChange = vi.fn();
    render(<TagsCard value={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  vip  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["vip"]);
  });

  it("TC3 — case-insensitive dedup preserves first-as-typed casing", () => {
    const onChange = vi.fn();
    render(<TagsCard value={["vip"]} onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "VIP" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // No new entry — the lowercase-key collision keeps existing "vip".
    expect(onChange).not.toHaveBeenCalled();
  });

  it("TC4 — dedup across new tags within same call (preserve-as-typed)", () => {
    const onChange = vi.fn();
    render(<TagsCard value={["VIP", "Gold"]} onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "vip" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("TC5 — Backspace on empty input removes the last chip", () => {
    const onChange = vi.fn();
    render(<TagsCard value={["vip", "gold"]} onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith(["vip"]);
  });

  it("TC6 — clicking chip × calls onChange without that tag", () => {
    const onChange = vi.fn();
    render(<TagsCard value={["vip", "gold"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Ta bort vip" }));
    expect(onChange).toHaveBeenCalledWith(["gold"]);
  });

  it("TC7 — debounced searchDraftTagsAction fires once after 300ms", async () => {
    render(<TagsCard value={[]} onChange={() => {}} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "v" } });
    fireEvent.change(input, { target: { value: "vi" } });
    fireEvent.change(input, { target: { value: "vip" } });
    expect(searchMock).not.toHaveBeenCalled();
    await flush();
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock).toHaveBeenCalledWith("vip");
  });

  it("TC8 — suggestion list renders + click adds tag", async () => {
    searchMock.mockResolvedValue(["vip", "VIP-Gold"]);
    const onChange = vi.fn();
    render(<TagsCard value={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "vi" } });
    await flush();
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("vip")).toBeTruthy();
    fireEvent.click(within(listbox).getByText("VIP-Gold"));
    expect(onChange).toHaveBeenCalledWith(["VIP-Gold"]);
  });

  it("TC9 — suggestions exclude tags already in value (case-insensitive)", async () => {
    searchMock.mockResolvedValue(["VIP", "vipps", "vippg"]);
    render(<TagsCard value={["vip"]} onChange={() => {}} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "vi" } });
    await flush();
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByText("VIP")).toBeNull();
    expect(within(listbox).getByText("vipps")).toBeTruthy();
  });

  it("TC10 — at 50 tags input is disabled", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `tag${i}`);
    render(<TagsCard value={fifty} onChange={() => {}} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("TC11 — defensive: tag > 64 chars is rejected (Enter no-ops)", () => {
    const onChange = vi.fn();
    render(<TagsCard value={[]} onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    // Bypass maxLength via direct value injection — verifies the defensive check.
    const oversized = "x".repeat(65);
    fireEvent.change(input, { target: { value: oversized } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("TC12 — input has maxLength 64", () => {
    render(<TagsCard value={[]} onChange={() => {}} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.maxLength).toBe(64);
  });

  it("TC13 — counter reflects current value length", () => {
    const { rerender } = render(<TagsCard value={["a", "b", "c"]} onChange={() => {}} />);
    expect(screen.getByText("3 / 50")).toBeTruthy();
    rerender(<TagsCard value={["a"]} onChange={() => {}} />);
    expect(screen.getByText("1 / 50")).toBeTruthy();
  });
});
