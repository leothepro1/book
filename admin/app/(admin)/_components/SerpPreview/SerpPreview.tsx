/**
 * SerpPreview — Google SERP card preview
 * ══════════════════════════════════════
 *
 * Approximates how Google renders a result in the SERP. Used in the
 * admin Preferences page so merchants see their title / description
 * as Google would show them while they type.
 *
 * Deliberately not pixel-perfect — Google itself varies the card by
 * device, query, and experiments. The goal is to give merchants an
 * accurate enough feel to judge whether a title truncates and whether
 * the description reads well.
 *
 * M6/M8 reuse this for product, page, and other entity SERP previews.
 */

import "./serp-preview.css";

export interface SerpPreviewProps {
  readonly title: string;
  /** Bare host + path, no protocol. e.g. "apelviken-x.rutgr.com" */
  readonly displayUrl: string;
  readonly description: string | null;
}

export function SerpPreview({
  title,
  displayUrl,
  description,
}: SerpPreviewProps) {
  return (
    <div className="serp-preview">
      <div className="serp-preview__url-row">
        <div className="serp-preview__favicon" aria-hidden />
        <div className="serp-preview__url-meta">
          <span className="serp-preview__site">{displayUrl}</span>
        </div>
      </div>
      <h4 className="serp-preview__title" title={title}>
        {title || <em className="serp-preview__placeholder">Sidtitel</em>}
      </h4>
      {description ? (
        <p className="serp-preview__description">{description}</p>
      ) : (
        <p className="serp-preview__description serp-preview__description--empty">
          Lägg till en metabeskrivning för att styra hur din sida
          presenteras i sökresultat.
        </p>
      )}
    </div>
  );
}
