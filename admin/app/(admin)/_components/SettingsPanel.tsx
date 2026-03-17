'use client';

import { useEffect, useState } from 'react';
import { useSettings } from './SettingsContext';
import { EditorIcon } from '@/app/_components/EditorIcon';
import { IntegrationsContent } from '@/app/(admin)/settings/integrations/IntegrationsContent';
import { OrganisationContent } from '@/app/(admin)/settings/organisation/OrganisationContent';
import { UsersContent } from '@/app/(admin)/settings/users/UsersContent';
import { PoliciesContent } from '@/app/(admin)/settings/policies/PoliciesContent';
import { CheckinContent } from '@/app/(admin)/settings/checkin/CheckinContent';
import { LanguagesContent } from '@/app/(admin)/settings/languages/LanguagesContent';
import { EmailContent } from '@/app/(admin)/settings/email/EmailContent';
import { useRole } from './RoleContext';

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
  /** If true, only visible to org:admin users */
  adminOnly?: boolean;
};

const NAV_ITEMS: { items: SettingsNavItem[]; divider?: boolean }[] = [
  {
    items: [
      { id: 'organization', label: 'Organisation', icon: 'corporate_fare', adminOnly: true },
      { id: 'users', label: 'Användare', icon: 'face', adminOnly: true },
      { id: 'billing', label: 'Fakturering', icon: 'contract', adminOnly: true },
    ],
    divider: true,
  },
  {
    items: [
      { id: 'general', label: 'Allmänt', icon: 'storefront' },
      { id: 'integrations', label: 'Integrationer', icon: 'linked_services', adminOnly: true },
      { id: 'domains', label: 'Domäner', icon: 'travel_explore', adminOnly: true },
      { id: 'notifications', label: 'Aviseringar', icon: 'notifications' },
      { id: 'languages', label: 'Språk', icon: 'translate' },
      { id: 'email', label: 'E-post', icon: 'mail', adminOnly: true },
      { id: 'checkin-checkout', label: 'In- och utcheckning', icon: 'room_service' },
      { id: 'policies', label: 'Policyer', icon: 'docs' },
    ],
  },
];

export function SettingsPanel() {
  const { isOpen, close } = useSettings();
  const { organization } = useClerkOrganization();
  const { isAdmin } = useRole();
  const [activeItem, setActiveItem] = useState(isAdmin ? 'organization' : 'general');
  const [search, setSearch] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [subTitle, setSubTitle] = useState<string | null>(null);
  const [inviteTrigger, setInviteTrigger] = useState(0);
  const [addLanguageTrigger, setAddLanguageTrigger] = useState(0);
  const [headerExtra, setHeaderExtra] = useState<React.ReactNode>(null);
  const [headerAction, setHeaderAction] = useState<React.ReactNode>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Filter nav items by search and role
  const filteredGroups = NAV_ITEMS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      (!item.adminOnly || isAdmin) &&
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
      <div className="settings-panel__overlay" onClick={close} />
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
                      onClick={() => { setActiveItem(item.id); setSubTitle(null); setInviteTrigger(0); setHeaderExtra(null); setHeaderAction(null); }}
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
            {/* Breadcrumb header — always visible */}
            {(() => {
              const item = NAV_ITEMS.flatMap((g) => g.items).find((i) => i.id === activeItem);
              if (!item) return null;
              return (
                <div className="settings-main__header">
                  <button
                    className="settings-main__header-icon"
                    onClick={() => { setResetKey((k) => k + 1); setSubTitle(null); setInviteTrigger(0); setHeaderExtra(null); setHeaderAction(null); }}
                    aria-label={`Tillbaka till ${item.label}`}
                  >
                    <EditorIcon name={item.icon} size={18} />
                  </button>
                  <EditorIcon name="chevron_right" size={16} className="settings-main__header-chevron" />
                  <h3 className="settings-main__header-title">{subTitle ?? item.label}</h3>
                  {headerExtra}
                  {activeItem === 'users' && (
                    headerAction ?? (
                      <button
                        className="settings-btn--connect"
                        style={{ marginLeft: 'auto', fontSize: 13, padding: '5px 12px' }}
                        onClick={() => setInviteTrigger((n) => n + 1)}
                      >
                        Lägg till användare
                      </button>
                    )
                  )}
                  {activeItem === 'languages' && (
                    <button
                      className="settings-btn--connect"
                      style={{ marginLeft: 'auto', fontSize: 13, padding: '5px 12px' }}
                      onClick={() => setAddLanguageTrigger((n) => n + 1)}
                    >
                      Lägg till språk
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Panel content */}
            <div id="settings-content">
              {activeItem === 'organization' ? (
                <OrganisationContent key={resetKey} onSubTitleChange={setSubTitle} />
              ) : activeItem === 'users' ? (
                <UsersContent key={resetKey} onSubTitleChange={setSubTitle} triggerInvite={inviteTrigger} onHeaderExtraChange={setHeaderExtra} onHeaderActionChange={setHeaderAction} />
              ) : activeItem === 'integrations' ? (
                <IntegrationsContent key={resetKey} onSubTitleChange={setSubTitle} />
              ) : activeItem === 'policies' ? (
                <PoliciesContent key={resetKey} onSubTitleChange={setSubTitle} />
              ) : activeItem === 'languages' ? (
                <LanguagesContent key={resetKey} onSubTitleChange={setSubTitle} triggerAdd={addLanguageTrigger} />
              ) : activeItem === 'email' ? (
                <EmailContent key={resetKey} onSubTitleChange={setSubTitle} />
              ) : activeItem === 'checkin-checkout' ? (
                <CheckinContent key={resetKey} onSubTitleChange={setSubTitle} onNavigate={(tab) => { setActiveItem(tab); setSubTitle(null); setResetKey((k) => k + 1); }} />
              ) : (
                <div key={resetKey} style={{ padding: 0 }}>
                  <p style={{ color: 'var(--admin-text-secondary)', fontSize: 13 }}>
                    Kommer snart
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
