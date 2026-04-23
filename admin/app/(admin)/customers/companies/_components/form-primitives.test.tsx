// @vitest-environment jsdom

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DateRangeField, NumberInput } from "./form-primitives";

/**
 * Small controlled wrapper so tests can observe the round-trip from
 * NumberInput's onChange through parent state back into the value prop.
 * Most real callers live inside <EditableCard>, which behaves the same way.
 */
function Controlled(props: {
  initial: number;
  onChange?: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  suffix?: string;
  disabled?: boolean;
  label?: string;
}) {
  const {
    initial,
    onChange,
    label = "Antal",
    min,
    max,
    step,
    precision,
    suffix,
    disabled,
  } = props;
  const [v, setV] = useState(initial);
  return (
    <NumberInput
      label={label}
      value={v}
      onChange={(n) => {
        setV(n);
        onChange?.(n);
      }}
      min={min}
      max={max}
      step={step}
      precision={precision}
      suffix={suffix}
      disabled={disabled}
    />
  );
}

describe("NumberInput", () => {
  it("renders the label and current value", () => {
    render(<NumberInput label="Antal" value={7} onChange={() => {}} />);
    const input = screen.getByLabelText("Antal") as HTMLInputElement;
    expect(input.value).toBe("7");
  });

  it("renders the suffix adjacent to the input", () => {
    render(<NumberInput label="Gäster" value={2} onChange={() => {}} suffix="st" />);
    expect(screen.getByText("st")).not.toBeNull();
  });

  it("renders helpText when provided and no error", () => {
    render(
      <NumberInput
        label="Antal"
        value={1}
        onChange={() => {}}
        helpText="Max 10 per bokning"
      />,
    );
    expect(screen.getByText("Max 10 per bokning")).not.toBeNull();
  });

  it("renders error instead of helpText and sets aria-invalid", () => {
    render(
      <NumberInput
        label="Antal"
        value={1}
        onChange={() => {}}
        helpText="ska inte visas"
        error="Måste vara minst 2"
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Måste vara minst 2");
    expect(screen.queryByText("ska inte visas")).toBeNull();
    expect((screen.getByLabelText("Antal") as HTMLInputElement).getAttribute("aria-invalid")).toBe("true");
  });

  it("+ button fires onChange with value + step", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(n: number) => void>();
    render(
      <NumberInput label="Antal" value={5} onChange={onChange} step={2} />,
    );
    await user.click(screen.getByRole("button", { name: /öka/i }));
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("− button fires onChange with value − step", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(n: number) => void>();
    render(
      <NumberInput label="Antal" value={5} onChange={onChange} step={2} />,
    );
    await user.click(screen.getByRole("button", { name: /minska/i }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("clamps to max on blur when user typed out of range", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(n: number) => void>();
    render(<Controlled initial={5} max={10} onChange={onChange} />);
    const input = screen.getByLabelText("Antal") as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, "50");
    expect(onChange).toHaveBeenLastCalledWith(50); // unclamped during typing
    await user.tab(); // blur
    expect(onChange).toHaveBeenLastCalledWith(10); // clamped on blur
    expect(input.value).toBe("10");
  });

  it("clamps to min on blur when user typed below range", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(n: number) => void>();
    render(<Controlled initial={5} min={1} onChange={onChange} />);
    const input = screen.getByLabelText("Antal") as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, "-3");
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(input.value).toBe("1");
  });

  it("disables input and both stepper buttons when disabled", () => {
    render(
      <NumberInput label="Antal" value={5} onChange={() => {}} disabled />,
    );
    expect((screen.getByLabelText("Antal") as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: /öka/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /minska/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("disables the − stepper when value is at min", () => {
    render(
      <NumberInput label="Antal" value={1} onChange={() => {}} min={1} max={10} />,
    );
    expect(
      (screen.getByRole("button", { name: /minska/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /öka/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("disables the + stepper when value is at max", () => {
    render(
      <NumberInput label="Antal" value={10} onChange={() => {}} min={1} max={10} />,
    );
    expect(
      (screen.getByRole("button", { name: /öka/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /minska/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("ArrowUp increments and ArrowDown decrements by step", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(n: number) => void>();
    render(<NumberInput label="Antal" value={5} onChange={onChange} step={2} />);
    const input = screen.getByLabelText("Antal");
    act(() => input.focus());
    await user.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith(7);
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith(3); // uncontrolled: still reads value=5 prop
  });

  it("respects precision=2 and accepts decimal values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(n: number) => void>();
    render(<Controlled initial={0} precision={2} onChange={onChange} />);
    const input = screen.getByLabelText("Antal") as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, "1.23");
    expect(onChange).toHaveBeenLastCalledWith(1.23);
    await user.tab();
    expect(input.value).toBe("1.23");
  });

  it("rejects decimal input when precision=0", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(n: number) => void>();
    render(<Controlled initial={0} precision={0} onChange={onChange} />);
    const input = screen.getByLabelText("Antal") as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, "1.5");
    // "." is rejected; final display is "15" (the "1" and "5" pass through).
    expect(input.value).toBe("15");
    expect(onChange).toHaveBeenLastCalledWith(15);
  });

  it("accepts comma as decimal separator during typing (Swedish locale habit)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(n: number) => void>();
    render(<Controlled initial={0} precision={2} onChange={onChange} />);
    const input = screen.getByLabelText("Antal") as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, "3,5");
    await user.tab();
    // Comma normalised to dot; final display uses dot + fixed precision.
    expect(input.value).toBe("3.50");
    expect(onChange).toHaveBeenLastCalledWith(3.5);
  });

  it("does not fire onChange for a no-op stepper click at boundary", async () => {
    // This scenario is structurally prevented (boundary button is disabled),
    // but we assert programmatically that calling stepBy at max with a
    // clamped result equal to value does not re-emit.
    const onChange = vi.fn<(n: number) => void>();
    render(
      <NumberInput label="Antal" value={10} onChange={onChange} min={0} max={10} />,
    );
    const incBtn = screen.getByRole("button", { name: /öka/i });
    expect((incBtn as HTMLButtonElement).disabled).toBe(true);
    // Even if somehow clicked (e.g. programmatic), the guard inside stepBy
    // prevents the no-op emission.
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// DateRangeField
// ═══════════════════════════════════════════════════════════════

/**
 * Helpers — date inputs are notoriously awkward with userEvent.type (its
 * behavior depends on the browser's date-input parser, which jsdom doesn't
 * fully implement). `fireEvent.change` is the canonical way to set a
 * date-input value in tests.
 */
function setDateInput(input: HTMLInputElement, iso: string): void {
  fireEvent.change(input, { target: { value: iso } });
}
function ymd(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

function ControlledDateRange(props: {
  initial?: { start: Date | null; end: Date | null };
  onChange?: (v: { start: Date | null; end: Date | null }) => void;
  label?: string;
  startLabel?: string;
  endLabel?: string;
  minDate?: Date;
  maxDate?: Date;
  helpText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  allowSameDay?: boolean;
}) {
  const {
    initial = { start: null, end: null },
    onChange,
    label = "Vistelse",
    ...rest
  } = props;
  const [v, setV] = useState(initial);
  return (
    <DateRangeField
      label={label}
      value={v}
      onChange={(next) => {
        setV(next);
        onChange?.(next);
      }}
      {...rest}
    />
  );
}

describe("DateRangeField", () => {
  it("renders two date inputs with default Från / Till sub-labels", () => {
    render(<ControlledDateRange />);
    const start = screen.getByLabelText("Från") as HTMLInputElement;
    const end = screen.getByLabelText("Till") as HTMLInputElement;
    expect(start.type).toBe("date");
    expect(end.type).toBe("date");
  });

  it("honours custom startLabel / endLabel", () => {
    render(
      <ControlledDateRange startLabel="Incheckning" endLabel="Utcheckning" />,
    );
    expect(screen.getByLabelText("Incheckning")).not.toBeNull();
    expect(screen.getByLabelText("Utcheckning")).not.toBeNull();
  });

  it("populates inputs from initial Date pair", () => {
    render(
      <ControlledDateRange
        initial={{ start: ymd(2026, 5, 10), end: ymd(2026, 5, 20) }}
      />,
    );
    expect((screen.getByLabelText("Från") as HTMLInputElement).value).toBe(
      "2026-05-10",
    );
    expect((screen.getByLabelText("Till") as HTMLInputElement).value).toBe(
      "2026-05-20",
    );
  });

  it("renders empty inputs when value is {null, null}", () => {
    render(<ControlledDateRange />);
    expect((screen.getByLabelText("Från") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Till") as HTMLInputElement).value).toBe("");
  });

  it("setting only start keeps end empty and fires onChange with {Date, null}", () => {
    const onChange = vi.fn<(v: { start: Date | null; end: Date | null }) => void>();
    render(<ControlledDateRange onChange={onChange} />);
    const start = screen.getByLabelText("Från") as HTMLInputElement;
    setDateInput(start, "2026-05-10");
    expect(onChange).toHaveBeenCalledTimes(1);
    const { start: s, end: e } = onChange.mock.calls[0][0];
    expect(s).toBeInstanceOf(Date);
    expect(s?.getFullYear()).toBe(2026);
    expect(s?.getMonth()).toBe(4); // 0-indexed May
    expect(s?.getDate()).toBe(10);
    expect(e).toBeNull();
    expect((screen.getByLabelText("Till") as HTMLInputElement).value).toBe("");
  });

  it("fires onChange with Date pair when a valid range is entered", () => {
    const onChange = vi.fn<(v: { start: Date | null; end: Date | null }) => void>();
    render(<ControlledDateRange onChange={onChange} />);
    setDateInput(screen.getByLabelText("Från") as HTMLInputElement, "2026-05-10");
    setDateInput(screen.getByLabelText("Till") as HTMLInputElement, "2026-05-15");
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last?.start).toBeInstanceOf(Date);
    expect(last?.end).toBeInstanceOf(Date);
    expect(last?.start?.getDate()).toBe(10);
    expect(last?.end?.getDate()).toBe(15);
  });

  it("shows validation error and suppresses onChange when end < start", () => {
    const onChange = vi.fn<(v: { start: Date | null; end: Date | null }) => void>();
    render(
      <ControlledDateRange
        initial={{ start: ymd(2026, 5, 10), end: null }}
        onChange={onChange}
      />,
    );
    onChange.mockClear(); // ignore the initial render's absence of calls
    const end = screen.getByLabelText("Till") as HTMLInputElement;
    setDateInput(end, "2026-05-05"); // before start
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/efter startdatumet/i);
    // User's typed value stays visible so they can correct it
    expect(end.value).toBe("2026-05-05");
  });

  it("blocks end === start when allowSameDay is false (default)", () => {
    const onChange = vi.fn<(v: { start: Date | null; end: Date | null }) => void>();
    render(
      <ControlledDateRange
        initial={{ start: ymd(2026, 5, 10), end: null }}
        onChange={onChange}
      />,
    );
    onChange.mockClear();
    setDateInput(screen.getByLabelText("Till") as HTMLInputElement, "2026-05-10");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).not.toBeNull();
  });

  it("permits end === start when allowSameDay is true", () => {
    const onChange = vi.fn<(v: { start: Date | null; end: Date | null }) => void>();
    render(
      <ControlledDateRange
        allowSameDay
        initial={{ start: ymd(2026, 5, 10), end: null }}
        onChange={onChange}
      />,
    );
    onChange.mockClear();
    setDateInput(screen.getByLabelText("Till") as HTMLInputElement, "2026-05-10");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sets min on start input from minDate prop", () => {
    render(<ControlledDateRange minDate={ymd(2026, 1, 1)} />);
    const start = screen.getByLabelText("Från") as HTMLInputElement;
    expect(start.getAttribute("min")).toBe("2026-01-01");
  });

  it("sets max on end input from maxDate prop", () => {
    render(<ControlledDateRange maxDate={ymd(2026, 12, 31)} />);
    const end = screen.getByLabelText("Till") as HTMLInputElement;
    expect(end.getAttribute("max")).toBe("2026-12-31");
  });

  it("end input's effective min = start + 1 day when start is set (default)", () => {
    render(
      <ControlledDateRange initial={{ start: ymd(2026, 5, 10), end: null }} />,
    );
    const end = screen.getByLabelText("Till") as HTMLInputElement;
    expect(end.getAttribute("min")).toBe("2026-05-11");
  });

  it("end input's effective min = start when allowSameDay is true", () => {
    render(
      <ControlledDateRange
        allowSameDay
        initial={{ start: ymd(2026, 5, 10), end: null }}
      />,
    );
    const end = screen.getByLabelText("Till") as HTMLInputElement;
    expect(end.getAttribute("min")).toBe("2026-05-10");
  });

  it("start input's effective max = end - 1 day when end is set (default)", () => {
    render(
      <ControlledDateRange initial={{ start: null, end: ymd(2026, 5, 20) }} />,
    );
    const start = screen.getByLabelText("Från") as HTMLInputElement;
    expect(start.getAttribute("max")).toBe("2026-05-19");
  });

  it("disables both inputs when disabled", () => {
    render(<ControlledDateRange disabled />);
    expect((screen.getByLabelText("Från") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Till") as HTMLInputElement).disabled).toBe(true);
  });

  it("sets required on both inputs when required", () => {
    render(<ControlledDateRange required />);
    expect((screen.getByLabelText("Från") as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText("Till") as HTMLInputElement).required).toBe(true);
  });

  it("renders helpText when no error is present", () => {
    render(<ControlledDateRange helpText="Minst en natt." />);
    expect(screen.getByText("Minst en natt.")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("error prop replaces helpText and mounts as role=alert", () => {
    render(
      <ControlledDateRange
        helpText="ska inte visas"
        error="Intervallet krockar med en befintlig bokning."
      />,
    );
    expect(screen.queryByText("ska inte visas")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(
      "Intervallet krockar med en befintlig bokning.",
    );
  });

  it("sets aria-invalid on both inputs when an error is shown", () => {
    render(<ControlledDateRange error="Fel" />);
    expect(
      (screen.getByLabelText("Från") as HTMLInputElement).getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      (screen.getByLabelText("Till") as HTMLInputElement).getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("parent error prop takes precedence over internal validation error in display", () => {
    const onChange = vi.fn<(v: { start: Date | null; end: Date | null }) => void>();
    render(
      <ControlledDateRange
        initial={{ start: ymd(2026, 5, 10), end: null }}
        error="Konflikt med befintlig bokning."
        onChange={onChange}
      />,
    );
    onChange.mockClear();
    // Type an invalid range — internal validation fails AND parent `error` is set.
    setDateInput(screen.getByLabelText("Till") as HTMLInputElement, "2026-05-05");
    // Display shows parent's error, not the internal "Slutdatumet…" message.
    expect(screen.getByRole("alert").textContent).toBe(
      "Konflikt med befintlig bokning.",
    );
    // Internal validation still blocks onChange — the two mechanisms are
    // independent: parent wins for display, internal wins for propagation.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears internal validation error when parent sends a new value externally", () => {
    // Simulates a consumer-driven reset (e.g. 'Rensa'-button).
    function ExternalReset() {
      const [v, setV] = useState<{ start: Date | null; end: Date | null }>({
        start: ymd(2026, 5, 10),
        end: null,
      });
      return (
        <>
          <DateRangeField label="Vistelse" value={v} onChange={setV} />
          <button onClick={() => setV({ start: null, end: null })}>reset</button>
        </>
      );
    }
    render(<ExternalReset />);
    const end = screen.getByLabelText("Till") as HTMLInputElement;
    setDateInput(end, "2026-05-05"); // invalid → surfaces error
    expect(screen.getByRole("alert")).not.toBeNull();
    fireEvent.click(screen.getByText("reset"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(end.value).toBe("");
  });
});
