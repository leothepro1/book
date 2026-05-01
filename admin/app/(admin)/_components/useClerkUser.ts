'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { useDevClerkUser } from './DevClerkContext';

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Unified Clerk user accessor for admin chrome (sidebar, header).
 *
 * Bound at module load via the build-time IS_DEV constant: dev reads
 * the server-fetched DevClerkUser snapshot (Clerk hooks would throw
 * because ClerkProvider isn't mounted in dev — see app/layout.tsx);
 * prod reads live Clerk state via `useUser()` + `useClerk()`. Each
 * variant calls hooks unconditionally so the React hook order stays
 * stable for the build's lifetime.
 *
 * Mirrors the inline pattern previously duplicated across UserMenu
 * and SidebarFooterMenu. Use this instead of re-implementing it.
 */

export type ClerkUserShape = {
  fullName?: string | null;
  firstName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
};

export type ClerkUserResult = {
  user: ClerkUserShape | null | undefined;
  signOut: () => void;
  openUserProfile: () => void;
};

function useClerkUserDev(): ClerkUserResult {
  const dev = useDevClerkUser();
  if (!dev) return { user: null, signOut: () => {}, openUserProfile: () => {} };
  return {
    user: {
      fullName: dev.fullName,
      firstName: dev.firstName,
      username: dev.username,
      imageUrl: dev.imageUrl,
      primaryEmailAddress: dev.emailAddress ? { emailAddress: dev.emailAddress } : null,
    },
    signOut: () => {},
    openUserProfile: () => {},
  };
}

function useClerkUserProd(): ClerkUserResult {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  return { user, signOut: () => signOut(), openUserProfile: () => openUserProfile() };
}

export const useClerkUser: () => ClerkUserResult = IS_DEV ? useClerkUserDev : useClerkUserProd;
