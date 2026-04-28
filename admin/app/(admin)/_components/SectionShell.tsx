'use client';

import type { ReactNode } from 'react';
import { useSidebar } from './SidebarContext';

/**
 * Sidebar drill-in body.
 *
 * Renders a back-chevron header + scrollable nav body. Slots into the
 * existing sidebar `<aside>` BELOW `SidebarOrgRow`, so the org row and
 * the collapse toggle stay visible across section switches.
 *
 * Settings is the first consumer; future Orders / Customers / Products
 * drill-ins reuse this primitive.
 */
export function SectionShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const { isCollapsed } = useSidebar();

  return (
    <div className="sb__section">
      <button
        type="button"
        onClick={onBack}
        className={`sb__item sb__section-back ${isCollapsed ? 'sb__item--collapsed' : ''}`}
        aria-label={`Tillbaka från ${title}`}
      >
        <span className="material-symbols-rounded sb__icon sb__icon--back">arrow_back_ios</span>
        <span className="sb__label">{title}</span>
      </button>

      <nav className="sb__nav sb__nav--section">{children}</nav>
    </div>
  );
}
