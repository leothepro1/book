/**
 * StructuredData — inline JSON-LD renderer
 * ════════════════════════════════════════
 *
 * Emits one `<script type="application/ld+json">` per structured-data
 * object. Used in the accommodation detail route (and future routes)
 * inside the page body — Google accepts JSON-LD anywhere in the
 * document.
 *
 * Server component (no "use client" directive) — this renders once,
 * on the server, with no client hydration.
 *
 * Safety: every object is serialized through `stringifyJsonLd`, which
 * escapes `<` as `<` so merchant content containing `</script>`
 * cannot break out of the enclosing script tag.
 */

import { stringifyJsonLd } from "../../../_lib/seo/json-ld-safe";
import type { StructuredDataObject } from "../../../_lib/seo/types";

interface StructuredDataProps {
  readonly data: readonly StructuredDataObject[];
}

export function StructuredData({ data }: StructuredDataProps) {
  if (data.length === 0) return null;

  return (
    <>
      {data.map((obj, index) => {
        const json = stringifyJsonLd(obj);
        // stringifyJsonLd returns "" on failure; skip emitting an
        // empty script tag rather than producing invalid JSON-LD.
        if (json.length === 0) return null;
        return (
          <script
            // Index is a stable key here because the array is
            // generated anew on every render and never mutated —
            // there's no reordering semantics for JSON-LD blocks.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: json }}
          />
        );
      })}
    </>
  );
}
