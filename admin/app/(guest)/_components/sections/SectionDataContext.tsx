"use client";

/**
 * Section Data Context
 *
 * Provides section-level resolvedData to descendant elements.
 * Set by SectionItem when rendering a section that has resolvedData.
 * Read by data-driven elements (e.g. dynamic product title) via useSectionData().
 *
 * This bridges the gap between section-level data (fetched server-side
 * via dataSources) and element-level rendering (client components).
 */

import { createContext, useContext, type ReactNode } from "react";
import type { ResolvedDataMap } from "@/app/_lib/sections/data-sources";

const SectionDataContext = createContext<ResolvedDataMap | undefined>(undefined);

export function SectionDataProvider({
  data,
  children,
}: {
  data: ResolvedDataMap | undefined;
  children: ReactNode;
}) {
  if (!data) return <>{children}</>;
  return (
    <SectionDataContext.Provider value={data}>
      {children}
    </SectionDataContext.Provider>
  );
}

/**
 * Read section-level resolved data from the nearest SectionDataProvider.
 * Returns undefined if no data is available (element not inside a data-sourced section).
 */
export function useSectionData(): ResolvedDataMap | undefined {
  return useContext(SectionDataContext);
}

/**
 * Read a specific resolved data key from the section.
 * Returns null if not found.
 */
export function useSectionDataKey<T = unknown>(key: string): T | null {
  const data = useContext(SectionDataContext);
  if (!data || !(key in data)) return null;
  return data[key] as T;
}
