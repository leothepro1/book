'use client';

import { useEffect, useRef } from 'react';
import { SearchIcon } from '@/app/_components/SearchIcon';
import { useSearch } from './search/SearchContext';
import { useSidebar } from './SidebarContext';
import { useSidebarNav } from './SidebarNavContext';

/**
 * Sidebar search input — closed/open morphs in place.
 *
 * Closed: 36px-tall input pinned in the main sidebar under SidebarOrgRow,
 * width matches the sidebar's nav-padding column.
 *
 * Open: same element morphs (CSS transitions on `left` / `width`) until
 * it touches the viewport's left edge and extends well past the sidebar
 * to the right. A soft white overlay fades in behind it to focus
 * attention on the morphed input — no dark backdrop.
 *
 * Closed-state position is owned entirely by CSS (`.sb-search` rule);
 * adjust there if the SidebarOrgRow height changes.
 */
export function SidebarSearchInput() {
  const { isOpen, open, close, query, setQuery } = useSearch();
  const { isCollapsed } = useSidebar();
  const { currentSection } = useSidebarNav();
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when it opens.
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Render only in the main sidebar. Drill-ins / collapsed sidebar hide it.
  if (isCollapsed || currentSection) return null;

  return (
    <>
      {/* In-flow spacer — keeps subsequent nav items below the fixed input. */}
      <div className="sb-search-spacer" aria-hidden />

      {/* White focus overlay — fades in when input opens. */}
      <div
        className={`sb-search-overlay ${isOpen ? 'sb-search-overlay--visible' : ''}`}
        onClick={close}
        aria-hidden
      />

      {/* The morphing input itself. Always position:fixed so the
          left/width transition is the only thing that animates. */}
      <div className={`sb-search ${isOpen ? 'sb-search--open' : ''}`}>
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
}
