import type { ReactNode } from "react";
import "./base.css";
import "./_components/settings-panel.css";
import { getAuth } from "./_lib/auth/devAuth";
import { AdminShell } from "./_components/AdminShell";
import { getActiveAppsForSidebar } from "@/app/_lib/apps/actions";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { orgRole } = await getAuth();
  const sidebarApps = await getActiveAppsForSidebar();

  return <AdminShell orgRole={orgRole} sidebarApps={sidebarApps}>{children}</AdminShell>;
}
