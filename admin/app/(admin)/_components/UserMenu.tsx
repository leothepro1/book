'use client';

import { useState, useRef, useEffect } from 'react';
import { useSidebar } from './SidebarContext';
import { useUser, useClerk } from '@clerk/nextjs';
import { useDevClerkUser } from './DevClerkContext';

const IS_DEV = process.env.NODE_ENV === 'development';

// ClerkProvider does not wrap in dev (see app/layout.tsx) — calling Clerk
// hooks would throw. Bind one implementation at module load via the build-time
// IS_DEV constant; each variant calls hooks unconditionally, so React hook
// order is stable for the lifetime of the build. The dev variant reads the
// real Clerk user fetched server-side at admin layout boot.
type ClerkUserShape = {
  firstName?: string | null;
  fullName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  imageUrl?: string | null;
};

type ClerkUserResult = {
  user: ClerkUserShape | null | undefined;
  signOut: () => void;
};

function useClerkUserDev(): ClerkUserResult {
  const dev = useDevClerkUser();
  if (!dev) return { user: null, signOut: () => {} };
  return {
    user: {
      firstName: dev.firstName,
      fullName: dev.fullName,
      username: dev.username,
      primaryEmailAddress: dev.emailAddress ? { emailAddress: dev.emailAddress } : null,
      imageUrl: dev.imageUrl,
    },
    signOut: () => {},
  };
}

function useClerkUserProd(): ClerkUserResult {
  const { user } = useUser();
  const { signOut } = useClerk();
  return { user, signOut };
}

const useClerkUser: () => ClerkUserResult = IS_DEV ? useClerkUserDev : useClerkUserProd;

interface UserMenuProps {
  inHeader?: boolean;
}

export function UserMenu({ inHeader = false }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { user, signOut } = useClerkUser();
  const { isCollapsed } = useSidebar();
  const menuRef = useRef<HTMLDivElement>(null);

  // Stäng menyn när man klickar utanför
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (!user) return null;

  const firstName = user.firstName || user.username || 'User';
  const fullName = user.fullName || firstName;
  const email = user.primaryEmailAddress?.emailAddress || '';
  const imageUrl = user.imageUrl;

  return (
    <div className="relative" ref={menuRef}>
      {/* User button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 transition-colors ${
          inHeader ? '' : `w-full ${isCollapsed ? 'justify-center' : ''}`
        }`}
      >
        {/* Avatar */}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={fullName}
            className="w-8 h-8 rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full flex-shrink-0 bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
            {firstName[0]}
          </div>
        )}
        {/* Name (endast vid expanded i sidebar, eller alltid i header) */}
        {!inHeader && (
          <span className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-200 ${
            isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
          }`}>
            {firstName}
          </span>
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className={`absolute ${inHeader ? 'top-full right-0 mt-2' : 'bottom-full left-0 mb-2'} w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 ${
          inHeader ? 'animate-slideDown' : 'animate-slideUp'
        }`}>
          {/* User info */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-3 mb-2">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={fullName}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                  {firstName[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {fullName}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {email}
                </p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-200 my-2"></div>

          {/* Menu items */}
          <div className="px-2">
            <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                <path d="M8 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 5a3 3 0 1 1 6 0 3 3 0 0 1-6 0zm-2.5 7.5A3.5 3.5 0 0 1 6 9h4a3.5 3.5 0 0 1 3.5 3.5V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1.5z"></path>
              </svg>
              <span>Inställningar</span>
            </button>

            <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"></path>
                <path d="M6.5 5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm1.5 3a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3a.5.5 0 0 0-.5-.5z"></path>
              </svg>
              <span>Tema</span>
            </button>

            <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"></path>
                <path d="M8 4.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5zm0 6a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"></path>
              </svg>
              <span>Hjälp och resurser</span>
            </button>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-200 my-2"></div>

          {/* Logout */}
          <div className="px-2">
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                <path d="M10 2a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 8a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1z"></path>
                <path d="M3 5a2 2 0 0 1 2-2h1a1 1 0 0 1 0 2H5v6h1a1 1 0 1 1 0 2H5a2 2 0 0 1-2-2V5zm9.354 1.146a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L10.793 7H7.5a.5.5 0 0 1 0-1h3.293L9.646 4.854a.5.5 0 1 1 .708-.708l2 2z"></path>
              </svg>
              <span>Logga ut</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
