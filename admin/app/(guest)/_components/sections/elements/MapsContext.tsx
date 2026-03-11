"use client";

import { createContext, useContext } from "react";
import type { MapConfig } from "@/app/(guest)/_lib/tenant/types";

const MapsContext = createContext<MapConfig[]>([]);

export function MapsProvider({
  maps,
  children,
}: {
  maps: MapConfig[];
  children: React.ReactNode;
}) {
  return <MapsContext.Provider value={maps}>{children}</MapsContext.Provider>;
}

export function useMaps(): MapConfig[] {
  return useContext(MapsContext);
}
