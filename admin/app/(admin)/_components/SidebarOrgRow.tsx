'use client';

import { OrganizationSwitcher } from '@clerk/nextjs';
import { useSidebar } from './SidebarContext';
import { useDevClerkOrg } from './DevClerkContext';

const IS_DEV = process.env.NODE_ENV === 'development';

export function SidebarOrgRow({ isCollapsed }: { isCollapsed: boolean }) {
  const { setIsCollapsed } = useSidebar();

  if (isCollapsed) {
    return (
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{ padding: '18px 18px 15px 18px' }}
      >
        {/* Temporarily hidden — sidebar collapse/expand toggle. */}
        <button
          className="flex-shrink-0 p-1 text-[#6D6C6B] hover:bg-[#E6E5E3] hover:text-[#323232] rounded-lg transition-colors duration-150"
          aria-label="Expandera sidebar"
          onClick={() => setIsCollapsed(false)}
          style={{ display: 'none' }}
        >
          <span
            className="material-symbols-rounded"
            style={{ fontSize: 20, display: 'block', color: '#303030' }}
          >
            side_navigation
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between flex-shrink-0"
      style={{ padding: '18px 18px 15px 18px' }}
    >
      {IS_DEV ? <DevOrgRow /> : <ClerkOrgSwitcher />}
      {/* Temporarily hidden — sidebar collapse toggle. */}
      <button
        className="flex-shrink-0 p-1 text-[#6D6C6B] hover:bg-[#E6E5E3] hover:text-[#323232] rounded-lg transition-colors duration-150"
        aria-label="Kollapsa sidebar"
        onClick={() => setIsCollapsed(true)}
        style={{ display: 'none' }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
          <rect x="1" y="2" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <line x1="6.5" y1="2" x2="6.5" y2="16" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </div>
  );
}

function ClerkOrgSwitcher() {
  return (
    <OrganizationSwitcher
      hidePersonal
      appearance={{
        elements: {
          organizationSwitcherTrigger: {
            padding: '4px',
            borderRadius: '8px',
            transition: 'background-color 150ms ease',
            '&:hover': {
              backgroundColor: '#E6E5E3',
            },
          },
          organizationPreview: {
            gap: '9px',
          },
          organizationPreviewAvatarBox: {
            width: '20px',
            height: '20px',
            borderRadius: '50px',
          },
          organizationPreviewAvatarImage: {
            width: '20px',
            height: '20px',
            borderRadius: '50px',
            objectFit: 'cover',
          },
          organizationPreviewMainIdentifier: {
            fontSize: '13px',
            fontWeight: 500,
            color: '#4c4c4c',
            letterSpacing: 0,
            lineHeight: '1em',
          },
        },
      }}
    />
  );
}

// Dev replica of OrganizationSwitcher's collapsed trigger — static, no dropdown,
// no Clerk hooks. Reads the real Clerk org name + image fetched server-side
// at admin layout boot (DevClerkContext).
function DevOrgRow() {
  const org = useDevClerkOrg();
  const name = org?.name ?? '—';
  const initial = name.charAt(0).toUpperCase() || '·';
  const imageUrl = org?.imageUrl;

  return (
    <div
      className="flex items-center min-w-0"
      style={{ padding: '4px', borderRadius: '8px', gap: 9 }}
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
      <span
        className="whitespace-nowrap overflow-hidden"
        style={{ fontSize: 13, fontWeight: 500, color: '#4c4c4c', letterSpacing: 0, lineHeight: '1em' }}
      >
        {name}
      </span>
    </div>
  );
}
