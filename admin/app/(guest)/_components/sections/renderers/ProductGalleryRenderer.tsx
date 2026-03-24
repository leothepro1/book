"use client";

/**
 * Product Gallery Renderer
 * ────────────────────────
 * Locked section renderer for the product page.
 * Renders product images in a 1+4 mosaic grid:
 *
 *   ┌──────────────┬──────┬──────┐
 *   │              │  2   │  3   │
 *   │      1       ├──────┼──────┤
 *   │              │  4   │  5   │
 *   └──────────────┴──────┴──────┘
 *
 * Images pulled dynamically from product media context.
 * gap and cornerRadius configurable via preset settings.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";
import "./product-gallery-renderer.css";

export function ProductGalleryDefaultRenderer(props: SectionRendererProps) {
  const { section, presetSettings } = props;
  const product = useProduct();
  const gap = (presetSettings.gap as number) ?? 10;
  const radius = (presetSettings.cornerRadius as number) ?? 12;
  const images: string[] = product?.images ?? [];

  if (images.length === 0) {
    return (
      <section className="s-pgallery" data-section-id={section.id}>
        <div
          className="s-pgallery__empty"
          style={{ borderRadius: radius }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 32, opacity: 0.2 }}>
            gallery_thumbnail
          </span>
          <span>Produktbilder visas här</span>
        </div>
      </section>
    );
  }

  const main = images[0];
  const thumbs = images.slice(1, 5);

  return (
    <section className="s-pgallery" data-section-id={section.id}>
      <div className="s-pgallery__grid" style={{ gap }}>
        {/* Left: main image */}
        <div className="s-pgallery__main" style={{ borderRadius: radius }}>
          <img src={main} alt="" className="s-pgallery__img" />
        </div>

        {/* Right: 4 thumbnails in 2×2 grid */}
        {thumbs.length > 0 && (
          <div className="s-pgallery__thumbs" style={{ gap }}>
            {thumbs.map((url, i) => (
              <div key={i} className="s-pgallery__thumb" style={{ borderRadius: radius }}>
                <img src={url} alt="" className="s-pgallery__img" />
              </div>
            ))}
            {/* Fill empty slots if fewer than 4 thumbs */}
            {Array.from({ length: Math.max(0, 4 - thumbs.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="s-pgallery__thumb s-pgallery__thumb--empty"
                style={{ borderRadius: radius }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
