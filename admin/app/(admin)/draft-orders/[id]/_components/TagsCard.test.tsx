// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TagsCard } from "./TagsCard";

describe("TagsCard — read-only", () => {
  it("renders empty-state when no tags", () => {
    render(<TagsCard tags={[]} />);
    expect(screen.getByText("Inga taggar.")).toBeTruthy();
  });

  it("renders one chip per tag", () => {
    render(<TagsCard tags={["vip", "high-season", "follow-up"]} />);
    expect(screen.getByText("vip")).toBeTruthy();
    expect(screen.getByText("high-season")).toBeTruthy();
    expect(screen.getByText("follow-up")).toBeTruthy();
  });

  it("renders no remove-button (read-only)", () => {
    const { container } = render(<TagsCard tags={["vip"]} />);
    expect(container.querySelector("button")).toBeNull();
  });
});
