"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { effectivePrice, formatPriceDisplay } from "@/app/_lib/products/pricing";
import { useCart } from "@/app/(guest)/_lib/cart/CartContext";
import "./product-detail.css";

// ── Serialized types (from server component) ───────────────────

type ProductMedia = {
  id: string;
  url: string;
  type: string;
  alt: string;
};

type ProductOption = {
  id: string;
  name: string;
  values: string[];
};

type ProductVariant = {
  id: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  sku: string | null;
  trackInventory: boolean;
  inventoryQuantity: number;
  continueSellingWhenOutOfStock: boolean;
};

type SerializedProduct = {
  id: string;
  title: string;
  description: string;
  slug: string;
  price: number;
  currency: string;
  compareAtPrice: number | null;
  trackInventory: boolean;
  inventoryQuantity: number;
  continueSellingWhenOutOfStock: boolean;
  media: ProductMedia[];
  options: ProductOption[];
  variants: ProductVariant[];
};

// ── Lightbox ──────────────────────────────────────────────────

function Lightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: ProductMedia[];
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

  const img = images[idx];

  return (
    <div className={`pd-lb${closing ? " pd-lb--closing" : ""}`} onClick={close}>
      <div className="pd-lb__content" onClick={(e) => e.stopPropagation()}>
        <button className="pd-lb__close" onClick={close} aria-label="Stäng">
          <span className="material-symbols-rounded">close</span>
        </button>

        {images.length > 1 && (
          <button className="pd-lb__arrow pd-lb__arrow--prev" onClick={prev} aria-label="Föregående">
            <span className="material-symbols-rounded">chevron_left</span>
          </button>
        )}

        <img src={img.url} alt={img.alt || ""} className="pd-lb__img" />

        {images.length > 1 && (
          <button className="pd-lb__arrow pd-lb__arrow--next" onClick={next} aria-label="Nästa">
            <span className="material-symbols-rounded">chevron_right</span>
          </button>
        )}

        {images.length > 1 && (
          <div className="pd-lb__counter">{idx + 1} / {images.length}</div>
        )}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────

export function ProductDetail({ product }: { product: SerializedProduct }) {
  const { addToCart } = useCart();
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const opt of product.options) {
      if (opt.values.length > 0) initial[opt.name] = opt.values[0];
    }
    return initial;
  });
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Find the matching variant based on selected options
  const selectedVariant = useMemo(() => {
    if (product.variants.length === 0) return null;
    return product.variants.find((v) => {
      const opts = product.options;
      if (opts[0] && v.option1 !== selectedOptions[opts[0].name]) return false;
      if (opts[1] && v.option2 !== selectedOptions[opts[1].name]) return false;
      if (opts[2] && v.option3 !== selectedOptions[opts[2].name]) return false;
      return true;
    }) ?? null;
  }, [product.variants, product.options, selectedOptions]);

  // Price resolution
  const price = effectivePrice(product.price, selectedVariant?.price);
  const compareAtPrice = selectedVariant?.compareAtPrice ?? product.compareAtPrice;

  // Inventory status
  const trackInv = selectedVariant ? selectedVariant.trackInventory : product.trackInventory;
  const invQty = selectedVariant ? selectedVariant.inventoryQuantity : product.inventoryQuantity;
  const continueOOS = selectedVariant
    ? selectedVariant.continueSellingWhenOutOfStock
    : product.continueSellingWhenOutOfStock;
  const inStock = !trackInv || invQty > 0 || continueOOS;
  const lowStock = trackInv && invQty > 0 && invQty <= 5;

  // Variant title for cart
  const variantTitle = selectedVariant
    ? [selectedVariant.option1, selectedVariant.option2, selectedVariant.option3]
        .filter(Boolean)
        .join(" / ")
    : null;

  const handleAddToCart = () => {
    addToCart({
      productId: product.id,
      variantId: selectedVariant?.id ?? null,
      quantity: 1,
      title: product.title,
      variantTitle,
      imageUrl: selectedVariant?.imageUrl ?? product.media[0]?.url ?? null,
      unitAmount: price,
      currency: product.currency,
    });
  };

  const images = product.media.filter((m) => m.type === "image");
  const activeImage = images[activeMediaIdx];

  return (
    <div className="pd">
      <div className="pd__layout">
        {/* Media gallery */}
        <div className="pd__media">
          {activeImage && (
            <div className="pd__main-image" onClick={() => setLightboxIdx(activeMediaIdx)} role="button" tabIndex={0}>
              <img
                src={activeImage.url}
                alt={activeImage.alt || product.title}
                className="pd__img"
              />
            </div>
          )}
          {images.length > 1 && (
            <div className="pd__thumbnails">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  className={`pd__thumb${i === activeMediaIdx ? " pd__thumb--active" : ""}`}
                  onClick={() => setActiveMediaIdx(i)}
                  aria-label={`Visa bild ${i + 1}`}
                >
                  <img src={img.url} alt={img.alt || ""} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="pd__info">
          <h1 className="pd__title">{product.title}</h1>

          {/* Price */}
          <div className="pd__price-row">
            <span className="pd__price">
              {formatPriceDisplay(price, product.currency)} kr
            </span>
            {compareAtPrice != null && compareAtPrice > price && (
              <span className="pd__compare-price">
                {formatPriceDisplay(compareAtPrice, product.currency)} kr
              </span>
            )}
          </div>

          {/* Option selectors */}
          {product.options.map((opt) => (
            <div key={opt.id} className="pd__option">
              <label className="pd__option-label">{opt.name}</label>
              <div className="pd__option-values">
                {opt.values.map((val) => (
                  <button
                    key={val}
                    className={`pd__option-btn${
                      selectedOptions[opt.name] === val ? " pd__option-btn--active" : ""
                    }`}
                    onClick={() =>
                      setSelectedOptions((prev) => ({ ...prev, [opt.name]: val }))
                    }
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Inventory status */}
          <div className="pd__stock">
            {!trackInv ? null : inStock ? (
              lowStock ? (
                <span className="pd__stock-low">Få kvar ({invQty} st)</span>
              ) : (
                <span className="pd__stock-ok">I lager</span>
              )
            ) : (
              <span className="pd__stock-out">Slut i lager</span>
            )}
          </div>

          {/* Add to cart */}
          <button
            className="pd__add-btn"
            onClick={handleAddToCart}
            disabled={!inStock}
          >
            {inStock ? "Lägg i varukorg" : "Slut i lager"}
          </button>

          {/* Description */}
          {product.description && (
            <div
              className="pd__description"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          )}
        </div>
      </div>

      {lightboxIdx !== null && (
        <Lightbox
          images={images}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}
