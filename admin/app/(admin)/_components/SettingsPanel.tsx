'use client';

import { useEffect, useState } from 'react';
import { useSettings } from './SettingsContext';
import { EditorIcon } from '@/app/_components/EditorIcon';

const IS_DEV = process.env.NODE_ENV === 'development';

function useClerkOrganization() {
  if (IS_DEV) {
    return {
      organization: {
        name: 'Dev Organisation',
        imageUrl: '',
      },
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useOrganization } = require('@clerk/nextjs');
  const { organization } = useOrganization();
  return { organization };
}

type SettingsNavItem = {
  id: string;
  label: string;
  icon: string;
};

const NAV_ITEMS: { items: SettingsNavItem[]; divider?: boolean }[] = [
  {
    items: [
      { id: 'organization', label: 'Organisation', icon: 'corporate_fare' },
      { id: 'users', label: 'Användare', icon: 'person' },
      { id: 'billing', label: 'Fakturering', icon: 'receipt_long' },
    ],
    divider: true,
  },
  {
    items: [
      { id: 'general', label: 'Allmänt', icon: 'storefront' },
      { id: 'integrations', label: 'Integrationer', icon: 'linked_services' },
      { id: 'domains', label: 'Domäner', icon: 'globe' },
      { id: 'notifications', label: 'Aviseringar', icon: 'notifications' },
      { id: 'checkin-checkout', label: 'In- och utcheckning', icon: 'room_service' },
    ],
  },
];

export function SettingsPanel() {
  const { isOpen, close } = useSettings();
  const { organization } = useClerkOrganization();
  const [activeItem, setActiveItem] = useState('organization');
  const [search, setSearch] = useState('');

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Filter nav items by search
  const filteredGroups = NAV_ITEMS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      item.label.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((group) => group.items.length > 0);

  const orgName = organization?.name ?? 'Organisation';
  const orgImage = organization?.imageUrl ?? '';

  return (
    <div
      className={`settings-panel ${isOpen ? 'settings-panel--open' : ''}`}
      aria-hidden={!isOpen}
    >
      <div className="settings-panel__content">
        {/* Close button — top right */}
        <button
          onClick={close}
          className="settings-panel__close"
          aria-label="Stäng inställningar"
        >
          <EditorIcon name="close" size={22} />
        </button>

        {/* Two-column layout */}
        <div className="settings-layout">
          {/* ── Left sidebar (281px) ── */}
          <div className="settings-nav">
            {/* Org header */}
            <div className="settings-nav__org">
              {orgImage ? (
                <img
                  src={orgImage}
                  alt={orgName}
                  className="settings-nav__org-avatar"
                />
              ) : (
                <div className="settings-nav__org-avatar settings-nav__org-avatar--fallback">
                  {orgName[0]?.toUpperCase()}
                </div>
              )}
              <div className="settings-nav__org-info">
                <div className="settings-nav__org-name">{orgName}</div>
                <div className="settings-nav__org-label">Organisation</div>
              </div>
            </div>

            {/* Search */}
            <div className="settings-nav__search-wrap">
              <EditorIcon name="search" size={16} className="settings-nav__search-icon" />
              <input
                type="text"
                placeholder="Sök inställningar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="settings-nav__search"
              />
            </div>

            {/* Nav items */}
            <nav className="settings-nav__list">
              {filteredGroups.map((group, gi) => (
                <div key={gi}>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveItem(item.id)}
                      className={`settings-nav__item ${activeItem === item.id ? 'settings-nav__item--active' : ''}`}
                    >
                      <EditorIcon name={item.icon} size={18} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                  {group.divider && <div className="settings-nav__divider" />}
                </div>
              ))}
            </nav>
          </div>

          {/* ── Right content (flex 1) ── */}
          <div className="settings-main">
            <p style={{ color: 'var(--admin-text-secondary)', padding: 24 }}>
              {activeItem}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
