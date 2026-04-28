'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { NavigationGuardProvider, UnsavedChangesModal } from './NavigationGuard';
import { SettingsProvider } from './SettingsContext';
import { SidebarNavProvider, useSidebarNav } from './SidebarNavContext';
import { RoleProvider } from './RoleContext';
import { DevClerkProvider } from './DevClerkContext';
import { SearchProvider } from './search/SearchContext';
import { SearchModal } from './search/SearchModal';
import { Sidebar } from './Sidebar';
import { RippleInit } from './RippleInit';
import type { SidebarApp } from '@/app/_lib/apps/actions';
import type { DevClerkData } from '../_lib/auth/dev-clerk-data';

// Settings drill-in body — lazy so its tab content trees don't ship with
// the underlying admin route.
const SettingsBody = dynamic(
  () => import('./SettingsBody').then((m) => ({ default: m.SettingsBody })),
  { ssr: false },
);

function LayoutContent({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSidebar();
  const { currentSection } = useSidebarNav();
  const inSettings = currentSection === 'settings';

  return (
    <main
      className={`flex-1 transition-all duration-300 ease-in-out overflow-y-auto h-screen ${
        isCollapsed ? 'ml-16' : 'ml-[270px]'
      }`}
      style={{ background: 'var(--admin-bg)' }}
    >
      <div className="container mx-auto py-8 px-6">
        {/* Underlying admin route stays mounted while drill-in is active.
            Hidden via display:none so scroll, form state, and data fetches
            survive the round-trip. */}
        <div style={{ display: inSettings ? 'none' : 'contents' }}>{children}</div>
        {inSettings && <SettingsBody />}
      </div>
    </main>
  );
}

function ShellInner({ sidebarApps, children }: { sidebarApps: SidebarApp[]; children: ReactNode }) {
  return (
    <>
      <RippleInit />
      <div className="admin-shell flex min-h-screen" style={{ background: 'var(--admin-bg)' }}>
        <Sidebar sidebarApps={sidebarApps} />
        <LayoutContent>{children}</LayoutContent>
      </div>
    </>
  );
}

export function AdminShell({
  orgRole,
  sidebarApps = [],
  devClerkData = null,
  children,
}: {
  orgRole: string | null;
  sidebarApps?: SidebarApp[];
  devClerkData?: DevClerkData | null;
  children: ReactNode;
}) {
  return (
    <DevClerkProvider value={devClerkData}>
      <RoleProvider orgRole={orgRole}>
        <SidebarProvider>
          <SidebarNavProvider apps={sidebarApps}>
            <NavigationGuardProvider>
              <SettingsProvider>
                <SearchProvider>
                  <ShellInner sidebarApps={sidebarApps}>{children}</ShellInner>
                  <UnsavedChangesModal />
                  {/* `SearchModal` retained for future use; the live UI
                      is currently the in-place morphing `SidebarSearchInput`. */}
                  {false && <SearchModal />}
                </SearchProvider>
              </SettingsProvider>
            </NavigationGuardProvider>
          </SidebarNavProvider>
        </SidebarProvider>
      </RoleProvider>
    </DevClerkProvider>
  );
}
