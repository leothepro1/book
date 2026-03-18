"use client";

import { createContext, useContext, useMemo } from "react";
import type { MenuConfig } from "@/app/(guest)/_lib/tenant/types";

const MenusContext = createContext<MenuConfig[]>([]);

const EMPTY_MENUS: MenuConfig[] = [];

export function MenusProvider({
  menus,
  children,
}: {
  menus: MenuConfig[];
  children: React.ReactNode;
}) {
  // Stabilise the context value: only change identity when content changes.
  // The parent (ThemeRenderer) may re-render for reasons unrelated to menus;
  // without this, every consumer would re-render needlessly.
  const stable = useMemo(() => (menus && menus.length > 0 ? menus : EMPTY_MENUS), [menus]);

  return <MenusContext.Provider value={stable}>{children}</MenusContext.Provider>;
}

export function useMenus(): MenuConfig[] {
  return useContext(MenusContext);
}

/**
 * Look up a menu by ID or handle.
 * Returns undefined if not found.
 */
export function useMenu(idOrHandle: string | undefined): MenuConfig | undefined {
  const menus = useMenus();
  return useMemo(() => {
    if (!idOrHandle) return undefined;
    return menus.find((m) => m.id === idOrHandle || m.handle === idOrHandle);
  }, [menus, idOrHandle]);
}
