// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LineItemRow } from "./LineItemRow";
import type { LocalLineItem } from "./types";

function makeLine(overrides: Partial<LocalLineItem> = {}): LocalLineItem {
  return {
    tempId: "tmp_1",
    accommodation: {
      id: "a1",
      name: "Stuga Vik",
      type: "CABIN",
      status: "ACTIVE",
      basePricePerNight: 100000,
      currency: "SEK",
    },
    fromDate: new Date("2026-05-01"),
    toDate: new Date("2026-05-04"),
    guestCount: 2,
    isCheckingAvailability: false,
    availability: { available: true },
    ...overrides,
  };
}

describe("LineItemRow", () => {
  it("R1 — renders accommodation name", () => {
    render(
      <LineItemRow line={makeLine()} hasConflict={false} onRemove={() => {}} />,
    );
    expect(screen.getByText("Stuga Vik")).toBeTruthy();
  });

  it("R2 — renders date range via formatDateRange", () => {
    render(
      <LineItemRow line={makeLine()} hasConflict={false} onRemove={() => {}} />,
    );
    // formatDateRange yields "1–4 maj 2026" for same-month range.
    const meta = document.querySelector(".ndr-line-row__meta");
    expect(meta?.textContent).toContain("maj");
    expect(meta?.textContent).toContain("2026");
  });

  it("R3 — pluralizes guest count (1 → gäst, >1 → gäster)", () => {
    const { rerender } = render(
      <LineItemRow
        line={makeLine({ guestCount: 1 })}
        hasConflict={false}
        onRemove={() => {}}
      />,
    );
    expect(
      document.querySelector(".ndr-line-row__meta")?.textContent,
    ).toContain("1 gäst");
    rerender(
      <LineItemRow
        line={makeLine({ guestCount: 3 })}
        hasConflict={false}
        onRemove={() => {}}
      />,
    );
    expect(
      document.querySelector(".ndr-line-row__meta")?.textContent,
    ).toContain("3 gäster");
  });

  it("R4 — shows 'Kontrollerar tillgänglighet…' when isCheckingAvailability", () => {
    render(
      <LineItemRow
        line={makeLine({
          isCheckingAvailability: true,
          availability: undefined,
        })}
        hasConflict={false}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText("Kontrollerar tillgänglighet…")).toBeTruthy();
  });

  it("R5 — renders 'Inte tillgängligt' badge when availability.available === false", () => {
    render(
      <LineItemRow
        line={makeLine({
          isCheckingAvailability: false,
          availability: { available: false, reason: "Booked" },
        })}
        hasConflict={false}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText("Inte tillgängligt")).toBeTruthy();
    // Reason rendered too.
    expect(screen.getByText("Booked")).toBeTruthy();
  });

  it("R6 — renders 'Konflikt' badge when hasConflict (and not unavailable)", () => {
    render(
      <LineItemRow
        line={makeLine()}
        hasConflict={true}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText("Konflikt")).toBeTruthy();
  });

  it("R7 — onRemove fires on 'Ta bort' click", () => {
    const onRemove = vi.fn();
    render(
      <LineItemRow
        line={makeLine()}
        hasConflict={false}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("R8 — adds ndr-line-row--problem className when unavailable or conflict", () => {
    const { rerender, container } = render(
      <LineItemRow
        line={makeLine({
          isCheckingAvailability: false,
          availability: { available: false },
        })}
        hasConflict={false}
        onRemove={() => {}}
      />,
    );
    expect(
      container.querySelector(".ndr-line-row--problem"),
    ).not.toBeNull();

    rerender(
      <LineItemRow
        line={makeLine()}
        hasConflict={true}
        onRemove={() => {}}
      />,
    );
    expect(
      container.querySelector(".ndr-line-row--problem"),
    ).not.toBeNull();

    rerender(
      <LineItemRow
        line={makeLine()}
        hasConflict={false}
        onRemove={() => {}}
      />,
    );
    expect(container.querySelector(".ndr-line-row--problem")).toBeNull();
  });
});
