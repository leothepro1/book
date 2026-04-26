/**
 * Portal Slug Generation
 * ══════════════════════
 *
 * Every tenant gets a unique subdomain: {slug}.{baseDomain}
 * Generated once on creation, immutable after that.
 *
 * Format: "{name-base}-{random6}"
 * Example: "grand-hotel-stockholm-x4k9mq"
 *
 * Same pattern as Shopify's myshopify.com URLs.
 *
 * URL composition is delegated to getTenantUrl / getTenantEmailFrom in
 * tenant-url.ts — this module owns slug GENERATION only.
 */

import { customAlphabet } from "nanoid";
import { prisma } from "@/app/_lib/db/prisma";
import { getPlatformBaseDomain } from "@/app/_lib/platform/constants";
import {
  getTenantEmailFrom,
  getTenantUrl,
} from "./tenant-url";

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
 * Thin wrapper over getTenantUrl — kept for callers that have only the slug.
 */
export function portalSlugToUrl(slug: string): string {
  return getTenantUrl({ portalSlug: slug });
}

/**
 * Returns the default noreply address for a tenant.
 * Uses the tenant's portalSlug subdomain — same as Shopify's pattern.
 * Example: "noreply@grandhotel-x4k9mq.rutgr.com"
 */
export function tenantDefaultEmailFrom(portalSlug: string): string {
  return `noreply@${portalSlug}.${getPlatformBaseDomain()}`;
}

/**
 * Returns the formatted from address for use in emails.
 * Priority: custom emailFrom > portalSlug-based > fallback.
 * Example: "Grand Hotel <noreply@grandhotel-x4k9mq.rutgr.com>"
 *
 * Thin wrapper over getTenantEmailFrom — kept for callers that pass
 * loose fields rather than a full Tenant row.
 */
export function tenantFromAddress(
  tenantName: string,
  portalSlug: string | null,
  customEmailFrom?: string | null,
  customEmailFromName?: string | null,
): string {
  return getTenantEmailFrom({
    name: tenantName,
    portalSlug,
    emailFrom: customEmailFrom ?? null,
    emailFromName: customEmailFromName ?? null,
  });
}
