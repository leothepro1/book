/**
 * SEO Engine — Template Interpolation
 * ═══════════════════════════════════
 *
 * Replaces `{path}` placeholders in merchant-authored templates with
 * values looked up from a context object.
 *
 * Grammar:
 *   placeholder := "{" identifier ("." identifier)* "}"
 *   identifier  := [A-Za-z_][A-Za-z0-9_]*
 *
 * Example:
 *   interpolate("{entity.title} | {tenant.siteName}",
 *               { entity: { title: "Stuga 1" }, tenant: { siteName: "X" } })
 *   // → "Stuga 1 | X"
 *
 * Semantics (matches Shopify Liquid's forgiving behaviour):
 *   - Missing key / non-descendable intermediate → placeholder left literal,
 *     a single `seo.interpolation.missing_key` warn is logged.
 *   - Leaf values of type string / number / boolean / bigint → coerced via String().
 *   - Any other leaf type (null, undefined, object, array, function, symbol)
 *     → placeholder left literal + warn.
 *   - Malformed placeholders (space inside, unbalanced braces) → left alone.
 *   - Never throws. Never returns `undefined`.
 *
 * M2 intentionally supports no escape syntax. A merchant cannot emit a
 * literal `{` in output. If real demand emerges we add `\{`; YAGNI for now.
 */

import { log } from "../logger";

const PLACEHOLDER_RE =
  /\{([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\}/g;

/** Options that tune interpolation behaviour. */
export interface InterpolateOptions {
  /**
   * Tenant ID attached to the `missing_key` warn log. Optional because
   * some call sites (tests, admin preview) have no tenant context yet.
   * When omitted, the log still fires but with `tenantId: null`.
   */
  tenantId?: string;
}

/**
 * Interpolate a template string against a context object.
 *
 * @param template A merchant-authored string with `{path}` placeholders.
 * @param context  Root object; paths are dotted member lookups from here.
 * @param options  Optional tenantId for missing-key telemetry.
 * @returns The template with resolvable placeholders substituted and
 *          unresolvable ones left literal. Never throws.
 */
export function interpolate(
  template: string,
  context: Record<string, unknown>,
  options: InterpolateOptions = {},
): string {
  return template.replace(PLACEHOLDER_RE, (match, rawPath: string) => {
    const leaf = lookupPath(context, rawPath);
    const coerced = coerce(leaf);
    if (coerced === null) {
      log("warn", "seo.interpolation.missing_key", {
        path: rawPath,
        tenantId: options.tenantId ?? null,
      });
      return match;
    }
    return coerced;
  });
}

/**
 * Descend a dotted path through a nested object tree. Returns `undefined`
 * if any segment leads to a non-object before the path is exhausted.
 */
function lookupPath(root: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = root;
  for (const seg of segments) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/**
 * Coerce a leaf value to a string, or return `null` if the value is not
 * a primitive we consider safe to render in SEO text.
 */
function coerce(value: unknown): string | null {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    default:
      return null;
  }
}
