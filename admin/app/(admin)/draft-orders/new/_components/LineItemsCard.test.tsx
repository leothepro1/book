// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import type { LocalLineItem } from "./types";

vi.mock("../actions", () => ({
  searchAccommodationsAction: vi.fn(),
  checkAvailabilityAction: vi.fn(),
}));

import { checkAvailabilityAction, searchAccommodationsAction } from "../actions";
import { LineItemsCard } from "./LineItemsCard";

const checkMock = checkAvailabilityAction as unknown as ReturnType<
  typeof vi.fn
>;
const searchMock = searchAccommodationsAction as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  checkMock.mockReset();
  searchMock.mockReset();
  searchMock.mockResolvedValue([]);
  checkMock.mockResolvedValue({ available: true });
});

afterEach(() => {
  vi.useRealTimers();
});

function makeLine(overrides: Partial<LocalLineItem> = {}): LocalLineItem {
  return {
    tempId: "tmp_1",
    accommodation: {
      id: "a1",
      name: "Stuga A",
      type: "CABIN",
      status: "ACTIVE",
      basePricePerNight: 0,
      currency: "SEK",
    },
    fromDate: new Date("2026-05-01"),
    toDate: new Date("2026-05-03"),
    guestCount: 2,
    isCheckingAvailability: false,
    availability: { available: true },
    ...overrides,
  };
}

describe("LineItemsCard", () => {
  it("L1 — empty state shows 'Inga boenden tillagda'", () => {
    render(
      <LineItemsCard
        lines={[]}
        setLines={() => {}}
        conflictingLineTempIds={[]}
      />,
    );
    expect(screen.getByText("Inga boenden tillagda")).toBeTruthy();
  });

  it("L2 — renders one LineItemRow per line", () => {
    render(
      <LineItemsCard
        lines={[
          makeLine({ tempId: "t1", accommodation: { ...makeLine().accommodation, name: "Alpha" } }),
          makeLine({ tempId: "t2", accommodation: { ...makeLine().accommodation, id: "a2", name: "Beta" } }),
        ]}
        setLines={() => {}}
        conflictingLineTempIds={[]}
      />,
    );
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("L3 — clicking 'Lägg till boende' opens the modal", () => {
    render(
      <LineItemsCard
        lines={[]}
        setLines={() => {}}
        conflictingLineTempIds={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Lägg till boende/i }));
    // Modal heading appears.
    expect(screen.getByText("Välj boende")).toBeTruthy();
  });

  it("L4 — handleAddLine triggers checkAvailabilityAction and updates the new line", async () => {
    let captured: LocalLineItem[] = [];
    function Wrapper() {
      const [lines, setLines] = useState<LocalLineItem[]>([]);
      // Mirror state into the closure-scoped capture after commit. Updating
      // in an effect (vs. directly during render) satisfies
      // react-hooks/globals — assertions still see the latest value because
      // act() flushes effects before they read.
      useEffect(() => {
        captured = lines;
      }, [lines]);
      return (
        <LineItemsCard
          lines={lines}
          setLines={setLines}
          conflictingLineTempIds={[]}
        />
      );
    }
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
    let resolveCheck: (v: { available: boolean }) => void = () => {};
    checkMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );

    render(<Wrapper />);
    fireEvent.click(screen.getByRole("button", { name: /Lägg till boende/i }));
    // Wait for modal's debounce + initial empty search to settle.
    await waitFor(() => {
      expect(screen.getByText("Stuga A")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Stuga A"));
    fireEvent.change(screen.getByLabelText("Från"), {
      target: { value: "2026-05-01" },
    });
    fireEvent.change(screen.getByLabelText("Till"), {
      target: { value: "2026-05-03" },
    });
    fireEvent.change(screen.getByLabelText("Antal gäster"), {
      target: { value: "2" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lägg till" }));
    });

    expect(captured.length).toBe(1);
    expect(captured[0].isCheckingAvailability).toBe(true);
    expect(checkMock).toHaveBeenCalledWith(
      "a1",
      expect.any(Date),
      expect.any(Date),
    );

    await act(async () => {
      resolveCheck({ available: true });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(captured[0].isCheckingAvailability).toBe(false);
    expect(captured[0].availability).toEqual({ available: true });
  });

  it("L5 — handleRemoveLine removes the matching line", () => {
    let captured: LocalLineItem[] = [];
    function Wrapper() {
      const [lines, setLines] = useState<LocalLineItem[]>([
        makeLine({ tempId: "t1" }),
        makeLine({
          tempId: "t2",
          accommodation: {
            ...makeLine().accommodation,
            id: "a2",
            name: "Other",
          },
        }),
      ]);
      // See L4 — mirror in effect, not during render.
      useEffect(() => {
        captured = lines;
      }, [lines]);
      return (
        <LineItemsCard
          lines={lines}
          setLines={setLines}
          conflictingLineTempIds={[]}
        />
      );
    }
    render(<Wrapper />);
    expect(captured.length).toBe(2);
    // Click first 'Ta bort' button.
    const removes = screen.getAllByRole("button", { name: "Ta bort" });
    fireEvent.click(removes[0]);
    expect(captured.length).toBe(1);
    expect(captured[0].tempId).toBe("t2");
  });
});
