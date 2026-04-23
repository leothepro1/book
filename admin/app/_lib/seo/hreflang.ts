/**
 * SEO Engine — Hreflang Resolution
 * ════════════════════════════════
 *
 * Produces the `<link rel="alternate" hreflang="...">` list for a
 * resolution. One entry per active tenant locale, plus an `x-default`
 * entry pointing at the default-locale variant.
 *
 * Design contract: this helper NEVER recomputes the canonical path.
 * The resolver has already determined the canonical (possibly after
 * applying a merchant override), and that result is passed in. We
 * only layer per-locale URL construction on top.
 *
 * Canonical override interaction:
 *   - When merchant sets `seoOverrides.canonicalPath`, every locale's
 *     hreflang entry points at the *same* overridden URL. This is
 *     the correct semantics: the merchant is asserting "all locale
 *     variants consolidate to this canonical page."
 *   - We log `seo.hreflang.canonical_overridden` once per affected
 *     resolution so ops can track adoption.
 *
 * Edge cases:
 *   - Single-locale tenant → still emits that locale plus `x-default`
 *     (Google-valid, redundant but harmless).
 *   - Missing translations (M8 concern) → entries emitted regardless.
 */

import { log } from "../logger";

import { buildLocalePath } from "./paths";
import type { Seoable, SeoResolutionContext } from "./types";

/** A single alternate-language link entry. */
export interface HreflangEntry {
  readonly code: string;
  readonly url: string;
}

/**
 * Compute the hreflang list for a resolution.
 *
 * @param seoable                  The adapter-produced contract.
 * @param ctx                      The resolution context (source of activeLocales,
 *                                 defaultLocale, primaryDomain, tenantId).
 * @param resolvedCanonicalPath    The canonical path produced by
 *                                 `resolveCanonical` for the current request —
 *                                 post-override, post-locale-prefix.
 * @returns                        Ordered list: every active locale in tenant
 *                                 declaration order, followed by `x-default`.
 */
export function resolveHreflang(
  seoable: Seoable,
  ctx: SeoResolutionContext,
  resolvedCanonicalPath: string,
): readonly HreflangEntry[] {
  const { tenant } = ctx;
  const origin = `https://${tenant.primaryDomain}`;
  const overridden = Boolean(seoable.seoOverrides?.canonicalPath);

  if (overridden) {
    // Every locale variant collapses to the merchant-authored canonical.
    log("info", "seo.hreflang.canonical_overridden", {
      tenantId: tenant.id,
      resourceId: seoable.id,
      canonicalPath: resolvedCanonicalPath,
      requestId: ctx.requestId ?? null,
    });

    const url = `${origin}${resolvedCanonicalPath}`;
    const entries: HreflangEntry[] = tenant.activeLocales.map((code) => ({
      code,
      url,
    }));
    entries.push({ code: "x-default", url });
    return entries;
  }

  // No override: per-locale path built from the seoable's natural path.
  const entries: HreflangEntry[] = tenant.activeLocales.map((code) => ({
    code,
    url: `${origin}${buildLocalePath(tenant, code, seoable.path)}`,
  }));

  // x-default points at the default-locale variant (no locale prefix).
  entries.push({ code: "x-default", url: `${origin}${seoable.path}` });

  return entries;
}
