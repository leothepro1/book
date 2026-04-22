/**
 * SEO Engine — ResolvedSeo → Next.js Metadata converter
 * ═════════════════════════════════════════════════════
 *
 * Pure function. No IO, no side effects, no throws. Takes the engine's
 * canonical `ResolvedSeo` output and produces the Next.js `Metadata`
 * shape that `generateMetadata` returns.
 *
 * Design invariants:
 *   - Every URL emitted is absolute (built by the resolver from the
 *     tenant's primaryDomain). We intentionally do NOT set
 *     `metadataBase` — absolute URLs flow through Next unchanged.
 *     The `next-metadata.test.ts` "every URL is https://..." guard
 *     catches regressions.
 *   - `null` fields from the resolver become `undefined` in Metadata
 *     (Next's types reject `null` for optional fields).
 *   - Empty arrays are represented as `undefined`, not empty arrays,
 *     to avoid Next emitting empty `<meta>` blocks.
 */

import type { Metadata } from "next";

import type { ResolvedSeo } from "./types";

/**
 * Convert the engine's `ResolvedSeo` output to a Next.js `Metadata`
 * object. Safe to call from `generateMetadata`.
 */
export function toNextMetadata(resolved: ResolvedSeo): Metadata {
  const languages =
    resolved.hreflang.length > 0
      ? Object.fromEntries(resolved.hreflang.map((h) => [h.code, h.url]))
      : undefined;

  const ogImages = resolved.openGraph.image
    ? [
        {
          url: resolved.openGraph.image.url,
          width: resolved.openGraph.image.width,
          height: resolved.openGraph.image.height,
          alt: resolved.openGraph.image.alt ?? undefined,
        },
      ]
    : undefined;

  const twitterImages = resolved.twitterCard.image
    ? [resolved.twitterCard.image.url]
    : undefined;

  return {
    title: resolved.title,
    description: resolved.description ?? undefined,
    robots: {
      index: !resolved.noindex,
      follow: !resolved.nofollow,
    },
    alternates: {
      canonical: resolved.canonicalUrl,
      languages,
    },
    openGraph: {
      type: resolved.openGraph.type,
      url: resolved.openGraph.url,
      title: resolved.openGraph.title,
      description: resolved.openGraph.description ?? undefined,
      siteName: resolved.openGraph.siteName,
      locale: resolved.openGraph.locale,
      images: ogImages,
    },
    twitter: {
      card: resolved.twitterCard.card,
      site: resolved.twitterCard.site ?? undefined,
      title: resolved.twitterCard.title,
      description: resolved.twitterCard.description ?? undefined,
      images: twitterImages,
    },
  };
}
