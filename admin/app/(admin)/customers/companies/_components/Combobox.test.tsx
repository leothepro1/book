// @vitest-environment jsdom

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Combobox, type ComboboxOption } from "./Combobox";

// ── Test helpers ──────────────────────────────────────────────────

/**
 * Makes an onSearch mock that returns a pending promise we can resolve or
 * reject from the test. Each call pushes the supplied AbortSignal so we
 * can inspect cancellation behaviour.
 */
function makeDeferredSearch<T = unknown>() {
  const signals: AbortSignal[] = [];
  const resolvers: Array<(v: ComboboxOption<T>[]) => void> = [];
  const rejecters: Array<(r: unknown) => void> = [];
  const mockFn = vi.fn(
    async (_query: string, signal: AbortSignal): Promise<ComboboxOption<T>[]> => {
      signals.push(signal);
      return new Promise<ComboboxOption<T>[]>((resolve, reject) => {
        resolvers.push(resolve);
        rejecters.push(reject);
      });
    },
  );
  return {
    mockFn,
    signals,
    resolveLast: (v: ComboboxOption<T>[]) => resolvers.at(-1)?.(v),
    rejectLast: (r: unknown) => rejecters.at(-1)?.(r),
  };
}

/** An onSearch mock that resolves synchronously (microtask) with a fixed list. */
function makeImmediateSearch<T = unknown>(results: ComboboxOption<T>[]) {
  return vi.fn(async () => results);
}

