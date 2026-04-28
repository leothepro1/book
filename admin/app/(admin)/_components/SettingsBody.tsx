'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSettings } from './SettingsContext';
import { EditorIcon } from '@/app/_components/EditorIcon';
import { IntegrationsContent } from '@/app/(admin)/settings/integrations/IntegrationsContent';
import { OrganisationContent } from '@/app/(admin)/settings/organisation/OrganisationContent';
import { UsersContent } from '@/app/(admin)/settings/users/UsersContent';
import { PoliciesContent } from '@/app/(admin)/settings/policies/PoliciesContent';
import { LanguagesContent } from '@/app/(admin)/settings/languages/LanguagesContent';
import { EmailContent } from '@/app/(admin)/settings/email/EmailContent';
import { PaymentsContent } from '@/app/(admin)/settings/payments/PaymentsContent';
import { CustomerAccountsContent } from '@/app/(admin)/settings/customer-accounts/CustomerAccountsContent';
import { BillingContent } from '@/app/(admin)/settings/billing/BillingContent';
import { AppsContent } from '@/app/(admin)/settings/apps/AppsContent';
import { GeneralContent } from '@/app/(admin)/settings/general/GeneralContent';
import { useRole } from './RoleContext';
import { useNavigationGuard } from './NavigationGuard';
import { SETTINGS_NAV_ITEMS, getDefaultSettingsTab } from './settings-nav-items';

/**
 * Settings drill-in body — renders in the admin content area while the user
 * is inside the settings section.
 *
 * Owns the breadcrumb header, the `*Content` ternary, resetKey-on-back logic,
 * and dynamic header extras (header-action, invite/add-language triggers).
 *
 * Active tab is read from `SettingsContext.activeTab` (hash-synced). The
 * sidebar drill-in (`SettingsSidebar`) writes the same context.
 */
