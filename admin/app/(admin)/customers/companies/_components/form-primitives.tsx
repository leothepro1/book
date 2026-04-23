"use client";

/**
 * Narrow form primitives for the Companies admin UI.
 *
 * Why not reuse products/accommodations inputs verbatim?
 *   The audit in FAS 5 confirmed those pages use raw HTML inputs with admin
 *   CSS classes rather than React components. There is literally nothing to
 *   reuse at the component level. These primitives wrap the SAME classes and
 *   SAME patterns — same underlying CSS tokens, same focus handling — just
 *   packaged for ergonomics so we don't repeat 40 lines of JSX per card.
 *
 * Gaps confirmed missing in the rest of the admin and built here:
 *   - AddressField  (no split address input exists; products/accommodations
 *                    never collect addresses).
 *   - JsonField     (no raw-JSON editor exists; needed for metafields).
 *   - ChipInput     (products has an inline chip implementation but no
 *                    standalone component; wrapped here for reuse).
 *   - MoneyInput    (products uses raw <input type="number"> inline; we
 *                    need BigInt-safe handling for creditLimitCents).
 *   - PercentInput  (not present anywhere; needed for depositPercent).
 *
 * These are all visually consistent with the existing admin — same base.css
 * tokens, same BEM prefix direction — and small enough to inline without
 * a design-system commitment.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// NOTE: Older primitives (TextField, SelectField, etc.) use `help` and surface
// errors via render-prop parents. Newer primitives (NumberInput, DateRangeField)
// use `helpText` and explicit `error` props per FAS 6.0 conventions.
// TODO: Align older primitives in a dedicated cleanup pass.

// ── TextField ───────────────────────────────────────────────────

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  help,
  type = "text",
  disabled,
  required,
  autoFocus,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
  type?: "text" | "email" | "tel" | "url";
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  onBlur?: () => void;
}) {
  const id = useId();
  return (
    <div className="co-field">
      <label htmlFor={id} className="co-field__label">
        {label}
        {required ? <span className="co-field__required"> *</span> : null}
      </label>
      <input
        id={id}
        type={type}
        className="co-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {help ? <div className="co-field__help">{help}</div> : null}
    </div>
  );
}

// ── TextArea ────────────────────────────────────────────────────

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  help,
  rows = 3,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
  rows?: number;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="co-field">
      <label htmlFor={id} className="co-field__label">
        {label}
      </label>
      <textarea
        id={id}
        className="co-input co-textarea"
        value={value}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {help ? <div className="co-field__help">{help}</div> : null}
    </div>
  );
}

// ── SelectField ─────────────────────────────────────────────────

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  help,
  disabled,
  required,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  help?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="co-field">
      <label htmlFor={id} className="co-field__label">
        {label}
        {required ? <span className="co-field__required"> *</span> : null}
      </label>
      <select
        id={id}
        className="co-input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {help ? <div className="co-field__help">{help}</div> : null}
    </div>
  );
}

// ── Toggle ──────────────────────────────────────────────────────

export function ToggleField({
  label,
  value,
  onChange,
  help,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  help?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="co-field co-field--inline">
      <input
        id={id}
        type="checkbox"
        className="co-toggle"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="co-field__label">
        {label}
      </label>
      {help ? <div className="co-field__help">{help}</div> : null}
    </div>
  );
}

// ── ChipInput (tags) ────────────────────────────────────────────

export function ChipInput({
  label,
  value,
  onChange,
  placeholder = "Skriv och tryck Enter…",
  help,
}: {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  help?: string;
}) {
  const id = useId();
  const [input, setInput] = useState("");
  const add = useCallback(
    (raw: string) => {
      const t = raw.trim();
      if (!t) return;
      if (value.includes(t)) {
        setInput("");
        return;
      }
      onChange([...value, t]);
      setInput("");
    },
    [value, onChange],
  );
  const removeAt = useCallback(
    (i: number) => onChange(value.filter((_, idx) => idx !== i)),
    [value, onChange],
  );
  return (
    <div className="co-field">
      <label htmlFor={id} className="co-field__label">
        {label}
      </label>
      <div className="co-chip-input">
        {value.map((tag, i) => (
          <span key={`${tag}-${i}`} className="co-chip">
            {tag}
            <button
              type="button"
              className="co-chip__remove"
              onClick={() => removeAt(i)}
              aria-label={`Ta bort ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          className="co-chip-input__field"
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(input);
            } else if (
              e.key === "Backspace" &&
              input === "" &&
              value.length > 0
            ) {
              removeAt(value.length - 1);
            }
          }}
          onBlur={() => input && add(input)}
        />
      </div>
      {help ? <div className="co-field__help">{help}</div> : null}
    </div>
  );
}

// ── AddressField ────────────────────────────────────────────────

export interface Address {
  name?: string;
  line1?: string;
  line2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
}

export function AddressField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: Address;
  onChange: (v: Address) => void;
  required?: boolean;
}) {
  const set = useCallback(
    (patch: Partial<Address>) => onChange({ ...value, ...patch }),
    [value, onChange],
  );
  return (
    <fieldset className="co-fieldset">
      <legend className="co-field__label">
        {label}
        {required ? <span className="co-field__required"> *</span> : null}
      </legend>
      <TextField
        label="Mottagare / Företagsnamn"
        value={value.name ?? ""}
        onChange={(v) => set({ name: v })}
      />
      <TextField
        label="Gatuadress"
        value={value.line1 ?? ""}
        onChange={(v) => set({ line1: v })}
      />
      <TextField
        label="Adresstillägg"
        value={value.line2 ?? ""}
        onChange={(v) => set({ line2: v })}
      />
      <div className="co-field-row">
        <TextField
          label="Postnummer"
          value={value.postalCode ?? ""}
          onChange={(v) => set({ postalCode: v })}
        />
        <TextField
          label="Ort"
          value={value.city ?? ""}
          onChange={(v) => set({ city: v })}
        />
      </div>
      <TextField
        label="Land"
        value={value.country ?? ""}
        onChange={(v) => set({ country: v })}
        placeholder="SE"
        help="Två bokstäver (ISO 3166). Fullständig utlandsleverans landar i senare version."
      />
    </fieldset>
  );
}

// ── JsonField (metafields) ──────────────────────────────────────

export function JsonField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  help?: string;
}) {
  const id = useId();
  const [raw, setRaw] = useState(() => toPretty(value));
  const [parseError, setParseError] = useState<string | null>(null);

  const flush = useCallback(() => {
    if (raw.trim() === "") {
      setParseError(null);
      onChange(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (
        parsed === null ||
        Array.isArray(parsed) ||
        typeof parsed !== "object"
      ) {
        setParseError("Metafields måste vara ett JSON-objekt (inte lista eller primitivt värde).");
        return;
      }
      setParseError(null);
      onChange(parsed);
    } catch (e) {
      setParseError(
        e instanceof Error ? `Ogiltigt JSON: ${e.message}` : "Ogiltigt JSON",
      );
    }
  }, [raw, onChange]);

  return (
    <div className="co-field">
      <label htmlFor={id} className="co-field__label">
        {label}
      </label>
      <textarea
        id={id}
        className="co-input co-json-editor"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={flush}
        rows={10}
        spellCheck={false}
      />
      {parseError ? (
        <div className="co-field__error" role="alert">
          {parseError}
        </div>
      ) : help ? (
        <div className="co-field__help">{help}</div>
      ) : null}
    </div>
  );
}

function toPretty(v: unknown): string {
  if (v === null || v === undefined) return "";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "";
  }
}

// ── MoneyInput (BigInt cents) ───────────────────────────────────

/**
 * Money input that stores values as BigInt cents end-to-end. Users type the
 * display value in kronor ("1234,56") and we convert on every keystroke.
 * Rejects non-numeric input rather than silently coercing to 0.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  help,
  allowNull = false,
  placeholder = "0",
}: {
  label: string;
  value: bigint | null;
  onChange: (v: bigint | null) => void;
  help?: string;
  allowNull?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const [display, setDisplay] = useState(() => bigintToDisplay(value));

  const handle = useCallback(
    (raw: string) => {
      setDisplay(raw);
      if (raw.trim() === "") {
        if (allowNull) onChange(null);
        else onChange(BigInt(0));
        return;
      }
      // Accept both "123,45" and "123.45"; reject anything else.
      const normalised = raw.replace(/\s/g, "").replace(",", ".");
      if (!/^-?\d+(\.\d{0,2})?$/.test(normalised)) return;
      const [whole, frac = ""] = normalised.split(".");
      const cents = BigInt(whole) * BigInt(100) + BigInt(frac.padEnd(2, "0").slice(0, 2) || "0");
      onChange(cents);
    },
    [onChange, allowNull],
  );
  return (
    <div className="co-field">
      <label htmlFor={id} className="co-field__label">
        {label}
      </label>
      <div className="co-money-input">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          className="co-input"
          value={display}
          placeholder={placeholder}
          onChange={(e) => handle(e.target.value)}
        />
        <span className="co-money-input__suffix">kr</span>
      </div>
      {help ? <div className="co-field__help">{help}</div> : null}
    </div>
  );
}

function bigintToDisplay(cents: bigint | null): string {
  if (cents === null) return "";
  const neg = cents < BigInt(0);
  const abs = neg ? -cents : cents;
  const whole = (abs / BigInt(100)).toString();
  const frac = (abs % BigInt(100)).toString().padStart(2, "0");
  const body = frac === "00" ? whole : `${whole},${frac}`;
  return neg ? `-${body}` : body;
}

// ── PercentInput ────────────────────────────────────────────────

export function PercentInput({
  label,
  value,
  onChange,
  help,
  min = 0,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  help?: string;
  min?: number;
  max?: number;
}) {
  const id = useId();
  return (
    <div className="co-field">
      <label htmlFor={id} className="co-field__label">
        {label}
      </label>
      <div className="co-money-input">
        <input
          id={id}
          type="number"
          className="co-input"
          value={value}
          min={min}
          max={max}
          step={1}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(Math.max(min, Math.min(max, Math.round(n))));
          }}
        />
        <span className="co-money-input__suffix">%</span>
      </div>
      {help ? <div className="co-field__help">{help}</div> : null}
    </div>
  );
}

// ── NumberInput ─────────────────────────────────────────────────

/**
 * Integer-or-decimal number input with inline −/+ steppers.
 *
 * Contract:
 *   - `value` is always a finite number (null is not supported; wrap at
 *     call site if the field is optional).
 *   - Clamping is deferred to blur + stepper clicks. Typing a transient
 *     out-of-range value does not clobber mid-entry; the final clamp
 *     fires once the user leaves the field or uses a stepper.
 *   - `precision` controls how many fractional digits the input accepts
 *     AND the display formatting after clamp. Step size is independent.
 *   - `suffix` is decorative inline content, not part of the value.
 *   - Steppers are `tabIndex={-1}` so keyboard users step via ArrowUp/
 *     ArrowDown on the input itself (mouse users retain the buttons).
 */
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 0,
  suffix,
  helpText,
  error,
  required,
  disabled,
  id: idProp,
  placeholder,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  suffix?: string;
  helpText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const helpId = helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;

  const format = useCallback(
    (n: number) => (precision === 0 ? String(Math.round(n)) : n.toFixed(precision)),
    [precision],
  );

  const clamp = useCallback(
    (n: number) => {
      const lo = min ?? Number.NEGATIVE_INFINITY;
      const hi = max ?? Number.POSITIVE_INFINITY;
      return Math.min(hi, Math.max(lo, n));
    },
    [min, max],
  );

  const normalise = useCallback(
    (n: number) => {
      const clamped = clamp(n);
      const factor = Math.pow(10, precision);
      return Math.round(clamped * factor) / factor;
    },
    [clamp, precision],
  );

  const allowedPattern = useMemo(
    () =>
      precision === 0
        ? /^-?\d*$/
        : new RegExp(`^-?\\d*(\\.\\d{0,${precision}})?$`),
    [precision],
  );

  const [display, setDisplay] = useState(() => format(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // External value changes (parent setState, reset buttons, etc.) re-sync
  // the display — but only when the user isn't actively typing, to avoid
  // clobbering an in-progress keystroke with a reformatted snapshot.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.activeElement !== inputRef.current) {
      setDisplay(format(value));
    }
  }, [value, format]);

  const handleType = useCallback(
    (raw: string) => {
      // Accept comma or dot as decimal separator during typing; the regex
      // test runs against the dot-normalised form.
      const probe = raw.replace(",", ".");
      if (!allowedPattern.test(probe)) return;
      setDisplay(raw);
      if (probe === "" || probe === "-" || probe === "." || probe === "-.") return;
      const parsed = Number(probe);
      if (!Number.isFinite(parsed)) return;
      onChange(parsed); // unclamped; blur performs final clamp
    },
    [allowedPattern, onChange],
  );

  const handleBlur = useCallback(() => {
    const probe = display.replace(",", ".");
    const parsed = Number(probe);
    if (!Number.isFinite(parsed) || probe === "" || probe === "-") {
      setDisplay(format(value));
      return;
    }
    const next = normalise(parsed);
    setDisplay(format(next));
    if (next !== value) onChange(next);
  }, [display, value, format, normalise, onChange]);

  const stepBy = useCallback(
    (direction: 1 | -1) => {
      const next = normalise(value + direction * step);
      setDisplay(format(next));
      if (next !== value) onChange(next);
    },
    [value, step, normalise, format, onChange],
  );

  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className="co-field">
      <label htmlFor={id} className="co-field__label">
        {label}
        {required ? <span className="co-field__required"> *</span> : null}
      </label>
      <div className={`co-number${disabled ? " co-number--disabled" : ""}`}>
        <button
          type="button"
          className="co-number__stepper co-number__stepper--dec"
          onClick={() => stepBy(-1)}
          disabled={disabled || atMin}
          aria-label={`Minska ${label}`}
          tabIndex={-1}
        >
          −
        </button>
        <div className="co-number__input-wrap">
          <input
            ref={inputRef}
            id={id}
            type="text"
            inputMode={precision === 0 ? "numeric" : "decimal"}
            className="co-input co-number__input"
            value={display}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => handleType(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                stepBy(1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                stepBy(-1);
              }
            }}
          />
          {suffix ? <span className="co-number__suffix">{suffix}</span> : null}
        </div>
        <button
          type="button"
          className="co-number__stepper co-number__stepper--inc"
          onClick={() => stepBy(1)}
          disabled={disabled || atMax}
          aria-label={`Öka ${label}`}
          tabIndex={-1}
        >
          +
        </button>
      </div>
      {error ? (
        <div id={errorId} className="co-field__error" role="alert">
          {error}
        </div>
      ) : helpText ? (
        <div id={helpId} className="co-field__help">
          {helpText}
        </div>
      ) : null}
    </div>
  );
}

