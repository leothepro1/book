/**
 * useSeoCharCounter — Shopify-style two-state character counter
 * ══════════════════════════════════════════════════════════════
 *
 * Neutral-until-error transition. Gray text while the field is within
 * its limit, `--admin-danger` color once the limit is exceeded. No
 * 80%-warn amber state — that's the Preferences pattern (homepage
 * SEO, shipped before M6), which stays untouched until a later batch
 * converges the two. For every per-entity SEO surface introduced in
 * M6, this hook is the source of truth.
 *
 * Pure — no React state, no effects. Named `use*` only because it's
 * an idiomatic React helper that callers treat as a hook dependency.
 * Safe to call unconditionally per React's Rules of Hooks.
 */

export interface SeoCharCounter {
  readonly state: "normal" | "error";
  /** CSS custom-property reference suitable for inline style `color:`. */
  readonly color: string;
  /** Human-readable Swedish progress, e.g. "41 av 70 tecken använda". */
  readonly display: string;
}

export function useSeoCharCounter(value: string, max: number): SeoCharCounter {
  const length = value.length;
  const state: SeoCharCounter["state"] = length > max ? "error" : "normal";
  const color =
    state === "error"
      ? "var(--admin-danger)"
      : "var(--admin-text-tertiary)";
  const display = `${length} av ${max} tecken använda`;
  return { state, color, display };
}
