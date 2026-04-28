// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(admin)/draft-orders/new/_components/TagsCard", () => ({
  TagsCard: ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: (next: string[]) => void;
  }) => (
    <div data-testid="new-tags-card">
      <span data-testid="new-tags-value">{JSON.stringify(value)}</span>
      <button
        type="button"
        onClick={() => onChange([...value, "added"])}
      >
        mock-add
      </button>
    </div>
  ),
}));

import { TagsCardEditable } from "./TagsCardEditable";

let onChangeMock: Mock<(next: string[]) => void>;

beforeEach(() => {
  onChangeMock = vi.fn();
});

describe("TagsCardEditable", () => {
  it("renders /new TagsCard as inner", () => {
    render(<TagsCardEditable value={["x"]} onChange={onChangeMock} />);
    expect(screen.getByTestId("new-tags-card")).toBeTruthy();
  });

  it("passes value through to /new TagsCard", () => {
    render(
      <TagsCardEditable value={["a", "b"]} onChange={onChangeMock} />,
    );
    expect(screen.getByTestId("new-tags-value").textContent).toBe(
      JSON.stringify(["a", "b"]),
    );
  });

  it("forwards onChange from /new TagsCard", () => {
    render(<TagsCardEditable value={["a"]} onChange={onChangeMock} />);
    screen.getByText("mock-add").click();
    expect(onChangeMock).toHaveBeenCalledWith(["a", "added"]);
  });
});
