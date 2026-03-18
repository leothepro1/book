/**
 * Section Item — Dispatches to the correct section renderer.
 *
 * Uses a static import map keyed by "definitionId/presetKey".
 * Falls back to GenericSectionRenderer for unregistered sections.
 *
 * COLOR SCHEME INTEGRATION:
 * When a section has a resolved color scheme, this component wraps
 * the renderer in a <div> with scheme CSS variables applied as inline
 * style. All child elements inherit scheme tokens via CSS cascading.
 * This is the SINGLE integration point — individual renderers never
 * need to know about color schemes.
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
import { SliderButtonRowRenderer, SliderCardRenderer } from "./renderers/SliderRenderer";
import { BokningarDefaultRenderer } from "./renderers/BokningarRenderer";

const RENDERER_MAP: Record<string, React.ComponentType<SectionRendererProps>> = {
  "tabs/underline": TabsUnderlineRenderer,
  "tabs/pill": TabsPillRenderer,
  "accordion/default": AccordionDefaultRenderer,
  "accordion/card": AccordionCardRenderer,
  "slider/button-row": SliderButtonRowRenderer,
  "slider/card": SliderCardRenderer,
  "bokningar/default": BokningarDefaultRenderer,
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
  const Renderer = RENDERER_MAP[key] ?? GenericSectionRenderer;
  const sanitized = sanitizeForClient(renderProps);

  const schemeStyle = renderProps.colorScheme?.cssVariables;

  // When a color scheme is active, wrap in a scoping div that sets
  // CSS custom properties. All descendants inherit via cascading.
  // When no scheme is active, render the renderer directly (no wrapper overhead).
  if (schemeStyle) {
    return (
      <div data-color-scheme={renderProps.colorScheme!.scheme.id} style={schemeStyle}>
        <Renderer {...sanitized} />
      </div>
    );
  }

  return <Renderer {...sanitized} />;
}
