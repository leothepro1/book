// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { NotesCardEditable } from "./NotesCardEditable";

let onChangeMock: Mock<
  (next: { internalNote: string; customerNote: string }) => void
>;

beforeEach(() => {
  onChangeMock = vi.fn();
});

describe("NotesCardEditable", () => {
  it("renders both textareas with current values", () => {
    render(
      <NotesCardEditable
        value={{ internalNote: "intern text", customerNote: "kund text" }}
        onChange={onChangeMock}
      />,
    );
    expect(screen.getByDisplayValue("intern text")).toBeTruthy();
    expect(screen.getByDisplayValue("kund text")).toBeTruthy();
  });

  it("renders 0 / 5000 counters when both notes are empty", () => {
    render(
      <NotesCardEditable
        value={{ internalNote: "", customerNote: "" }}
        onChange={onChangeMock}
      />,
    );
    const counters = screen.getAllByText("0 / 5000");
    expect(counters.length).toBe(2);
  });

  it("typing in internal textarea fires onChange with updated internalNote, customerNote preserved", () => {
    render(
      <NotesCardEditable
        value={{ internalNote: "old internal", customerNote: "kund text" }}
        onChange={onChangeMock}
      />,
    );
    const textarea = screen.getByDisplayValue("old internal");
    fireEvent.change(textarea, { target: { value: "new internal" } });
    expect(onChangeMock).toHaveBeenCalledWith({
      internalNote: "new internal",
      customerNote: "kund text",
    });
  });

  it("typing in customer textarea fires onChange with updated customerNote, internalNote preserved", () => {
    render(
      <NotesCardEditable
        value={{ internalNote: "intern text", customerNote: "old kund" }}
        onChange={onChangeMock}
      />,
    );
    const textarea = screen.getByDisplayValue("old kund");
    fireEvent.change(textarea, { target: { value: "new kund" } });
    expect(onChangeMock).toHaveBeenCalledWith({
      internalNote: "intern text",
      customerNote: "new kund",
    });
  });

  it("textareas have maxLength=5000", () => {
    render(
      <NotesCardEditable
        value={{ internalNote: "", customerNote: "" }}
        onChange={onChangeMock}
      />,
    );
    const textareas = screen.getAllByRole("textbox");
    expect(textareas.length).toBe(2);
    textareas.forEach((t) => {
      expect((t as HTMLTextAreaElement).maxLength).toBe(5000);
    });
  });

  it("counters reflect current value-prop length", () => {
    render(
      <NotesCardEditable
        value={{ internalNote: "abc", customerNote: "fyra" }}
        onChange={onChangeMock}
      />,
    );
    expect(screen.getByText("3 / 5000")).toBeTruthy();
    expect(screen.getByText("4 / 5000")).toBeTruthy();
  });
});
