/**
 * SEO Engine — HTML-safe JSON-LD serialization
 * ════════════════════════════════════════════
 *
 * Serializes a `StructuredDataObject` into a JSON string safe for
 * embedding inside `<script type="application/ld+json">` without
 * risk of HTML break-out.
 *
 * Attack surface we defend against:
 *   - `</script>` (or `</Script>`, `</SCRIPT>`) in any string value
 *     would otherwise close the enclosing script tag and let the
 *     remaining content render as HTML.
 *   - `<!--` / `<![CDATA[` / `<script` — less common but same class.
 *   - U+2028 / U+2029 — JavaScript line terminators that are legal
 *     in JSON but illegal in JavaScript string literals; a modern
 *     browser parses `<script type="application/ld+json">` content
 *     as JSON, but the characters can still cause problems for some
 *     older crawlers and SSR caches.
 *
 * Defense: replace every `<` with `<` (a valid JSON escape that
 * every JSON parser unescapes back to `<`). That single substitution
 * neutralizes every `</tag>`, `<!--`, and `<script` variant in one
 * pass. Also escape U+2028 and U+2029 explicitly.
 *
 * Returns the empty string on `JSON.stringify` failure (circular
 * references, BigInt without `toJSON`, etc.) and logs — never throws.
 */

import { log } from "../logger";
import type { StructuredDataObject } from "./types";

// Regexes written with `new RegExp` + Unicode escapes so the pattern
// source is unambiguous ASCII. (Literal U+2028 / U+2029 inside a `/.../`
// regex literal confuses some TypeScript / esbuild parsers into a
// "unterminated regex" error.)
const HTML_OPEN = /</g;
const LINE_SEP = new RegExp("\u2028", "g");
const PARA_SEP = new RegExp("\u2029", "g");

/**
 * Serialize a JSON-LD object for safe embedding in an inline
 * `<script>` tag. Output is minified (no indentation) to save bytes
 * on what can be several KB of structured data per page.
 *
 * @param obj A `StructuredDataObject` (must have `@context` + `@type`).
 * @returns   A JSON string with all HTML-break-out vectors escaped,
 *            or an empty string if serialization fails.
 */
export function stringifyJsonLd(obj: StructuredDataObject): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(obj);
  } catch (error) {
    log("error", "seo.json_ld.stringify_failed", {
      schemaType:
        typeof obj["@type"] === "string" ? obj["@type"] : "unknown",
      reason: error instanceof Error ? error.message : String(error),
    });
    return "";
  }

  return serialized
    .replace(HTML_OPEN, "\\u003c")
    .replace(LINE_SEP, "\\u2028")
    .replace(PARA_SEP, "\\u2029");
}
