"use server";

import { headers } from "next/headers";
import { getCurrentTenant } from "./getCurrentTenant";

/**
 * Build the tenant's guest-facing base URL.
 *
 * Today this derives from the current request host.
 * When tenants get a `primaryDomain` column the lookup
 * becomes:  tenant.primaryDomain ?? request host.
 *
 * Every URL in the platform that points to the guest portal
 * MUST go through this function so custom-domain support
 * is a single-line change.
 */
export async function getTenantBaseUrl(): Promise<string | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  // Future: if (tenantData.tenant.primaryDomain) return `https://${tenantData.tenant.primaryDomain}`;

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";

  return `${protocol}://${host}`;
}
