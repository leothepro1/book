"use client";

/**
 * Collection Grid v2 Renderer (Kollektionsrutnät v2)
 * ───────────────────────────────────────────────────
 * 2-column CSS grid with repeating 2-1-2 pattern:
 *   Row 1: 2 items (1 col each)
 *   Row 2: 1 item (full width)
 *   Row 3: 2 items (1 col each)
 *   ... repeats
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./collection-grid-v2-renderer.css";

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

/**
 * Determine if a block at index i should span full width.
 * Pattern repeats every 5 items: [half, half, FULL, half, half]
 * Index within cycle: 0,1 = half | 2 = full | 3,4 = half
 */
function isFullWidth(index: number): boolean {
  return index % 5 === 2;
}

export function CollectionGridV2Renderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, blocks } = props;

  const heading = (settings.heading as string) || "";
  const headingSize = (settings.headingSize as string) || "md";
  const headingAlignment = (settings.headingAlignment as string) || "left";
  const ratioKey = (presetSettings.aspectRatio as string) || "3:4";
  const aspectRatio = ASPECT_MAP[ratioKey] || "3 / 4";

  if (blocks.length === 0) return null;

  return (
    <section className="s-cgv2" data-section-id={section.id}>
      {heading && (
        <h2
          className="s-cgv2__heading"
          style={{
            fontSize: SIZE_MAP[headingSize] || SIZE_MAP.md,
            textAlign: headingAlignment as React.CSSProperties["textAlign"],
            margin: `0 0 clamp(0.75rem, 2vw, 1.25rem)`,
          }}
        >
          {heading}
        </h2>
      )}

      <div className="s-cgv2__grid">
        {blocks.map((block, i) => {
          const imageSlot = block.slots.image;
          const labelSlot = block.slots.label;
          const full = isFullWidth(i);

          return (
            <div
              key={block.block.id}
              className={`s-cgv2__item${full ? " s-cgv2__item--full" : ""}`}
              style={{ aspectRatio }}
            >
              {imageSlot?.elements.map((resolved) => (
                <div key={resolved.element.id} className="s-cgv2__image">
                  <ElementRenderer resolved={resolved} />
                </div>
              ))}

              {labelSlot?.elements.map((resolved) => (
                <div key={resolved.element.id} className="s-cgv2__label">
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
