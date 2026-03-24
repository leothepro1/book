"use client";

/**
 * Purchase Block Renderer
 * ───────────────────────
 * Sticky sidebar section: price, date picker, buy button.
 * Renders elements from the "content" slot vertically.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./purchase-block-renderer.css";

export function PurchaseBlockDefaultRenderer(props: SectionRendererProps) {
  const { section, blocks } = props;
  const block = blocks[0];
  const contentSlot = block?.slots.content;

  return (
    <section className="s-purchase" data-section-id={section.id}>
      <div className="s-purchase__card">
        {contentSlot?.elements.map((resolved) => (
          <ElementRenderer key={resolved.element.id} resolved={resolved} />
        ))}
      </div>
    </section>
  );
}
