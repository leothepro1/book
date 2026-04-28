'use client';

import { type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SectionShell } from './SectionShell';
import { useSidebarNav } from './SidebarNavContext';
import { useNavigationGuard } from './NavigationGuard';
import { useSidebar } from './SidebarContext';
import { APPS_INSTALLED_PATH } from '../_lib/apps/route-helpers';
import type { SidebarApp } from '@/app/_lib/apps/actions';

/**
 * Drill-in sidebar for a single installed app.
 *
 * Header shows the app's name. The body lists each `AppPage` declared
 * by the app definition as a row that links to `/apps/{appId}/{slug}`.
 * Active row is derived from `pathname`.
 *
 * Activated via `currentSection === 'app:{appId}'` — the prefix is
 * managed in `sidebar-sections.ts`. Auto-enter on path-sync handles
 * direct URL landings; back-chevron uses the standard exitSection.
 */
export function AppSidebar({ app }: { app: SidebarApp }) {
  const { isCollapsed } = useSidebar();
  const { exitSection } = useSidebarNav();
  const { navigate, guardAction, isGuarded } = useNavigationGuard();
  const pathname = usePathname();
  const router = useRouter();

  const pages = app.pages ?? [];

  // Back chevron — close the drill-in AND return to the installed-apps
  // overview, so the user gets a clear "up one level" action instead of
  // staying on the current app's page with the main sidebar exposed.
  const handleBack = () => {
    const goBack = () => {
      exitSection();
      router.push(APPS_INSTALLED_PATH);
    };
    if (isGuarded) guardAction(goBack);
    else goBack();
  };

  const guardedClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (isGuarded) {
      e.preventDefault();
      navigate(href);
    }
  };

  // Active page = longest matching href prefix, mirroring RouteSidebar's logic.
  const activeHref = (() => {
    let best: string | null = null;
    let bestLen = -1;
    for (const page of pages) {
      const href = pageHref(app.appId, page.slug);
      if (pathname === href || pathname.startsWith(href + '/')) {
        if (href.length > bestLen) {
          best = href;
          bestLen = href.length;
        }
      }
    }
    return best;
  })();

  return (
    <SectionShell title={app.name} onBack={handleBack}>
      {pages.map((page) => {
        const href = pageHref(app.appId, page.slug);
        const active = activeHref === href;
        const className = [
          'sb__item',
          active && 'sb__item--active',
          isCollapsed && 'sb__item--collapsed',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <Link
            key={page.slug || '__default__'}
            href={href}
            onClick={(e) => guardedClick(e, href)}
            className={className}
          >
            <span className="sb__label">{page.label}</span>
          </Link>
        );
      })}
    </SectionShell>
  );
}

/** Build the absolute href for an app's page. Empty slug → app root. */
function pageHref(appId: string, slug: string): string {
  return slug ? `/apps/${appId}/${slug}` : `/apps/${appId}`;
}
