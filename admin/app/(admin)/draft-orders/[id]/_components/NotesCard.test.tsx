// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { NotesCard } from "./NotesCard";

describe("NotesCard — read-only split", () => {
  it("renders both section headings always", () => {
    render(<NotesCard internalNote={null} customerNote={null} />);
    expect(screen.getByText("Intern anteckning")).toBeTruthy();
    expect(screen.getByText("Anteckning till kund")).toBeTruthy();
  });

  it("shows em-dash placeholder when both notes are null", () => {
    render(<NotesCard internalNote={null} customerNote={null} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(2);
  });

  it("renders internalNote body when set", () => {
    render(
      <NotesCard internalNote="Staff memo here" customerNote={null} />,
    );
    expect(screen.getByText("Staff memo here")).toBeTruthy();
  });

  it("renders customerNote body when set", () => {
    render(
      <NotesCard internalNote={null} customerNote="To-customer text" />,
    );
    expect(screen.getByText("To-customer text")).toBeTruthy();
  });

  it("preserves whitespace via pre-wrap", () => {
    render(
      <NotesCard internalNote={"line 1\nline 2"} customerNote={null} />,
    );
    const node = screen.getByText(/line 1/);
    expect(node.style.whiteSpace).toBe("pre-wrap");
  });
});
