"use server";

import { getTenantUrl } from "@/app/_lib/tenant/tenant-url";
import { getCurrentTenant } from "./getCurrentTenant";

/**
 * Resolve the current tenant's guest-portal base URL.
 *
 * This is the subdomain under which the booking engine / storefront
 * lives (e.g. https://grand-hotel-x4k9mq.{platform-base-domain}).
 * Derived from `tenant.portalSlug`, which is assigned at org-creation
 * time and never changes.
 *
 * Delegates to getTenantUrl — the single entry point for tenant URL
 * composition. A future migration to custom primary domains becomes a
 * one-file change inside getTenantUrl.
 *
 * Any settings panel that needs to show the guest-facing URL for the
 * current tenant MUST go through this function. Callers compose the
 * full URL locally:
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
  if (!tenantData.tenant.portalSlug) return null;
  return getTenantUrl(tenantData.tenant);
}
