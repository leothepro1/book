/**
 * Sitemap structural validation
 * ═════════════════════════════
 *
 * Last verified against sitemap.org protocol 0.9 + Google's
 * xhtml:link hreflang extension: 2026-04-23.
 * Re-verify quarterly.
 *
 * ── What this file does ─────────────────────────────────────────
 * Every generated sitemap XML in the codebase (serializer unit
 * tests, E2E mocked registry tests, full route handler tests) is
 * piped through a Zod schema that encodes the subset of
 * sitemap.org 0.9 Bedfront emits. Drift in the hand-rolled
 * `xml.ts` serializer (missing <loc>, renamed element, dropped
 * namespace attribute) fails CI before crawlers see malformed XML
 * in production.
 *
 * Hand-authored (not schema-derived) because:
 *   - Bedfront emits a deliberate subset of sitemap.org 0.9 —
 *     never <changefreq> or <priority>, always <xhtml:link> with
 *     the xmlns:xhtml namespace declaration.
 *   - The schema encodes BOTH "sitemap.org requires this" AND
 *     "Bedfront's policy is this". A hybrid posture that a
 *     generic schema.org-derived validator wouldn't produce.
 *   - fast-xml-parser stays a devDependency; production `xml.ts`
 *     remains hand-rolled zero-dep.
 *
 * ── Sources for required-field list ─────────────────────────────
 *   sitemap.org 0.9 protocol:
 *     https://www.sitemaps.org/protocol.html
 *   Google hreflang xhtml:link extension:
 *     https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap
 *
 * If sitemap.org or Google change a required-fields list, update
 * the matching schema here AND bump the "Last verified" date above.
 */

import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

// ── Namespace literals ──────────────────────────────────────

const SITEMAP_XMLNS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const XHTML_XMLNS = "http://www.w3.org/1999/xhtml";

// ── Parser configuration ────────────────────────────────────

/**
 * fast-xml-parser options. Every option is load-bearing — do not
 * change without understanding the schema impact.
 *
 * `parseAttributeValue: false` + `parseTagValue: false` keep every
 * value as a string. `z.literal("...")` and `z.string().datetime()`
 * in the schemas below depend on this — auto-coercion would turn
 * `2026` into a number and break the schema match.
 *
 * `isArray` forces the three variable-count elements (url, sitemap,
 * xhtml:link) to always parse as arrays, so Zod schemas can assert
 * on `z.array(...)` uniformly regardless of 0 / 1 / N occurrences.
 *
 * `trimValues: true` is REQUIRED. Our serializer emits indented XML
 * ("\n  <url>\n    <loc>..."); without trim, fast-xml-parser
 * surfaces the inter-tag whitespace as `#text` keys on every
 * object. Our `.strict()` schemas would then reject every parsed
 * object as having an "unrecognized key #text". Trim drops the
 * whitespace-only text nodes entirely. Tag content (`<loc>…</loc>`)
 * contains no leading/trailing whitespace in our serializer output,
 * so trim is lossless for real values.
 */
const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  ignoreDeclaration: true,
  ignorePiTags: true,
  isArray: (name: string): boolean =>
    ["url", "sitemap", "xhtml:link"].includes(name),
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
} as const;

const parser = new XMLParser(PARSER_OPTIONS);

/**
 * Parse raw sitemap XML into a plain object. Opaque to consumers —
 * use `expectValidSitemapUrlset` / `expectValidSitemapIndex`.
 */
export function parseSitemapXml(xml: string): unknown {
  return parser.parse(xml);
}

// ── Zod schemas ─────────────────────────────────────────────
//
// .strict() on every object shape is load-bearing:
//   • Catches accidentally-added unknown elements (<changefreq>,
//     <priority>) if a future serializer change emits them.
//   • Catches accidentally-added unknown attributes on <urlset> or
//     <url> if we ever declare a new namespace without updating
//     schemas here.
// Drift detection > permissive parsing. Do NOT relax .strict() to
// fix a validation failure — the failure IS the signal.

/**
 * Absolute URL (https:// or http://). sitemap.org requires fully
 * qualified URLs; relative paths are invalid.
 */
const LocSchema = z.string().url();

