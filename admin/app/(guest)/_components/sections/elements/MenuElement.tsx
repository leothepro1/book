"use client";

/**
 * MenuElement — Renders a saved menu's items as navigation links.
 *
 * In the footer "app" layout, this renders as the tab bar items.
 * In the footer "classic" layout, this renders as an accordion.
 *
 * Used as a section element, not directly by GuestFooter.
 */

import { useMemo } from "react";
import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useMenus } from "./MenusContext";

export function MenuElement({ resolved }: { resolved: ResolvedElement }) {
  const menus = useMenus();
  const { settings } = resolved;

  const menuId = typeof settings.menu_id === "string" ? settings.menu_id : "";

  const menuConfig = useMemo(() => {
    if (!menus || !menuId) return null;
    return menus.find((m) => m.id === menuId) ?? null;
  }, [menus, menuId]);

  if (!menuId) {
    return (
      <div
        style={{
          padding: "24px 16px",
          background: "#F0EFED",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8C8B89",
          fontSize: 14,
          gap: 8,
        }}
      >
        <span className="material-symbols-rounded" style={{ fontSize: 20 }} aria-hidden="true">
          link
        </span>
        Ingen meny vald
      </div>
    );
  }

  if (!menuConfig) {
    return (
      <div
        style={{
          padding: "24px 16px",
          background: "#F0EFED",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8C8B89",
          fontSize: 14,
        }}
      >
        Menyn hittades inte
      </div>
    );
  }

  // Render menu items as simple navigation links
  return (
    <nav>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {menuConfig.items.map((item) => (
          <li key={item.id}>
            <a
              href={item.url}
              style={{
                display: "block",
                padding: "8px 0",
                color: "inherit",
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
