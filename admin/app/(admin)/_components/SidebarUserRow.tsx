'use client';

import { useUser } from '@clerk/nextjs';

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

  if (!user) return null;

  const firstName = user.firstName || user.username || 'User';
  const imageUrl = user.imageUrl;

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
        <span
          className={`text-base tracking-[-0.15px] font-[500] text-[#6D6C6B] whitespace-nowrap overflow-hidden transition-all duration-200 ${
            isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
          }`}
        >
          {firstName}
        </span>
      </div>
      <button
        className={`flex-shrink-0 p-1 text-[#6D6C6B] hover:bg-[#E6E5E3] hover:text-[#323232] rounded-lg transition-colors duration-150 ${
          isCollapsed ? 'hidden' : ''
        }`}
        aria-label="Notiser"
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </button>
    </div>
  );
}
