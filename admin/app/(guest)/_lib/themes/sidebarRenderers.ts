/**
 * Sidebar Renderer Map — static imports for server-side rendering.
 *
 * Same pattern as SectionItem.tsx's RENDERER_MAP. "use client" modules
 * register components via registerSection() as side effects, but those
 * side effects don't execute on the server. Static imports work because
 * Next.js creates a client component reference that can be rendered
 * from a server component.
 *
 * Add new sidebar section types here as they are built.
 */

import type { SectionComponent } from "./types";
import SearchSidebarSection from "./sections/search-sidebar/default";

export const SIDEBAR_RENDERER_MAP: Record<string, SectionComponent> = {
  "search/default": SearchSidebarSection,
};
