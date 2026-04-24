"use client";

/**
 * SearchListingPreview — Google-SERP-style result card
 * ═════════════════════════════════════════════════════
 *
 * Pure presentational. Renders "what Google shows" for a given
 * title + breadcrumb URL + description, optionally with a price row
 * (product PDPs). No state, no fetching, no side effects — callers
 * feed resolved strings straight from `previewSeoForEntity`.
 *
 * This is the Shopify-grade sibling of the older `SerpPreview`
 * component (`_components/SerpPreview/`), which is retained for
 * backward compatibility but has no live consumers. This component
 * adds:
 *   - favicon slot (merchant-uploaded via tenant.seoDefaults.faviconId
 *     or inline platform default)
 *   - breadcrumb " › " separator rendering for nested URLs
 *   - optional price row (product listings)
 *   - graceful favicon-load error fallback
 *
 * Keep this component zero-dependency on the preview engine — tests
 * feed props directly; parents own the side-effectful data fetch.
 */

import { useState } from "react";

import "./SearchListingPreview.css";

export interface SearchListingPreviewProps {
  readonly title: string;
  /**
   * Bare host + breadcrumb, e.g. "apelviken-x.rutgr.com › shop ›
   * products › frukost-buffe". No protocol, no trailing slash.
   */
  readonly displayUrl: string;
  readonly description: string;
  /**
   * Tenant-configured favicon URL. When null, the component renders
   * an inline platform-default SVG mark.
   */
  readonly faviconUrl: string | null;
  /**
   * Optional price row shown under the description. Product PDPs
   * pass a formatted string like "0,55 € EUR"; other resource types
   * omit this prop entirely.
   */
  readonly price?: string | null;
}

export function SearchListingPreview({
  title,
  displayUrl,
  description,
  faviconUrl,
  price,
}: SearchListingPreviewProps) {
  // Derive the site name from the first breadcrumb segment — the
  // host — so callers don't need to pass it separately. Strip the
  // TLD and capitalize to approximate how Google shows site names
  // in the SERP top row (e.g. "stikaro.com" → "Stikaro").
  const firstSegment = displayUrl.split("›")[0].trim();
  const siteName = deriveSiteName(firstSegment);

  return (
    <div className="slp">
      <div className="slp__top-row">
        <Favicon faviconUrl={faviconUrl} />
        <div className="slp__site-meta">
          <span className="slp__site-name">{siteName}</span>
          <span className="slp__display-url">{displayUrl}</span>
        </div>
      </div>

      <h3 className="slp__title" title={title}>
        {title}
      </h3>

      <p className="slp__description">{description}</p>

      {price ? <p className="slp__price">{price}</p> : null}
    </div>
  );
}

// ── Favicon slot with graceful fallback ──────────────────────

function Favicon({ faviconUrl }: { faviconUrl: string | null }) {
  // Track *which* URL failed rather than a boolean flag — when
  // `faviconUrl` changes, the derived `hasFailed` naturally goes
  // false without a useEffect reset. Avoids cascading renders and
  // the `react-hooks/set-state-in-effect` lint rule.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const hasFailed = faviconUrl !== null && failedUrl === faviconUrl;

  if (faviconUrl && !hasFailed) {
    return (
      // 16×16 favicon from a tenant-configured URL — next/image's
      // optimizer adds no value at this size and pulls in a larger
      // bundle surface for every admin panel that renders a SERP
      // preview. Plain <img> is the intentional choice here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="slp__favicon"
        src={faviconUrl}
        alt=""
        aria-hidden
        onError={() => setFailedUrl(faviconUrl)}
      />
    );
  }
  return <PlatformDefaultFavicon />;
}

/**
 * Inline SVG used when a tenant hasn't configured a favicon. Deliberate-
 * ly generic — a rounded square with a subtle corner mark — so it never
 * implies merchant branding. 16x16 matches Google's actual SERP favicon
 * slot. No external asset so the render path never waits on a network.
 */
function PlatformDefaultFavicon() {
  return (
    <svg
      className="slp__favicon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="3"
        fill="var(--admin-surface-raised, #f2f2f2)"
        stroke="var(--admin-border, #d9d9d9)"
        strokeWidth="1"
      />
      <circle
        cx="8"
        cy="8"
        r="3"
        fill="var(--admin-text-tertiary, #909090)"
      />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function deriveSiteName(host: string): string {
  // Strip TLD — "apelviken-x.rutgr.com" → "apelviken-x". Capitalise
  // the first character; leave the rest alone to preserve any
  // legitimate casing (hyphens stay, digits stay).
  const firstPart = host.split(".")[0] ?? host;
  if (firstPart.length === 0) return host;
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}
