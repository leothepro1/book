'use client';

import type { ReactNode } from 'react';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { NavigationGuardProvider, UnsavedChangesModal } from './NavigationGuard';
import { SettingsProvider, useSettings } from './SettingsContext';
import { RoleProvider } from './RoleContext';
import { Sidebar } from './Sidebar';
import type { SidebarApp } from '@/app/_lib/apps/actions';
import { SettingsPanel } from './SettingsPanel';

function LayoutContent({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <main className={`flex-1 transition-all duration-300 ease-in-out overflow-y-auto h-screen ${
      isCollapsed ? 'ml-16' : 'ml-[270px]'
    }`} style={{ background: 'var(--admin-bg)' }}>
      <div className="container mx-auto py-8 px-6">
        {children}
      </div>
    </main>
  );
}

function ShellInner({ sidebarApps, children }: { sidebarApps: SidebarApp[]; children: ReactNode }) {
  const { isOpen } = useSettings();

  return (
    <>
      <div className={`admin-shell flex min-h-screen ${isOpen ? 'admin-shell--pushed' : ''}`}
        style={{ background: 'var(--admin-bg)' }}
      >
        <Sidebar sidebarApps={sidebarApps} />
        <LayoutContent>{children}</LayoutContent>
      </div>
      <SettingsPanel />
    </>
  );
}

export function AdminShell({ orgRole, sidebarApps = [], children }: { orgRole: string | null; sidebarApps?: SidebarApp[]; children: ReactNode }) {
  return (
    <RoleProvider orgRole={orgRole}>
      <SidebarProvider>
        <NavigationGuardProvider>
          <SettingsProvider>
            <ShellInner sidebarApps={sidebarApps}>{children}</ShellInner>
            <UnsavedChangesModal />
          </SettingsProvider>
        </NavigationGuardProvider>
      </SidebarProvider>
    </RoleProvider>
  );
}
