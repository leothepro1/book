import type { ReactNode } from "react";
import "./base.css";
import "./_components/settings-panel.css";
import { getAuth } from "./_lib/auth/devAuth";
import { AdminShell } from "./_components/AdminShell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { orgRole } = await getAuth();

  return <AdminShell orgRole={orgRole}>{children}</AdminShell>;
}
