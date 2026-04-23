/**
 * M7 Sitemap — XML serialization
 * ══════════════════════════════
 *
 * Pure string builders that convert `BuiltSitemapIndex` and
 * `BuiltShard` into sitemap.org 0.9 XML. Hand-rolled rather than
 * dep-backed because:
 *   - The schema is small, stable, and well-documented.
 *   - Zero devDep avoids supply-chain surface.
 *   - Output is deterministic — the M7.5 commit will pipe every
 *     serialized result through a structural Zod validator (backed
 *     by fast-xml-parser as a devDep, parse-only) in CI.
 *
 * ── Escape ordering ────────────────────────────────────────────
 * `&` MUST be replaced first; any later replacement would otherwise
 * double-escape previously-emitted `&` introductions (e.g. turning
 * `<` → `&lt;` before `&` substitution would produce `&amp;lt;`).
 *
 * ── Namespaces ─────────────────────────────────────────────────
 * `<urlset>` always declares both `xmlns` (sitemap) and `xmlns:xhtml`
 * (hreflang). Always-declaring keeps every shard structurally
 * identical and costs one extra line of output per shard — the
 * bytes are negligible and conditional-declare would branch the
 * serializer for no gain.
 */

import type {
  BuiltShard,
  BuiltSitemapIndex,
} from "./types";

// ── Namespaces ──────────────────────────────────────────────

const SITEMAP_XMLNS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const XHTML_XMLNS = "http://www.w3.org/1999/xhtml";

// ── XML escape ──────────────────────────────────────────────

/**
 * Escape a string for safe inclusion inside XML text / attribute
 * values. Covers the five predefined entities in XML 1.0:
 *   &  <  >  "  '
 *
 * `&` MUST be first — reordering would produce double-escaping.
 *
 * Exported for xml.test.ts. Not part of the public API for
 * consumers outside this module.
 */
export function xmlEscape(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// ── Sitemap index ───────────────────────────────────────────

/**
 * Serialize a `BuiltSitemapIndex` to a `<sitemapindex>` XML string.
 * Empty `shards` produces a valid empty shell — sitemap.org accepts
 * (though a typical tenant will always have at least the `pages`
 * shard).
 */
export function sitemapIndexToXml(index: BuiltSitemapIndex): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<sitemapindex xmlns="${SITEMAP_XMLNS}">`);
  for (const shard of index.shards) {
    lines.push(`  <sitemap>`);
    lines.push(`    <loc>${xmlEscape(shard.url)}</loc>`);
    if (shard.lastmod !== null) {
      lines.push(`    <lastmod>${shard.lastmod.toISOString()}</lastmod>`);
    }
    lines.push(`  </sitemap>`);
  }
  lines.push(`</sitemapindex>`);
  return lines.join("\n");
}

// ── Sitemap shard (urlset) ──────────────────────────────────

/**
 * Serialize a `BuiltShard` to a `<urlset>` XML string. Each entry
 * emits:
 *   - `<loc>` (always)
 *   - `<lastmod>` (only when `entry.lastmod` is non-null)
 *   - one `<xhtml:link rel="alternate" hreflang="…" href="…"/>`
 *     per alternate.
 *
 * Empty `entries` produces a valid empty `<urlset>` — crawlers
 * accept this without error.
 */
export function sitemapShardToXml(shard: BuiltShard): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<urlset`);
  lines.push(`    xmlns="${SITEMAP_XMLNS}"`);
  lines.push(`    xmlns:xhtml="${XHTML_XMLNS}">`);
  for (const entry of shard.entries) {
    lines.push(`  <url>`);
    lines.push(`    <loc>${xmlEscape(entry.url)}</loc>`);
    if (entry.lastmod !== null) {
      lines.push(`    <lastmod>${entry.lastmod.toISOString()}</lastmod>`);
    }
    for (const alt of entry.alternates) {
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="${xmlEscape(
          alt.hreflang,
        )}" href="${xmlEscape(alt.url)}"/>`,
      );
    }
    lines.push(`  </url>`);
  }
  lines.push(`</urlset>`);
  return lines.join("\n");
}
