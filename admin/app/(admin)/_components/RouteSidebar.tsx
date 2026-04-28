'use client';

import { type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SectionShell } from './SectionShell';
import { useSidebarNav } from './SidebarNavContext';
import { useNavigationGuard } from './NavigationGuard';
import { useSidebar } from './SidebarContext';
import { getActiveItemHref, type DrillInSection } from './sidebar-sections';

/**
 * Generic drill-in body for route-based sections.
 *
 * Items are real routes — clicking navigates via `<Link>` while keeping
 * the drill-in open. Active row is derived from `pathname`.
 *
 * Back chevron exits the section (without leaving the current page —
 * see SidebarNavContext's manuallyExited flag).
 */
export function RouteSidebar({ section }: { section: DrillInSection }) {
  const { isCollapsed } = useSidebar();
  const { exitSection, setNavigatingTo } = useSidebarNav();
  const { navigate, guardAction, isGuarded } = useNavigationGuard();
  const pathname = usePathname();

  const activeHref = getActiveItemHref(pathname, section.items);

  const handleBack = () => {
    if (isGuarded) guardAction(exitSection);
    else exitSection();
  };

  const guardedClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (isGuarded) {
      e.preventDefault();
      navigate(href);
      return;
    }
    if (href !== pathname) setNavigatingTo(href);
  };

  return (
    <SectionShell title={section.label} onBack={handleBack}>
      {section.items.map((item) => {
        const active = activeHref === item.href;
        const className = [
          'sb__item',
          active && 'sb__item--active',
          isCollapsed && 'sb__item--collapsed',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(e) => guardedClick(e, item.href)}
            className={className}
          >
            <span className="material-symbols-rounded sb__icon">{item.icon}</span>
            <span className="sb__label">{item.label}</span>
          </Link>
        );
      })}
    </SectionShell>
  );
}
