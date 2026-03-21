"use client";

/**
 * Product Hero Split Renderer (Produkthero: Delad)
 * ─────────────────────────────────────────────────
 * Split layout: image top, content bottom.
 * Two-tone look driven by color scheme — bottom half uses
 * var(--background), no hardcoded dark values.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./product-hero-split-renderer.css";

const ASPECT_MAP: Record<string, string> = {
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "3:4": "3 / 4",
  "16:9": "16 / 9",
};

export function ProductHeroSplitRenderer(props: SectionRendererProps) {
  const { section, presetSettings, blocks } = props;

  const ratioKey = (presetSettings.imageAspectRatio as string) || "1:1";
  const aspectRatio = ASPECT_MAP[ratioKey] || "1 / 1";

  if (blocks.length === 0) return null;

  const block = blocks[0];
  const imageSlot = block.slots.image;
  const eyebrowSlot = block.slots.eyebrow;
  const contentSlot = block.slots.content;
  const actionsSlot = block.slots.actions;

  return (
    <section className="s-phs" data-section-id={section.id}>
      {/* Image — upper half, edge-to-edge */}
      {imageSlot?.elements.map((resolved) => (
        <div
          key={resolved.element.id}
          className="s-phs__image"
          style={{ aspectRatio }}
        >
          <ElementRenderer resolved={resolved} />
        </div>
      ))}

      {/* Content — lower half, uses var(--background) from color scheme */}
      <div className="s-phs__body">
        {/* Eyebrow label */}
        {eyebrowSlot?.elements.map((resolved) => (
          <div key={resolved.element.id} className="s-phs__eyebrow">
            <ElementRenderer resolved={resolved} />
          </div>
        ))}

        {/* Heading + body text */}
        {contentSlot?.elements.map((resolved, i) => (
          <div
            key={resolved.element.id}
            className={i > 0 ? "s-phs__description" : undefined}
          >
            <ElementRenderer resolved={resolved} />
          </div>
        ))}

        {/* Ghost button */}
        {actionsSlot?.elements.map((resolved) => (
          <div key={resolved.element.id} className="s-phs__action">
            <ElementRenderer resolved={resolved} />
          </div>
        ))}
      </div>
    </section>
  );
}
