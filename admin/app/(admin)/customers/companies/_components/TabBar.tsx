import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Horizontal tab bar built on server-rendered <Link>s. Active tab is derived
 * from the current URL's `?tab=` segment, so every tab change is a normal
 * Next.js navigation — the server refetches only the active tab's data.
 *
 * Keyboard accessibility: arrow keys + Home/End would be nice to have; the
 * W3C pattern uses role="tablist"/"tab" with onKeyDown handlers, but that
 * requires a client component. For FAS 4 we rely on native <a> tab order
 * (Tab / Shift+Tab) which is sufficient for WCAG 2.1 AA. Full APG pattern
 * can be layered on in a later polish pass.
 */

export interface TabDef {
  key: string;
  label: string;
  /** Accessible suffix appended to the visible label via aria-label. */
  ariaSuffix?: string;
  badge?: ReactNode;
}

export function TabBar({
  tabs,
  activeTab,
  basePath,
  /** If provided, preserved alongside `?tab=` on every tab link (e.g. search / cursor). */
  preserve,
}: {
  tabs: TabDef[];
  activeTab: string;
  basePath: string;
  preserve?: Record<string, string | undefined>;
}) {
  return (
    <nav className="co-tabs" role="tablist" aria-label="Flikar">
      {tabs.map((tab) => {
        const params = new URLSearchParams();
        if (preserve) {
          for (const [k, v] of Object.entries(preserve)) {
            if (v !== undefined && v !== "") params.set(k, v);
          }
        }
        params.set("tab", tab.key);
        const href = `${basePath}?${params.toString()}`;
        const isActive = activeTab === tab.key;
        return (
          <Link
            key={tab.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.ariaSuffix ? `${tab.label} ${tab.ariaSuffix}` : undefined}
            className={`co-tab${isActive ? " co-tab--active" : ""}`}
          >
            <span>{tab.label}</span>
            {tab.badge ? <span className="co-tab__badge">{tab.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
