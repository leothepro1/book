import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";

/**
 * Resolve tenant from the request host header (subdomain).
 *
 * Production: {portalSlug}.rutgr.com → lookup by portalSlug
 * Development: localhost → lookup by DEV_ORG_ID (Clerk org)
 *
 * Returns the tenant row or null if not found.
 * This is the guest-portal equivalent of getCurrentTenant() in admin.
 */
export async function resolveTenantFromHost() {
  const h = await headers();
  const host = h.get("host") ?? "";

  // Development fallback — no subdomain on localhost or Codespaces
  const isDev =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".app.github.dev");
  if (isDev) {
    if (!env.DEV_ORG_ID) return null;
    const tenant = await getCachedTenantByClerkOrg(env.DEV_ORG_ID);
    if (tenant) setSentryTenantContext(tenant.id, tenant.portalSlug ?? undefined);
    return tenant;
  }

  // Production: extract subdomain from {slug}.rutgr.com
  const dotIndex = host.indexOf(".");
  if (dotIndex === -1) return null;

  const portalSlug = host.slice(0, dotIndex);
  if (!portalSlug) return null;

  const tenant = await getCachedTenantByHost(portalSlug);
  if (tenant) setSentryTenantContext(tenant.id, portalSlug);
  return tenant;
}

// ── Cached DB lookups ────────────────────────────────────────────

function getCachedTenantByHost(portalSlug: string) {
  return unstable_cache(
    () => prisma.tenant.findUnique({ where: { portalSlug } }),
    ["tenant-by-host", portalSlug],
    {
      revalidate: 300,
      tags: [`tenant-by-host:${portalSlug}`],
    },
  )();
}

function getCachedTenantByClerkOrg(clerkOrgId: string) {
  return unstable_cache(
    () => prisma.tenant.findUnique({ where: { clerkOrgId } }),
    ["tenant-by-host", `clerk:${clerkOrgId}`],
    {
      revalidate: 300,
      tags: [`tenant-by-host:clerk:${clerkOrgId}`],
    },
  )();
}
