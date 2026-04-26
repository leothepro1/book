"use client";

import { useEffect, useState } from "react";
import { searchAccommodationsAction } from "../actions";
import type { AccommodationSearchResult } from "@/app/_lib/draft-orders";

type Props = {
  onClose: () => void;
  onAdd: (
    accommodation: AccommodationSearchResult,
    fromDate: Date,
    toDate: Date,
    guestCount: number,
  ) => void;
};

export function AccommodationPickerModal({ onClose, onAdd }: Props) {
  const [step, setStep] = useState<"search" | "details">("search");
  const [selected, setSelected] = useState<AccommodationSearchResult | null>(
    null,
  );

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<AccommodationSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [guestCount, setGuestCount] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsSearching(true);
      const r = await searchAccommodationsAction(debouncedQuery);
      if (!cancelled) {
        setResults(r);
        setIsSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const handleSelect = (acc: AccommodationSearchResult) => {
    setSelected(acc);
    setStep("details");
  };

  const fromParsed = fromDate ? new Date(fromDate) : null;
  const toParsed = toDate ? new Date(toDate) : null;
  const datesValid =
    fromParsed !== null &&
    toParsed !== null &&
    !isNaN(fromParsed.getTime()) &&
    !isNaN(toParsed.getTime()) &&
    fromParsed < toParsed;

  const canAdd = selected !== null && datesValid && guestCount >= 1;

  const handleAdd = () => {
    if (!canAdd || !selected || !fromParsed || !toParsed) return;
    onAdd(selected, fromParsed, toParsed, guestCount);
  };

  return (
    <div className="am-overlay am-overlay--visible" onClick={onClose}>
      <div className="am-modal" onClick={(e) => e.stopPropagation()}>
        <div className="am-modal__header">
          <h3 className="am-modal__title">
            {step === "search"
              ? "Välj boende"
              : `Datum för ${selected?.name ?? ""}`}
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
          {step === "search" ? (
            <>
              <input
                type="text"
                className="admin-input"
                placeholder="Sök boende…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <div className="ndr-acc-results">
                {isSearching && (
                  <div className="ndr-acc-results__status">Söker…</div>
                )}
                {!isSearching && results.length === 0 && (
                  <div className="ndr-acc-results__status">Inga matchningar</div>
                )}
                {!isSearching &&
                  results.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      className="ndr-acc-result-row"
                      onClick={() => handleSelect(r)}
                    >
                      <div className="ndr-acc-result-row__name">{r.name}</div>
                      <div className="ndr-acc-result-row__meta">{r.type}</div>
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <>
              <div className="pf-field">
                <label className="ndr-field-label" htmlFor="ndr-from-date">
                  Från
                </label>
                <input
                  id="ndr-from-date"
                  type="date"
                  className="admin-input"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="pf-field">
                <label className="ndr-field-label" htmlFor="ndr-to-date">
                  Till
                </label>
                <input
                  id="ndr-to-date"
                  type="date"
                  className="admin-input"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <div className="pf-field">
                <label className="ndr-field-label" htmlFor="ndr-guest-count">
                  Antal gäster
                </label>
                <input
                  id="ndr-guest-count"
                  type="number"
                  className="admin-input"
                  min={1}
                  value={guestCount}
                  onChange={(e) =>
                    setGuestCount(parseInt(e.target.value, 10) || 1)
                  }
                />
              </div>
            </>
          )}
        </div>

        <div className="am-modal__footer">
          {step === "details" && (
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => setStep("search")}
            >
              Tillbaka
            </button>
          )}
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={onClose}
          >
            Avbryt
          </button>
          {step === "details" && (
            <button
              type="button"
              className="admin-btn admin-btn--accent"
              onClick={handleAdd}
              disabled={!canAdd}
            >
              Lägg till
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
