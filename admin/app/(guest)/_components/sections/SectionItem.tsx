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
import { SectionDataProvider } from "./SectionDataContext";
import { TabsUnderlineRenderer, TabsPillRenderer } from "./renderers/TabsRenderer";
import { AccordionDefaultRenderer, AccordionCardRenderer } from "./renderers/AccordionRenderer";
import { SliderButtonRowRenderer, SliderCardRenderer } from "./renderers/SliderRenderer";
import { BokningarDefaultRenderer } from "./renderers/BokningarRenderer";
import { FullscreenSlideshowRenderer } from "./renderers/FullscreenSlideshowRenderer";
import { SlideshowCardRenderer } from "./renderers/SlideshowCardRenderer";
import { HeroFullscreenRenderer } from "./renderers/HeroFullscreenRenderer";
import { HeroBottomAlignedRenderer } from "./renderers/HeroBottomAlignedRenderer";
import { CarouselRenderer } from "./renderers/CarouselRenderer";
import { CollectionGridRenderer } from "./renderers/CollectionGridRenderer";
import { CollectionGridV2Renderer } from "./renderers/CollectionGridV2Renderer";
import { ProductHeroRenderer } from "./renderers/ProductHeroRenderer";
import { ProductHeroSplitRenderer } from "./renderers/ProductHeroSplitRenderer";
import { TextBlocksRenderer } from "./renderers/TextBlocksRenderer";
import { SearchDefaultRenderer } from "./renderers/SearchRenderer";
import { ProductGalleryDefaultRenderer } from "./renderers/ProductGalleryRenderer";
import { ProductContentDefaultRenderer } from "./renderers/ProductContentRenderer";
import { SearchResultsDefaultRenderer } from "./renderers/SearchResultsRenderer";
import { PurchaseBlockDefaultRenderer } from "./renderers/PurchaseBlockRenderer";
import { ProduktseriRenderer } from "./renderers/ProduktseriRenderer";
const RENDERER_MAP: Record<string, React.ComponentType<SectionRendererProps>> = {
  "tabs/underline": TabsUnderlineRenderer,
  "tabs/pill": TabsPillRenderer,
  "accordion/default": AccordionDefaultRenderer,
  "accordion/card": AccordionCardRenderer,
  "slider/button-row": SliderButtonRowRenderer,
  "slider/card": SliderCardRenderer,
  "bokningar/default": BokningarDefaultRenderer,
  "fullscreen-slideshow/default": FullscreenSlideshowRenderer,
  "slideshow-card/default": SlideshowCardRenderer,
  "hero-fullscreen/default": HeroFullscreenRenderer,
  "hero-bottom-aligned/default": HeroBottomAlignedRenderer,
  "carousel/default": CarouselRenderer,
  "collection-grid/default": CollectionGridRenderer,
  "collection-grid-v2/default": CollectionGridV2Renderer,
  "product-hero/default": ProductHeroRenderer,
  "product-hero-split/default": ProductHeroSplitRenderer,
  "text-blocks/default": TextBlocksRenderer,
  "search/default": SearchDefaultRenderer,
  "product-gallery/default": ProductGalleryDefaultRenderer,
  "product-content/default": ProductContentDefaultRenderer,
  "search-results/default": SearchResultsDefaultRenderer,
  "purchase-block/default": PurchaseBlockDefaultRenderer,
  "produktserie/default": ProduktseriRenderer,
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
  const resolvedData = renderProps.resolvedData;

  // SectionDataProvider makes resolvedData available to descendant elements
  // via useSectionData() hook — zero overhead when no data is present.
  if (schemeStyle) {
    return (
      <div data-color-scheme={renderProps.colorScheme!.scheme.id} style={schemeStyle}>
        <SectionDataProvider data={resolvedData}>
          <Renderer {...sanitized} />
        </SectionDataProvider>
      </div>
    );
  }

  return (
    <SectionDataProvider data={resolvedData}>
      <Renderer {...sanitized} />
    </SectionDataProvider>
  );
}
