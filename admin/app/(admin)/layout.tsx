import type { ReactNode } from "react";
import "./base.css";
import "./_components/sidebar.css";
import "./_components/settings-panel.css";
import "./_components/search/search.css";
import { getAuth } from "./_lib/auth/devAuth";
import { loadDevClerkData } from "./_lib/auth/dev-clerk-data";
import { AdminShell } from "./_components/AdminShell";
import { getActiveAppsForSidebar } from "@/app/_lib/apps/actions";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { orgRole } = await getAuth();
  const [sidebarApps, devClerkData] = await Promise.all([
    getActiveAppsForSidebar(),
    loadDevClerkData(),
  ]);

  return (
    <AdminShell orgRole={orgRole} sidebarApps={sidebarApps} devClerkData={devClerkData}>
      {children}
    </AdminShell>
  );
}
