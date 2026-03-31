"use client";

/**
 * Product Content Renderer
 * ────────────────────────
 * Sticky booking sidebar (right column).
 * Left column is intentionally empty — content above this section
 * (standalone elements like product-title, accommodation-highlights)
 * flows alongside the sticky sidebar via CSS grid on the parent.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { ProductBookingSidebar } from "../../shared/ProductBookingSidebar";
import "./product-content-renderer.css";

export function ProductContentDefaultRenderer(props: SectionRendererProps) {
  const { section } = props;

  return (
    <section className="s-pcontent" data-section-id={section.id}>
      <ProductBookingSidebar />
    </section>
  );
}
