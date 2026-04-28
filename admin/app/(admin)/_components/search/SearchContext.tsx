'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Global search state.
 *
 * One instance per admin app — wraps the entire admin tree so any
 * component can call `useSearch().open()` to surface the modal.
 *
 * Owned state:
 *   - `isOpen` — modal visibility
 *   - `query` — the current input value (single source of truth)
 *
 * The keyboard shortcut (Cmd+K / Ctrl+K) is mounted here so it works
 * regardless of where the modal trigger lives in the UI.
 */

type SearchContextValue = {
  isOpen: boolean;
  query: string;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (q: string) => void;
};

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    // Clear query on close so the next opening starts fresh.
    setQuery('');
  }, []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // Global Cmd+K (mac) / Ctrl+K (others). Also Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <SearchContext.Provider value={{ isOpen, query, open, close, toggle, setQuery }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch must be used within SearchProvider');
  return ctx;
}