/**
 * W3C Datetime exactly as `Date.prototype.toISOString()` emits.
 *   offset: false  — we always emit the `Z` suffix, never ±HH:mm.
 *   precision: 3   — toISOString() always emits milliseconds.
 *
 * Drift detection: a serializer change that drops millisecond
 * precision or emits timezone offset fails validation loudly.
 */
const LastmodSchema = z.string().datetime({
  offset: false,
  precision: 3,
});

/**
 * <xhtml:link rel="alternate" hreflang="..." href="..."/> —
 * Google's recommended hreflang extension. `rel` MUST be
 * "alternate" per spec.
 */
const XhtmlLinkSchema = z
  .object({
    "@_rel": z.literal("alternate"),
    "@_hreflang": z.string().min(1),
    "@_href": LocSchema,
  })
  .strict();

/**
 * <url> entry. `<loc>` is the only required child per sitemap.org.
 * `<lastmod>` + `<xhtml:link>` are optional per spec; we validate
 * them when present but don't require them.
 *
 * Notable absences (intentional): <changefreq>, <priority>. Bedfront
 * does not emit these. `.strict()` rejects them if ever introduced
 * without an explicit schema update.
 */
const SitemapUrlSchema = z
  .object({
    loc: LocSchema,
    lastmod: LastmodSchema.optional(),
    "xhtml:link": z.array(XhtmlLinkSchema).optional(),
  })
  .strict();

/**
 * <urlset> root. Both xmlns declarations are required:
 *   - `@_xmlns` is the sitemap.org namespace (mandatory per spec).
 *   - `@_xmlns:xhtml` is the xhtml hreflang-extension namespace.
 *     M7.1 decided always-declare for structural uniformity across
 *     every shard; the schema enforces that choice.
 *
 * `url` is `.optional()` so empty urlsets pass (a tenant with zero
 * entries of a resource type served via direct URL gets a valid
 * empty <urlset/>).
 */
export const SitemapUrlsetSchema = z
  .object({
    urlset: z
      .object({
        "@_xmlns": z.literal(SITEMAP_XMLNS),
        "@_xmlns:xhtml": z.literal(XHTML_XMLNS),
        url: z.array(SitemapUrlSchema).optional(),
      })
      .strict(),
  })
  .strict();

/**
 * <sitemap> entry inside <sitemapindex>. Same shape as <url> minus
 * the xhtml:link extension (hreflang doesn't apply at the index
 * level — the shard files carry it per-URL).
 */
const SitemapIndexEntrySchema = z
  .object({
    loc: LocSchema,
    lastmod: LastmodSchema.optional(),
  })
  .strict();

/**
 * <sitemapindex> root. `sitemap` is `.optional()` because the
 * serializer's empty-list case emits `<sitemapindex></sitemapindex>`
 * (xml.test.ts exercises this). Production never emits it — the
 * pages shard is always populated — but the serializer is
 * technically capable.
 */
export const SitemapIndexSchema = z
  .object({
    sitemapindex: z
      .object({
        "@_xmlns": z.literal(SITEMAP_XMLNS),
        sitemap: z.array(SitemapIndexEntrySchema).optional(),
      })
      .strict(),
  })
  .strict();

// ── Expect helpers ──────────────────────────────────────────

/**
 * Parse + validate a `<urlset>` XML string. Throws with serialized
 * Zod issues + the raw XML on failure — having the XML in the
 * error message accelerates root-cause analysis when a retrofit
 * assertion suddenly trips in CI.
 */
export function expectValidSitemapUrlset(xml: string): void {
  const parsed = parseSitemapXml(xml);
  const result = SitemapUrlsetSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Sitemap urlset validation failed:\n${JSON.stringify(
        result.error.issues,
        null,
        2,
      )}\n\nXML:\n${xml}`,
    );
  }
}

/** Parse + validate a `<sitemapindex>` XML string. See `expectValidSitemapUrlset`. */
export function expectValidSitemapIndex(xml: string): void {
  const parsed = parseSitemapXml(xml);
  const result = SitemapIndexSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Sitemap index validation failed:\n${JSON.stringify(
        result.error.issues,
        null,
        2,
      )}\n\nXML:\n${xml}`,
    );
  }
}