// ── RadioGroup ──────────────────────────────────────────────────

export function RadioGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  help,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; description?: string }>;
  help?: string;
}) {
  const name = useId();
  return (
    <fieldset className="co-fieldset">
      <legend className="co-field__label">{label}</legend>
      {options.map((opt) => (
        <label key={opt.value} className="co-radio">
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span>
            <span className="co-radio__label">{opt.label}</span>
            {opt.description ? (
              <span className="co-radio__desc">{opt.description}</span>
            ) : null}
          </span>
        </label>
      ))}
      {help ? <div className="co-field__help">{help}</div> : null}
    </fieldset>
  );
}

// ── DateField ───────────────────────────────────────────────────

export function DateField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string; // YYYY-MM-DD or ""
  onChange: (v: string) => void;
  help?: string;
}) {
  const id = useId();
  return (
    <div className="co-field">
      <label htmlFor={id} className="co-field__label">
        {label}
      </label>
      <input
        id={id}
        type="date"
        className="co-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {help ? <div className="co-field__help">{help}</div> : null}
    </div>
  );
}

// ── DateRangeField ──────────────────────────────────────────────

/**
 * Paired date-picker for a calendar range (check-in / check-out, from / to).
 *
 * Contract:
 *   - `value` is the authoritative Date pair; nulls permitted for partial
 *     input states (user has picked one side, hasn't picked the other yet).
 *   - `onChange` fires ONLY when the resulting pair passes range validation.
 *     Invalid ranges (end < start, or end === start when !allowSameDay)
 *     surface an inline error but do NOT propagate to the parent. This keeps
 *     parent state always valid while letting the user see their in-progress
 *     input with a clear reason why it isn't saved yet.
 *   - Effective min/max on each input combines the explicit `minDate`/
 *     `maxDate` caps with the partner input's current value, so the native
 *     picker's own UI already forbids impossible picks on browsers that
 *     honour `min`/`max`.
 *   - `allowSameDay` defaults to `false` — the typical hospitality case is
 *     check-in < check-out. Analytics-style pickers can set it true.
 */
