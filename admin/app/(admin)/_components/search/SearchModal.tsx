'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { SearchIcon } from '@/app/_components/SearchIcon';
import { useSearch } from './SearchContext';
import { useSearchEngine } from './useSearchEngine';
import type { SearchResult } from './types';

/**
 * Global search modal.
 *
 * Always mounted at the AdminShell root — visibility is controlled by
 * `useSearch().isOpen`. Closed by:
 *   - clicking the overlay
 *   - pressing Esc (handled in SearchContext keyboard listener)
 *   - selecting a result (Link navigation triggers close)
 *
 * Keyboard nav: ↑ / ↓ moves the active row; Enter follows the active
 * result's href. `activeIndex` is reset whenever the result set changes.
 *
 * The modal is intentionally dumb about results — it just renders the
 * groups returned by `useSearchEngine`. Adding new resource types
 * happens via `registerSearchProvider()`, not here.
 */
export function SearchModal() {
  const { isOpen, query, setQuery, close } = useSearch();
  const { groups, isLoading } = useSearchEngine(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Focus the input when opening.
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Flat list of results — drives keyboard nav across groups.
  const flatResults = useMemo<SearchResult[]>(() => {
    const all: SearchResult[] = [];
    for (const g of groups) all.push(...g.results);
    return all;
  }, [groups]);

  // Reset active row whenever the result set changes — render-phase
  // compare instead of an effect so React doesn't run an extra commit.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [trackedFlat, setTrackedFlat] = useState(flatResults);
  if (flatResults !== trackedFlat) {
    setTrackedFlat(flatResults);
    setActiveIndex(0);
  }

  // Keyboard nav within the modal — arrows + enter.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, flatResults.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        const target = flatResults[activeIndex];
        if (target) {
          e.preventDefault();
          window.location.href = target.href;
          close();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, flatResults, activeIndex, close]);

  if (!isOpen) return null;

  const trimmed = query.trim();
  const showEmptyState = trimmed.length === 0;
  const showNoResults = !showEmptyState && !isLoading && groups.length === 0;

  return (
    <div className="adm-search" role="dialog" aria-label="Sök" aria-modal>
      <div className="adm-search__overlay" onClick={close} />
      <div className="adm-search__panel" role="combobox" aria-expanded aria-haspopup="listbox">
        <div className="adm-search__inputrow">
          <SearchIcon size={18} className="adm-search__inputicon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök bland ordrar, kunder, produkter…"
            className="adm-search__input"
            aria-label="Sök"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="adm-search__body" role="listbox">
          {showEmptyState && (
            <div className="adm-search__hint">Börja skriva för att söka.</div>
          )}
          {showNoResults && (
            <div className="adm-search__hint">
              Inga träffar för &ldquo;{trimmed}&rdquo;.
            </div>
          )}
          {groups.map((group) => (
            <div key={group.providerId} className="adm-search__group">
              <div className="adm-search__group-label">{group.label}</div>
              {group.results.map((result, idx) => {
                const flatIdx = computeFlatIndex(groups, group.providerId, idx);
                const isActive = flatIdx === activeIndex;
                return (
                  <Link
                    key={result.id}
                    href={result.href}
                    className={`adm-search__item ${isActive ? 'adm-search__item--active' : ''}`}
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                    onClick={close}
                    role="option"
                    aria-selected={isActive}
                  >
                    <span className="adm-search__item-title">{result.title}</span>
                    {result.subtitle && (
                      <span className="adm-search__item-subtitle">{result.subtitle}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Compute the index of `(groupId, rowIdx)` within the flat-results list. */
function computeFlatIndex(
  groups: { providerId: string; results: unknown[] }[],
  providerId: string,
  rowIdx: number,
): number {
  let n = 0;
  for (const g of groups) {
    if (g.providerId === providerId) return n + rowIdx;
    n += g.results.length;
  }
  return -1;
}