/** Small controlled wrapper so tests can observe the onChange round-trip. */
function Controlled(props: {
  initial?: ComboboxOption<unknown> | null;
  onChange?: (v: ComboboxOption<unknown> | null) => void;
  onSearch: React.ComponentProps<typeof Combobox>["onSearch"];
  label?: string;
  minQueryLength?: number;
  debounceMs?: number;
  helpText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [v, setV] = useState<ComboboxOption<unknown> | null>(props.initial ?? null);
  return (
    <Combobox
      label={props.label ?? "Kund"}
      value={v}
      onChange={(opt) => {
        setV(opt);
        props.onChange?.(opt);
      }}
      onSearch={props.onSearch}
      minQueryLength={props.minQueryLength}
      debounceMs={props.debounceMs}
      helpText={props.helpText}
      error={props.error}
      required={props.required}
      disabled={props.disabled}
    />
  );
}

// ── Rendering ─────────────────────────────────────────────────────

describe("Combobox — rendering", () => {
  it("renders the input with the provided label", () => {
    render(<Controlled onSearch={makeImmediateSearch([])} />);
    expect(screen.getByLabelText("Kund")).not.toBeNull();
  });

  it("renders a placeholder when value is null and input is empty", () => {
    render(
      <Combobox
        label="Kund"
        value={null}
        onChange={() => {}}
        onSearch={makeImmediateSearch([])}
        placeholder="Sök kund…"
      />,
    );
    expect(
      (screen.getByLabelText("Kund") as HTMLInputElement).placeholder,
    ).toBe("Sök kund…");
  });

  it("populates the input with value.label when value is set", () => {
    render(
      <Controlled
        initial={{ id: "a", label: "Apelviken" }}
        onSearch={makeImmediateSearch([])}
      />,
    );
    expect((screen.getByLabelText("Kund") as HTMLInputElement).value).toBe(
      "Apelviken",
    );
  });

  it("renders helpText when no error is set", () => {
    render(
      <Controlled
        onSearch={makeImmediateSearch([])}
        helpText="Välj en befintlig kund"
      />,
    );
    expect(screen.getByText("Välj en befintlig kund")).not.toBeNull();
  });

  it("error replaces helpText and sets aria-invalid on the input", () => {
    render(
      <Controlled
        onSearch={makeImmediateSearch([])}
        helpText="ska inte visas"
        error="Kunden har spärrade fakturor."
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Kunden har spärrade fakturor.",
    );
    expect(screen.queryByText("ska inte visas")).toBeNull();
    expect(
      (screen.getByLabelText("Kund") as HTMLInputElement).getAttribute(
        "aria-invalid",
      ),
    ).toBe("true");
  });

  it("shows the clear × button only when value is not null", () => {
    // Testing Combobox directly (not through the Controlled wrapper) so
    // rerender actually flows a new `value` prop through — the wrapper's
    // useState(initial) only reads initial on mount, not on rerender.
    const onSearch = makeImmediateSearch([]);
    const { rerender } = render(
      <Combobox
        label="Kund"
        value={null}
        onChange={() => {}}
        onSearch={onSearch}
      />,
    );
    expect(screen.queryByRole("button", { name: "Rensa" })).toBeNull();
    rerender(
      <Combobox
        label="Kund"
        value={{ id: "a", label: "Apelviken" }}
        onChange={() => {}}
        onSearch={onSearch}
      />,
    );
    expect(screen.getByRole("button", { name: "Rensa" })).not.toBeNull();
  });

  it("disabled: input is disabled and clear button is hidden even with a value set", () => {
    render(
      <Controlled
        initial={{ id: "a", label: "Apelviken" }}
        onSearch={makeImmediateSearch([])}
        disabled
      />,
    );
    expect((screen.getByLabelText("Kund") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Rensa" })).toBeNull();
  });
});

// ── Search lifecycle (real timers, short debounce windows) ────────
//
// Fake timers interact poorly with userEvent + async Promise resolution in
// React 19: the combination reliably times out. Real timers with tiny
// `debounceMs` values are just as informative (the behaviour under test
// is "debounce exists" and "abort fires", not the exact ms count) and
// don't fight the async scheduler.

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("Combobox — search lifecycle", () => {
  it("typing does NOT fire onSearch until after debounceMs elapses", async () => {
    const user = userEvent.setup();
    const { mockFn } = makeDeferredSearch();
    render(<Controlled onSearch={mockFn} debounceMs={120} />);
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    // Immediately after typing, the debounce window has not yet elapsed.
    expect(mockFn).not.toHaveBeenCalled();
    // Wait past the debounce window.
    await wait(180);
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith("a", expect.any(AbortSignal));
  });

  it("rapid typing aborts the previous in-flight search via AbortSignal", async () => {
    const user = userEvent.setup();
    const { mockFn, signals } = makeDeferredSearch();
    render(<Controlled onSearch={mockFn} debounceMs={40} />);
    const input = screen.getByLabelText("Kund");

    await user.type(input, "a");
    await wait(80);
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    // Second keystroke while the first search is still pending. The
    // component should abort the first controller before debouncing
    // the next call.
    await user.type(input, "b");
    await wait(80);
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it("typing below minQueryLength does NOT call onSearch", async () => {
    const user = userEvent.setup();
    const { mockFn } = makeDeferredSearch();
    render(<Controlled onSearch={mockFn} minQueryLength={2} debounceMs={40} />);
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    await wait(80);
    expect(mockFn).not.toHaveBeenCalled();
    // Adding a second character hits the min and should trigger a search.
    await user.type(input, "b");
    await wait(80);
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith("ab", expect.any(AbortSignal));
  });

  it("loading message is visible while the search promise is pending", async () => {
    const user = userEvent.setup();
    const { mockFn } = makeDeferredSearch();
    render(<Controlled onSearch={mockFn} debounceMs={20} />);
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    await waitFor(() => expect(screen.getByText("Söker…")).not.toBeNull());
    expect(mockFn).toHaveBeenCalled();
  });

  it("empty message when onSearch resolves with []", async () => {
    const user = userEvent.setup();
    const { mockFn, resolveLast } = makeDeferredSearch();
    render(<Controlled onSearch={mockFn} debounceMs={20} />);
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    await waitFor(() => expect(mockFn).toHaveBeenCalled());
    await act(async () => {
      resolveLast([]);
    });
    await waitFor(() =>
      expect(screen.getByText("Inga träffar")).not.toBeNull(),
    );
  });

  it("renders options after onSearch resolves with results", async () => {
    const user = userEvent.setup();
    const { mockFn, resolveLast } = makeDeferredSearch();
    render(<Controlled onSearch={mockFn} debounceMs={20} />);
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    await waitFor(() => expect(mockFn).toHaveBeenCalled());
    await act(async () => {
      resolveLast([
        { id: "1", label: "Alpha AB" },
        { id: "2", label: "Beta AB" },
      ]);
    });
    await waitFor(() =>
      expect(screen.getByText("Alpha AB")).not.toBeNull(),
    );
    expect(screen.getByText("Beta AB")).not.toBeNull();
  });

  it("search error: onSearch rejects → error shown in dropdown, no field aria-invalid", async () => {
    const user = userEvent.setup();
    const { mockFn, rejectLast } = makeDeferredSearch();
    render(<Controlled onSearch={mockFn} debounceMs={20} />);
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    await waitFor(() => expect(mockFn).toHaveBeenCalled());
    await act(async () => {
      rejectLast(new Error("Nätverksfel"));
    });
    await waitFor(() => {
      const alerts = screen.queryAllByRole("alert");
      expect(alerts.some((a) => a.textContent === "Nätverksfel")).toBe(true);
    });
    expect(
      (screen.getByLabelText("Kund") as HTMLInputElement).getAttribute(
        "aria-invalid",
      ),
    ).toBeNull();
  });
});

// ── Keyboard nav (real timers, immediate search) ──────────────────

describe("Combobox — keyboard navigation", () => {
  const opts: ComboboxOption[] = [
    { id: "1", label: "Alpha" },
    { id: "2", label: "Beta" },
    { id: "3", label: "Gamma" },
  ];

  async function openWithResults(
    user: ReturnType<typeof userEvent.setup>,
    results: ComboboxOption[] = opts,
  ) {
    render(<Controlled onSearch={makeImmediateSearch(results)} debounceMs={0} />);
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    await waitFor(() =>
      expect(screen.getByText(results[0].label)).not.toBeNull(),
    );
    return input;
  }

  it("ArrowDown opens the dropdown when closed", async () => {
    const user = userEvent.setup();
    render(<Controlled onSearch={makeImmediateSearch([])} />);
    const input = screen.getByLabelText("Kund") as HTMLInputElement;
    // ensure blurred: combobox's onFocus opens it, so we have to avoid focus
    expect(input.getAttribute("aria-expanded")).toBe("false");
    act(() => input.focus()); // opens via focus
    await user.keyboard("{Escape}"); // explicit close
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).not.toBeNull();
  });

  it("ArrowDown highlights the next non-disabled option (results auto-highlight first)", async () => {
    const user = userEvent.setup();
    await openWithResults(user);
    // After results land, first option is auto-highlighted.
    const options = screen.getAllByRole("option");
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowDown}");
    const options2 = screen.getAllByRole("option");
    expect(options2[1].getAttribute("aria-selected")).toBe("true");
  });

  it("ArrowUp highlights the previous option", async () => {
    const user = userEvent.setup();
    await openWithResults(user);
    await user.keyboard("{ArrowDown}"); // 0 → 1
    await user.keyboard("{ArrowDown}"); // 1 → 2
    await user.keyboard("{ArrowUp}"); // 2 → 1
    const options = screen.getAllByRole("option");
    expect(options[1].getAttribute("aria-selected")).toBe("true");
  });

  it("ArrowDown on the last option wraps to the first", async () => {
    const user = userEvent.setup();
    await openWithResults(user);
    await user.keyboard("{ArrowDown}"); // 0 → 1
    await user.keyboard("{ArrowDown}"); // 1 → 2
    await user.keyboard("{ArrowDown}"); // 2 → 0 (wrap)
    const options = screen.getAllByRole("option");
    expect(options[0].getAttribute("aria-selected")).toBe("true");
  });

  it("Enter selects the highlighted option, closes dropdown, fires onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(v: ComboboxOption | null) => void>();
    render(
      <Controlled
        onChange={onChange}
        onSearch={makeImmediateSearch(opts)}
        debounceMs={0}
      />,
    );
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    await waitFor(() => expect(screen.getByText("Alpha")).not.toBeNull());
    await user.keyboard("{ArrowDown}"); // highlight Beta
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "2", label: "Beta" }),
    );
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape closes the dropdown without selecting", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(v: ComboboxOption | null) => void>();
    render(
      <Controlled
        onChange={onChange}
        onSearch={makeImmediateSearch(opts)}
        debounceMs={0}
      />,
    );
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    await waitFor(() => expect(screen.getByText("Alpha")).not.toBeNull());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "1" }),
    );
  });

  it("Tab closes the dropdown and moves focus naturally to the next field", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Controlled onSearch={makeImmediateSearch(opts)} debounceMs={0} />
        <button>Next field</button>
      </>,
    );
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    await waitFor(() => expect(screen.getByText("Alpha")).not.toBeNull());
    await user.tab();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(screen.getByText("Next field"));
  });

  it("arrow nav skips disabled options", async () => {
    const user = userEvent.setup();
    const withDisabled: ComboboxOption[] = [
      { id: "1", label: "Alpha" },
      { id: "2", label: "Beta", disabled: true },
      { id: "3", label: "Gamma" },
    ];
    await openWithResults(user, withDisabled);
    // Auto-highlighted = first enabled (Alpha, index 0).
    const getSelectedId = () => {
      const options = screen.getAllByRole("option");
      const sel = options.find((o) => o.getAttribute("aria-selected") === "true");
      return sel?.textContent;
    };
    expect(getSelectedId()).toContain("Alpha");
    await user.keyboard("{ArrowDown}");
    // Should skip disabled Beta and land on Gamma.
    expect(getSelectedId()).toContain("Gamma");
  });
});

