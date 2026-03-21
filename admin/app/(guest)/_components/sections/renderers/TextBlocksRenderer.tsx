"use client";

/**
 * Text Blocks Renderer (Textblock)
 * ─────────────────────────────────
 * Card container with centered text blocks.
 * Divider between blocks via CSS border — not an element.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./text-blocks-renderer.css";

export function TextBlocksRenderer(props: SectionRendererProps) {
  const { section, blocks } = props;

  if (blocks.length === 0) return null;

  return (
    <section className="s-tb" data-section-id={section.id}>
      <div className="s-tb__card">
        {blocks.map((block, i) => (
          <div
            key={block.block.id}
            className={`s-tb__block${i > 0 ? " s-tb__block--divider" : ""}`}
          >
            {block.slots.content?.elements.map((resolved) => (
              <ElementRenderer key={resolved.element.id} resolved={resolved} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
