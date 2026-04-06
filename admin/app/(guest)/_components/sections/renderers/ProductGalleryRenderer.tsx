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
 * Clicking any image opens a fullscreen lightbox.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";
import { useOptionalProductEngineContext } from "@/app/_lib/products/engine";
import "./product-gallery-renderer.css";

// ── Lightbox ──────────────────────────────────────────────────

function Lightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  const prev = useCallback(() => setIdx((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIdx((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [close, prev, next]);

  return (
    <div className={`s-pgallery-lb${closing ? " s-pgallery-lb--closing" : ""}`} onClick={close}>
      <div className="s-pgallery-lb__content" onClick={(e) => e.stopPropagation()}>
        <button className="s-pgallery-lb__close" onClick={close} aria-label="Stäng">
          <span className="material-symbols-rounded">close</span>
        </button>

        {images.length > 1 && (
          <button className="s-pgallery-lb__arrow s-pgallery-lb__arrow--prev" onClick={prev} aria-label="Föregående">
            <span className="material-symbols-rounded">chevron_left</span>
          </button>
        )}

        <img src={images[idx]} alt="" className="s-pgallery-lb__img" />

        {images.length > 1 && (
          <button className="s-pgallery-lb__arrow s-pgallery-lb__arrow--next" onClick={next} aria-label="Nästa">
            <span className="material-symbols-rounded">chevron_right</span>
          </button>
        )}

        {images.length > 1 && (
          <div className="s-pgallery-lb__counter">{idx + 1} / {images.length}</div>
        )}
      </div>
    </div>
  );
}

// ── Renderer ──────────────────────────────────────────────────

export function ProductGalleryDefaultRenderer(props: SectionRendererProps) {
  const { section, presetSettings } = props;
  const product = useProduct();
  const engine = useOptionalProductEngineContext();
  const activeImageUrl = engine?.activeImageUrl ?? null;
  const gap = (presetSettings.gap as number) ?? 10;
  const radius = (presetSettings.cornerRadius as number) ?? 12;
  const baseImages: string[] = product?.images ?? [];

  // When a variant with its own image is selected, show it first
  const images = useMemo(() => {
    if (!activeImageUrl || baseImages.includes(activeImageUrl)) return baseImages;
    return [activeImageUrl, ...baseImages];
  }, [activeImageUrl, baseImages]);

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

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
        <div
          className="s-pgallery__main"
          style={{ borderRadius: radius }}
          onClick={() => setLightboxIdx(0)}
          role="button"
          tabIndex={0}
        >
          <img src={main} alt="" className="s-pgallery__img" />
        </div>

        {/* Right: 4 thumbnails in 2×2 grid */}
        {thumbs.length > 0 && (
          <div className="s-pgallery__thumbs" style={{ gap }}>
            {thumbs.map((url, i) => (
              <div
                key={i}
                className="s-pgallery__thumb"
                style={{ borderRadius: radius }}
                onClick={() => setLightboxIdx(i + 1)}
                role="button"
                tabIndex={0}
              >
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

      {lightboxIdx !== null && (
        <Lightbox
          images={images}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </section>
  );
}
