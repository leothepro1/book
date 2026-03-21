"use client";

/**
 * Hero Fullscreen Renderer
 * ────────────────────────
 * Single full-bleed hero image with overlaid content
 * positioned in the lower portion. No slider — always 1 block.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./hero-fullscreen-renderer.css";

export function HeroFullscreenRenderer(props: SectionRendererProps) {
  const { section, presetSettings, blocks } = props;

  const aspectRatio = (presetSettings.aspectRatio as string) || "16 / 9";

  if (blocks.length === 0) return null;

  const block = blocks[0];
  const imageSlot = block.slots.image;
  const contentSlot = block.slots.content;
  const actionsSlot = block.slots.actions;

  return (
    <section
      className="s-hero-fs"
      data-section-id={section.id}
      style={{ aspectRatio }}
    >
      {/* Background image — fills entire section */}
      {imageSlot?.elements.map((resolved) => (
        <div key={resolved.element.id} className="s-hero-fs__bg">
          <ElementRenderer resolved={resolved} />
        </div>
      ))}


      {/* Content — lower portion, stacked vertically */}
      <div className="s-hero-fs__content">
        {contentSlot?.elements.map((resolved) => (
          <ElementRenderer key={resolved.element.id} resolved={resolved} />
        ))}
        {actionsSlot?.elements.map((resolved) => (
          <ElementRenderer key={resolved.element.id} resolved={resolved} />
        ))}
      </div>
    </section>
  );
}
