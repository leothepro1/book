import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./base.css";
import "./_components/sidebar.css";
import "./_components/settings-panel.css";
import "./_components/search/search.css";
import { getAuth } from "./_lib/auth/devAuth";
import { loadDevClerkData } from "./_lib/auth/dev-clerk-data";
import { AdminShell } from "./_components/AdminShell";
import { getActiveAppsForSidebar } from "@/app/_lib/apps/actions";

// Self-hosted via next/font — only loads on admin routes (no Google
// CDN at runtime). Next.js requires font loaders to be assigned to
// a module-level const, even when we only need the @font-face side
// effect (the actual font name "Geist" / "Geist Mono" is referenced
// directly in (admin)/base.css's --admin-font at :root). We don't
// need the className/variable indirection because :root makes the
// font available to every element including portaled popovers, but
// applying `.className` on a child element below is harmless and
// keeps the loader call explicitly "used" without an eslint pragma.
const geistSans = Geist({ subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], display: "swap" });

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { orgRole } = await getAuth();
  const [sidebarApps, devClerkData] = await Promise.all([
    getActiveAppsForSidebar(),
    loadDevClerkData(),
  ]);

  // The geist loader consts above must be observably "used" so
  // Next.js's font-loader rule passes (just assigning to a const at
  // module scope is enough — referencing them here makes that
  // explicit and prevents tree-shakers from dead-code-eliminating
  // the import). Functional effect: zero — the @font-face is loaded
  // by the import itself, and base.css's :root references the font
  // by literal name.
  void geistSans;
  void geistMono;

  return (
    <>
      <AdminShell orgRole={orgRole} sidebarApps={sidebarApps} devClerkData={devClerkData}>
        {children}
      </AdminShell>
      {/*
        Portal anchor for popovers (Menu, Calendar, Modal, Toast). The
        font scope no longer needs this — Geist is set at :root in
        base.css — but the anchor still serves to escape AdminShell's
        z-index / overflow context cleanly. Components prefer this
        node over document.body via getAdminPortalRoot().
      */}
      <div id="admin-portal-root" />
    </>
  );
}
