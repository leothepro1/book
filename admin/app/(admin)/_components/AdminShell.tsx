'use client';

import type { ReactNode } from 'react';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { NavigationGuardProvider, UnsavedChangesModal } from './NavigationGuard';
import { SettingsProvider, useSettings } from './SettingsContext';
import { RoleProvider } from './RoleContext';
import { Sidebar } from './Sidebar';
import { SettingsPanel } from './SettingsPanel';

function LayoutContent({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <main className={`flex-1 transition-all duration-300 ease-in-out overflow-y-auto ${
      isCollapsed ? 'ml-16' : 'ml-64'
    }`} style={{ background: 'var(--admin-bg)' }}>
      <div className="container mx-auto py-8 px-6">
        {children}
      </div>
    </main>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { isOpen } = useSettings();

  return (
    <>
      <div className={`admin-shell flex min-h-screen ${isOpen ? 'admin-shell--pushed' : ''}`}
        style={{ background: 'var(--admin-bg)' }}
      >
        <Sidebar />
        <LayoutContent>{children}</LayoutContent>
      </div>
      <SettingsPanel />
    </>
  );
}

export function AdminShell({ orgRole, children }: { orgRole: string | null; children: ReactNode }) {
  return (
    <RoleProvider orgRole={orgRole}>
      <SidebarProvider>
        <NavigationGuardProvider>
          <SettingsProvider>
            <ShellInner>{children}</ShellInner>
            <UnsavedChangesModal />
          </SettingsProvider>
        </NavigationGuardProvider>
      </SidebarProvider>
    </RoleProvider>
  );
}
