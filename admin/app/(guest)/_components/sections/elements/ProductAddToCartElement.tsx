"use client";

/**
 * Product Add to Cart Element
 * ═══════════════════════════
 *
 * Standard-product variant selector + price + inventory + buy button.
 * All logic lives in useProductEngine — this component is pure rendering.
 *
 * Reads from ProductContext for the type guard, then from
 * ProductEngineContext for all state and actions.
 */

import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";
import { useProductEngineContext } from "@/app/_lib/products/engine";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import "./product-add-to-cart-element.css";

export function ProductAddToCartElement({ resolved }: { resolved: ResolvedElement }) {
  const product = useProduct();
  if (!product || product.productType !== "STANDARD") return null;

  return <StandardAddToCart />;
}

/**
 * Inner component — only rendered when product is STANDARD.
 * Separated so hooks are always called (no conditional hook calls).
 */
function StandardAddToCart() {
  const product = useProduct()!;
  const engine = useProductEngineContext();

  if (product.productType !== "STANDARD") return null;

  return (
    <div>
      {/* Price */}
      <div className="patc__price-row">
        <span className="patc__price">
          {formatPriceDisplay(engine.price, product.currency)} kr
        </span>
        {engine.compareAtPrice != null && engine.compareAtPrice > engine.price && (
          <span className="patc__compare-price">
            {formatPriceDisplay(engine.compareAtPrice, product.currency)} kr
          </span>
        )}
      </div>

      {/* Option selectors */}
      {product.options.map((opt) => (
        <div key={opt.id} className="patc__option">
          <label className="patc__option-label">{opt.name}</label>
          <div className="patc__option-values">
            {opt.values.map((val) => (
              <button
                key={val}
                type="button"
                className={`patc__option-btn${
                  engine.selectedOptions[opt.name] === val ? " patc__option-btn--active" : ""
                }`}
                onClick={() => engine.setOption(opt.name, val)}
              >
                {val}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Inventory status */}
      <div className="patc__stock">
        {!engine.inStock ? (
          <span className="patc__stock-out">Slut i lager</span>
        ) : engine.lowStock ? (
          <span className="patc__stock-low">Få kvar ({engine.inventoryQuantity} st)</span>
        ) : engine.inventoryQuantity > 0 ? (
          <span className="patc__stock-ok">I lager</span>
        ) : null}
      </div>

      {/* Add to cart */}
      <button
        type="button"
        className="patc__add-btn"
        onClick={engine.addToCart}
        disabled={!engine.inStock}
      >
        {engine.inStock ? "Lägg i varukorg" : "Slut i lager"}
      </button>
    </div>
  );
}
