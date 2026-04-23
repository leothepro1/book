/**
 * M7 Sitemap — robots.txt builder
 * ═══════════════════════════════
 *
 * Pure function. Produces a per-tenant robots.txt body keyed on the
 * tenant's `primaryDomain` (for the `Sitemap:` line) and an
 * `indexable` fail-closed switch owned by the route handler.
 *
 * ── Policy split ───────────────────────────────────────────────
 * This module owns the RENDER. The route handler (M7.4) owns the
 * POLICY — deciding whether a given host maps to `indexable: true`
 * (known tenant, allowed to be crawled) or `indexable: false`
 * (unknown host, or a future deactivated-tenant signal). Keeping
 * these concerns apart means tests can exercise both branches
 * without mocking `resolveTenantFromHost`.
 *
 * ── Disallow list ──────────────────────────────────────────────
 * The list is static. `Disallow: /search` without `?q=` is
 * standard-compliant across all major crawlers: robots.txt
 * matching is path-prefix, and `/search` subsumes every query
 * variant. Admin-configurable per-tenant rules (custom Disallow,
 * AI-bot specific rules like `User-agent: GPTBot`) are M12 scope.
 */

import type { RobotsContext } from "./types";

// ── Static Disallow list ────────────────────────────────────
//
// Order matters only for human-readability (the admin stack, then
// APIs, then checkout/commerce, then account/auth, then
// utility-portal paths). Crawlers treat rules as unordered.

const DISALLOW_PATHS: readonly string[] = [
  "/admin",
  "/api",
  "/checkout",
  "/cart",
  "/account",
  "/portal",
  "/auth",
  "/login",
  "/register",
  "/order-status",
  "/unsubscribe",
  "/email-unsubscribe",
  "/no-booking",
  "/p/",
  "/shop/checkout",
  "/shop/gift-cards/confirmation",
  "/search",
];

// ── Builder ─────────────────────────────────────────────────

/**
 * Render a tenant's robots.txt. Two branches:
 *
 *   indexable = true  → full Allow / Disallow / Sitemap block.
 *   indexable = false → fail-closed `User-agent: *` + `Disallow: /`.
 *
 * The builder never reads tenant state; callers resolve `indexable`
 * from whatever signal the platform uses (today: "tenant resolved
 * from host header"; future: "tenant.status === ACTIVE").
 */
export function buildRobotsTxt(ctx: RobotsContext): string {
  if (!ctx.indexable) {
    return "User-agent: *\nDisallow: /\n";
  }

  const lines: string[] = [];
  lines.push("# Bedfront robots.txt");
  lines.push(
    "# TODO(m12): make per-tenant Disallow list + AI-bot rules admin-configurable",
  );
  lines.push("");
  lines.push("User-agent: *");
  lines.push("Allow: /");
  for (const path of DISALLOW_PATHS) {
    lines.push(`Disallow: ${path}`);
  }
  lines.push("");
  lines.push(`Sitemap: https://${ctx.primaryDomain}/sitemap.xml`);
  lines.push(""); // trailing newline for POSIX-friendly files
  return lines.join("\n");
}