// ── Mouse interaction ─────────────────────────────────────────────

describe("Combobox — mouse interaction", () => {
  const opts: ComboboxOption[] = [
    { id: "1", label: "Alpha" },
    { id: "2", label: "Beta" },
  ];

  it("click on an option fires onChange with that option and closes the dropdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(v: ComboboxOption | null) => void>();
    render(
      <Controlled
        onChange={onChange}
        onSearch={makeImmediateSearch(opts)}
        debounceMs={0}
      />,
    );
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    await waitFor(() => expect(screen.getByText("Alpha")).not.toBeNull());
    await user.click(screen.getByText("Beta"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "2", label: "Beta" }),
    );
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("click on × clear button fires onChange(null)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(v: ComboboxOption | null) => void>();
    render(
      <Controlled
        initial={{ id: "a", label: "Apelviken" }}
        onChange={onChange}
        onSearch={makeImmediateSearch([])}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Rensa" }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect((screen.getByLabelText("Kund") as HTMLInputElement).value).toBe("");
  });

  it("click outside the combobox closes the dropdown and preserves the selected value", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Outside</button>
        <Controlled
          initial={{ id: "a", label: "Apelviken" }}
          onSearch={makeImmediateSearch([])}
        />
      </>,
    );
    const input = screen.getByLabelText("Kund") as HTMLInputElement;
    act(() => input.focus());
    expect(screen.getByRole("listbox")).not.toBeNull();
    await user.click(screen.getByText("Outside"));
    expect(screen.queryByRole("listbox")).toBeNull();
    // Value preserved.
    expect(input.value).toBe("Apelviken");
  });
});

