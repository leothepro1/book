// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { SaveBar } from "./SaveBar";

describe("SaveBar", () => {
  it("S1 — portal-renders into document.body", () => {
    const { container } = render(
      <SaveBar canSave={true} isSaving={false} onSave={() => {}} />,
    );
    // Portal: nothing should render inside the test container itself.
    expect(container.querySelector(".pf-footer")).toBeNull();
    // But .pf-footer must exist on document.body.
    expect(document.body.querySelector(".pf-footer")).not.toBeNull();
  });

  it("S2 — disabled when !canSave", () => {
    render(<SaveBar canSave={false} isSaving={false} onSave={() => {}} />);
    const btn = document.body.querySelector(
      ".pf-footer button",
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(true);
  });

  it("S3 — disabled when isSaving", () => {
    render(<SaveBar canSave={true} isSaving={true} onSave={() => {}} />);
    const btn = document.body.querySelector(
      ".pf-footer button",
    ) as HTMLButtonElement | null;
    expect(btn!.disabled).toBe(true);
  });

  it("S4 — text 'Skapa order' when not saving", () => {
    render(<SaveBar canSave={true} isSaving={false} onSave={() => {}} />);
    const btn = document.body.querySelector(".pf-footer button");
    expect(btn?.textContent).toBe("Skapa order");
  });

  it("S5 — text 'Skapar order…' when isSaving", () => {
    render(<SaveBar canSave={true} isSaving={true} onSave={() => {}} />);
    const btn = document.body.querySelector(".pf-footer button");
    expect(btn?.textContent).toBe("Skapar order…");
  });

  it("S6 — onSave fires on click", () => {
    const onSave = vi.fn();
    render(<SaveBar canSave={true} isSaving={false} onSave={onSave} />);
    const btn = document.body.querySelector(
      ".pf-footer button",
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
