'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { DevClerkData } from '../_lib/auth/dev-clerk-data';

const DevClerkContext = createContext<DevClerkData | null>(null);

export function DevClerkProvider({
  value,
  children,
}: {
  value: DevClerkData | null;
  children: ReactNode;
}) {
  return <DevClerkContext.Provider value={value}>{children}</DevClerkContext.Provider>;
}

/**
 * Returns the real Clerk user fetched server-side at admin layout boot,
 * or null if dev-clerk-data was unavailable. In prod, always null —
 * components should use Clerk hooks directly there.
 */
export function useDevClerkUser() {
  return useContext(DevClerkContext)?.user ?? null;
}

/**
 * Returns the real Clerk organisation fetched server-side at admin layout boot,
 * or null if dev-clerk-data was unavailable.
 */
export function useDevClerkOrg() {
  return useContext(DevClerkContext)?.org ?? null;
}
