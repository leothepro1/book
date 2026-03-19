import { headers } from "next/headers";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";

/**
 * Resolve tenant from the request host header (subdomain).
 *
 * Production: {portalSlug}.bedfront.com → lookup by portalSlug
 * Development: localhost → lookup by DEV_ORG_ID (Clerk org)
 *
 * Returns the tenant row or null if not found.
 * This is the guest-portal equivalent of getCurrentTenant() in admin.
 */
export async function resolveTenantFromHost() {
  const h = await headers();
  const host = h.get("host") ?? "";

  // Development fallback — no subdomain on localhost
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    if (!env.DEV_ORG_ID) return null;
    return prisma.tenant.findUnique({ where: { clerkOrgId: env.DEV_ORG_ID } });
  }

  // Production: extract subdomain from {slug}.bedfront.com
  const dotIndex = host.indexOf(".");
  if (dotIndex === -1) return null;

  const portalSlug = host.slice(0, dotIndex);
  if (!portalSlug) return null;

  return prisma.tenant.findUnique({ where: { portalSlug } });
}
