"use server";

import { getCurrentTenant } from "./getCurrentTenant";

/**
 * Resolve the current tenant's guest-portal base URL.
 *
 * This is the subdomain under which the booking engine / storefront
 * lives (e.g. https://grand-hotel-x4k9mq.rutgr.com). Derived from
 * `tenant.portalSlug`, which is assigned at org-creation time and
 * never changes.
 *
 * Mirrors the exact construction used by the Store page's "Visa
 * webbshop" button (app/(admin)/store/actions.ts): pulls the base
 * domain from NEXT_PUBLIC_BASE_DOMAIN so dev, staging, and prod all
 * resolve correctly without code changes.
 *
 * Any settings panel that needs to show the guest-facing URL for the
 * current tenant MUST go through this function so a future migration
 * to custom primary domains is a single-file change. Callers compose
 * the full URL locally:
 *
 *   const base = await getGuestPortalUrl();
 *   const accountUrl = base ? `${base}/account` : null;
 *
 * Returns null when:
 *   • the user is not authenticated
 *   • the tenant has no portalSlug (legacy rows before backfill)
 *
 * Never throws — callers can safely render an empty-state UI on null.
 */
export async function getGuestPortalUrl(): Promise<string | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;
  const slug = tenantData.tenant.portalSlug;
  if (!slug) return null;
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "rutgr.com";
  return `https://${slug}.${baseDomain}`;
}
