'use client';

import type { ReactNode } from "react";
import { Sidebar } from "./_components/Sidebar";
import { SidebarProvider, useSidebar } from "./_components/SidebarContext";
import { NavigationGuardProvider, UnsavedChangesModal } from "./_components/NavigationGuard";

function LayoutContent({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <main className={`flex-1 transition-all duration-300 ease-in-out bg-[#FBFAF9] overflow-y-auto ${
      isCollapsed ? 'ml-16' : 'ml-64'
    }`}>
      <div className="container mx-auto py-8 px-6">
        {children}
      </div>
    </main>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <NavigationGuardProvider>
        <div className="flex min-h-screen bg-[#FBFAF9]">
          <Sidebar />
          <LayoutContent>{children}</LayoutContent>
        </div>
        <UnsavedChangesModal />
      </NavigationGuardProvider>
    </SidebarProvider>
  );
}
