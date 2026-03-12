"use client";

import { createContext, useContext, useMemo } from "react";
import type { MapConfig } from "@/app/(guest)/_lib/tenant/types";

const MapsContext = createContext<MapConfig[]>([]);

const EMPTY_MAPS: MapConfig[] = [];

export function MapsProvider({
  maps,
  children,
}: {
  maps: MapConfig[];
  children: React.ReactNode;
}) {
  // Stabilise the context value: only change identity when content changes.
  // The parent (ThemeRenderer) may re-render for reasons unrelated to maps;
  // without this, every consumer would re-render needlessly.
  const stable = useMemo(() => (maps && maps.length > 0 ? maps : EMPTY_MAPS), [maps]);

  return <MapsContext.Provider value={stable}>{children}</MapsContext.Provider>;
}

export function useMaps(): MapConfig[] {
  return useContext(MapsContext);
}
