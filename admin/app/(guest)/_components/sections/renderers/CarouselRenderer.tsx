"use client";

/**
 * Carousel Renderer (Karusell)
 * ────────────────────────────
 * Section heading above, horizontal scrolling items below.
 * Each item: image (aspect ratio from section settings) + text label.
 * No pagination — scroll-snap navigation.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./carousel-renderer.css";

const ASPECT_MAP: Record<string, string> = {
  "1:1": "1 / 1",
  "3:4": "3 / 4",
  "4:3": "4 / 3",
  "16:9": "16 / 9",
};

const SIZE_MAP: Record<string, string> = {
  xs: "1rem",
  sm: "clamp(1.5rem, 1.25rem + 1vw, 2rem)",
  md: "clamp(1.875rem, 1.5rem + 1.5vw, 2.5rem)",
  lg: "clamp(2.25rem, 1.75rem + 2vw, 3.25rem)",
  xl: "clamp(2.75rem, 2rem + 3vw, 4rem)",
};

export function CarouselRenderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, blocks } = props;

  const heading = (settings.heading as string) || "";
  const headingSize = (settings.headingSize as string) || "md";
  const headingAlignment = (settings.headingAlignment as string) || "left";
  const ratioKey = (presetSettings.aspectRatio as string) || "1:1";
  const aspectRatio = ASPECT_MAP[ratioKey] || "1 / 1";

  if (blocks.length === 0) return null;

  return (
    <section className="s-carousel" data-section-id={section.id}>
      {/* Section heading — setting field, rendered like HeadingElement */}
      {heading && (
        <h2
          className="s-carousel__heading"
          style={{
            fontSize: SIZE_MAP[headingSize] || SIZE_MAP.md,
            textAlign: headingAlignment as React.CSSProperties["textAlign"],
            margin: `0 0 clamp(0.75rem, 2vw, 1.25rem)`,
          }}
        >
          {heading}
        </h2>
      )}

      {/* Scroll track */}
      <div className="s-carousel__track">
        {blocks.map((block) => {
          const imageSlot = block.slots.image;
          const labelSlot = block.slots.label;

          return (
            <div key={block.block.id} className="s-carousel__item">
              {/* Image wrapper — aspect ratio from section settings */}
              {imageSlot?.elements.map((resolved) => (
                <div
                  key={resolved.element.id}
                  className="s-carousel__image"
                  style={{ aspectRatio }}
                >
                  <ElementRenderer resolved={resolved} />
                </div>
              ))}

              {/* Label below image */}
              {labelSlot?.elements.map((resolved) => (
                <div key={resolved.element.id} className="s-carousel__label">
                  <ElementRenderer resolved={resolved} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
