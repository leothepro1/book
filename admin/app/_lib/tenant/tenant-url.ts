import type { Tenant } from "@prisma/client";
import { getPlatformBaseDomain } from "@/app/_lib/platform/constants";

/**
 * Single entry point for building any tenant-facing URL.
 *
 * Today: always returns {portalSlug}.{baseDomain}.
 * Phase 3+: will read tenant.primaryDomain from the Domain table when set,
 * falling back to portalSlug.
 *
 * MUST be the only function in the codebase that builds tenant URLs.
 * Direct template-string composition like `https://${slug}.rutgr.com` is
 * forbidden everywhere except this file, env, and dev-mode host-checks.
 */

export type TenantUrlInput = Pick<Tenant, "portalSlug">;

export interface TenantUrlOptions {
  /** Optional path to append (e.g. "/checkout"). Must start with "/". */
  path?: string;
  /** Optional locale to prefix (e.g. "sv"). Phase 7 (Markets) will expand this. */
  locale?: string;
  /** If false, return path-only (no protocol/host). Defaults to true. */
  absolute?: boolean;
}

const PROTOCOL = "https";

export function getTenantUrl(
  tenant: TenantUrlInput,
  opts: TenantUrlOptions = {},
): string {
  const { path, locale, absolute = true } = opts;

  if (!tenant.portalSlug) {
    throw new Error(
      "[getTenantUrl] Tenant has no portalSlug. " +
        "All tenants must have a portalSlug; backfill required before calling this function.",
    );
  }

  if (path !== undefined && !path.startsWith("/")) {
    throw new Error(`[getTenantUrl] path must start with "/", got: ${path}`);
  }

  const baseDomain = getPlatformBaseDomain();
  const host = `${tenant.portalSlug}.${baseDomain}`;

  const localeSegment = locale ? `/${locale}` : "";
  const pathSegment = path ?? "";
  const fullPath = `${localeSegment}${pathSegment}`;

  if (!absolute) return fullPath || "/";

  return `${PROTOCOL}://${host}${fullPath}`;
}

/**
 * Email-from address for a tenant. Uses custom emailFrom if set, else
 * derives from portalSlug + base domain.
 *
 * This is a separate function (not getTenantUrl with an option) because
 * email addresses are not URLs and have different fallback semantics.
 */
export type TenantEmailFromInput = Pick<
  Tenant,
  "portalSlug" | "emailFrom" | "emailFromName" | "name"
>;

export function getTenantEmailFrom(tenant: TenantEmailFromInput): string {
  const baseDomain = getPlatformBaseDomain();
  const email =
    tenant.emailFrom ||
    (tenant.portalSlug
      ? `noreply@${tenant.portalSlug}.${baseDomain}`
      : `noreply@${baseDomain}`);
  const name = tenant.emailFromName || tenant.name;
  return `${name} <${email}>`;
}
