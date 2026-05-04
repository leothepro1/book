'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { inferSectionFromPath, type SectionInferableApp } from './sidebar-sections';

/**
 * Sidebar drill-in state.
 *
 * Two kinds of sections:
 *   - Route-based (orders, products, etc.) — derived from pathname; we
 *     auto-enter when the user lands on a section route.
 *   - State-based (settings) — entered explicitly via SettingsContext;
 *     not tied to URL pathname.
 *
 * `manuallyExited` lets the user close a route-based drill-in while
 * staying on its routes. Without it the auto-enter logic would re-open
 * the drill-in immediately. The flag clears the moment the path leaves
 * the section.
 */

const TRANSITION_DURATION_MS = 220;
const SETTINGS_SECTION = 'settings';

type SidebarNavContextValue = {
  /** Active section id, or null when the main sidebar is shown. */
  currentSection: string | null;
  /** True while the slide animation is in progress. */
  transitioning: boolean;
  /** Drill into a section. Triggers a transition unless already there. */
  enterSection: (id: string) => void;
  /** Exit back to the main sidebar. No-op if already on main. */
  exitSection: () => void;
  /** Pathname the user is navigating to — null when no nav is in flight. */
  navigatingTo: string | null;
  /**
   * Mark a navigation as pending so the body can show an immediate
   * loading state. Cleared automatically on the next pathname change.
   */
  setNavigatingTo: (href: string | null) => void;
};

const SidebarNavContext = createContext<SidebarNavContextValue | null>(null);

export function SidebarNavProvider({
  apps,
  children,
}: {
  /** Installed apps — used to detect per-app drill-in sections from pathname. */
  apps?: SectionInferableApp[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [manuallyExited, setManuallyExited] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  const enterSection = useCallback((id: string) => {
    setManuallyExited(null);
    setCurrentSection(id);
    // Set transitioning synchronously so consumers (SidebarSearchInput)
    // see it true in the same render as the section change. The useEffect
    // below schedules the clear after the swap window.
    setTransitioning(true);
  }, []);

  const exitSection = useCallback(() => {
    setCurrentSection((prev) => {
      if (prev === null) return null;
      // Only flag route-based sections — settings is state-based and
      // doesn't have a path to "stay in" after exit.
      if (prev !== SETTINGS_SECTION) {
        setManuallyExited(prev);
      }
      return null;
    });
    setTransitioning(true);
  }, []);

  // Auto-sync currentSection from pathname for route-based sections.
  // Settings is path-independent. React-recommended "store info from
  // previous renders" pattern — guarded setState during render is safe
  // when conditioned on a strict comparison against tracked state.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [trackedPathname, setTrackedPathname] = useState<string | null>(null);

  if (pathname !== trackedPathname) {
    setTrackedPathname(pathname);

    // Pathname landed — clear any pending navigation indicator.
    if (navigatingTo) {
      setNavigatingTo(null);
    }

    if (currentSection !== SETTINGS_SECTION) {
      const inferred = inferSectionFromPath(pathname, apps);

      if (manuallyExited && inferred !== manuallyExited) {
        setManuallyExited(null);
      }

      const skipAutoEnter = manuallyExited && inferred === manuallyExited;
      if (!skipAutoEnter && inferred !== currentSection) {
        setCurrentSection(inferred);
        setTransitioning(true);
      }
    }
  }

  // Trigger the slide animation whenever the active section changes.
  // The first render is silent — landing on a section route via deep link
  // shouldn't animate from main → section as if the user had clicked.
  const previousSectionRef = useRef<string | null>(currentSection);
  const initialRenderRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      previousSectionRef.current = currentSection;
      return;
    }
    if (previousSectionRef.current === currentSection) return;
    previousSectionRef.current = currentSection;

    if (timerRef.current) clearTimeout(timerRef.current);
    // setTransitioning fires as a direct reaction to a section change —
    // it never feeds back into `currentSection`, so no cascade is possible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTransitioning(true);
    timerRef.current = setTimeout(() => {
      setTransitioning(false);
      timerRef.current = null;
    }, TRANSITION_DURATION_MS);
  }, [currentSection]);

  return (
    <SidebarNavContext.Provider value={{ currentSection, transitioning, enterSection, exitSection, navigatingTo, setNavigatingTo }}>
      {children}
    </SidebarNavContext.Provider>
  );
}

export function useSidebarNav(): SidebarNavContextValue {
  const ctx = useContext(SidebarNavContext);
  if (!ctx) throw new Error('useSidebarNav must be used within SidebarNavProvider');
  return ctx;
}
