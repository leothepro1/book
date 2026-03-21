"use client";

/**
 * Collection Grid Renderer (Kollektionsrutnät)
 * ─────────────────────────────────────────────
 * 2-column CSS grid. Image fills each card, text label overlaid
 * at bottom-left. If odd item count, first item spans full width.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./collection-grid-renderer.css";

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

export function CollectionGridRenderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, blocks } = props;

  const heading = (settings.heading as string) || "";
  const headingSize = (settings.headingSize as string) || "md";
  const headingAlignment = (settings.headingAlignment as string) || "left";
  const ratioKey = (presetSettings.aspectRatio as string) || "3:4";
  const aspectRatio = ASPECT_MAP[ratioKey] || "3 / 4";
  const isOdd = blocks.length % 2 !== 0;

  if (blocks.length === 0) return null;

  return (
    <section className="s-cg" data-section-id={section.id}>
      {/* Section heading */}
      {heading && (
        <h2
          className="s-cg__heading"
          style={{
            fontSize: SIZE_MAP[headingSize] || SIZE_MAP.md,
            textAlign: headingAlignment as React.CSSProperties["textAlign"],
            margin: `0 0 clamp(0.75rem, 2vw, 1.25rem)`,
          }}
        >
          {heading}
        </h2>
      )}

      {/* Grid */}
      <div className="s-cg__grid">
        {blocks.map((block, i) => {
          const imageSlot = block.slots.image;
          const labelSlot = block.slots.label;
          const spanFull = isOdd && i === 0;

          return (
            <div
              key={block.block.id}
              className={`s-cg__item${spanFull ? " s-cg__item--full" : ""}`}
              style={{ aspectRatio }}
            >
              {/* Image — fills entire card */}
              {imageSlot?.elements.map((resolved) => (
                <div key={resolved.element.id} className="s-cg__image">
                  <ElementRenderer resolved={resolved} />
                </div>
              ))}


              {/* Label — overlaid, bottom-left */}
              {labelSlot?.elements.map((resolved) => (
                <div key={resolved.element.id} className="s-cg__label">
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
