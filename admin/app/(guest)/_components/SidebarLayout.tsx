"use client";

/**
 * Sidebar Layout — Client Component
 *
 * Renders a two-column layout with a persistent sidebar on the left.
 * The sidebar is hidden on checkout routes (pathname-based check).
 * On mobile (< 768px): sidebar collapses into a toggleable panel
 * above the main content.
 *
 * This component is only mounted when the active theme declares
 * layout: "sidebar-left". For all other themes, GuestPageShell
 * renders the standard single-column layout without this component.
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AccountSidebar } from "./AccountSidebar";
import "./sidebar-layout.css";

/** Routes where the sidebar is fully hidden (no sidebar at all). */
const SIDEBAR_EXCLUDED_PREFIXES = ["/checkout", "/shop/products", "/login", "/register", "/order-status", "/auth"];

/** Routes where the sidebar is hidden (suffix match). */
const SIDEBAR_EXCLUDED_SUFFIXES = ["/addons"];

/** Routes that show the account sidebar instead of the search sidebar. */
const ACCOUNT_PREFIXES = ["/account"];

export function SidebarLayout({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Route-based exclusion — sidebar never renders on checkout etc.
  const isExcluded =
    SIDEBAR_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    SIDEBAR_EXCLUDED_SUFFIXES.some((suffix) => pathname.endsWith(suffix));

  // Account pages get their own navigation sidebar
  const isAccount = ACCOUNT_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isExcluded || (!sidebar && !isAccount)) {
    return <>{children}</>;
  }

  if (isAccount) {
    return (
      <div className="sl sl--account">
        <aside className="sl__sidebar"><AccountSidebar /></aside>
        <div className="sl__main"><div className="g-content">{children}</div></div>
      </div>
    );
  }

  return (
    <div className="sl">
      {/* ── Desktop sidebar ── */}
      <aside className="sl__sidebar">{sidebar}</aside>

      {/* ── Mobile toggle ── */}
      <div className="sl__mobile-bar">
        <button
          type="button"
          className="sl__mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Stäng sökpanel" : "Öppna sökpanel"}
        >
          <span
            className="material-symbols-rounded select-none leading-none"
            style={{
              fontSize: 20,
              fontVariationSettings: `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20`,
            }}
          >
            {mobileOpen ? "close" : "search"}
          </span>
          <span className="sl__mobile-label">
            {mobileOpen ? "Stäng" : "Sök & boka"}
          </span>
        </button>
      </div>

      {/* ── Mobile sidebar panel ── */}
      {mobileOpen && (
        <div className="sl__mobile-panel">{sidebar}</div>
      )}

      {/* ── Main content ── */}
      <div className="sl__main">{children}</div>
    </div>
  );
}