export function DateRangeField({
  label,
  startLabel = "Från",
  endLabel = "Till",
  value,
  onChange,
  minDate,
  maxDate,
  helpText,
  error,
  required,
  disabled,
  id: idProp,
  allowSameDay = false,
}: {
  label: string;
  startLabel?: string;
  endLabel?: string;
  value: { start: Date | null; end: Date | null };
  onChange: (value: { start: Date | null; end: Date | null }) => void;
  minDate?: Date;
  maxDate?: Date;
  helpText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  allowSameDay?: boolean;
}) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const startId = `${id}-start`;
  const endId = `${id}-end`;
  const helpId = helpText ? `${id}-help` : undefined;
  const errorId = `${id}-error`;

  // Local string mirror. The UI shows these even when a range is invalid,
  // so the user can see what they typed and fix it. Parent `value` only
  // advances through onChange (fired on valid edits).
  const [startStr, setStartStr] = useState(() => dateToInputString(value.start));
  const [endStr, setEndStr] = useState(() => dateToInputString(value.end));
  const [internalError, setInternalError] = useState<string | null>(null);

  // External prop change → re-sync local strings and clear any internal
  // validation error. If the parent changed its value without going through
  // our onChange, the new value is by definition the truth.
  useEffect(() => {
    setStartStr(dateToInputString(value.start));
    setEndStr(dateToInputString(value.end));
    setInternalError(null);
  }, [value.start, value.end]);

  // Parent `error` wins for display (matches NumberInput). Internal validation
  // still gates onChange propagation — invalid ranges never reach the parent —
  // but the displayed message defers to the parent when provided.
  // TODO: i18n — error messages hardcoded in Swedish. When a non-Swedish consumer
  // emerges, accept invalidRangeError prop or route through future i18n helper.
  const displayError = error ?? internalError ?? null;
  const describedBy =
    [displayError ? errorId : null, helpId].filter(Boolean).join(" ") || undefined;

  const validateAndFire = useCallback(
    (nextStartStr: string, nextEndStr: string) => {
      const nextStart = inputStringToDate(nextStartStr);
      const nextEnd = inputStringToDate(nextEndStr);

      if (nextStart && nextEnd) {
        const invalid = allowSameDay
          ? nextEnd < nextStart
          : nextEnd <= nextStart;
        if (invalid) {
          setInternalError(
            allowSameDay
              ? "Slutdatumet måste vara samma dag eller efter startdatumet."
              : "Slutdatumet måste vara efter startdatumet.",
          );
          return;
        }
      }
      setInternalError(null);
      onChange({ start: nextStart, end: nextEnd });
    },
    [allowSameDay, onChange],
  );

  const handleStart = useCallback(
    (raw: string) => {
      setStartStr(raw);
      validateAndFire(raw, endStr);
    },
    [endStr, validateAndFire],
  );

  const handleEnd = useCallback(
    (raw: string) => {
      setEndStr(raw);
      validateAndFire(startStr, raw);
    },
    [startStr, validateAndFire],
  );

  // Effective min/max per input, combining explicit caps with the partner's
  // current value.
  const minDateStr = minDate ? dateToInputString(minDate) : undefined;
  const maxDateStr = maxDate ? dateToInputString(maxDate) : undefined;

  // Start input: cannot exceed end (or end - 1 day if !allowSameDay).
  const startMaxCandidates: string[] = [];
  if (maxDateStr) startMaxCandidates.push(maxDateStr);
  const endAsDate = inputStringToDate(endStr);
  if (endAsDate) {
    const cap = allowSameDay ? endAsDate : addDays(endAsDate, -1);
    startMaxCandidates.push(dateToInputString(cap));
  }
  const startMax =
    startMaxCandidates.length > 0
      ? startMaxCandidates.slice().sort()[0] // earliest wins (ISO sorts chronologically)
      : undefined;

  // End input: cannot precede start (or start + 1 day if !allowSameDay).
  const endMinCandidates: string[] = [];
  if (minDateStr) endMinCandidates.push(minDateStr);
  const startAsDate = inputStringToDate(startStr);
  if (startAsDate) {
    const floor = allowSameDay ? startAsDate : addDays(startAsDate, 1);
    endMinCandidates.push(dateToInputString(floor));
  }
  const endMin =
    endMinCandidates.length > 0
      ? endMinCandidates.slice().sort().slice(-1)[0] // latest wins
      : undefined;

  return (
    <div className="co-field co-daterange">
      <div className="co-field__label">
        {label}
        {required ? <span className="co-field__required"> *</span> : null}
      </div>
      <div className="co-daterange__group">
        <div className="co-field co-daterange__cell">
          <label htmlFor={startId} className="co-daterange__sub">
            {startLabel}
          </label>
          <input
            id={startId}
            type="date"
            className="co-input"
            value={startStr}
            min={minDateStr}
            max={startMax}
            required={required}
            disabled={disabled}
            aria-invalid={displayError ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => handleStart(e.target.value)}
          />
        </div>
        <div className="co-field co-daterange__cell">
          <label htmlFor={endId} className="co-daterange__sub">
            {endLabel}
          </label>
          <input
            id={endId}
            type="date"
            className="co-input"
            value={endStr}
            min={endMin}
            max={maxDateStr}
            required={required}
            disabled={disabled}
            aria-invalid={displayError ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => handleEnd(e.target.value)}
          />
        </div>
      </div>
      {displayError ? (
        <div id={errorId} className="co-field__error" role="alert">
          {displayError}
        </div>
      ) : helpText ? (
        <div id={helpId} className="co-field__help">
          {helpText}
        </div>
      ) : null}
    </div>
  );
}

function dateToInputString(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inputStringToDate(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

// ── WriteActionsSlot ────────────────────────────────────────────

/**
 * Header right-slot that hosts write actions (Arkivera, dropdown, etc.).
 * Mirrors the product header's `.pf-header__actions` layout so companies
 * and products render identical header geometry. FAS 4 left an empty
 * `<div data-fas5-actions>`; FAS 5 fills that slot via this component.
 */
export function WriteActionsSlot({ children }: { children: ReactNode }) {
  return <div className="co-page__actions">{children}</div>;
}