// ── Value management ─────────────────────────────────────────────

describe("Combobox — value management", () => {
  it("typing while a value is selected fires onChange(null) and starts a fresh query", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(v: ComboboxOption | null) => void>();
    render(
      <Controlled
        initial={{ id: "a", label: "Apelviken" }}
        onChange={onChange}
        onSearch={makeImmediateSearch([])}
        debounceMs={0}
      />,
    );
    const input = screen.getByLabelText("Kund") as HTMLInputElement;
    await user.clear(input);
    expect(onChange).toHaveBeenCalledWith(null);
    expect(input.value).toBe("");
  });

  it("external value change (parent sets new value) updates the input display", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [v, setV] = useState<ComboboxOption | null>(null);
      return (
        <>
          <button
            onClick={() =>
              setV({ id: "x", label: "Extern vald kund" })
            }
          >
            set
          </button>
          <Combobox
            label="Kund"
            value={v}
            onChange={setV}
            onSearch={makeImmediateSearch([])}
          />
        </>
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText("Kund") as HTMLInputElement;
    expect(input.value).toBe("");
    await user.click(screen.getByText("set"));
    expect(input.value).toBe("Extern vald kund");
  });
});

// ── Accessibility ─────────────────────────────────────────────────

describe("Combobox — accessibility", () => {
  const opts: ComboboxOption[] = [
    { id: "1", label: "Alpha" },
    { id: "2", label: "Beta" },
  ];

  it("role=combobox on input + aria-expanded reflects dropdown state", async () => {
    const user = userEvent.setup();
    render(<Controlled onSearch={makeImmediateSearch([])} />);
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    act(() => (input as HTMLInputElement).focus());
    expect(input.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("aria-activedescendant matches the highlighted option's id", async () => {
    const user = userEvent.setup();
    render(<Controlled onSearch={makeImmediateSearch(opts)} debounceMs={0} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "a");
    await waitFor(() => expect(screen.getByText("Alpha")).not.toBeNull());
    const highlightedOptionId = screen
      .getAllByRole("option")
      .find((o) => o.getAttribute("aria-selected") === "true")
      ?.getAttribute("id");
    expect(highlightedOptionId).not.toBeNull();
    expect(input.getAttribute("aria-activedescendant")).toBe(
      highlightedOptionId,
    );
  });

  it("dropdown is role=listbox when open", async () => {
    const user = userEvent.setup();
    render(<Controlled onSearch={makeImmediateSearch(opts)} debounceMs={0} />);
    const input = screen.getByLabelText("Kund");
    await user.type(input, "a");
    await waitFor(() => expect(screen.getByText("Alpha")).not.toBeNull());
    expect(screen.getByRole("listbox")).not.toBeNull();
  });
});
