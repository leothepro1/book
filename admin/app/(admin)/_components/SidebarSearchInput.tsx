'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SearchIcon } from '@/app/_components/SearchIcon';
import { useSearch } from './search/SearchContext';
import { useSidebar } from './SidebarContext';
import { useSidebarNav } from './SidebarNavContext';

/**
 * Sidebar search input — closed/open morphs in place.
 *
 * Closed: 36px-tall input pinned under SidebarOrgRow, width matches the
 * sidebar's nav-padding column.
 *
 * Open: same element morphs (CSS transitions on `left` / `width`) until
 * it touches the viewport's left edge and extends well past the sidebar
 * to the right. A soft white overlay fades in behind to focus attention.
 *
 * Architecture: the in-flow spacer sits inside `.sb__nav` (so it reserves
 * vertical space and the y-position oracle), but the fixed-positioned
 * input + overlay are rendered via portal into `document.body`. Without
 * the portal, the input lives inside `.sb__swap-pane`, which becomes a
 * containing block for fixed descendants whenever it gets `will-change`
 * during a swap animation — that toggling makes the input jump up/down
 * each time a section is opened or closed.
 */
type AnimState = 'exit-forward' | 'enter-back' | null;

export function SidebarSearchInput() {
  const { isOpen, open, close, query, setQuery } = useSearch();
  const { isCollapsed } = useSidebar();
  const { currentSection, transitioning } = useSidebarNav();
  const inputRef = useRef<HTMLInputElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const [searchTop, setSearchTop] = useState<number | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  // Mirror the main panel's swap animation. We can't track "previous
  // section" locally because this component unmounts whenever the swap
  // pane it lives in is replaced. `transitioning` from SidebarNavContext
  // lives above the swap and survives the remount, so it's the source
  // of truth for "an animation should be running right now".
  const animState: AnimState = transitioning
    ? currentSection !== null
      ? 'exit-forward' // drilling in: search slides left out with main
      : 'enter-back'   // drilling out: search slides in from left with main
    : null;

  // Portal target only exists on the client.
  useEffect(() => setPortalReady(true), []);

  // Auto-focus the input when it opens.
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Pin the portaled fixed input to the swap-pane's top — same y as
  // the section back-button, which sits at margin-top:0 of `.sb__section`.
  // Using the spacer directly would put the input 12px lower (it sits
  // inside `.sb__nav` which has `padding-top: 12px`).
  useLayoutEffect(() => {
    const el = spacerRef.current;
    if (!el) return;
    const target = (el.closest('.sb__swap-pane') as HTMLElement | null) ?? el;
    const update = () => setSearchTop(target.getBoundingClientRect().top);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [isCollapsed, currentSection]);

  if (isCollapsed) return null;
  // Hide while in a section, EXCEPT during the brief exit animation that
  // mirrors the main panel sliding away.
  if (currentSection && animState !== 'exit-forward') return null;

  const animClass =
    animState === 'exit-forward'
      ? ' sb-search--anim-exit-forward'
      : animState === 'enter-back'
        ? ' sb-search--anim-enter-back'
        : '';

  const portaled = (
    <>
      {/* White focus overlay — fades in when input opens. */}
      <div
        className={`sb-search-overlay ${isOpen ? 'sb-search-overlay--visible' : ''}`}
        onClick={close}
        aria-hidden
      />

      {/* The morphing input itself. Always position:fixed so the
          left/width transition is the only thing that animates. */}
      <div
        className={`sb-search${isOpen ? ' sb-search--open' : ''}${animClass}`}
        style={searchTop !== null ? { top: `${searchTop}px` } : undefined}
      >
        <SearchIcon size={15} className="sb-search__icon" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Sök"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={open}
          className="sb-search__input"
          aria-label="Sök"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </>
  );

  return (
    <>
      {/* In-flow spacer — reserves vertical space for the portaled input
          and acts as the y-position oracle (see useLayoutEffect above). */}
      <div ref={spacerRef} className="sb-search-spacer" aria-hidden />
      {portalReady && createPortal(portaled, document.body)}
    </>
  );
}
