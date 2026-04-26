// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../actions", () => ({
  searchAccommodationsAction: vi.fn(),
}));

import { searchAccommodationsAction } from "../actions";
import { AccommodationPickerModal } from "./AccommodationPickerModal";

const searchMock = searchAccommodationsAction as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  searchMock.mockReset();
  searchMock.mockResolvedValue([]);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function flushAsync() {
  // Resolve any in-flight microtasks (e.g. awaited action promises) under fake timers.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AccommodationPickerModal", () => {
  it("M1 — initial step is 'search'", async () => {
    render(
      <AccommodationPickerModal onClose={() => {}} onAdd={() => {}} />,
    );
    expect(screen.getByText("Välj boende")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Sök boende…"),
    ).toBeTruthy();
  });

  it("M2 — search input debounced 300ms before action call", async () => {
    searchMock.mockResolvedValue([
      {
        id: "a1",
        name: "Stuga A",
        type: "CABIN",
        status: "ACTIVE",
        basePricePerNight: 0,
        currency: "SEK",
      },
    ]);
    render(
      <AccommodationPickerModal onClose={() => {}} onAdd={() => {}} />,
    );
    // Initial mount call with debouncedQuery="" already fires; clear it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    searchMock.mockClear();

    const input = screen.getByPlaceholderText(
      "Sök boende…",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "stug" } });

    // Before debounce window completes, no new call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(searchMock).not.toHaveBeenCalled();

    // After debounce.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await flushAsync();
    expect(searchMock).toHaveBeenCalledWith("stug");
  });

  it("M3 — results render as clickable rows", async () => {
    searchMock.mockResolvedValue([
      {
        id: "a1",
        name: "Stuga A",
        type: "CABIN",
        status: "ACTIVE",
        basePricePerNight: 0,
        currency: "SEK",
      },
      {
        id: "a2",
        name: "Stuga B",
        type: "CABIN",
        status: "ACTIVE",
        basePricePerNight: 0,
        currency: "SEK",
      },
    ]);
    render(
      <AccommodationPickerModal onClose={() => {}} onAdd={() => {}} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    expect(screen.getByText("Stuga A")).toBeTruthy();
    expect(screen.getByText("Stuga B")).toBeTruthy();
  });

  it("M4 — clicking a result switches to details step with selected", async () => {
    searchMock.mockResolvedValue([
      {
        id: "a1",
        name: "Stuga A",
        type: "CABIN",
        status: "ACTIVE",
        basePricePerNight: 0,
        currency: "SEK",
      },
    ]);
    render(
      <AccommodationPickerModal onClose={() => {}} onAdd={() => {}} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    fireEvent.click(screen.getByText("Stuga A"));
    expect(screen.getByText("Datum för Stuga A")).toBeTruthy();
  });

  it("M5 — details step renders date inputs + guest count", async () => {
    searchMock.mockResolvedValue([
      {
        id: "a1",
        name: "X",
        type: "CABIN",
        status: "ACTIVE",
        basePricePerNight: 0,
        currency: "SEK",
      },
    ]);
    render(
      <AccommodationPickerModal onClose={() => {}} onAdd={() => {}} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    fireEvent.click(screen.getByText("X"));
    expect(screen.getByLabelText("Från")).toBeTruthy();
    expect(screen.getByLabelText("Till")).toBeTruthy();
    expect(screen.getByLabelText("Antal gäster")).toBeTruthy();
  });

  it("M6 — invalid dates → 'Lägg till' disabled", async () => {
    searchMock.mockResolvedValue([
      {
        id: "a1",
        name: "X",
        type: "CABIN",
        status: "ACTIVE",
        basePricePerNight: 0,
        currency: "SEK",
      },
    ]);
    render(
      <AccommodationPickerModal onClose={() => {}} onAdd={() => {}} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    fireEvent.click(screen.getByText("X"));
    // toDate before fromDate is invalid.
    fireEvent.change(screen.getByLabelText("Från"), {
      target: { value: "2026-05-05" },
    });
    fireEvent.change(screen.getByLabelText("Till"), {
      target: { value: "2026-05-03" },
    });
    const addBtn = screen.getByRole("button", {
      name: "Lägg till",
    }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });

  it("M7 — guestCount < 1 → 'Lägg till' disabled", async () => {
    searchMock.mockResolvedValue([
      {
        id: "a1",
        name: "X",
        type: "CABIN",
        status: "ACTIVE",
        basePricePerNight: 0,
        currency: "SEK",
      },
    ]);
    render(
      <AccommodationPickerModal onClose={() => {}} onAdd={() => {}} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    fireEvent.click(screen.getByText("X"));
    fireEvent.change(screen.getByLabelText("Från"), {
      target: { value: "2026-05-01" },
    });
    fireEvent.change(screen.getByLabelText("Till"), {
      target: { value: "2026-05-03" },
    });
    // Negative numeric input parses through onChange and lands as -3,
    // exercising the canAdd guard `guestCount >= 1`.
    fireEvent.change(screen.getByLabelText("Antal gäster"), {
      target: { value: "-3" },
    });
    expect(
      (
        screen.getByRole("button", { name: "Lägg till" }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("M8 — valid input + click → onAdd with correct params", async () => {
    searchMock.mockResolvedValue([
      {
        id: "a1",
        name: "X",
        type: "CABIN",
        status: "ACTIVE",
        basePricePerNight: 0,
        currency: "SEK",
      },
    ]);
    const onAdd = vi.fn();
    render(<AccommodationPickerModal onClose={() => {}} onAdd={onAdd} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    fireEvent.click(screen.getByText("X"));
    fireEvent.change(screen.getByLabelText("Från"), {
      target: { value: "2026-05-01" },
    });
    fireEvent.change(screen.getByLabelText("Till"), {
      target: { value: "2026-05-03" },
    });
    fireEvent.change(screen.getByLabelText("Antal gäster"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lägg till" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [acc, from, to, guests] = onAdd.mock.calls[0];
    expect(acc.id).toBe("a1");
    expect(from).toBeInstanceOf(Date);
    expect(to).toBeInstanceOf(Date);
    expect(from.getTime()).toBeLessThan(to.getTime());
    expect(guests).toBe(4);
  });

  it("M9 — onClose fires when overlay clicked", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <AccommodationPickerModal onClose={onClose} onAdd={() => {}} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    const overlay = container.querySelector(".am-overlay") as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("M10 — onClose fires on X button click", async () => {
    const onClose = vi.fn();
    render(<AccommodationPickerModal onClose={onClose} onAdd={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    fireEvent.click(screen.getByRole("button", { name: "Stäng" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("M11 — 'Tillbaka' from details returns to search step", async () => {
    searchMock.mockResolvedValue([
      {
        id: "a1",
        name: "X",
        type: "CABIN",
        status: "ACTIVE",
        basePricePerNight: 0,
        currency: "SEK",
      },
    ]);
    render(
      <AccommodationPickerModal onClose={() => {}} onAdd={() => {}} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushAsync();
    fireEvent.click(screen.getByText("X"));
    expect(screen.getByText("Datum för X")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tillbaka" }));
    expect(screen.getByText("Välj boende")).toBeTruthy();
  });
});
