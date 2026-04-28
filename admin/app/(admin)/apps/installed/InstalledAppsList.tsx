'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { SearchIcon } from '@/app/_components/SearchIcon';
import type { SidebarApp } from '@/app/_lib/apps/actions';
import type { AppCategory } from '@/app/_lib/apps/types';

/**
 * Installed apps list with live search + category filter.
 *
 * Server passes the full installed list; filtering happens client-side
 * (the list is small and bounded by the tenant's installed app count).
 *
 * Filter state:
 *   - `search` is matched case-insensitively against `app.name`
 *   - `category` defaults to `'all'` (no filter); set to a specific
 *     `AppCategory` to narrow the list.
 */

const CATEGORIES: AppCategory[] = [
  'marketing',
  'sales',
  'analytics',
  'channels',
  'crm',
  'operations',
  'finance',
];

const CATEGORY_LABELS: Record<AppCategory, string> = {
  marketing: 'Marknadsföring',
  sales: 'Försäljning',
  analytics: 'Analys',
  channels: 'Försäljningskanaler',
  crm: 'CRM',
  operations: 'Drift',
  finance: 'Ekonomi',
};

type Filter = AppCategory | 'all';

export function InstalledAppsList({ apps }: { apps: SidebarApp[] }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on any click outside it.
  useEffect(() => {
    if (!dropdownOpen) return;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [dropdownOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter((app) => {
      if (filter !== 'all' && app.category !== filter) return false;
      if (q && !app.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [apps, search, filter]);

  // Only show categories that at least one installed app actually uses.
  // Preserves the canonical CATEGORIES order so the dropdown is stable.
  const availableCategories = useMemo(() => {
    const present = new Set(apps.map((a) => a.category));
    return CATEGORIES.filter((c) => present.has(c));
  }, [apps]);

  const filterLabel = filter === 'all' ? 'Alla kategorier' : CATEGORY_LABELS[filter];

  return (
    <>
      <div className="installed-apps__toolbar">
        <div className="installed-apps__search-wrap">
          <SearchIcon size={18} className="installed-apps__search-icon" />
          <input
            type="text"
            placeholder="Sök efter app"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="installed-apps__search"
            aria-label="Sök efter app"
          />
        </div>
        <div className="admin-dropdown installed-apps__filter" ref={dropdownRef}>
          <button
            type="button"
            className="admin-dropdown__trigger installed-apps__filter-trigger"
            onClick={() => setDropdownOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
          >
            <span>{filterLabel}</span>
            <span className="material-symbols-rounded admin-dropdown__chevron">
              expand_more
            </span>
          </button>
          {dropdownOpen && (
            <ul className="admin-dropdown__list" role="listbox">
              <li
                role="option"
                aria-selected={filter === 'all'}
                className={`admin-dropdown__item ${filter === 'all' ? 'admin-dropdown__item--active' : ''}`}
                onClick={() => {
                  setFilter('all');
                  setDropdownOpen(false);
                }}
              >
                Alla kategorier
              </li>
              {availableCategories.map((cat) => (
                <li
                  key={cat}
                  role="option"
                  aria-selected={filter === cat}
                  className={`admin-dropdown__item ${filter === cat ? 'admin-dropdown__item--active' : ''}`}
                  onClick={() => {
                    setFilter(cat);
                    setDropdownOpen(false);
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ul className="installed-apps__list">
        {filtered.map((app) => (
          <li key={app.appId}>
            <Link href={`/apps/${app.appId}`} className="installed-apps__row">
              <div className="installed-apps__icon">
                {app.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={app.iconUrl} alt="" className="installed-apps__icon-img" />
                ) : (
                  <span className="material-symbols-rounded installed-apps__icon-glyph">
                    {app.icon}
                  </span>
                )}
              </div>
              <span className="installed-apps__name">{app.name}</span>
              <span className="settings-btn--muted installed-apps__action">Hantera</span>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="installed-apps__empty">Inga appar matchar dina filter.</li>
        )}
      </ul>
    </>
  );
}
