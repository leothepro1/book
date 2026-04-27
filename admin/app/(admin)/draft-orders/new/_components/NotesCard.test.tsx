// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NotesCard } from "./NotesCard";

describe("NotesCard", () => {
  it("NC1 — empty value renders textarea with 0 / 5000 counter", () => {
    render(<NotesCard value="" onChange={() => {}} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe("");
    expect(screen.getByText("0 / 5000")).toBeTruthy();
  });

  it("NC2 — textarea is labelled by 'Anteckning'", () => {
    render(<NotesCard value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Anteckning")).toBeTruthy();
  });

  it("NC3 — onChange fires with the typed value", () => {
    const onChange = vi.fn();
    render(<NotesCard value="" onChange={onChange} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "ny anteckning" } });
    expect(onChange).toHaveBeenCalledWith("ny anteckning");
  });

  it("NC4 — counter reflects the controlled value length", () => {
    const { rerender } = render(<NotesCard value="abc" onChange={() => {}} />);
    expect(screen.getByText("3 / 5000")).toBeTruthy();
    rerender(<NotesCard value="hello world" onChange={() => {}} />);
    expect(screen.getByText("11 / 5000")).toBeTruthy();
  });

  it("NC5 — textarea has maxLength=5000", () => {
    render(<NotesCard value="" onChange={() => {}} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(5000);
  });

  it("NC6 — placeholder communicates internal-only intent", () => {
    render(<NotesCard value="" onChange={() => {}} />);
    expect(
      screen.getByPlaceholderText("Intern anteckning, syns inte för kund."),
    ).toBeTruthy();
  });
});
