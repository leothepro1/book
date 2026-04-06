"use client";

/**
 * Shop Product Layout — 2-column product page
 * ─────────────────────────────────────────────
 * Left: hero image + thumbnail strip (sticky on scroll)
 * Right: title, price, description, variants, add-to-cart
 *
 * Self-contained — owns its own gallery, does NOT reuse
 * ProductGalleryRenderer (which belongs to accommodation pages).
 *
 * Only used on /shop/products/[slug] — never on accommodation pages.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";
import { useOptionalProductEngineContext } from "@/app/_lib/products/engine";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import "./shop-product-layout.css";

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
    <div className={`spl-lb${closing ? " spl-lb--closing" : ""}`} onClick={close}>
      <div className="spl-lb__content" onClick={(e) => e.stopPropagation()}>
        <button className="spl-lb__close" onClick={close} aria-label="Stäng">
          <span className="material-symbols-rounded">close</span>
        </button>
        {images.length > 1 && (
          <button className="spl-lb__arrow spl-lb__arrow--prev" onClick={prev} aria-label="Föregående">
            <span className="material-symbols-rounded">chevron_left</span>
          </button>
        )}
        <img src={images[idx]} alt="" className="spl-lb__img" />
        {images.length > 1 && (
          <button className="spl-lb__arrow spl-lb__arrow--next" onClick={next} aria-label="Nästa">
            <span className="material-symbols-rounded">chevron_right</span>
          </button>
        )}
        {images.length > 1 && (
          <div className="spl-lb__counter">{idx + 1} / {images.length}</div>
        )}
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────

export function ShopProductLayout() {
  const product = useProduct();
  const engine = useOptionalProductEngineContext();

  if (!product || product.productType !== "STANDARD") return null;

  const activeImageUrl = engine?.activeImageUrl ?? null;
  const baseImages: string[] = product.images ?? [];
  const images = useMemo(() => {
    if (!activeImageUrl || baseImages.includes(activeImageUrl)) return baseImages;
    return [activeImageUrl, ...baseImages];
  }, [activeImageUrl, baseImages]);

  const price = engine?.price ?? product.price;
  const compareAtPrice = engine?.compareAtPrice ?? product.compareAtPrice;

  return (
    <div className="spl">
      {/* Left: gallery (sticky) */}
      <div className="spl__left">
        <ShopGallery images={images} />
      </div>

      {/* Right: product info */}
      <div className="spl__right">
        <h1 className="spl__title">{product.title}</h1>

        <div className="spl__price-row">
          <span className="spl__price">
            {formatPriceDisplay(price, product.currency)} kr
          </span>
          {compareAtPrice != null && compareAtPrice > price && (
            <span className="spl__compare-price">
              {formatPriceDisplay(compareAtPrice, product.currency)} kr
            </span>
          )}
        </div>

        {product.description && (
          <div
            className="spl__desc"
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
        )}

        {engine && product.options.map((opt) => (
          <div key={opt.id} className="spl__option">
            <label className="spl__option-label">{opt.name}</label>
            <div className="spl__option-values">
              {opt.values.map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`spl__option-btn${
                    engine.selectedOptions[opt.name] === val ? " spl__option-btn--active" : ""
                  }`}
                  onClick={() => engine.setOption(opt.name, val)}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        ))}

        {engine && (
          <button
            type="button"
            className="spl__add-btn"
            onClick={engine.addToCart}
            disabled={!engine.inStock}
          >
            {engine.inStock ? "Lägg i varukorg" : "Slut i lager"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Shop Gallery (hero + thumbnails) ─────────────────────────

function ShopGallery({ images }: { images: string[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => { setActiveIdx(0); }, [images.length]);

  if (images.length === 0) {
    return (
      <div className="spl__gallery-empty">
        <span className="material-symbols-rounded" style={{ fontSize: 32, opacity: 0.2 }}>
          gallery_thumbnail
        </span>
        <span>Produktbilder visas här</span>
      </div>
    );
  }

  return (
    <>
      <div
        className="spl__hero"
        onClick={() => setLightboxIdx(activeIdx)}
        role="button"
        tabIndex={0}
      >
        <img src={images[activeIdx]} alt="" className="spl__hero-img" />
      </div>

      {images.length > 1 && (
        <div className="spl__thumbs">
          {images.map((url, i) => (
            <button
              key={i}
              type="button"
              className={`spl__thumb${i === activeIdx ? " spl__thumb--active" : ""}`}
              onClick={() => setActiveIdx(i)}
            >
              <img src={url} alt="" className="spl__thumb-img" />
            </button>
          ))}
        </div>
      )}

      {lightboxIdx !== null && (
        <Lightbox
          images={images}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}
