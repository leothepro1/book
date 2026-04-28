'use client';

import { useEffect, useState } from 'react';
import { SearchIcon } from '@/app/_components/SearchIcon';
import { useSearch } from './SearchContext';

/**
 * Search trigger — a button that LOOKS like a search input.
 *
 * Click (or Cmd+K from anywhere) opens the modal. Includes the platform
 * keyboard hint so the shortcut is discoverable; `⌘K` on macOS,
 * `Ctrl K` elsewhere. Detected client-side, so server-render is the
 * generic platform-neutral form until hydration.
 */
export function SearchTrigger({ placeholder = 'Sök' }: { placeholder?: string }) {
  const { open } = useSearch();
  const isMac = useIsMac();
  return (
    <button type="button" className="adm-search-trigger" onClick={open} aria-label={placeholder}>
      <SearchIcon size={16} className="adm-search-trigger__icon" />
      <span className="adm-search-trigger__placeholder">{placeholder}</span>
      <kbd className="adm-search-trigger__kbd">
        {isMac ? '⌘' : 'Ctrl'}
        <span aria-hidden> </span>
        K
      </kbd>
    </button>
  );
}

function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    // One-shot platform detection — never re-fires, never cascades.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMac(/Mac|iPhone|iPod|iPad/.test(navigator.platform));
  }, []);
  return isMac;
}
