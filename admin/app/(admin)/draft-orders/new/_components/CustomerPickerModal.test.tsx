// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { CustomerSearchResult } from "@/app/_lib/draft-orders";

vi.mock("../actions", () => ({
  searchCustomersAction: vi.fn(),
}));

import { searchCustomersAction } from "../actions";
import { CustomerPickerModal } from "./CustomerPickerModal";

const searchMock = searchCustomersAction as unknown as ReturnType<
  typeof vi.fn
>;

const ANNA: CustomerSearchResult = {
  id: "g1",
  email: "anna@example.se",
  name: "Anna Andersson",
  phone: null,
  draftOrderCount: 0,
  orderCount: 3,
};

const NO_NAME: CustomerSearchResult = {
  id: "g2",
  email: "bob@example.se",
  name: null,
  phone: null,
  draftOrderCount: 0,
  orderCount: 0,
};

beforeEach(() => {
  searchMock.mockReset();
  searchMock.mockResolvedValue([]);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("CustomerPickerModal", () => {
  it("CP1 — renders dialog with title and search input", async () => {
    render(
      <CustomerPickerModal onClose={() => {}} onSelect={() => {}} />,
    );
    expect(screen.getByText("Välj kund")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Sök på namn eller e-post"),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("CP2 — shows hint when query empty", () => {
    render(
      <CustomerPickerModal onClose={() => {}} onSelect={() => {}} />,
    );
    expect(
      screen.getAllByText("Sök på namn eller e-post").length,
    ).toBeGreaterThan(0);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("CP3 — debounces input 300ms before action call", async () => {
    searchMock.mockResolvedValue([ANNA]);
    render(
      <CustomerPickerModal onClose={() => {}} onSelect={() => {}} />,
    );
    const input = screen.getByPlaceholderText(
      "Sök på namn eller e-post",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "anna" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(searchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await flushAsync();
    expect(searchMock).toHaveBeenCalledWith("anna");
  });

  it("CP4 — renders results with name and meta", async () => {
    searchMock.mockResolvedValue([ANNA]);
    render(
      <CustomerPickerModal onClose={() => {}} onSelect={() => {}} />,
    );
    fireEvent.change(
      screen.getByPlaceholderText("Sök på namn eller e-post"),
      { target: { value: "anna" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    expect(screen.getByText("Anna Andersson")).toBeTruthy();
    expect(screen.getByText("anna@example.se · 3 ordrar")).toBeTruthy();
  });

  it("CP5 — name=null falls back to email as title", async () => {
    searchMock.mockResolvedValue([NO_NAME]);
    render(
      <CustomerPickerModal onClose={() => {}} onSelect={() => {}} />,
    );
    fireEvent.change(
      screen.getByPlaceholderText("Sök på namn eller e-post"),
      { target: { value: "bob" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    expect(screen.getByText("bob@example.se")).toBeTruthy();
  });

  it("CP6 — order count uses singular for 1", async () => {
    searchMock.mockResolvedValue([{ ...ANNA, orderCount: 1 }]);
    render(
      <CustomerPickerModal onClose={() => {}} onSelect={() => {}} />,
    );
    fireEvent.change(
      screen.getByPlaceholderText("Sök på namn eller e-post"),
      { target: { value: "a" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    expect(screen.getByText("anna@example.se · 1 order")).toBeTruthy();
  });

  it("CP7 — empty results show 'Inga matchningar'", async () => {
    searchMock.mockResolvedValue([]);
    render(
      <CustomerPickerModal onClose={() => {}} onSelect={() => {}} />,
    );
    fireEvent.change(
      screen.getByPlaceholderText("Sök på namn eller e-post"),
      { target: { value: "xyz" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    expect(screen.getByText("Inga matchningar")).toBeTruthy();
  });

  it("CP8 — clicking a result calls onSelect + onClose", async () => {
    searchMock.mockResolvedValue([ANNA]);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CustomerPickerModal onClose={onClose} onSelect={onSelect} />,
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
    expect(onSelect).toHaveBeenCalledWith(ANNA);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("CP9 — clicking overlay calls onClose", () => {
    const onClose = vi.fn();
    const { container } = render(
      <CustomerPickerModal onClose={onClose} onSelect={() => {}} />,
    );
    const overlay = container.querySelector(".am-overlay") as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("CP10 — clicking modal-inner does NOT call onClose (stopPropagation)", () => {
    const onClose = vi.fn();
    const { container } = render(
      <CustomerPickerModal onClose={onClose} onSelect={() => {}} />,
    );
    const modal = container.querySelector(".am-modal") as HTMLElement;
    fireEvent.click(modal);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("CP11 — X-button calls onClose", () => {
    const onClose = vi.fn();
    render(
      <CustomerPickerModal onClose={onClose} onSelect={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stäng" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("CP12 — Avbryt-button calls onClose", () => {
    const onClose = vi.fn();
    render(
      <CustomerPickerModal onClose={onClose} onSelect={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("CP13 — empty query hides prior results via render guard (no extra fetch)", async () => {
    searchMock.mockResolvedValue([ANNA]);
    render(
      <CustomerPickerModal onClose={() => {}} onSelect={() => {}} />,
    );
    const input = screen.getByPlaceholderText(
      "Sök på namn eller e-post",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "anna" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    expect(screen.getByText("Anna Andersson")).toBeTruthy();

    searchMock.mockClear();
    fireEvent.change(input, { target: { value: "" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    expect(searchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Anna Andersson")).toBeNull();
  });
});
