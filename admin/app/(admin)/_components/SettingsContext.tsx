'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useSidebarNav } from './SidebarNavContext';

/**
 * Settings state — active tab, sub-path, and hash sync.
 *
 * `isOpen` / `open` / `close` / `toggle` are kept on the public API for
 * backwards compatibility with `*Content` callers. They delegate to the
 * shared `SidebarNavContext` so the sidebar drill-in is the single source
 * of truth for "is settings showing".
 */

const SETTINGS_SECTION_ID = 'settings';

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
  const { currentSection, enterSection, exitSection } = useSidebarNav();
  const [activeTab, setActiveTabState] = useState<string | null>(null);
  const [subPath, setSubPathState] = useState<string | null>(null);

  const isOpen = currentSection === SETTINGS_SECTION_ID;

  // On mount: read hash and auto-enter section if it matches #settings/...
  useEffect(() => {
    const { tab, subPath: sp } = parseHash(window.location.hash);
    if (tab) {
      setActiveTabState(tab);
      setSubPathState(sp);
      enterSection(SETTINGS_SECTION_ID);
    }

    function onHashChange() {
      const { tab: t, subPath: s } = parseHash(window.location.hash);
      if (t) {
        setActiveTabState(t);
        setSubPathState(s);
        enterSection(SETTINGS_SECTION_ID);
      } else {
        exitSection();
      }
    }

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    setSubPathState(null);
    window.history.replaceState(null, '', buildHash(tab, null));
  }, []);

  const setSubPath = useCallback((path: string | null) => {
    setSubPathState(path);
    if (activeTab) {
      window.history.replaceState(null, '', buildHash(activeTab, path));
    }
  }, [activeTab]);

  const open = useCallback((tab?: string) => {
    enterSection(SETTINGS_SECTION_ID);
    if (tab) {
      setActiveTabState(tab);
      setSubPathState(null);
      window.history.replaceState(null, '', buildHash(tab, null));
    } else {
      const t = activeTab ?? 'organization';
      if (t !== activeTab) setActiveTabState(t);
      window.history.replaceState(null, '', buildHash(t, null));
    }
  }, [activeTab, enterSection]);

  const close = useCallback(() => {
    exitSection();
    // Clear hash without triggering scroll
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [exitSection]);

  const toggle = useCallback(() => {
    if (isOpen) {
      exitSection();
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
      enterSection(SETTINGS_SECTION_ID);
      const t = activeTab ?? 'organization';
      window.history.replaceState(null, '', buildHash(t, null));
    }
  }, [isOpen, enterSection, exitSection, activeTab]);

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
