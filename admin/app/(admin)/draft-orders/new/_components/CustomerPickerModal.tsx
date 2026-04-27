"use client";

import { useEffect, useRef, useState } from "react";
import { searchCustomersAction } from "../actions";
import type { CustomerSearchResult } from "@/app/_lib/draft-orders";

interface CustomerPickerModalProps {
  onClose: () => void;
  onSelect: (customer: CustomerSearchResult) => void;
}

function buildResultMeta(c: CustomerSearchResult): string | null {
  const parts: string[] = [];
  if (c.name) parts.push(c.email);
  if (c.orderCount > 0) {
    parts.push(`${c.orderCount} ${c.orderCount === 1 ? "order" : "ordrar"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

// Parent gates rendering with `{open && <CustomerPickerModal ... />}` —
// fresh state per open without reset effects (matches AccommodationPickerModal).
export function CustomerPickerModal({
  onClose,
  onSelect,
}: CustomerPickerModalProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input after the modal mounts.
  useEffect(() => {
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  // Debounce query → debouncedQuery (300ms).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch on debouncedQuery change. Cancelled-flag guards against stale responses.
  // Empty queries no-op — render-time guard (showHint) hides any stale results.
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed === "") return;
    let cancelled = false;
    (async () => {
      setIsSearching(true);
      const r = await searchCustomersAction(trimmed);
      if (!cancelled) {
        setResults(r);
        setIsSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const trimmed = debouncedQuery.trim();
  const showHint = trimmed === "";
  const showLoading = !showHint && isSearching;
  const showEmpty = !showHint && !isSearching && results.length === 0;
  const showResults = !showHint && !isSearching && results.length > 0;

  return (
    <div
      className="am-overlay am-overlay--visible"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-picker-title"
    >
      <div className="am-modal" onClick={(e) => e.stopPropagation()}>
        <div className="am-modal__header">
          <h3 id="customer-picker-title" className="am-modal__title">
            Välj kund
          </h3>
          <button
            type="button"
            className="am-modal__close"
            onClick={onClose}
            aria-label="Stäng"
          >
            ×
          </button>
        </div>

        <div className="am-modal__body">
          <input
            ref={inputRef}
            type="text"
            className="admin-input"
            placeholder="Sök på namn eller e-post"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="ndr-customer-results">
            {showHint && (
              <div className="ndr-customer-results__hint">
                Sök på namn eller e-post
              </div>
            )}
            {showLoading && (
              <div className="ndr-acc-results__status">Söker…</div>
            )}
            {showEmpty && (
              <div className="ndr-acc-results__status">Inga matchningar</div>
            )}
            {showResults &&
              results.map((c) => {
                const meta = buildResultMeta(c);
                return (
                  <button
                    type="button"
                    key={c.id}
                    className="ndr-customer-result-row"
                    onClick={() => {
                      onSelect(c);
                      onClose();
                    }}
                  >
                    <span className="ndr-customer-result-row__name">
                      {c.name ?? c.email}
                    </span>
                    {meta && (
                      <span className="ndr-customer-result-row__meta">
                        {meta}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>

        <div className="am-modal__footer">
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={onClose}
          >
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
}
