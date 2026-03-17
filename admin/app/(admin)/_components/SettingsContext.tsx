'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

type SettingsContextValue = {
  isOpen: boolean;
  open: (tab?: string) => void;
  close: () => void;
  toggle: () => void;
  /** Active settings tab (e.g. "email", "users") — synced with hash */
  activeTab: string | null;
  setActiveTab: (tab: string) => void;
  /** Sub-path within the active tab (e.g. "guest/BOOKING_CONFIRMED") */
  subPath: string | null;
  setSubPath: (path: string | null) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Parse #settings/email/guest/BOOKING_CONFIRMED → { tab: "email", subPath: "guest/BOOKING_CONFIRMED" } */
function parseHash(hash: string): { tab: string | null; subPath: string | null } {
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith('settings/')) return { tab: null, subPath: null };
  const parts = raw.slice('settings/'.length).split('/');
  const tab = parts[0] || null;
  const subPath = parts.length > 1 ? parts.slice(1).join('/') : null;
  return { tab, subPath };
}

function buildHash(tab: string, subPath: string | null): string {
  if (subPath) return `#settings/${tab}/${subPath}`;
  return `#settings/${tab}`;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTabState] = useState<string | null>(null);
  const [subPath, setSubPathState] = useState<string | null>(null);

  // On mount: read hash and auto-open if it matches #settings/...
  useEffect(() => {
    const { tab, subPath: sp } = parseHash(window.location.hash);
    if (tab) {
      setActiveTabState(tab);
      setSubPathState(sp);
      setIsOpen(true);
    }

    function onHashChange() {
      const { tab: t, subPath: s } = parseHash(window.location.hash);
      if (t) {
        setActiveTabState(t);
        setSubPathState(s);
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    }

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    setSubPathState(null);
    window.history.replaceState(null, '', buildHash(tab, null));
  }, []);

  const setSubPath = useCallback((path: string | null) => {
    setSubPathState(path);
    setActiveTabState((prev) => {
      if (prev) window.history.replaceState(null, '', buildHash(prev, path));
      return prev;
    });
  }, []);

  const open = useCallback((tab?: string) => {
    setIsOpen(true);
    if (tab) {
      setActiveTabState(tab);
      setSubPathState(null);
      window.history.replaceState(null, '', buildHash(tab, null));
    } else {
      setActiveTabState((prev) => {
        const t = prev ?? 'organization';
        window.history.replaceState(null, '', buildHash(t, null));
        return t;
      });
    }
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Clear hash without triggering scroll
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((v) => {
      if (v) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return !v;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ isOpen, open, close, toggle, activeTab, setActiveTab, subPath, setSubPath }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
