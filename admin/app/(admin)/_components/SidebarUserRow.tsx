'use client';

import { useUser } from '@clerk/nextjs';
import { useSidebar } from './SidebarContext';

const IS_DEV = process.env.NODE_ENV === 'development';

const DEV_USER = {
  firstName: 'Dev',
  fullName: 'Dev User',
  username: 'dev',
  primaryEmailAddress: { emailAddress: 'dev@localhost' },
  imageUrl: '',
};

function useClerkUser() {
  const clerkResult = IS_DEV ? { user: null } : useUser();
  if (IS_DEV) return { user: DEV_USER };
  return { user: clerkResult.user };
}

export function SidebarUserRow({ isCollapsed }: { isCollapsed: boolean }) {
  const { user } = useClerkUser();
  const { setIsCollapsed } = useSidebar();

  if (!user) return null;

  const firstName = user.firstName || user.username || 'User';
  const imageUrl = user.imageUrl;

  if (isCollapsed) {
    return (
      <div className="flex items-center justify-center flex-shrink-0" style={{ padding: "18px 18px 15px 18px", borderBottom: "1px solid #ebebeb" }}>
        <button
          className="flex-shrink-0 p-1 text-[#6D6C6B] hover:bg-[#E6E5E3] hover:text-[#323232] rounded-lg transition-colors duration-150"
          aria-label="Expandera sidebar"
          onClick={() => setIsCollapsed(false)}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 20, display: "block", color: "#303030" }}>side_navigation</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between flex-shrink-0" style={{ padding: "18px 18px 15px 18px", borderBottom: "1px solid #ebebeb" }}>
      <div className="flex items-center gap-2 min-w-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={firstName}
            className="w-[22px] h-[22px] rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-[22px] h-[22px] rounded-full flex-shrink-0 bg-[var(--admin-accent)] flex items-center justify-center text-white text-[11px] font-semibold">
            {firstName[0]}
          </div>
        )}
        <span className="text-base tracking-[-0.15px] font-[500] text-[#6D6C6B] whitespace-nowrap overflow-hidden transition-all duration-200 w-auto opacity-100">
          {firstName}
        </span>
      </div>
      <button
        className="flex-shrink-0 p-1 text-[#6D6C6B] hover:bg-[#E6E5E3] hover:text-[#323232] rounded-lg transition-colors duration-150"
        aria-label="Kollapsa sidebar"
        onClick={() => setIsCollapsed(true)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
          <rect x="1" y="2" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <line x1="6.5" y1="2" x2="6.5" y2="16" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </div>
  );
}
