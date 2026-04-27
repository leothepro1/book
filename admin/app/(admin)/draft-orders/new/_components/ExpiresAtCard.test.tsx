// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ExpiresAtCard } from "./ExpiresAtCard";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe("ExpiresAtCard", () => {
  it("EAC1 — renders with value formatted as local YYYY-MM-DD", () => {
    // 2026-05-04 local — constructed via Date(y, m, d) so no UTC shift.
    const value = new Date(2026, 4, 4);
    render(<ExpiresAtCard value={value} onChange={() => {}} />);
    const input = screen.getByLabelText("Utgångsdatum") as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.value).toBe("2026-05-04");
  });

  it("EAC2 — onChange fires with a Date matching local midnight", () => {
    const onChange = vi.fn();
    render(<ExpiresAtCard value={new Date(2026, 4, 4)} onChange={onChange} />);
    const input = screen.getByLabelText("Utgångsdatum") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-06-15" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const passed = onChange.mock.calls[0][0] as Date;
    expect(passed instanceof Date).toBe(true);
    expect(passed.getFullYear()).toBe(2026);
    expect(passed.getMonth()).toBe(5); // June
    expect(passed.getDate()).toBe(15);
    expect(passed.getHours()).toBe(0);
    expect(passed.getMinutes()).toBe(0);
  });

  it("EAC3 — min attribute equals today (local)", () => {
    render(<ExpiresAtCard value={new Date(2026, 4, 4)} onChange={() => {}} />);
    const input = screen.getByLabelText("Utgångsdatum") as HTMLInputElement;
    expect(input.min).toBe(todayLocalIso());
  });

  it("EAC4 — no clear control rendered (NOT NULL contract)", () => {
    render(<ExpiresAtCard value={new Date(2026, 4, 4)} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /ta bort/i })).toBeNull();
    expect(screen.queryByText(/ta bort utgångsdatum/i)).toBeNull();
  });

  it("EAC5 — empty user input no-ops (does not call onChange)", () => {
    const onChange = vi.fn();
    render(<ExpiresAtCard value={new Date(2026, 4, 4)} onChange={onChange} />);
    const input = screen.getByLabelText("Utgångsdatum") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("EAC6 — help text communicates auto-deletion", () => {
    render(<ExpiresAtCard value={new Date(2026, 4, 4)} onChange={() => {}} />);
    expect(
      screen.getByText("Utkastet raderas automatiskt efter detta datum."),
    ).toBeTruthy();
  });
});
