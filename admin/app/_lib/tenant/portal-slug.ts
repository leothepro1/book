/**
 * Portal Slug Generation
 * ══════════════════════
 *
 * Every tenant gets a unique subdomain: {slug}.bedfront.com
 * Generated once on creation, immutable after that.
 *
 * Format: "{name-base}-{random6}"
 * Example: "grand-hotel-stockholm-x4k9mq"
 *
 * Same pattern as Shopify's myshopify.com URLs.
 */

import { customAlphabet } from "nanoid";
import { prisma } from "@/app/_lib/db/prisma";

// URL-safe alphabet — no ambiguous characters (0, O, l, 1)
const nanoid = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 6);

/**
 * Converts a hotel name to a URL-safe slug base.
 * "Grand Hotel Stockholm" → "grand-hotel-stockholm"
 * "Åre Ski Lodge" → "are-ski-lodge"
 */
export function nameToSlugBase(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[åä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * Generates a unique portal slug for a tenant.
 * Format: "{name-slug}-{random6}"
 * Retries up to 5 times on collision (astronomically unlikely).
 */
export async function generatePortalSlug(tenantName: string): Promise<string> {
  const base = nameToSlugBase(tenantName);

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = base ? `${base}-${nanoid()}` : `hotel-${nanoid()}`;

    const existing = await prisma.tenant.findUnique({
      where: { portalSlug: slug },
      select: { id: true },
    });

    if (!existing) return slug;
  }

  // Fallback: pure random if all attempts collide
  return `hotel-${nanoid()}${nanoid()}`;
}

/**
 * Returns the full subdomain URL for a tenant.
 */
export function portalSlugToUrl(slug: string): string {
  return `https://${slug}.bedfront.com`;
}

/**
 * Returns the default noreply address for a tenant.
 * Uses their portalSlug subdomain — same as Shopify's pattern.
 * Example: "noreply@grandhotel-x4k9mq.bedfront.com"
 */
export function tenantDefaultEmailFrom(portalSlug: string): string {
  return `noreply@${portalSlug}.bedfront.com`;
}

/**
 * Returns the formatted from address for use in emails.
 * Priority: custom emailFrom > portalSlug-based > fallback.
 * Example: "Grand Hotel <noreply@grandhotel-x4k9mq.bedfront.com>"
 */
export function tenantFromAddress(
  tenantName: string,
  portalSlug: string | null,
  customEmailFrom?: string | null,
  customEmailFromName?: string | null,
): string {
  const email = customEmailFrom || (portalSlug ? tenantDefaultEmailFrom(portalSlug) : "noreply@bedfront.com");
  const name = customEmailFromName || tenantName;
  return `${name} <${email}>`;
}
