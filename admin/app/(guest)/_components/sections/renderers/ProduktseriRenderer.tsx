"use client";

/**
 * Produktserie Renderer (Featured Collection)
 * ─────────────────────────────────────────────
 * Data-driven product grid. Reads products from resolvedData.collection.
 * Each product renders via the shared ProductCard component.
 *
 * No blocks — content comes from the product catalog via dataSources.
 * Shopify equivalent: "Featured collection" section renderer.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import type { ResolvedCollectionDisplay, ResolvedProductDisplay } from "@/app/_lib/sections/data-sources";
import { ProductCard } from "../../cards/ProductCard";
import "./produktserie-renderer.css";

function productHref(product: ResolvedProductDisplay): string {
  if (product.productType === "GIFT_CARD") return `/shop/gift-cards/${product.slug}`;
  return `/shop/products/${product.slug}`;
}

const SIZE_MAP: Record<string, string> = {
  xs: "1rem",
  sm: "clamp(1.5rem, 1.25rem + 1vw, 2rem)",
  md: "clamp(1.875rem, 1.5rem + 1.5vw, 2.5rem)",
  lg: "clamp(2.25rem, 1.75rem + 2vw, 3.25rem)",
  xl: "clamp(2.75rem, 2rem + 3vw, 4rem)",
};

const ASPECT_MAP: Record<string, "1:1" | "3:4" | "4:3" | "16:9"> = {
  "1:1": "1:1",
  "3:4": "3:4",
  "4:3": "4:3",
  "16:9": "16:9",
};

function Heading({ html, size }: { html: string; size: string }) {
  if (!html) return null;
  return (
    <h2
      className="s-ps__heading"
      style={{
        fontSize: SIZE_MAP[size] || SIZE_MAP.md,
        margin: "0 0 clamp(0.75rem, 2vw, 1.25rem)",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function ProduktseriRenderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, resolvedData } = props;

  const heading = (settings.heading as string) || "";
  const headingSize = (settings.headingSize as string) || "md";
  const showDescription = settings.showDescription === true;
  const descriptionOverride = (settings.description as string) || "";
  const columns = Math.max(1, Math.min(6, Number(presetSettings.columns) || 3));
  const ratioKey = (presetSettings.aspectRatio as string) || "1:1";
  const aspectRatio = ASPECT_MAP[ratioKey] || "1:1";
  const maxProducts = Math.max(1, Math.min(50, Number(presetSettings.maxProducts) || 12));
  const showPrice = presetSettings.showPrice !== false;
  const showCompareAtPrice = presetSettings.showCompareAtPrice !== false;
  const showSecondImage = presetSettings.showSecondImage === true;
  const mobileColumns = (presetSettings.mobileColumns as string) || "2";

  const collection = resolvedData?.collection as
    | ResolvedCollectionDisplay
    | null
    | undefined;

  const products = collection?.products.slice(0, maxProducts) ?? [];

  // No collection selected — show empty state in editor context
  if (!collection) {
    return (
      <section className="s-ps" data-section-id={section.id}>
        <Heading html={heading} size={headingSize} />
        <div className="s-ps__empty">Välj en produktserie i sektionsinställningarna.</div>
      </section>
    );
  }

  // Collection exists but has no products
  if (products.length === 0) {
    return (
      <section className="s-ps" data-section-id={section.id}>
        <Heading html={heading} size={headingSize} />
        <div className="s-ps__empty">Produktserien har inga aktiva produkter.</div>
      </section>
    );
  }

  return (
    <section className="s-ps" data-section-id={section.id}>
      <Heading html={heading} size={headingSize} />
      {(() => {
        const descHtml = showDescription ? collection.description : descriptionOverride;
        if (!descHtml) return null;
        return <div className="s-ps__description" dangerouslySetInnerHTML={{ __html: descHtml }} />;
      })()}

      <div
        className={`s-ps__grid s-ps__grid--mobile-${mobileColumns}`}
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            title={product.title}
            slug={product.slug}
            href={productHref(product)}
            price={product.price}
            currency={product.currency}
            compareAtPrice={product.compareAtPrice}
            featuredImage={product.featuredImage}
            hoverImage={product.images[1] ?? null}
            aspectRatio={aspectRatio}
            showPrice={showPrice}
            showCompareAtPrice={showCompareAtPrice}
            showHoverImage={showSecondImage}
          />
        ))}
      </div>
    </section>
  );
}
