'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { ADMIN_ROLE } from '../_lib/auth/roles';

type RoleContextValue = {
  orgRole: string | null;
  isAdmin: boolean;
};

const RoleContext = createContext<RoleContextValue>({ orgRole: null, isAdmin: false });

export function RoleProvider({
  orgRole,
  children,
}: {
  orgRole: string | null;
  children: ReactNode;
}) {
  return (
    <RoleContext.Provider value={{ orgRole, isAdmin: orgRole === ADMIN_ROLE }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleContextValue {
  return useContext(RoleContext);
}
