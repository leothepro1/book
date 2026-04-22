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

import { useCallback, useId, useState, type ReactNode } from "react";

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