export function SettingsBody() {
  const { activeTab, setActiveTab } = useSettings();
  const { isAdmin } = useRole();
  const { guardAction, isGuarded } = useNavigationGuard();
  const defaultTab = getDefaultSettingsTab(isAdmin);
  const activeItem = activeTab ?? defaultTab;

  const [resetKey, setResetKey] = useState(0);
  const [subTitle, setSubTitle] = useState<string | { label: string; onClick?: () => void }[] | null>(null);
  const [inviteTrigger, setInviteTrigger] = useState(0);
  const [addLanguageTrigger, setAddLanguageTrigger] = useState(0);
  const [headerExtra, setHeaderExtra] = useState<React.ReactNode>(null);
  const [headerAction, setHeaderAction] = useState<React.ReactNode>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const trailFreshRef = useRef(false);

  // Sync transient header state when the active tab changes (sidebar swaps
  // setActiveTab from outside this component). Uses the React-recommended
  // "store info from previous renders" pattern instead of a useEffect, so
  // we don't trigger a cascading re-render after mount.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevActiveItem, setPrevActiveItem] = useState(activeItem);
  if (prevActiveItem !== activeItem) {
    setPrevActiveItem(activeItem);
    setSubTitle(null);
    setInviteTrigger(0);
    setHeaderExtra(null);
    setHeaderAction(null);
  }

  // Wrap setSubTitle to skip trail transition on navigation
  const setSubTitleWithFresh = useCallback((val: typeof subTitle) => {
    trailFreshRef.current = true;
    setSubTitle(val);
  }, []);

  // Remove data-fresh after paint so hover transitions work
  useEffect(() => {
    if (!trailFreshRef.current || !headerRef.current) return;
    const trails = headerRef.current.querySelectorAll('.settings-main__header-trail');
    trails.forEach((el) => el.setAttribute('data-fresh', ''));
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        trails.forEach((el) => el.removeAttribute('data-fresh'));
        trailFreshRef.current = false;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [subTitle]);

  const item = SETTINGS_NAV_ITEMS.find((i) => i.id === activeItem);

  return (
    <div className="settings-body">
      {/* Breadcrumb header — only renders if active item is a known nav entry */}
      {item && (
        <div className="settings-main__header" ref={headerRef}>
          <button
            className="settings-main__header-icon"
            onClick={() => {
              const goBack = () => {
                setActiveTab(activeItem);
                setResetKey((k) => k + 1);
                setSubTitle(null);
                setInviteTrigger(0);
                setHeaderExtra(null);
                setHeaderAction(null);
              };
              if (isGuarded) guardAction(goBack);
              else goBack();
            }}
            aria-label={`Tillbaka till ${item.label}`}
          >
            <EditorIcon name={item.icon} size={20} />
          </button>
          {Array.isArray(subTitle) && subTitle.length > 1 ? (
            subTitle.map((seg, i) => {
              const isLast = i === subTitle.length - 1;
              if (isLast) {
                return (
                  <span key={i} className="settings-main__header-seg">
                    <EditorIcon name="arrow_forward_ios" size={12} className="settings-main__header-chevron" />
                    <h3 className="settings-main__header-title">{seg.label}</h3>
                  </span>
                );
              }
              return (
                <span key={i} className="settings-main__header-seg">
                  <EditorIcon name="arrow_forward_ios" size={12} className="settings-main__header-chevron" />
                  <span className="settings-main__header-trail">
                    {seg.onClick ? (
                      <button
                        className="settings-main__header-crumb"
                        onClick={() => {
                          if (isGuarded) guardAction(seg.onClick!);
                          else seg.onClick!();
                        }}
                      >
                        {seg.label}
                      </button>
                    ) : (
                      <span className="settings-main__header-crumb">{seg.label}</span>
                    )}
                  </span>
                </span>
              );
            })
          ) : Array.isArray(subTitle) ? (
            <>
              <EditorIcon name="arrow_forward_ios" size={12} className="settings-main__header-chevron" />
              <h3 className="settings-main__header-title">{subTitle[0].label}</h3>
            </>
          ) : (
            <>
              <EditorIcon name="arrow_forward_ios" size={12} className="settings-main__header-chevron" />
              <h3 className="settings-main__header-title">{subTitle ?? item.label}</h3>
            </>
          )}
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
      )}

      {/* Tab content */}
      <div id="settings-content">
        {activeItem === 'organization' ? (
          <OrganisationContent key={resetKey} onSubTitleChange={setSubTitle} />
        ) : activeItem === 'users' ? (
          <UsersContent
            key={resetKey}
            onSubTitleChange={setSubTitle}
            triggerInvite={inviteTrigger}
            onHeaderExtraChange={setHeaderExtra}
            onHeaderActionChange={setHeaderAction}
          />
        ) : activeItem === 'integrations' ? (
          <IntegrationsContent key={resetKey} onSubTitleChange={setSubTitle} />
        ) : activeItem === 'policies' ? (
          <PoliciesContent key={resetKey} onSubTitleChange={setSubTitle} />
        ) : activeItem === 'languages' ? (
          <LanguagesContent key={resetKey} onSubTitleChange={setSubTitle} triggerAdd={addLanguageTrigger} />
        ) : activeItem === 'email' ? (
          <EmailContent key={resetKey} onSubTitleChange={setSubTitleWithFresh} onHeaderExtraChange={setHeaderExtra} />
        ) : activeItem === 'payments' ? (
          <PaymentsContent key={resetKey} onSubTitleChange={setSubTitle} />
        ) : activeItem === 'customer-accounts' ? (
          <CustomerAccountsContent key={resetKey} onSubTitleChange={setSubTitle} />
        ) : activeItem === 'apps' ? (
          <AppsContent key={resetKey} onSubTitleChange={setSubTitle} onHeaderExtraChange={setHeaderExtra} />
        ) : activeItem === 'billing' ? (
          <BillingContent key={resetKey} onSubTitleChange={setSubTitle} />
        ) : activeItem === 'general' ? (
          <GeneralContent key={resetKey} onSubTitleChange={setSubTitle} />
        ) : (
          <div key={resetKey} style={{ padding: 0 }}>
            <p style={{ color: 'var(--admin-text-secondary)', fontSize: 13 }}>
              Kommer snart
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
