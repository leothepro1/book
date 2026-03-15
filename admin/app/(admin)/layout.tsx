'use client';

import type { ReactNode } from "react";
import "./base.css";
import "./_components/settings-panel.css";
import { Sidebar } from "./_components/Sidebar";
import { SidebarProvider, useSidebar } from "./_components/SidebarContext";
import { NavigationGuardProvider, UnsavedChangesModal } from "./_components/NavigationGuard";
import { SettingsProvider, useSettings } from "./_components/SettingsContext";
import { SettingsPanel } from "./_components/SettingsPanel";

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

function AdminShell({ children }: { children: ReactNode }) {
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

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <NavigationGuardProvider>
        <SettingsProvider>
          <AdminShell>{children}</AdminShell>
          <UnsavedChangesModal />
        </SettingsProvider>
      </NavigationGuardProvider>
    </SidebarProvider>
  );
}
