"use client";

/**
 * Product Hero Renderer (Produkthero)
 * ────────────────────────────────────
 * Image above, heading + text + full-width button below.
 * No overlay, no slider — simple vertical stack.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./product-hero-renderer.css";

const ASPECT_MAP: Record<string, string> = {
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "3:4": "3 / 4",
  "16:9": "16 / 9",
};

export function ProductHeroRenderer(props: SectionRendererProps) {
  const { section, presetSettings, blocks } = props;

  const ratioKey = (presetSettings.imageAspectRatio as string) || "1:1";
  const aspectRatio = ASPECT_MAP[ratioKey] || "1 / 1";

  if (blocks.length === 0) return null;

  const block = blocks[0];
  const imageSlot = block.slots.image;
  const contentSlot = block.slots.content;
  const actionsSlot = block.slots.actions;

  return (
    <section className="s-ph" data-section-id={section.id}>
      {/* Image — above content */}
      {imageSlot?.elements.map((resolved) => (
        <div
          key={resolved.element.id}
          className="s-ph__image"
          style={{ aspectRatio }}
        >
          <ElementRenderer resolved={resolved} />
        </div>
      ))}

      {/* Content — below image */}
      <div className="s-ph__body">
        {contentSlot?.elements.map((resolved) => (
          <ElementRenderer key={resolved.element.id} resolved={resolved} />
        ))}
        {actionsSlot?.elements.map((resolved) => (
          <div key={resolved.element.id} className="s-ph__action">
            <ElementRenderer resolved={resolved} />
          </div>
        ))}
      </div>
    </section>
  );
}
