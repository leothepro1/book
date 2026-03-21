"use client";

/**
 * Hero Bottom-Aligned Renderer (Huvudbild: Bottenjusterad)
 * ────────────────────────────────────────────────────────
 * Full-bleed hero with content anchored to bottom-left.
 * Label (eyebrow) → heading → body. No button, no slider.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./hero-bottom-aligned-renderer.css";

export function HeroBottomAlignedRenderer(props: SectionRendererProps) {
  const { section, presetSettings, blocks } = props;

  const aspectRatio = (presetSettings.aspectRatio as string) || "16 / 9";

  if (blocks.length === 0) return null;

  const block = blocks[0];
  const imageSlot = block.slots.image;
  const labelSlot = block.slots.label;
  const contentSlot = block.slots.content;

  return (
    <section
      className="s-hero-ba"
      data-section-id={section.id}
      style={{ aspectRatio }}
    >
      {/* Background image */}
      {imageSlot?.elements.map((resolved) => (
        <div key={resolved.element.id} className="s-hero-ba__bg">
          <ElementRenderer resolved={resolved} />
        </div>
      ))}


      {/* Content — bottom-left anchored */}
      <div className="s-hero-ba__content">
        {/* Eyebrow label */}
        {labelSlot?.elements.map((resolved) => (
          <div key={resolved.element.id} className="s-hero-ba__label">
            <ElementRenderer resolved={resolved} />
          </div>
        ))}

        {/* Heading + body */}
        {contentSlot?.elements.map((resolved) => (
          <ElementRenderer key={resolved.element.id} resolved={resolved} />
        ))}
      </div>
    </section>
  );
}
