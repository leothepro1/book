// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(admin)/draft-orders/new/_components/ExpiresAtCard", () => ({
  ExpiresAtCard: ({
    value,
    onChange,
  }: {
    value: Date;
    onChange: (next: Date) => void;
  }) => (
    <div data-testid="new-expires-card">
      <span data-testid="new-expires-iso">{value.toISOString()}</span>
      <button
        type="button"
        onClick={() => onChange(new Date("2026-12-25T00:00:00Z"))}
      >
        mock-pick
      </button>
    </div>
  ),
}));

import { ExpiresAtCardEditable } from "./ExpiresAtCardEditable";

let onChangeMock: Mock<(next: Date) => void>;

beforeEach(() => {
  onChangeMock = vi.fn();
});

describe("ExpiresAtCardEditable", () => {
  it("renders /new ExpiresAtCard as inner", () => {
    render(
      <ExpiresAtCardEditable
        value={new Date("2026-05-01T00:00:00Z")}
        onChange={onChangeMock}
      />,
    );
    expect(screen.getByTestId("new-expires-card")).toBeTruthy();
  });

  it("passes value through to /new ExpiresAtCard", () => {
    render(
      <ExpiresAtCardEditable
        value={new Date("2026-05-01T00:00:00Z")}
        onChange={onChangeMock}
      />,
    );
    expect(screen.getByTestId("new-expires-iso").textContent).toBe(
      "2026-05-01T00:00:00.000Z",
    );
  });

  it("forwards onChange from /new ExpiresAtCard", () => {
    render(
      <ExpiresAtCardEditable
        value={new Date("2026-05-01T00:00:00Z")}
        onChange={onChangeMock}
      />,
    );
    screen.getByText("mock-pick").click();
    expect(onChangeMock).toHaveBeenCalledWith(new Date("2026-12-25T00:00:00Z"));
  });
});
