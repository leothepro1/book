import Link from "next/link";
import { formatPriceDisplay, getVariantPriceRange } from "@/app/_lib/products/pricing";
import "./ProductCard.css";

/**
 * ProductCard — Shared product card component
 * ════════════════════════════════════════════
 *
 * Single implementation of a product card. Used by:
 *   - /shop/collections/[slug] page
 *   - ProduktseriRenderer (featured collection section)
 *   - Any future product grid or listing
 *
 * Renders: image (with optional hover), title, price (with variant range
 * and optional compare-at strikethrough). Optionally wrapped in a Link.
 */

const ASPECT_MAP: Record<string, string> = {
  "1:1": "1 / 1",
  "3:4": "3 / 4",
  "4:3": "4 / 3",
  "16:9": "16 / 9",
};

export interface ProductCardProps {
  title: string;
  /** Used to build /shop/products/{slug} unless href is provided. */
  slug: string;
  /** Override link destination (e.g. for gift cards: /shop/gift-cards/{slug}). */
  href?: string;
  /** Base product price in ören. */
  price: number;
  currency: string;
  /** Shown as strikethrough if > effective price. */
  compareAtPrice?: number | null;
  /** Used to compute price range (min–max). */
  variants?: Array<{ price: number | null; compareAtPrice?: number | null }>;
  featuredImage?: { url: string; alt?: string | null } | null;
  hoverImage?: { url: string; alt?: string | null } | null;
  /** Controls image container aspect ratio. Default: "3:4" */
  aspectRatio?: "1:1" | "3:4" | "4:3" | "16:9";
  /** Show price row. Default: true */
  showPrice?: boolean;
  /** Show compare-at price strikethrough. Default: true */
  showCompareAtPrice?: boolean;
  /** Show second image on hover. Default: false */
  showHoverImage?: boolean;
  /** Wrap card in Link. Default: true */
  linkable?: boolean;
}

export function ProductCard({
  title,
  slug,
  href,
  price,
  currency,
  compareAtPrice,
  variants,
  featuredImage,
  hoverImage,
  aspectRatio = "3:4",
  showPrice = true,
  showCompareAtPrice = true,
  showHoverImage = false,
  linkable = true,
}: ProductCardProps) {
  const { min, max } = getVariantPriceRange(price, variants ?? []);
  const ratio = ASPECT_MAP[aspectRatio] || "3 / 4";

  const priceDisplay = min === max
    ? `${formatPriceDisplay(min, currency)} kr`
    : `${formatPriceDisplay(min, currency)} – ${formatPriceDisplay(max, currency)} kr`;

  // Compare-at price: show the product-level compareAtPrice only when
  // there's no variant range (single price) and it's higher than the price.
  const showCompare = showCompareAtPrice
    && compareAtPrice != null
    && compareAtPrice > min
    && min === max;

  const content = (
    <>
      <div className="pc__image-wrap" style={{ aspectRatio: ratio }}>
        {featuredImage ? (
          <img
            className="pc__image"
            src={featuredImage.url}
            alt={featuredImage.alt || title}
            loading="lazy"
          />
        ) : (
          <div className="pc__placeholder" />
        )}
        {showHoverImage && hoverImage && (
          <img
            className="pc__image pc__image--hover"
            src={hoverImage.url}
            alt={hoverImage.alt || title}
            loading="lazy"
          />
        )}
      </div>

      <div className="pc__body">
        <h3 className="pc__title">{title}</h3>
        {showPrice && min > 0 && (
          <div className="pc__price-row">
            <span className="pc__price">{priceDisplay}</span>
            {showCompare && (
              <span className="pc__compare-price">
                {formatPriceDisplay(compareAtPrice!, currency)} kr
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );

  if (linkable) {
    return (
      <Link href={href ?? `/shop/products/${slug}`} className="pc">
        {content}
      </Link>
    );
  }

  return <div className="pc">{content}</div>;
}
