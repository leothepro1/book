"use client";

// TODO: When primitives move to a shared _components/primitives/_shared/ module
// (see Modal.tsx), any overlap with Modal's focus/portal utilities will be
// consolidated. For now Combobox is self-contained — dropdown is inline in
// the field, not a portal, so no shared pieces to extract yet.

/**
 * Combobox — async typeahead with single-select + AbortSignal cancellation.
 *
 * Scope for FAS 6.0 (Alt C minimal):
 *   Included — debounced async search, AbortSignal cancellation, keyboard
 *              navigation, clear button, controlled value.
 *   Excluded — onCreateNew / "Skapa ny" option, custom renderOption, any
 *              multi-select readiness. Defer until a consumer needs them.
 *
 * Value-vs-query contract:
 *   The input is free-typed. When `value` is set and the user starts typing,
 *   we fire `onChange(null)` once (wiping the selected value) and begin a
 *   new search against the typed query. This is the Shopify-style pattern —
 *   the alternative of "freezing" the input on selection traps users in
 *   multi-step reselection flows. If the consumer needs the value preserved
 *   while showing in-progress query text, they can add a wrapper later.
 *
 * External value sync:
 *   `lastFiredRef` tracks the most recent value we fired via `onChange`.
 *   The sync effect compares `value` against that ref — if they match, the
 *   parent's state was driven by us (no-op); if they differ, the parent
 *   changed value externally (e.g. "reset" button), so we update the input
 *   to show the new label. This is the same pattern used in DateRangeField.
 *
 * Search lifecycle:
 *   - Each keystroke clears the pending debounce timer AND aborts any
 *     in-flight AbortController. Only the latest query ever sees its
 *     results applied to state.
 *   - `onSearch` is read through a ref so the debounced callback closes
 *     over the current handler without needing to be re-created whenever
 *     the parent passes a new reference.
 *   - Rejected searches show their message inside the dropdown (not as a
 *     field `error` — that prop is reserved for parent-provided business
 *     errors).
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type ComboboxOption<T = unknown> = {
  id: string;
  label: string;
  subtitle?: string;
  badge?: string;
  disabled?: boolean;
  metadata?: T;
};

export function Combobox<T = unknown>({
  label,
  placeholder,
  value,
  onChange,
  onSearch,
  emptyMessage = "Inga träffar",
  loadingMessage = "Söker…",
  minQueryLength = 1,
  debounceMs = 250,
  helpText,
  error,
  required,
  disabled,
  id: idProp,
}: {
  label: string;
  placeholder?: string;
  value: ComboboxOption<T> | null;
  onChange: (option: ComboboxOption<T> | null) => void;
  onSearch: (
    query: string,
    signal: AbortSignal,
  ) => Promise<ComboboxOption<T>[]>;
  emptyMessage?: string;
  loadingMessage?: string;
  minQueryLength?: number;
  debounceMs?: number;
  helpText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const dropdownId = `${id}-dropdown`;
  const helpId = helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const [inputValue, setInputValue] = useState<string>(value?.label ?? "");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ComboboxOption<T>[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Tracks the value we last fired via onChange. Lets us distinguish
  // parent-originated value changes (sync display) from our own
  // (no-op, avoids clobbering mid-edit).
  const lastFiredRef = useRef<ComboboxOption<T> | null>(value);

  // Ref-trick so the debounced search doesn't recreate when the parent
  // passes a new onSearch reference.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // External value change → re-sync the input.
  useEffect(() => {
    if (value !== lastFiredRef.current) {
      lastFiredRef.current = value;
      setInputValue(value?.label ?? "");
    }
  }, [value]);

  // Unmount: drop any pending debounce + abort any in-flight search.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Click outside closes the dropdown (preserves value).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const firstEnabledIndex = (opts: ComboboxOption<T>[]): number => {
    for (let i = 0; i < opts.length; i++) {
      if (!opts[i].disabled) return i;
    }
    return -1;
  };

  const lastEnabledIndex = (opts: ComboboxOption<T>[]): number => {
    for (let i = opts.length - 1; i >= 0; i--) {
      if (!opts[i].disabled) return i;
    }
    return -1;
  };

  const findNextEnabled = (
    start: number,
    direction: 1 | -1,
    opts: ComboboxOption<T>[],
  ): number => {
    if (opts.length === 0) return -1;
    // If nothing is highlighted and we're going forward, first hop should land at index 0.
    let i = start === -1 ? (direction === 1 ? -1 : 0) : start;
    for (let count = 0; count < opts.length; count++) {
      i = (i + direction + opts.length) % opts.length;
      if (!opts[i].disabled) return i;
    }
    return -1;
  };

  const runSearch = useCallback(
    (query: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      if (query.length < minQueryLength) {
        setResults([]);
        setLoading(false);
        setSearchError(null);
        setHighlightedIndex(-1);
        return;
      }

      debounceTimerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setSearchError(null);
        try {
          const found = await onSearchRef.current(query, controller.signal);
          if (controller.signal.aborted) return;
          setResults(found);
          setHighlightedIndex(firstEnabledIndex(found));
          setLoading(false);
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err instanceof Error && err.name === "AbortError") return;
          setSearchError(
            err instanceof Error ? err.message : "Sökningen misslyckades.",
          );
          setResults([]);
          setHighlightedIndex(-1);
          setLoading(false);
        }
      }, debounceMs);
    },
    [minQueryLength, debounceMs],
  );

  const selectOption = (opt: ComboboxOption<T>) => {
    if (opt.disabled) return;
    lastFiredRef.current = opt;
    setInputValue(opt.label);
    setOpen(false);
    setResults([]);
    setHighlightedIndex(-1);
    onChange(opt);
  };

  const handleTyping = (raw: string) => {
    setInputValue(raw);
    setOpen(true);
    if (value !== null) {
      lastFiredRef.current = null;
      onChange(null);
    }
    runSearch(raw);
  };

  const handleClear = () => {
    lastFiredRef.current = null;
    setInputValue("");
    setResults([]);
    setHighlightedIndex(-1);
    setSearchError(null);
    setOpen(true);
    if (value !== null) onChange(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          if (results.length > 0 && highlightedIndex === -1) {
            setHighlightedIndex(firstEnabledIndex(results));
          }
          return;
        }
        if (results.length > 0) {
          setHighlightedIndex((prev) => findNextEnabled(prev, 1, results));
        }
        return;
      }
      case "ArrowUp": {
        if (!open) return;
        e.preventDefault();
        if (results.length > 0) {
          setHighlightedIndex((prev) => findNextEnabled(prev, -1, results));
        }
        return;
      }
      case "Home": {
        if (!open || results.length === 0) return;
        e.preventDefault();
        setHighlightedIndex(firstEnabledIndex(results));
        return;
      }
      case "End": {
        if (!open || results.length === 0) return;
        e.preventDefault();
        setHighlightedIndex(lastEnabledIndex(results));
        return;
      }
      case "Enter": {
        if (!open) return;
        if (highlightedIndex < 0) return;
        const opt = results[highlightedIndex];
        if (!opt) return;
        e.preventDefault();
        selectOption(opt);
        return;
      }
      case "Escape": {
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        return;
      }
      case "Tab": {
        // Let natural tab-to-next-field proceed; just close the dropdown.
        setOpen(false);
        return;
      }
      default:
        return;
    }
  };

  const handleFocus = () => {
    if (disabled) return;
    setOpen(true);
  };

  const activeDescendantId =
    open && highlightedIndex >= 0 && results[highlightedIndex]
      ? `${id}-option-${results[highlightedIndex].id}`
      : undefined;

  const describedBy =
    [error ? errorId : null, helpId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="co-field co-combobox" ref={containerRef}>
      <label htmlFor={id} className="co-field__label">
        {label}
        {required ? <span className="co-field__required"> *</span> : null}
      </label>
      <div className="co-combobox__input-wrap">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          className="co-input co-combobox__input"
          value={inputValue}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={dropdownId}
          aria-activedescendant={activeDescendantId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => handleTyping(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        />
        {loading ? (
          <span className="co-combobox__spinner" aria-hidden="true" />
        ) : null}
        {value !== null && !disabled ? (
          <button
            type="button"
            className="co-combobox__clear"
            onClick={handleClear}
            aria-label="Rensa"
            tabIndex={-1}
          >
            ×
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id={dropdownId}
          role="listbox"
          className="co-combobox__dropdown"
        >
          {inputValue.length < minQueryLength ? (
            <div className="co-combobox__hint">
              Skriv minst {minQueryLength} tecken för att söka…
            </div>
          ) : loading ? (
            <div className="co-combobox__loading">{loadingMessage}</div>
          ) : searchError ? (
            <div className="co-combobox__error" role="alert">
              {searchError}
            </div>
          ) : results.length === 0 ? (
            <div className="co-combobox__empty">{emptyMessage}</div>
          ) : (
            results.map((opt, i) => (
              <div
                key={opt.id}
                id={`${id}-option-${opt.id}`}
                role="option"
                aria-selected={i === highlightedIndex}
                aria-disabled={opt.disabled || undefined}
                className={
                  "co-combobox__option" +
                  (i === highlightedIndex
                    ? " co-combobox__option--highlighted"
                    : "") +
                  (opt.disabled ? " co-combobox__option--disabled" : "")
                }
                onMouseEnter={() => {
                  if (!opt.disabled) setHighlightedIndex(i);
                }}
                onClick={() => selectOption(opt)}
              >
                <div className="co-combobox__option-text">
                  <div className="co-combobox__option-label">{opt.label}</div>
                  {opt.subtitle ? (
                    <div className="co-combobox__option-subtitle">
                      {opt.subtitle}
                    </div>
                  ) : null}
                </div>
                {opt.badge ? (
                  <span className="co-combobox__option-badge">{opt.badge}</span>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
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
