/**
 * Section Item — Dispatches to the correct section renderer.
 *
 * Uses a static import map keyed by "definitionId/presetKey".
 * Falls back to GenericSectionRenderer for unregistered sections.
 *
 * Why a static map instead of the registry?
 * The section renderer registry uses registerSectionRenderer() which
 * works great for client-side lookups. But ThemeRenderer is a server
 * component, and renderer components (like Tabs) are client components.
 * Static imports let Next.js handle the server/client boundary correctly.
 *
 * IMPORTANT: SectionRendererProps contains functions (createDefault,
 * createDefaultBlocks, migrations) nested at multiple levels. These
 * cannot be serialized across the React Server → Client Component
 * boundary. JSON round-trip strips all functions automatically.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { GenericSectionRenderer } from "./GenericSectionRenderer";
import { TabsUnderlineRenderer, TabsPillRenderer } from "./renderers/TabsRenderer";
import { AccordionDefaultRenderer, AccordionCardRenderer } from "./renderers/AccordionRenderer";

const RENDERER_MAP: Record<string, React.ComponentType<SectionRendererProps>> = {
  "tabs/underline": TabsUnderlineRenderer,
  "tabs/pill": TabsPillRenderer,
  "accordion/default": AccordionDefaultRenderer,
  "accordion/card": AccordionCardRenderer,
};

/**
 * Strip all non-serializable values (functions) from props so they
 * can cross the server → client component boundary. JSON round-trip
 * naturally drops functions, undefined, and symbols.
 */
function sanitizeForClient(props: SectionRendererProps): SectionRendererProps {
  return JSON.parse(JSON.stringify(props));
}

export function SectionItem({ renderProps }: { renderProps: SectionRendererProps }) {
  const key = `${renderProps.definition.id}/${renderProps.preset.key}`;
  const Renderer = RENDERER_MAP[key];

  if (Renderer) {
    return <Renderer {...sanitizeForClient(renderProps)} />;
  }

  return <GenericSectionRenderer {...sanitizeForClient(renderProps)} />;
}
