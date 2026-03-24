"use client";

/**
 * Product Content Renderer
 * ────────────────────────
 * 65/35 split layout.
 * Left (main slot): title, highlights, description, features.
 * Right (sidebar slot): price, booking form, buy button — sticky.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import { ProductBookingSidebar } from "../../shared/ProductBookingSidebar";
import "./product-content-renderer.css";

export function ProductContentDefaultRenderer(props: SectionRendererProps) {
  const { section, blocks } = props;
  const mainBlock = blocks[0];
  const mainSlot = mainBlock?.slots.main;

  return (
    <section className="s-pcontent" data-section-id={section.id}>
      <div className="s-pcontent__grid">
        <div className="s-pcontent__main">
          {mainSlot?.elements.map((resolved) => (
            <ElementRenderer key={resolved.element.id} resolved={resolved} />
          ))}
          {(!mainSlot || mainSlot.elements.length === 0) && (
            <div className="s-pcontent__empty">Produktinnehåll visas här</div>
          )}
        </div>
        <div className="s-pcontent__sidebar">
          <ProductBookingSidebar />
        </div>
      </div>
    </section>
  );
}
