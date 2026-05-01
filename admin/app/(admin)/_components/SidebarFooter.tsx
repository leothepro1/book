'use client';

import { useState } from 'react';
import { useSidebar } from './SidebarContext';
import { SidebarFooterMenu } from './SidebarFooterMenu';
import { useClerkUser } from './useClerkUser';

/**
 * Sidebar footer — pinned at the bottom, persists across every drill-in
 * section swap. The user row (avatar + name) and the more_horiz icon are
 * a single click target: hovering anywhere styles the more_horiz "button"
 * with its hover state, and clicking anywhere opens the same popup.
 *
 * We render the avatar + name ourselves (instead of using Clerk's
 * `<UserButton>`) because UserButton owns its click handler and would
 * pop Clerk's built-in menu instead of our footer popup. The popup's
 * first item delegates to `openUserProfile()` to surface Clerk's
 * profile UI when the user wants account management.
 */
export function SidebarFooter() {
  const { isCollapsed } = useSidebar();
  const [moreOpen, setMoreOpen] = useState(false);
  const { user } = useClerkUser();

  const name = user?.fullName ?? user?.firstName ?? user?.username ?? '—';
  const initial = name.charAt(0).toUpperCase() || '·';
  const imageUrl = user?.imageUrl;

  return (
    <div className="sb__footer">
      <button
        type="button"
        className={`sb__footer-trigger${isCollapsed ? ' sb__footer-trigger--collapsed' : ''}`}
        aria-label="Mer"
        aria-haspopup="menu"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((v) => !v)}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={name} className="sb__footer-avatar" />
        ) : (
          <span className="sb__footer-avatar sb__footer-avatar--placeholder" aria-hidden>
            {initial}
          </span>
        )}
        {!isCollapsed && (
          <>
            <span className="sb__footer-name">{name}</span>
            <span className="sb__footer-trigger-more" aria-hidden>
              <span className="material-symbols-rounded">more_horiz</span>
            </span>
          </>
        )}
      </button>
      {!isCollapsed && (
        <button type="button" className="sb__footer-btn" aria-label="Notiser">
          <span className="material-symbols-rounded">notifications</span>
        </button>
      )}
      <SidebarFooterMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
