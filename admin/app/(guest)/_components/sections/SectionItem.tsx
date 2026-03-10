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
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { GenericSectionRenderer } from "./GenericSectionRenderer";
import { TabsUnderlineRenderer, TabsPillRenderer } from "./renderers/TabsRenderer";

const RENDERER_MAP: Record<string, React.ComponentType<SectionRendererProps>> = {
  "tabs/underline": TabsUnderlineRenderer,
  "tabs/pill": TabsPillRenderer,
};

export function SectionItem({ renderProps }: { renderProps: SectionRendererProps }) {
  const key = `${renderProps.definition.id}/${renderProps.preset.key}`;
  const Renderer = RENDERER_MAP[key];

  if (Renderer) {
    return <Renderer {...renderProps} />;
  }

  return <GenericSectionRenderer {...renderProps} />;
}
