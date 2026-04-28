'use client';

import { type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from './SidebarContext';
import { useNavigationGuard } from './NavigationGuard';
import { SidebarOrgRow } from './SidebarOrgRow';
import { SidebarFooter } from './SidebarFooter';
import { SidebarSearchInput } from './SidebarSearchInput';
import { useSettings } from './SettingsContext';
import { useSidebarNav } from './SidebarNavContext';
import { SidebarNavSwap } from './SidebarNavSwap';
import { SettingsSidebar } from './SettingsSidebar';
import { RouteSidebar } from './RouteSidebar';
import { AppSidebar } from './AppSidebar';
import { DRILL_IN_SECTIONS, getSection, inferSectionFromPath, parseAppSectionId } from './sidebar-sections';
import { getDefaultSettingsTab } from './settings-nav-items';
import { getApparHref, isApparActivePath } from '../_lib/apps/route-helpers';
import { useRole } from './RoleContext';
import type { SidebarApp } from '@/app/_lib/apps/actions';

// Compose `.sb__*` class string from a base + modifiers (false-y values dropped).
function itemClass(...mods: (string | false | null | undefined)[]): string {
  return ['sb__item', ...(mods.filter(Boolean) as string[])].join(' ');
}

export function Sidebar({ sidebarApps = [] }: { sidebarApps?: SidebarApp[] }) {
  const { currentSection, enterSection, setNavigatingTo } = useSidebarNav();
  const { isCollapsed } = useSidebar();
  const pathname = usePathname();
  const { navigate, guardAction, isGuarded } = useNavigationGuard();
  const { open: openSettings } = useSettings();
  const { isAdmin } = useRole();

  // Tag any link click as "navigation pending" so the body shows a
  // loading state immediately, then clears when the new pathname lands.
  const markPending = (href: string) => {
    if (href !== pathname) setNavigatingTo(href);
  };

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');
  const inferredSection = inferSectionFromPath(pathname);

  const guardedClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (isGuarded) {
      e.preventDefault();
      navigate(href);
      return;
    }
    markPending(href);
  };

  // Section trigger — opens the drill-in AND navigates to the section's
  // first item (its parent route, when the section has one). The auto-sync
  // in SidebarNavContext would also pick up the navigation, but we call
  // `enterSection` synchronously so the slide animation starts on click
  // instead of after navigation lands.
  const triggerClick = (e: MouseEvent<HTMLAnchorElement>, sectionId: string, href: string) => {
    if (isGuarded) {
      e.preventDefault();
      guardAction(() => {
        enterSection(sectionId);
        navigate(href);
      });
      return;
    }
    enterSection(sectionId);
    markPending(href);
  };

  const renderSectionTrigger = (sectionId: string) => {
    const section = getSection(sectionId);
    if (!section) return null;
    const firstHref = section.items[0]?.href ?? '/';
    const active = inferredSection === section.id;
    return (
      <Link
        href={firstHref}
        onClick={(e) => triggerClick(e, section.id, firstHref)}
        className={itemClass(active && 'sb__item--active', isCollapsed && 'sb__item--collapsed')}
      >
        <span className="material-symbols-rounded sb__icon">{section.icon}</span>
        <span className="sb__label">{section.label}</span>
        <span className="material-symbols-rounded sb__item-trail">arrow_forward_ios</span>
      </Link>
    );
  };

  // Determine which drill-in body to render under the org row.
  const drillInSection = currentSection && currentSection !== 'settings'
    ? getSection(currentSection)
    : null;

  // App sections are dynamic — id is `app:{appId}`. Resolve via sidebarApps.
  const appSection = (() => {
    if (!currentSection) return null;
    const appId = parseAppSectionId(currentSection);
    if (!appId) return null;
    const app = sidebarApps.find((a) => a.appId === appId);
    if (!app || !app.pages || app.pages.length < 2) return null;
    return app;
  })();

  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-30 flex flex-col ${
        isCollapsed ? 'w-[58px]' : 'w-[270px]'
      }`}
      style={{
        background: '#FAFAFA',
        borderRight: '1px solid var(--admin-border)',
        transition: 'width 0.2s ease-in-out',
        overflow: 'hidden',
      }}
    >
      {/* Profile row — always visible, even inside drill-in sections */}
      <SidebarOrgRow isCollapsed={isCollapsed} />

      <SidebarNavSwap sectionKey={currentSection ?? 'main'}>
        {currentSection === 'settings' ? (
          <SettingsSidebar />
        ) : appSection ? (
          <AppSidebar app={appSection} />
        ) : drillInSection ? (
          <RouteSidebar section={drillInSection} />
        ) : (
          <>
            <nav className="sb__nav">
              <SidebarSearchInput />
              {/* Startsida — flat link, no drill-in */}
              {(() => {
                const active = isActive('/home');
                return (
                  <Link
                    href="/home"
                    onClick={(e) => guardedClick(e, '/home')}
                    className={itemClass(active && 'sb__item--active', isCollapsed && 'sb__item--collapsed')}
                  >
                    <span className="material-symbols-rounded sb__icon">home_app_logo</span>
                    <span className="sb__label">Startsida</span>
                  </Link>
                );
              })()}

              {/* Section triggers (drill-ins) */}
              {renderSectionTrigger('orders')}
              {renderSectionTrigger('customers')}
              {renderSectionTrigger('products')}
              {renderSectionTrigger('accommodations')}

              {/* Rabatter — flat link */}
              {(() => {
                const active = isActive('/discounts');
                return (
                  <Link
                    href="/discounts"
                    onClick={(e) => guardedClick(e, '/discounts')}
                    className={itemClass(active && 'sb__item--active', isCollapsed && 'sb__item--collapsed')}
                  >
                    <span className="material-symbols-rounded sb__icon">percent_discount</span>
                    <span className="sb__label">Rabatter</span>
                  </Link>
                );
              })()}

              {renderSectionTrigger('content')}

              {/* Ekonomi — flat link */}
              {(() => {
                const active = isActive('/finance');
                return (
                  <Link
                    href="/finance"
                    onClick={(e) => guardedClick(e, '/finance')}
                    className={itemClass(active && 'sb__item--active', isCollapsed && 'sb__item--collapsed')}
                  >
                    <span className="material-symbols-rounded sb__icon">account_balance_wallet</span>
                    <span className="sb__label">Ekonomi</span>
                  </Link>
                );
              })()}

              {renderSectionTrigger('analytics')}
              {renderSectionTrigger('webshop')}

              {/* Appar — single flat link. Targets the marketplace when no
                  apps are installed, the installed-apps overview otherwise.
                  Active state spans the whole `/apps` area. */}
              {(() => {
                const apparHref = getApparHref(sidebarApps.length);
                const active = isApparActivePath(pathname);
                return (
                  <Link
                    href={apparHref}
                    onClick={(e) => guardedClick(e, apparHref)}
                    className={itemClass(active && 'sb__item--active', isCollapsed && 'sb__item--collapsed')}
                  >
                    <span className="material-symbols-rounded sb__icon">home_storage</span>
                    <span className="sb__label">Appar</span>
                  </Link>
                );
              })()}

              {/* Inställningar — drill-in trigger, last item in the list. */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => openSettings(getDefaultSettingsTab(isAdmin))}
                  className={itemClass(isCollapsed && 'sb__item--collapsed')}
                >
                  <span className="material-symbols-rounded sb__icon">settings</span>
                  <span className="sb__label">Inställningar</span>
                  <span className="material-symbols-rounded sb__item-trail">arrow_forward_ios</span>
                </button>
              )}
            </nav>
          </>
        )}
      </SidebarNavSwap>

      {/* Pinned footer — persistent across every drill-in section swap. */}
      <SidebarFooter />
    </aside>
  );
}
