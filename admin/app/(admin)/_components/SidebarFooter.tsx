'use client';

import { UserButton } from '@clerk/nextjs';
import { useSidebar } from './SidebarContext';
import { useDevClerkUser } from './DevClerkContext';

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Sidebar footer — pinned at the bottom, persists across every drill-in
 * section swap (mirrors `SidebarOrgRow` in the header).
 *
 * Layout + visual style is intentionally identical to the org row, but
 * shows the PERSONAL user (not the organisation):
 *   - 20×20 round avatar
 *   - name in 13px / weight 500 / `#4c4c4c`
 *   - 9px gap between avatar and name
 *
 * Dev: reads `useDevClerkUser()` (server-fetched at admin layout boot).
 * Prod: Clerk's `<UserButton showName />` with `appearance` overrides
 * mirroring the org switcher's preview styling.
 */
export function SidebarFooter() {
  const { isCollapsed } = useSidebar();
  return (
    <div className="sb__footer">
      <div className="sb__footer-user">
        {IS_DEV ? <DevUserRow isCollapsed={isCollapsed} /> : <ClerkUserRow isCollapsed={isCollapsed} />}
      </div>
      {!isCollapsed && (
        <div className="sb__footer-actions">
          <button type="button" className="sb__footer-btn" aria-label="Mer">
            <span className="material-symbols-rounded">more_horiz</span>
          </button>
          <button type="button" className="sb__footer-btn" aria-label="Notiser">
            <span className="material-symbols-rounded">notifications</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ClerkUserRow({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <UserButton
      showName={!isCollapsed}
      appearance={{
        elements: {
          userButtonTrigger: {
            padding: '4px',
            borderRadius: '8px',
            transition: 'background-color 150ms ease',
            '&:hover': {
              backgroundColor: '#E6E5E3',
            },
          },
          userButtonBox: {
            gap: '9px',
          },
          userButtonOuterIdentifier: {
            fontSize: '13px',
            fontWeight: 500,
            color: '#4c4c4c',
            letterSpacing: 0,
            lineHeight: '1em',
          },
          userButtonAvatarBox: {
            width: '20px',
            height: '20px',
            borderRadius: '50px',
          },
          userButtonAvatarImage: {
            width: '20px',
            height: '20px',
            borderRadius: '50px',
            objectFit: 'cover',
          },
        },
      }}
    />
  );
}

// Dev replica of `<UserButton showName />` — static, no Clerk hooks.
// Mirrors `DevOrgRow` exactly, but reads the personal user.
function DevUserRow({ isCollapsed }: { isCollapsed: boolean }) {
  const user = useDevClerkUser();
  const name = user?.fullName ?? user?.firstName ?? user?.username ?? '—';
  const initial = name.charAt(0).toUpperCase() || '·';
  const imageUrl = user?.imageUrl;

  return (
    <div
      className="flex items-center min-w-0"
      style={{
        padding: '4px',
        borderRadius: '8px',
        gap: 9,
        justifyContent: isCollapsed ? 'center' : 'flex-start',
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={name}
          className="flex-shrink-0"
          style={{ width: 20, height: 20, borderRadius: 50, objectFit: 'cover' }}
        />
      ) : (
        <div
          className="flex-shrink-0 flex items-center justify-center text-white"
          style={{ width: 20, height: 20, borderRadius: 50, background: 'var(--admin-accent)', fontSize: 10, fontWeight: 600 }}
        >
          {initial}
        </div>
      )}
      {!isCollapsed && (
        <span
          className="whitespace-nowrap"
          style={{ fontSize: 13, fontWeight: 500, color: '#4c4c4c', letterSpacing: 0, lineHeight: '1em' }}
        >
          {name}
        </span>
      )}
    </div>
  );
}
