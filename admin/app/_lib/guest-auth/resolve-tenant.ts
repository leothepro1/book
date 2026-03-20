/**
 * Guest Tenant Resolution
 * ═══════════════════════
 *
 * Resolves the tenant from the request Host header (subdomain).
 * Guest portal runs on {portalSlug}.bedfront.com — the subdomain
 * is the portalSlug, and we look up the tenant by that slug.
 *
 * In dev (localhost), subdomain routing is not available.
 * DEV_GUEST_PORTAL_SLUG env var provides the tenant identity.
 * No client-supplied input is ever used for tenant resolution.
 */

import { prisma } from "@/app/_lib/db/prisma";

const BASE_DOMAIN = "bedfront.com";
const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Extract portalSlug from the Host header.
 * Returns null if the host is the root domain (no subdomain)
 * or if it doesn't match the expected pattern.
 *
 * Examples:
 *   "grand-hotel-x4k9mq.bedfront.com" → "grand-hotel-x4k9mq"
 *   "bedfront.com" → null
 *   "localhost:3000" → null
 */
function extractPortalSlug(host: string): string | null {
  // Strip port if present
  const hostname = host.split(":")[0];

  // Must be a subdomain of bedfront.com
  if (!hostname.endsWith(`.${BASE_DOMAIN}`)) return null;

  const slug = hostname.slice(0, -(BASE_DOMAIN.length + 1));
  return slug || null;
}

/**
 * Resolve tenant from the request.
 *
 * Production: extracts portalSlug from Host header → DB lookup.
 * Dev: falls back to DEV_GUEST_PORTAL_SLUG env var when Host is localhost.
 *
 * Never reads tenant identity from the request body.
 * Returns tenantId or null if tenant cannot be resolved.
 */
/**
 * Core resolution: portalSlug → tenantId via DB lookup.
 * Shared by both the Request-based and headers()-based variants.
 */
async function resolveFromHost(host: string): Promise<string | null> {
  let portalSlug = extractPortalSlug(host);

  // Dev fallback: use env var when on localhost (no subdomains available)
  if (!portalSlug && IS_DEV) {
    portalSlug = process.env.DEV_GUEST_PORTAL_SLUG ?? null;
  }

  if (!portalSlug) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { portalSlug },
    select: { id: true },
  });

  return tenant?.id ?? null;
}

/**
 * Resolve tenant from a Request object (API route handlers).
 */
export async function resolveGuestTenant(req: Request): Promise<string | null> {
  const host = req.headers.get("host") ?? "";
  return resolveFromHost(host);
}

/**
 * Resolve tenant from next/headers (server components).
 * Uses the same logic as resolveGuestTenant but reads Host
 * from the Next.js headers() function instead of a Request.
 */
export async function resolveGuestTenantFromHeaders(): Promise<string | null> {
  const { headers } = await import("next/headers");
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "";
  return resolveFromHost(host);
}
