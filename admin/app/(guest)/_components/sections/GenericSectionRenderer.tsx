/**
 * Generic Section Renderer
 *
 * Fallback renderer for sections that don't have a dedicated renderer
 * registered. Walks the full block → slot → element hierarchy and
 * renders them in a simple vertical stack.
 *
 * This ensures every section added via the editor is visible on the
 * guest portal, even before a custom renderer is built.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { BlockRenderer } from "./BlockRenderer";

export function GenericSectionRenderer(props: SectionRendererProps) {
  const { section, preset, settings, blocks } = props;
  const isLoose = section.definitionId === "__loose-element";
  const pt = isLoose ? 0 : ((settings.paddingTop as number) ?? 0);
  const pr = isLoose ? 0 : ((settings.paddingRight as number) ?? 0);
  const pb = isLoose ? 0 : ((settings.paddingBottom as number) ?? 0);
  const pl = isLoose ? 0 : ((settings.paddingLeft as number) ?? 0);
  const backgroundColor = (settings.backgroundColor as string) || "transparent";
  const hasPadding = pt || pr || pb || pl;

  return (
    <section
      className={preset.cssClass}
      data-section-id={section.id}
      data-definition-id={section.definitionId}
      style={{
        padding: hasPadding ? `${pt}px ${pr}px ${pb}px ${pl}px` : undefined,
        backgroundColor,
        display: "flex",
        flexDirection: "column",
        gap: isLoose ? 0 : 16,
      }}
    >
      {blocks.map((block) => (
        <BlockRenderer key={block.block.id} block={block} />
      ))}
    </section>
  );
}
