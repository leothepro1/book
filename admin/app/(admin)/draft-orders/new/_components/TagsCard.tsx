"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { searchDraftTagsAction } from "../actions";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const CHIP_CONTAINER: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
  padding: "6px 8px",
  border: "1px solid var(--admin-border)",
  borderRadius: 8,
  background: "#fff",
  minHeight: 38,
};

const CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 8px",
  background: "var(--admin-surface-muted)",
  border: "1px solid var(--admin-border)",
  borderRadius: 6,
  fontSize: 13,
  color: "var(--admin-text)",
  lineHeight: 1.3,
};

const CHIP_REMOVE: CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 14,
  lineHeight: 1,
  cursor: "pointer",
  padding: "0 2px",
  color: "var(--admin-text-muted)",
  fontFamily: "inherit",
};

const CHIP_INPUT: CSSProperties = {
  flex: 1,
  minWidth: 100,
  border: "none",
  outline: "none",
  background: "transparent",
  fontSize: 14,
  fontFamily: "inherit",
  color: "var(--admin-text)",
  padding: "4px 2px",
};

const SUGGESTIONS_WRAP: CSSProperties = {
  position: "relative",
  marginTop: 0,
};

const SUGGESTIONS_LIST: CSSProperties = {
  position: "absolute",
  top: 4,
  left: 0,
  right: 0,
  background: "#fff",
  border: "1px solid var(--admin-border)",
  borderRadius: 8,
  boxShadow: "var(--admin-shadow-md)",
  zIndex: 10,
  maxHeight: 220,
  overflowY: "auto",
  padding: 4,
};

const SUGGESTION_ITEM: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "6px 8px",
  fontSize: 13,
  color: "var(--admin-text)",
  cursor: "pointer",
  borderRadius: 6,
  fontFamily: "inherit",
};

const FOOTER_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 6,
  fontSize: 12,
  color: "var(--admin-text-tertiary)",
};

const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

const MAX_TAGS = 50;
const MAX_TAG_LEN = 64;
const DEBOUNCE_MS = 300;

interface TagsCardProps {
  value: string[];
  onChange: (next: string[]) => void;
}

function dedupCaseInsensitive(tags: string[]): string[] {
  return Array.from(
    new Map(tags.map((t) => [t.toLowerCase(), t])).values(),
  );
}

export function TagsCard({ value, onChange }: TagsCardProps) {
  const inputId = useId();
  const listboxId = useId();
  const [inputValue, setInputValue] = useState("");
  const [fetchedSuggestions, setFetchedSuggestions] = useState<string[]>([]);
  const [liveMessage, setLiveMessage] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const atMax = value.length >= MAX_TAGS;
  const trimmedInput = inputValue.trim();

  // Derived view: filter fetched suggestions against current value
  // (case-insensitive) and gate visibility on non-empty trimmed input.
  // Computing at render avoids storing showSuggestions/suggestions in state.
  const lowerValueSet = new Set(value.map((t) => t.toLowerCase()));
  const visibleSuggestions =
    trimmedInput.length > 0
      ? fetchedSuggestions.filter((s) => !lowerValueSet.has(s.toLowerCase()))
      : [];
  const showSuggestions = visibleSuggestions.length > 0;

  const addTag = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_TAG_LEN) return;
    if (atMax) return;
    const next = dedupCaseInsensitive([...value, trimmed]);
    if (next.length === value.length) {
      setInputValue("");
      return;
    }
    onChange(next);
    setInputValue("");
    setLiveMessage(`Tagg ${trimmed} tillagd`);
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
    setLiveMessage(`Tagg ${tag} borttagen`);
  };

  // Debounced fetch. When input is empty, the effect cleans up the timer
  // and exits without touching state — visibleSuggestions derives from
  // trimmedInput at render-time, so there's nothing to clear.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (trimmedInput.length === 0) return;
    const reqId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      const results = await searchDraftTagsAction(trimmedInput);
      if (reqId !== requestIdRef.current) return;
      setFetchedSuggestions(results);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [trimmedInput]);

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <label htmlFor={inputId} className="pf-card-title">
          Taggar
        </label>
      </div>

      <div style={CHIP_CONTAINER}>
        {value.map((tag) => (
          <span key={tag} style={CHIP}>
            {tag}
            <button
              type="button"
              style={CHIP_REMOVE}
              onClick={() => removeTag(tag)}
              aria-label={`Ta bort ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={listboxId}
          aria-autocomplete="list"
          style={CHIP_INPUT}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(inputValue);
            } else if (
              e.key === "Backspace" &&
              inputValue === "" &&
              value.length > 0
            ) {
              e.preventDefault();
              const last = value[value.length - 1];
              removeTag(last);
            }
          }}
          placeholder={value.length === 0 ? "Lägg till tagg" : ""}
          maxLength={MAX_TAG_LEN}
          disabled={atMax}
        />
      </div>

      <div style={SUGGESTIONS_WRAP}>
        {showSuggestions && (
          <ul id={listboxId} role="listbox" style={SUGGESTIONS_LIST}>
            {visibleSuggestions.map((s) => (
              <li key={s} role="option" aria-selected={false}>
                <button
                  type="button"
                  style={SUGGESTION_ITEM}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(s)}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={FOOTER_STYLE}>
        <span aria-live="polite">
          {value.length} / {MAX_TAGS}
        </span>
      </div>

      <span aria-live="polite" style={SR_ONLY}>
        {liveMessage}
      </span>
    </div>
  );
}
